// RF model calibration via least-squares fitting
//
// Uses measured RSSI values at known positions to calibrate:
// - Path loss exponent (n)
// - Wall correction factor
//
// TODO: Implement in Phase 8d

use crate::error::AppError;

/// Calibration input: a single measurement point with predicted vs. measured RSSI.
#[derive(Debug, Clone)]
pub struct CalibrationPoint {
    pub predicted_rssi_dbm: f64,
    pub measured_rssi_dbm: f64,
    pub distance_m: f64,
    pub wall_count: i32,
}

/// Runs least-squares calibration to find optimal path loss exponent.
pub fn calibrate(
    points: &[CalibrationPoint],
    initial_exponent: f64,
) -> Result<CalibrationOutput, AppError> {
    let _ = (points, initial_exponent);
    // TODO: Implement least-squares fitting
    Err(AppError::Measurement {
        message: "Calibration not yet implemented".into(),
    })
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
