// macOS WiFi interface via airport CLI fallback
//
// Uses the macOS `airport` command-line utility to read:
// - RSSI (signal strength)
// - Noise floor
// - BSSID, SSID
// - Frequency, TX rate
//
// The airport binary is a private framework tool at:
// /System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport
//
// This is the primary platform for MVP (D-05: macOS-first).

use std::process::Command;

use crate::error::AppError;
use crate::measurement::rssi::{WifiMeasurementTrait, WifiSignalInfo};

/// Path to the macOS airport utility.
const AIRPORT_PATH: &str =
    "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";

/// macOS WiFi measurement implementation using the airport CLI utility.
pub struct MacOsWifiMeasurement;

impl MacOsWifiMeasurement {
    pub fn new() -> Self {
        Self
    }
}

impl WifiMeasurementTrait for MacOsWifiMeasurement {
    fn read_signal(&self) -> Result<WifiSignalInfo, AppError> {
        let output = Command::new(AIRPORT_PATH)
            .arg("-I")
            .output()
            .map_err(|e| AppError::Platform {
                message: format!("Failed to execute airport command: {}", e),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Platform {
                message: format!("airport command failed: {}", stderr),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_airport_output(&stdout)
    }

    fn is_connected(&self) -> Result<bool, AppError> {
        let output = Command::new(AIRPORT_PATH)
            .arg("-I")
            .output()
            .map_err(|e| AppError::Platform {
                message: format!("Failed to execute airport command: {}", e),
            })?;

        if !output.status.success() {
            return Ok(false);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Check if the 'state' line contains 'running' (indicates active connection)
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() == 2 {
                let key = parts[0].trim();
                let value = parts[1].trim();
                if key == "state" {
                    return Ok(value == "running");
                }
            }
        }

        Ok(false)
    }
}

/// Parses the output of `airport -I` into a WifiSignalInfo struct.
///
/// The airport output is a key-value format with colon separators:
/// ```text
///      agrCtlRSSI: -57
///      agrCtlNoise: -87
///            state: running
///         op mode: station
///      lastTxRate: 866
///            BSSID: a4:ee:57:42:a8:3f
///             SSID: MyNetwork
///          channel: 44,80
/// ```
fn parse_airport_output(output: &str) -> Result<WifiSignalInfo, AppError> {
    let mut rssi: Option<f64> = None;
    let mut noise: Option<f64> = None;
    let mut ssid: Option<String> = None;
    let mut bssid: Option<String> = None;
    let mut tx_rate: Option<f64> = None;
    let mut frequency_mhz: Option<i32> = None;

    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() != 2 {
            continue;
        }
        let key = parts[0].trim();
        let value = parts[1].trim();

        match key {
            "agrCtlRSSI" => rssi = value.parse().ok(),
            "agrCtlNoise" => noise = value.parse().ok(),
            "SSID" => ssid = Some(value.to_string()),
            "BSSID" => bssid = Some(value.to_string()),
            "lastTxRate" => tx_rate = value.parse().ok(),
            "channel" => {
                // Parse "44,80" - first number is the channel number
                let ch: i32 = value
                    .split(',')
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                if ch > 0 {
                    frequency_mhz = Some(channel_to_frequency(ch));
                }
            }
            _ => {}
        }
    }

    let rssi_val = rssi.ok_or_else(|| AppError::Platform {
        message: "Could not read RSSI from airport output. WiFi may be disconnected.".into(),
    })?;

    // Calculate SNR when both RSSI and noise are available
    let snr = match (rssi, noise) {
        (Some(r), Some(n)) => Some(r - n),
        _ => None,
    };

    Ok(WifiSignalInfo {
        rssi_dbm: rssi_val,
        noise_dbm: noise,
        snr_db: snr,
        bssid,
        ssid,
        frequency_mhz,
        tx_rate_mbps: tx_rate,
    })
}

/// Converts a WiFi channel number to its center frequency in MHz.
///
/// Supports 2.4 GHz (channels 1-14), 5 GHz (channels 36-177),
/// and 6 GHz (channels 1-233 when frequency > 5925 MHz).
pub fn channel_to_frequency(channel: i32) -> i32 {
    match channel {
        // 2.4 GHz band: channels 1-13
        1..=13 => 2412 + (channel - 1) * 5,
        // 2.4 GHz band: channel 14 (Japan only)
        14 => 2484,
        // 5 GHz band: channels 36-177
        36..=177 => 5000 + channel * 5,
        // 6 GHz band (Wi-Fi 6E): channels 1-233, but channel numbers overlap
        // with 2.4 GHz. Airport CLI doesn't currently distinguish these.
        // DAP-X2810 (Wi-Fi 6, not 6E) only uses 2.4/5 GHz — MVP-acceptable.
        // TODO: Add 6 GHz support when macOS provides band disambiguation
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_to_frequency_24ghz() {
        assert_eq!(channel_to_frequency(1), 2412);
        assert_eq!(channel_to_frequency(6), 2437);
        assert_eq!(channel_to_frequency(11), 2462);
        assert_eq!(channel_to_frequency(13), 2472);
        assert_eq!(channel_to_frequency(14), 2484);
    }

    #[test]
    fn test_channel_to_frequency_5ghz() {
        assert_eq!(channel_to_frequency(36), 5180);
        assert_eq!(channel_to_frequency(44), 5220);
        assert_eq!(channel_to_frequency(149), 5745);
        assert_eq!(channel_to_frequency(165), 5825);
    }

    #[test]
    fn test_channel_to_frequency_unknown() {
        assert_eq!(channel_to_frequency(0), 0);
        assert_eq!(channel_to_frequency(200), 0);
    }

    #[test]
    fn test_parse_airport_output_full() {
        let output = "     agrCtlRSSI: -57\n\
                       agrCtlNoise: -87\n\
                             state: running\n\
                          op mode: station\n\
                       lastTxRate: 866\n\
                            BSSID: a4:ee:57:42:a8:3f\n\
                             SSID: MyNetwork\n\
                          channel: 44,80\n";

        let info = parse_airport_output(output).unwrap();
        assert!((info.rssi_dbm - (-57.0)).abs() < 0.01);
        assert_eq!(info.noise_dbm, Some(-87.0));
        assert_eq!(info.snr_db, Some(30.0));
        assert_eq!(info.ssid.as_deref(), Some("MyNetwork"));
        assert_eq!(info.bssid.as_deref(), Some("a4:ee:57:42:a8:3f"));
        assert_eq!(info.tx_rate_mbps, Some(866.0));
        assert_eq!(info.frequency_mhz, Some(5220)); // channel 44
    }

    #[test]
    fn test_parse_airport_output_24ghz() {
        let output = "     agrCtlRSSI: -45\n\
                       agrCtlNoise: -92\n\
                             state: running\n\
                       lastTxRate: 72\n\
                            BSSID: 00:11:22:33:44:55\n\
                             SSID: HomeNet\n\
                          channel: 6\n";

        let info = parse_airport_output(output).unwrap();
        assert!((info.rssi_dbm - (-45.0)).abs() < 0.01);
        assert_eq!(info.frequency_mhz, Some(2437)); // channel 6
    }

    #[test]
    fn test_parse_airport_output_no_rssi() {
        let output = "     state: init\n";
        let result = parse_airport_output(output);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_airport_output_minimal() {
        let output = "     agrCtlRSSI: -70\n";
        let info = parse_airport_output(output).unwrap();
        assert!((info.rssi_dbm - (-70.0)).abs() < 0.01);
        assert_eq!(info.noise_dbm, None);
        assert_eq!(info.snr_db, None);
        assert_eq!(info.ssid, None);
    }
}
