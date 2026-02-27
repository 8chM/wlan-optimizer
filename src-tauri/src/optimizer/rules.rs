// Rule-based optimization heuristics (D-14: regelbasiert).
//
// Each rule inspects the current AP configs and measurement data, then
// returns a Vec<ParameterChange> with suggested improvements.
// Rules are intentionally conservative for home-network use cases.

use super::types::{
    ApSnapshot, MeasurementSnapshot, OptimizationInput, ParameterChange, Priority,
};
use std::collections::HashMap;

// =============================================================================
// Non-overlapping channels per band
// =============================================================================

/// Preferred non-overlapping channels for 2.4 GHz.
const CHANNELS_24GHZ: &[i32] = &[1, 6, 11];

/// Preferred non-overlapping channels for 5 GHz (common DFS-free + DFS).
const CHANNELS_5GHZ: &[i32] = &[36, 44, 52, 149, 157];

// =============================================================================
// TX power limits (DAP-X2810 reference)
// =============================================================================

const TX_POWER_MIN_24GHZ: f64 = 1.0;
const TX_POWER_MAX_24GHZ: f64 = 23.0;
const TX_POWER_MIN_5GHZ: f64 = 1.0;
const TX_POWER_MAX_5GHZ: f64 = 26.0;

// =============================================================================
// Thresholds for measurement-based rules
// =============================================================================

/// RSSI above this value at most points indicates over-coverage.
const RSSI_OVER_COVERAGE_DBM: f64 = -40.0;
/// RSSI below this value at many points indicates under-coverage.
const RSSI_UNDER_COVERAGE_DBM: f64 = -75.0;
/// Fraction of measurements that must exceed the threshold.
const COVERAGE_FRACTION: f64 = 0.6;

/// UDP jitter threshold above which narrower channel width is suggested.
const JITTER_HIGH_MS: f64 = 10.0;
/// UDP packet loss threshold above which narrower channel width is suggested.
const LOSS_HIGH_PERCENT: f64 = 2.0;

/// TX power reduction step in dBm when over-coverage is detected.
const TX_POWER_REDUCE_STEP: f64 = 3.0;
/// TX power increase step in dBm when under-coverage is detected.
const TX_POWER_INCREASE_STEP: f64 = 3.0;

// =============================================================================
// Channel assignment rule
// =============================================================================

/// Suggests non-overlapping channel assignments when multiple APs share the
/// same channel on a given band. Priority: HIGH.
pub fn rule_channel_assignment(input: &OptimizationInput) -> Vec<ParameterChange> {
    let mut changes = Vec::new();

    // Analyze 2.4 GHz channel conflicts
    changes.extend(suggest_channels_for_band(
        &input.access_points,
        "2.4ghz",
        "channel_24ghz",
        CHANNELS_24GHZ,
        |ap| ap.channel_24ghz,
    ));

    // Analyze 5 GHz channel conflicts
    changes.extend(suggest_channels_for_band(
        &input.access_points,
        "5ghz",
        "channel_5ghz",
        CHANNELS_5GHZ,
        |ap| ap.channel_5ghz,
    ));

    changes
}

/// For a given band, detects channel conflicts and suggests reassignment.
fn suggest_channels_for_band(
    access_points: &[ApSnapshot],
    band_label: &str,
    parameter_name: &str,
    preferred_channels: &[i32],
    get_channel: fn(&ApSnapshot) -> Option<i32>,
) -> Vec<ParameterChange> {
    let mut changes = Vec::new();

    // Collect enabled APs that have a channel set on this band.
    let aps_with_channel: Vec<(&ApSnapshot, i32)> = access_points
        .iter()
        .filter(|ap| ap.enabled)
        .filter_map(|ap| get_channel(ap).map(|ch| (ap, ch)))
        .collect();

    if aps_with_channel.len() < 2 {
        return changes; // No conflicts possible with 0 or 1 AP.
    }

    // Group APs by their current channel.
    let mut channel_groups: HashMap<i32, Vec<&ApSnapshot>> = HashMap::new();
    for (ap, ch) in &aps_with_channel {
        channel_groups.entry(*ch).or_default().push(ap);
    }

    // Find groups where more than one AP uses the same channel.
    let conflicting_groups: Vec<(i32, Vec<&ApSnapshot>)> = channel_groups
        .into_iter()
        .filter(|(_, aps)| aps.len() > 1)
        .collect();

    if conflicting_groups.is_empty() {
        return changes;
    }

    // Determine which channels are already in use.
    let used_channels: Vec<i32> = aps_with_channel.iter().map(|(_, ch)| *ch).collect();

    // Find available preferred channels (not currently in use).
    let available: Vec<i32> = preferred_channels
        .iter()
        .filter(|ch| !used_channels.contains(ch))
        .copied()
        .collect();

    let mut available_iter = available.iter();

    // For each conflict group, keep the first AP and reassign the rest.
    for (current_ch, aps) in &conflicting_groups {
        for ap in aps.iter().skip(1) {
            if let Some(&new_ch) = available_iter.next() {
                let ap_label = ap.label.as_deref().unwrap_or(&ap.id);
                changes.push(ParameterChange {
                    access_point_id: ap.id.clone(),
                    parameter: parameter_name.to_string(),
                    old_value: Some(current_ch.to_string()),
                    new_value: new_ch.to_string(),
                    description_de: format!(
                        "AP '{}' ({}) Kanal von {} auf {} aendern, um Co-Kanal-Interferenz zu vermeiden",
                        ap_label, band_label, current_ch, new_ch
                    ),
                    description_en: format!(
                        "Change AP '{}' ({}) channel from {} to {} to avoid co-channel interference",
                        ap_label, band_label, current_ch, new_ch
                    ),
                    priority: Priority::High,
                });
            }
            // If no more preferred channels are available, we skip (cannot reassign
            // without potentially causing another conflict).
        }
    }

    changes
}

