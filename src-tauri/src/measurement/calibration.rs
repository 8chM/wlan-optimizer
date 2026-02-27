// RF model calibration via least-squares fitting
//
// Uses measured RSSI values at known positions to calibrate:
// - Path loss exponent (n)
// - Wall correction factor
//
// Algorithm: Grid search with refinement for the optimal path loss exponent
// that minimizes RMSE between predicted and measured RSSI values.
//
// The predicted RSSI depends on the path loss exponent through the
// free-space path loss formula:
//   RSSI = TX_power + Antenna_gain + Rx_gain - PL(1m) - 10*n*log10(d) - wall_losses
//
// When calibrating, we adjust n relative to the initial exponent used to
// compute the original predicted values.

use crate::error::AppError;

/// Average wall attenuation in dB used for wall correction calculation.
/// This represents a typical interior wall (drywall/plaster) at 5 GHz.
const AVERAGE_WALL_ATTENUATION_DB: f64 = 5.0;

/// Calibration input: a single measurement point with predicted vs. measured RSSI.
#[derive(Debug, Clone)]
pub struct CalibrationPoint {
    pub predicted_rssi_dbm: f64,
    pub measured_rssi_dbm: f64,
    pub distance_m: f64,
    pub wall_count: i32,
}

/// Output of a calibration run.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CalibrationOutput {
    pub path_loss_exponent: f64,
    pub wall_correction_factor: f64,
    pub rmse_db: f64,
    pub r_squared: f64,
    pub max_deviation_db: f64,
}

/// Confidence level derived from calibration RMSE.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum CalibrationConfidence {
    /// RMSE < 5 dB: excellent fit
    High,
    /// RMSE 5-8 dB: acceptable fit
    Medium,
    /// RMSE > 8 dB: poor fit, results should be used with caution
    Low,
}

impl CalibrationConfidence {
    /// Derives confidence level from RMSE value.
    pub fn from_rmse(rmse: f64) -> Self {
        if rmse < 5.0 {
            Self::High
        } else if rmse <= 8.0 {
            Self::Medium
        } else {
            Self::Low
        }
    }

    /// Returns the confidence as a string matching the DB schema values.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }
}

/// Runs least-squares calibration to find optimal path loss exponent
/// and wall correction factor.
///
/// Uses a two-phase grid search:
/// 1. Coarse search: n from 1.5 to 6.0 in steps of 0.1
/// 2. Fine search: refinement around the best coarse result in steps of 0.01
///
/// # Arguments
/// * `points` - At least 3 calibration points with predicted/measured RSSI
/// * `initial_exponent` - The path loss exponent used to compute predicted_rssi_dbm
///
/// # Returns
/// CalibrationOutput with the optimal parameters and fit statistics
pub fn calibrate(
    points: &[CalibrationPoint],
    initial_exponent: f64,
) -> Result<CalibrationOutput, AppError> {
    if points.len() < 3 {
        return Err(AppError::Measurement {
            message: format!(
                "Need at least 3 calibration points, got {}",
                points.len()
            ),
        });
    }

    // Validate that we have usable distance values
    let valid_points: Vec<&CalibrationPoint> = points
        .iter()
        .filter(|p| p.distance_m > 0.1)
        .collect();

    if valid_points.len() < 3 {
        return Err(AppError::Measurement {
            message: format!(
                "Need at least 3 points with distance > 0.1m, got {}",
                valid_points.len()
            ),
        });
    }

    // Phase 1: Coarse grid search for path loss exponent
    let mut best_n = initial_exponent;
    let mut best_rmse = f64::INFINITY;

    let coarse_steps = ((6.0 - 1.5) / 0.1).round() as i32;
    for i in 0..=coarse_steps {
        let n = 1.5 + i as f64 * 0.1;
        let rmse = compute_rmse(points, initial_exponent, n, 1.0);
        if rmse < best_rmse {
            best_rmse = rmse;
            best_n = n;
        }
    }

    // Phase 2: Fine refinement around the best coarse result
    let fine_start = (best_n - 0.1_f64).max(1.5);
    let fine_end = (best_n + 0.1_f64).min(6.0);
    let fine_steps = ((fine_end - fine_start) / 0.01).round() as i32;
    for i in 0..=fine_steps {
        let n = fine_start + i as f64 * 0.01;
        let rmse = compute_rmse(points, initial_exponent, n, 1.0);
        if rmse < best_rmse {
            best_rmse = rmse;
            best_n = n;
        }
    }

    // Compute wall correction factor
    let wall_correction = compute_wall_correction(points, initial_exponent, best_n);

    // Recompute RMSE with the wall correction applied
    let final_rmse = compute_rmse(points, initial_exponent, best_n, wall_correction);

    // Compute fit statistics
    let r_squared = compute_r_squared(points, initial_exponent, best_n, wall_correction);
    let max_deviation = compute_max_deviation(points, initial_exponent, best_n, wall_correction);

    Ok(CalibrationOutput {
        path_loss_exponent: round_to_decimals(best_n, 2),
        wall_correction_factor: round_to_decimals(wall_correction, 2),
        rmse_db: round_to_decimals(final_rmse, 2),
        r_squared: round_to_decimals(r_squared, 4),
        max_deviation_db: round_to_decimals(max_deviation, 2),
    })
}

