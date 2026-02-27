// WiFi RSSI measurement via platform-specific APIs
//
// Uses the platform module to dispatch to the correct OS implementation:
// - macOS: CoreWLAN via objc2-core-wlan
// - Windows: WlanApi (V1.1)
// - Linux: nl80211 (V1.2)
//
// TODO: Implement in Phase 8d

use crate::error::AppError;

/// WiFi signal information from the local adapter.
#[derive(Debug, Clone, serde::Serialize)]
pub struct WifiSignalInfo {
    pub rssi_dbm: f64,
    pub noise_dbm: Option<f64>,
    pub snr_db: Option<f64>,
    pub bssid: Option<String>,
    pub ssid: Option<String>,
    pub frequency_mhz: Option<i32>,
    pub tx_rate_mbps: Option<f64>,
}

/// Trait for WiFi measurement implementations.
pub trait WifiMeasurementTrait: Send + Sync {
    /// Reads the current WiFi signal info.
    fn read_signal(&self) -> Result<WifiSignalInfo, AppError>;

    /// Checks if WiFi is connected.
    fn is_connected(&self) -> Result<bool, AppError>;
}