// =============================================================================
// TX power adjustment rule
// =============================================================================

/// Suggests TX power adjustments based on RSSI measurements.
/// - Over-coverage (RSSI > -40 dBm at most points): reduce power.
/// - Under-coverage (RSSI < -75 dBm at many points): increase power.
/// Priority: MEDIUM.
pub fn rule_tx_power_adjustment(input: &OptimizationInput) -> Vec<ParameterChange> {
    let mut changes = Vec::new();

    if input.measurements.is_empty() {
        return changes; // No measurement data, skip this rule.
    }

    // Split measurements by band.
    let measurements_24: Vec<&MeasurementSnapshot> = input
        .measurements
        .iter()
        .filter(|m| m.frequency_band == "2.4ghz")
        .collect();

    let measurements_5: Vec<&MeasurementSnapshot> = input
        .measurements
        .iter()
        .filter(|m| m.frequency_band == "5ghz")
        .collect();

    // Apply TX power rules per band.
    for ap in &input.access_points {
        if !ap.enabled {
            continue;
        }

        // 2.4 GHz band
        if let Some(current_power) = ap.tx_power_24ghz_dbm {
            if let Some(change) = suggest_tx_power_change(
                ap,
                &measurements_24,
                "tx_power_24ghz",
                "2.4 GHz",
                current_power,
                TX_POWER_MIN_24GHZ,
                TX_POWER_MAX_24GHZ,
            ) {
                changes.push(change);
            }
        }

        // 5 GHz band
        if let Some(current_power) = ap.tx_power_5ghz_dbm {
            if let Some(change) = suggest_tx_power_change(
                ap,
                &measurements_5,
                "tx_power_5ghz",
                "5 GHz",
                current_power,
                TX_POWER_MIN_5GHZ,
                TX_POWER_MAX_5GHZ,
            ) {
                changes.push(change);
            }
        }
    }

    changes
}

/// Analyzes measurement RSSI to suggest a power increase or decrease for one AP/band.
fn suggest_tx_power_change(
    ap: &ApSnapshot,
    measurements: &[&MeasurementSnapshot],
    parameter_name: &str,
    band_label: &str,
    current_power: f64,
    min_power: f64,
    max_power: f64,
) -> Option<ParameterChange> {
    if measurements.is_empty() {
        return None;
    }

    let rssi_values: Vec<f64> = measurements
        .iter()
        .filter_map(|m| m.rssi_dbm)
        .collect();

    if rssi_values.is_empty() {
        return None;
    }

    let total = rssi_values.len() as f64;

    // Check over-coverage: fraction of readings above -40 dBm.
    let over_count = rssi_values.iter().filter(|&&r| r > RSSI_OVER_COVERAGE_DBM).count() as f64;
    if over_count / total >= COVERAGE_FRACTION {
        let new_power = (current_power - TX_POWER_REDUCE_STEP).max(min_power);
        if (new_power - current_power).abs() > 0.1 {
            let ap_label = ap.label.as_deref().unwrap_or(&ap.id);
            return Some(ParameterChange {
                access_point_id: ap.id.clone(),
                parameter: parameter_name.to_string(),
                old_value: Some(format!("{:.0}", current_power)),
                new_value: format!("{:.0}", new_power),
                description_de: format!(
                    "AP '{}' {} Sendeleistung von {:.0} auf {:.0} dBm reduzieren (Ueberversorgung erkannt)",
                    ap_label, band_label, current_power, new_power
                ),
                description_en: format!(
                    "Reduce AP '{}' {} TX power from {:.0} to {:.0} dBm (over-coverage detected)",
                    ap_label, band_label, current_power, new_power
                ),
                priority: Priority::Medium,
            });
        }
    }

    // Check under-coverage: fraction of readings below -75 dBm.
    let under_count = rssi_values.iter().filter(|&&r| r < RSSI_UNDER_COVERAGE_DBM).count() as f64;
    if under_count / total >= COVERAGE_FRACTION {
        let new_power = (current_power + TX_POWER_INCREASE_STEP).min(max_power);
        if (new_power - current_power).abs() > 0.1 {
            let ap_label = ap.label.as_deref().unwrap_or(&ap.id);
            return Some(ParameterChange {
                access_point_id: ap.id.clone(),
                parameter: parameter_name.to_string(),
                old_value: Some(format!("{:.0}", current_power)),
                new_value: format!("{:.0}", new_power),
                description_de: format!(
                    "AP '{}' {} Sendeleistung von {:.0} auf {:.0} dBm erhoehen (schlechte Abdeckung erkannt)",
                    ap_label, band_label, current_power, new_power
                ),
                description_en: format!(
                    "Increase AP '{}' {} TX power from {:.0} to {:.0} dBm (poor coverage detected)",
                    ap_label, band_label, current_power, new_power
                ),
                priority: Priority::Medium,
            });
        }
    }

    None
}