/// Adjusts the predicted RSSI for a calibration point using a new path loss
/// exponent and wall correction factor.
///
/// The adjustment is relative to the initial exponent that was used to compute
/// the original predicted_rssi_dbm:
///
///   new_predicted = predicted + 10 * (initial_n - new_n) * log10(distance)
///                   + wall_count * (1 - wall_factor) * avg_wall_attenuation
fn adjust_prediction(
    point: &CalibrationPoint,
    initial_n: f64,
    new_n: f64,
    wall_factor: f64,
) -> f64 {
    let distance = point.distance_m.max(0.1);
    let distance_correction = 10.0 * (initial_n - new_n) * distance.log10();
    let wall_correction =
        point.wall_count as f64 * (1.0 - wall_factor) * AVERAGE_WALL_ATTENUATION_DB;
    point.predicted_rssi_dbm + distance_correction + wall_correction
}

/// Computes RMSE between measured and adjusted predicted RSSI values.
fn compute_rmse(
    points: &[CalibrationPoint],
    initial_n: f64,
    new_n: f64,
    wall_factor: f64,
) -> f64 {
    let sum_sq: f64 = points
        .iter()
        .map(|p| {
            let adjusted = adjust_prediction(p, initial_n, new_n, wall_factor);
            let residual = p.measured_rssi_dbm - adjusted;
            residual * residual
        })
        .sum();
    (sum_sq / points.len() as f64).sqrt()
}

/// Computes the R-squared (coefficient of determination) for the calibrated model.
///
/// R^2 = 1 - (SS_res / SS_tot)
/// where SS_res = sum of squared residuals, SS_tot = total sum of squares
fn compute_r_squared(
    points: &[CalibrationPoint],
    initial_n: f64,
    new_n: f64,
    wall_factor: f64,
) -> f64 {
    let n = points.len() as f64;
    let mean_measured: f64 = points.iter().map(|p| p.measured_rssi_dbm).sum::<f64>() / n;

    let ss_res: f64 = points
        .iter()
        .map(|p| {
            let adjusted = adjust_prediction(p, initial_n, new_n, wall_factor);
            let residual = p.measured_rssi_dbm - adjusted;
            residual * residual
        })
        .sum();

    let ss_tot: f64 = points
        .iter()
        .map(|p| {
            let diff = p.measured_rssi_dbm - mean_measured;
            diff * diff
        })
        .sum();

    if ss_tot < 1e-10 {
        // All measured values are nearly identical - model fit is undefined
        return 0.0;
    }

    // Clamp to [0, 1] since negative R^2 can occur with poor fits
    (1.0 - ss_res / ss_tot).max(0.0).min(1.0)
}

/// Computes the maximum absolute deviation between measured and predicted RSSI.
fn compute_max_deviation(
    points: &[CalibrationPoint],
    initial_n: f64,
    new_n: f64,
    wall_factor: f64,
) -> f64 {
    points
        .iter()
        .map(|p| {
            let adjusted = adjust_prediction(p, initial_n, new_n, wall_factor);
            (p.measured_rssi_dbm - adjusted).abs()
        })
        .fold(0.0_f64, f64::max)
}

