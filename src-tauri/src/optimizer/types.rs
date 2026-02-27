// Optimizer type definitions for the rule-based optimization engine.
//
// These types describe the input (AP configs + measurements) and output
// (parameter changes with descriptions) of the optimization algorithm.

use serde::{Deserialize, Serialize};

/// Priority level for an optimization change.
/// Determines the ordering of suggested changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Priority {
    High,
    Medium,
    Low,
}

/// Input data for the optimization engine.
/// Aggregated from the database before running rules.
#[derive(Debug, Clone)]
pub struct OptimizationInput {
    /// All enabled access points on the target floor.
    pub access_points: Vec<ApSnapshot>,
    /// Measurement data associated with the floor (may be empty).
    pub measurements: Vec<MeasurementSnapshot>,
    /// Physical floor dimensions in meters (width, height).
    pub floor_dimensions: Option<(f64, f64)>,
}

/// Snapshot of one access point's current configuration.
#[derive(Debug, Clone)]
pub struct ApSnapshot {
    pub id: String,
    pub label: Option<String>,
    pub ip_address: Option<String>,
    pub tx_power_24ghz_dbm: Option<f64>,
    pub tx_power_5ghz_dbm: Option<f64>,
    pub channel_24ghz: Option<i32>,
    pub channel_5ghz: Option<i32>,
    pub channel_width: String,
    pub enabled: bool,
}

/// Snapshot of one measurement reading used by rules.
#[derive(Debug, Clone)]
pub struct MeasurementSnapshot {
    pub rssi_dbm: Option<f64>,
    pub frequency_band: String,
    pub iperf_udp_jitter_ms: Option<f64>,
    pub iperf_udp_lost_percent: Option<f64>,
    pub iperf_tcp_download_bps: Option<f64>,
}

/// A single suggested parameter change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterChange {
    pub access_point_id: String,
    pub parameter: String,
    pub old_value: Option<String>,
    pub new_value: String,
    pub description_de: String,
    pub description_en: String,
    pub priority: Priority,
}

/// Result of the optimization algorithm: a list of parameter changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub changes: Vec<ParameterChange>,
}