// =============================================================================
// Channel width rule
// =============================================================================

/// Suggests narrower channel width when UDP jitter or packet loss is high,
/// or wider channel width when throughput is good and no interference.
/// Priority: LOW.
pub fn rule_channel_width(input: &OptimizationInput) -> Vec<ParameterChange> {
    let mut changes = Vec::new();

    if input.measurements.is_empty() {
        return changes;
    }

    // Compute aggregate metrics across all measurements.
    let jitter_values: Vec<f64> = input
        .measurements
        .iter()
        .filter_map(|m| m.iperf_udp_jitter_ms)
        .collect();

    let loss_values: Vec<f64> = input
        .measurements
        .iter()
        .filter_map(|m| m.iperf_udp_lost_percent)
        .collect();

    let avg_jitter = if jitter_values.is_empty() {
        None
    } else {
        Some(jitter_values.iter().sum::<f64>() / jitter_values.len() as f64)
    };

    let avg_loss = if loss_values.is_empty() {
        None
    } else {
        Some(loss_values.iter().sum::<f64>() / loss_values.len() as f64)
    };

    let high_interference = match (avg_jitter, avg_loss) {
        (Some(j), _) if j > JITTER_HIGH_MS => true,
        (_, Some(l)) if l > LOSS_HIGH_PERCENT => true,
        _ => false,
    };

    let low_interference = match (avg_jitter, avg_loss) {
        (Some(j), Some(l)) if j < JITTER_HIGH_MS / 2.0 && l < LOSS_HIGH_PERCENT / 2.0 => true,
        _ => false,
    };

    for ap in &input.access_points {
        if !ap.enabled {
            continue;
        }

        let current_width = &ap.channel_width;
        let ap_label = ap.label.as_deref().unwrap_or(&ap.id);

        if high_interference {
            // Suggest narrower width.
            let new_width = narrow_channel_width(current_width);
            if let Some(new_w) = new_width {
                changes.push(ParameterChange {
                    access_point_id: ap.id.clone(),
                    parameter: "channel_width".to_string(),
                    old_value: Some(current_width.clone()),
                    new_value: new_w.to_string(),
                    description_de: format!(
                        "AP '{}' Kanalbreite von {} auf {} MHz reduzieren (hoher Jitter/Paketverlust)",
                        ap_label, current_width, new_w
                    ),
                    description_en: format!(
                        "Reduce AP '{}' channel width from {} to {} MHz (high jitter/packet loss)",
                        ap_label, current_width, new_w
                    ),
                    priority: Priority::Low,
                });
            }
        } else if low_interference {
            // Suggest wider width.
            let new_width = widen_channel_width(current_width);
            if let Some(new_w) = new_width {
                changes.push(ParameterChange {
                    access_point_id: ap.id.clone(),
                    parameter: "channel_width".to_string(),
                    old_value: Some(current_width.clone()),
                    new_value: new_w.to_string(),
                    description_de: format!(
                        "AP '{}' Kanalbreite von {} auf {} MHz erhoehen (geringe Interferenz)",
                        ap_label, current_width, new_w
                    ),
                    description_en: format!(
                        "Increase AP '{}' channel width from {} to {} MHz (low interference)",
                        ap_label, current_width, new_w
                    ),
                    priority: Priority::Low,
                });
            }
        }
    }

    changes
}

/// Returns a narrower channel width, or None if already at minimum (20 MHz).
fn narrow_channel_width(current: &str) -> Option<&'static str> {
    match current {
        "160" => Some("80"),
        "80" => Some("40"),
        "40" => Some("20"),
        _ => None, // Already at 20 or unrecognized
    }
}

/// Returns a wider channel width, or None if already at maximum (160 MHz).
fn widen_channel_width(current: &str) -> Option<&'static str> {
    match current {
        "20" => Some("40"),
        "40" => Some("80"),
        "80" => Some("160"),
        _ => None, // Already at 160 or unrecognized
    }
}