/// Computes the wall correction factor based on the residuals for points
/// that pass through walls.
///
/// The wall correction factor adjusts the default wall attenuation values.
/// A factor > 1.0 means walls attenuate more than predicted,
/// a factor < 1.0 means less.
fn compute_wall_correction(
    points: &[CalibrationPoint],
    initial_n: f64,
    calibrated_n: f64,
) -> f64 {
    // Separate points into with-walls and without-walls groups
    let wall_points: Vec<&CalibrationPoint> = points
        .iter()
        .filter(|p| p.wall_count > 0)
        .collect();

    if wall_points.is_empty() {
        // No wall data available, keep default factor
        return 1.0;
    }

    // For each wall point, compute the residual after distance correction
    // The residual should be explained by wall losses
    // residual = measured - (predicted + distance_correction)
    // wall_correction_factor = sum(residual * wall_count) / sum(wall_count^2 * avg_attenuation)
    let mut numerator = 0.0_f64;
    let mut denominator = 0.0_f64;

    for p in &wall_points {
        let distance = p.distance_m.max(0.1);
        let distance_correction = 10.0 * (initial_n - calibrated_n) * distance.log10();
        let predicted_with_n_only = p.predicted_rssi_dbm + distance_correction;
        let residual = p.measured_rssi_dbm - predicted_with_n_only;

        let wall_attenuation = p.wall_count as f64 * AVERAGE_WALL_ATTENUATION_DB;
        numerator += residual * wall_attenuation;
        denominator += wall_attenuation * wall_attenuation;
    }

    if denominator.abs() < 1e-10 {
        return 1.0;
    }

    // The correction represents: actual_wall_loss = wall_correction * predicted_wall_loss
    // So: wall_correction = 1 - (sum_residual_wall / sum_wall_attenuation^2) ...
    // Actually: residual = -wall_count * (correction_factor - 1) * avg_attenuation
    // So: correction_factor = 1 - numerator / denominator
    let raw_factor = 1.0 - numerator / denominator;

    // Clamp to reasonable range [0.1, 3.0] as per DB constraint
    raw_factor.max(0.1).min(3.0)
}

