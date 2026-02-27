// macOS WiFi interface via CoreWLAN
//
// Uses objc2-core-wlan (or command-line fallback) to read:
// - RSSI (signal strength)
// - Noise floor
// - BSSID, SSID
// - Frequency, TX rate
//
// This is the primary platform for MVP (D-05: macOS-first).
//
// TODO: Implement in Phase 8d

use crate::error::AppError;
use crate::measurement::rssi::{WifiMeasurementTrait, WifiSignalInfo};

/// macOS WiFi measurement implementation using CoreWLAN.
pub struct MacOsWifiMeasurement;

impl MacOsWifiMeasurement {
    pub fn new() -> Self {
        Self
    }
}

impl WifiMeasurementTrait for MacOsWifiMeasurement {
    fn read_signal(&self) -> Result<WifiSignalInfo, AppError> {
        // TODO: Implement using CoreWLAN or `airport -I` fallback
        Err(AppError::Platform {
            message: "macOS WiFi measurement not yet implemented".into(),
        })
    }

    fn is_connected(&self) -> Result<bool, AppError> {
        // TODO: Implement
        Ok(false)
    }
}
