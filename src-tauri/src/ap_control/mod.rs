pub mod custom_adapter;
pub mod provider;

use crate::error::AppError;

/// Trait for access point controllers.
///
/// Each AP vendor/protocol gets its own implementation.
/// The provider pattern allows swapping adapters at runtime.
pub trait ApControllerTrait: Send + Sync {
    /// Reads the current configuration from the access point.
    fn read_config(&self, ip: &str) -> Result<ApConfig, AppError>;

    /// Applies a configuration change to the access point.
    fn apply_config(&self, ip: &str, config: &ApConfigChange) -> Result<(), AppError>;

    /// Tests connectivity to the access point.
    fn test_connection(&self, ip: &str) -> Result<bool, AppError>;

    /// Returns the name of this controller (e.g., "D-Link WebGUI").
    fn name(&self) -> &str;
}

/// Current configuration read from an AP.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ApConfig {
    pub ssid: Option<String>,
    pub channel_24ghz: Option<i32>,
    pub channel_5ghz: Option<i32>,
    pub tx_power_24ghz_dbm: Option<f64>,
    pub tx_power_5ghz_dbm: Option<f64>,
    pub channel_width: Option<String>,
    pub band_steering_enabled: Option<bool>,
}

/// A configuration change to apply to an AP.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ApConfigChange {
    pub parameter: String,
    pub value: String,
}