/// Rounds a float to a specified number of decimal places.
fn round_to_decimals(value: f64, decimals: u32) -> f64 {
    let factor = 10.0_f64.powi(decimals as i32);
    (value * factor).round() / factor
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_points() -> Vec<CalibrationPoint> {
        // Simulate points at various distances with initial_n = 3.5
        // predicted values: TX(23) + Gain(4.3) + Rx(-3) - PL1m(46.42) - 10*3.5*log10(d)
        // = -22.12 - 35*log10(d)
        vec![
            CalibrationPoint {
                predicted_rssi_dbm: -22.12,  // d=1m
                measured_rssi_dbm: -25.0,
                distance_m: 1.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -32.66,  // d=2m
                measured_rssi_dbm: -35.0,
                distance_m: 2.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -38.84,  // d=3m
                measured_rssi_dbm: -42.0,
                distance_m: 3.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -43.2,   // d=4m
                measured_rssi_dbm: -48.0,
                distance_m: 4.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -46.56,  // d=5m
                measured_rssi_dbm: -52.0,
                distance_m: 5.0,
                wall_count: 1,
            },
        ]
    }

    #[test]
    fn test_calibrate_minimum_points() {
        let points = vec![
            CalibrationPoint {
                predicted_rssi_dbm: -40.0,
                measured_rssi_dbm: -42.0,
                distance_m: 2.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -50.0,
                measured_rssi_dbm: -53.0,
                distance_m: 5.0,
                wall_count: 0,
            },
        ];

        let result = calibrate(&points, 3.5);
        assert!(result.is_err());
    }

    #[test]
    fn test_calibrate_with_valid_points() {
        let points = sample_points();
        let result = calibrate(&points, 3.5).unwrap();

        // The calibrated exponent should be higher than 3.5
        // because measured values are worse than predicted
        assert!(result.path_loss_exponent > 3.5);
        assert!(result.path_loss_exponent < 6.0);
        assert!(result.path_loss_exponent >= 1.5);

        // RMSE should be finite and positive
        assert!(result.rmse_db >= 0.0);
        assert!(result.rmse_db.is_finite());

        // R-squared should be between 0 and 1
        assert!(result.r_squared >= 0.0);
        assert!(result.r_squared <= 1.0);

        // Max deviation should be non-negative
        assert!(result.max_deviation_db >= 0.0);

        // Wall correction should be in valid range
        assert!(result.wall_correction_factor >= 0.1);
        assert!(result.wall_correction_factor <= 3.0);
    }

    #[test]
    fn test_calibrate_perfect_fit() {
        // Points where predicted == measured (same exponent)
        let points = vec![
            CalibrationPoint {
                predicted_rssi_dbm: -40.0,
                measured_rssi_dbm: -40.0,
                distance_m: 2.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -50.0,
                measured_rssi_dbm: -50.0,
                distance_m: 5.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -55.0,
                measured_rssi_dbm: -55.0,
                distance_m: 7.0,
                wall_count: 0,
            },
        ];

        let result = calibrate(&points, 3.5).unwrap();

        // With a perfect fit, RMSE should be close to 0
        assert!(result.rmse_db < 1.0);

        // Path loss exponent should remain close to initial
        assert!((result.path_loss_exponent - 3.5).abs() < 0.5);
    }

    #[test]
    fn test_confidence_levels() {
        assert_eq!(CalibrationConfidence::from_rmse(2.0), CalibrationConfidence::High);
        assert_eq!(CalibrationConfidence::from_rmse(4.9), CalibrationConfidence::High);
        assert_eq!(CalibrationConfidence::from_rmse(5.0), CalibrationConfidence::Medium);
        assert_eq!(CalibrationConfidence::from_rmse(7.0), CalibrationConfidence::Medium);
        assert_eq!(CalibrationConfidence::from_rmse(8.0), CalibrationConfidence::Medium);
        assert_eq!(CalibrationConfidence::from_rmse(8.1), CalibrationConfidence::Low);
        assert_eq!(CalibrationConfidence::from_rmse(15.0), CalibrationConfidence::Low);
    }

    #[test]
    fn test_confidence_as_str() {
        assert_eq!(CalibrationConfidence::High.as_str(), "high");
        assert_eq!(CalibrationConfidence::Medium.as_str(), "medium");
        assert_eq!(CalibrationConfidence::Low.as_str(), "low");
    }

    #[test]
    fn test_adjust_prediction() {
        let point = CalibrationPoint {
            predicted_rssi_dbm: -50.0,
            measured_rssi_dbm: -55.0,
            distance_m: 5.0,
            wall_count: 0,
        };

        // Same exponent should return the original prediction
        let adjusted = adjust_prediction(&point, 3.5, 3.5, 1.0);
        assert!((adjusted - (-50.0)).abs() < 0.01);

        // Higher exponent should lower the prediction (more path loss)
        let adjusted_higher = adjust_prediction(&point, 3.5, 4.0, 1.0);
        assert!(adjusted_higher < -50.0);
    }

    #[test]
    fn test_round_to_decimals() {
        assert!((round_to_decimals(3.14159, 2) - 3.14).abs() < 0.001);
        assert!((round_to_decimals(3.14159, 4) - 3.1416).abs() < 0.00001);
        assert!((round_to_decimals(3.5, 0) - 4.0).abs() < 0.001);
    }

    #[test]
    fn test_wall_correction_no_walls() {
        let points = vec![
            CalibrationPoint {
                predicted_rssi_dbm: -40.0,
                measured_rssi_dbm: -42.0,
                distance_m: 2.0,
                wall_count: 0,
            },
            CalibrationPoint {
                predicted_rssi_dbm: -50.0,
                measured_rssi_dbm: -53.0,
                distance_m: 5.0,
                wall_count: 0,
            },
        ];

        let factor = compute_wall_correction(&points, 3.5, 3.5);
        assert!((factor - 1.0).abs() < 0.01);
    }
}
