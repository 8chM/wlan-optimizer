use tauri::{AppHandle, State};

use crate::db::measurement as db_measurement;
use crate::db::models::{
    CreateMeasurementPointParams, CreateMeasurementRunParams, Measurement, MeasurementPoint,
    MeasurementRun, SaveMeasurementParams,
};
use crate::error::AppError;
use crate::measurement::iperf::IperfManager;
use crate::measurement::rssi::WifiMeasurementTrait;
#[cfg(target_os = "macos")]
use crate::platform::macos::MacOsWifiMeasurement;
use crate::state::AppState;

// =============================================================================
// Measurement run management
// =============================================================================

/// Creates a new measurement run for a floor.
#[tauri::command]
pub fn create_measurement_run(
    params: CreateMeasurementRunParams,
    state: State<'_, AppState>,
) -> Result<MeasurementRun, AppError> {
    // Validate run_number range
    if params.run_number < 1 || params.run_number > 3 {
        return Err(AppError::Validation {
            message: format!(
                "run_number must be between 1 and 3, got {}",
                params.run_number
            ),
        });
    }

    // Validate run_type
    match params.run_type.as_str() {
        "baseline" | "post_optimization" | "verification" => {}
        _ => {
            return Err(AppError::Validation {
                message: format!(
                    "Invalid run_type '{}'. Must be one of: baseline, post_optimization, verification",
                    params.run_type
                ),
            });
        }
    }

    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_measurement::insert_measurement_run(&conn, &params)
}

/// Fetches all measurement runs for a floor, ordered by run_number.
#[tauri::command]
pub fn get_measurement_runs(
    floor_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<MeasurementRun>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_measurement::get_measurement_runs_by_floor(&conn, &floor_id)
}

/// Fetches all measurements for a given measurement run.
#[tauri::command]
pub fn get_measurements_by_run(
    measurement_run_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Measurement>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_measurement::get_measurements_by_run(&conn, &measurement_run_id)
}

/// Cancels an in-progress measurement run.
#[tauri::command]
pub fn cancel_measurement(
    measurement_run_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_measurement::cancel_run(&conn, &measurement_run_id)
}

/// Updates the status of a measurement run.
#[tauri::command]
pub fn update_measurement_run_status(
    measurement_run_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_measurement::update_run_status(&conn, &measurement_run_id, &status)
}

// =============================================================================
// Measurement point management
// =============================================================================

/// Creates a new measurement point on a floor.
#[tauri::command]
pub fn create_measurement_point(
    params: CreateMeasurementPointParams,
    state: State<'_, AppState>,
) -> Result<MeasurementPoint, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_measurement::insert_measurement_point(&conn, &params)
}

// =============================================================================
// Active measurement execution
// =============================================================================

/// Starts a measurement at a specific point.
/// Coordinates RSSI reading + iPerf3 tests, determines quality, and saves to DB.
///
/// This is an async command because iPerf3 tests are async.
#[tauri::command]
pub async fn start_measurement(
    measurement_point_id: String,
    measurement_run_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    // 1. Read WiFi signal info via platform module (macOS only)
    #[cfg(target_os = "macos")]
    let signal = {
        let wifi = MacOsWifiMeasurement::new();
        wifi.read_signal().ok()
    };
    #[cfg(not(target_os = "macos"))]
    let signal: Option<crate::measurement::rssi::WifiSignalInfo> = None;

    // 2. Look up the measurement run to get iPerf server IP
    let iperf_server_ip = {
        let conn = state.db.lock().map_err(|e| AppError::Internal {
            message: format!("Failed to acquire DB lock: {}", e),
        })?;
        let run = conn.query_row(
            "SELECT iperf_server_ip FROM measurement_runs WHERE id = ?1",
            [&measurement_run_id],
            |row| row.get::<_, Option<String>>(0),
        )?;
        run
    };

    // 3. Run iPerf3 tests if server IP is configured
    let mut tcp_upload_bps: Option<f64> = None;
    let mut tcp_download_bps: Option<f64> = None;
    let mut tcp_retransmits: Option<i32> = None;
    let mut udp_throughput_bps: Option<f64> = None;
    let mut udp_jitter_ms: Option<f64> = None;
    let mut udp_lost_packets: Option<i32> = None;
    let mut udp_total_packets: Option<i32> = None;
    let mut raw_iperf_json: Option<String> = None;

    if let Some(ref server_ip) = iperf_server_ip {
        if !server_ip.is_empty() {
            let iperf = IperfManager::new();

            // TCP upload
            if let Ok(tcp_up) = iperf.run_tcp_upload(&app, server_ip, 10, 4).await {
                tcp_upload_bps = Some(tcp_up.throughput_bps);
                tcp_retransmits = Some(tcp_up.retransmits);
                raw_iperf_json = Some(tcp_up.raw_json.clone());
            }

            // TCP download
            if let Ok(tcp_down) = iperf.run_tcp_download(&app, server_ip, 10, 4).await {
                tcp_download_bps = Some(tcp_down.throughput_bps);
                // Prefer download raw_json if upload didn't produce one
                if raw_iperf_json.is_none() {
                    raw_iperf_json = Some(tcp_down.raw_json.clone());
                }
            }

            // UDP test
            if let Ok(udp) = iperf.run_udp_test(&app, server_ip, 5).await {
                udp_throughput_bps = Some(udp.throughput_bps);
                udp_jitter_ms = Some(udp.jitter_ms);
                udp_lost_packets = Some(udp.lost_packets);
                udp_total_packets = Some(udp.total_packets);
            }
        }
    }

    // 4. Determine frequency band from signal info
    let frequency_band = signal
        .as_ref()
        .and_then(|s| s.frequency_mhz)
        .map(|freq| {
            if freq < 3000 {
                "2.4ghz"
            } else if freq < 5925 {
                "5ghz"
            } else {
                "6ghz"
            }
        })
        .unwrap_or("5ghz")
        .to_string();

    // 5. Determine quality level
    let rssi = signal.as_ref().map(|s| s.rssi_dbm);
    let quality = determine_quality(rssi, tcp_download_bps);

    // 6. Build SaveMeasurementParams and save to DB
    let params = SaveMeasurementParams {
        measurement_point_id,
        measurement_run_id,
        frequency_band,
        rssi_dbm: rssi,
        noise_dbm: signal.as_ref().and_then(|s| s.noise_dbm),
        iperf_tcp_upload_bps: tcp_upload_bps,
        iperf_tcp_download_bps: tcp_download_bps,
        iperf_tcp_retransmits: tcp_retransmits,
        iperf_udp_throughput_bps: udp_throughput_bps,
        iperf_udp_jitter_ms: udp_jitter_ms,
        iperf_udp_lost_packets: udp_lost_packets,
        iperf_udp_total_packets: udp_total_packets,
        raw_iperf_json,
    };

    // Save the measurement
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let measurement_id = uuid::Uuid::new_v4().to_string();

    let snr = match (
        signal.as_ref().map(|s| s.rssi_dbm),
        signal.as_ref().and_then(|s| s.noise_dbm),
    ) {
        (Some(r), Some(n)) => Some(r - n),
        _ => None,
    };

    conn.execute(
        "INSERT INTO measurements (
            id, measurement_point_id, measurement_run_id, frequency_band,
            rssi_dbm, noise_dbm, snr_db,
            connected_bssid, connected_ssid, frequency_mhz, tx_rate_mbps,
            iperf_tcp_upload_bps, iperf_tcp_download_bps, iperf_tcp_retransmits,
            iperf_udp_throughput_bps, iperf_udp_jitter_ms,
            iperf_udp_lost_packets, iperf_udp_total_packets,
            quality, raw_iperf_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        rusqlite::params![
            measurement_id,
            params.measurement_point_id,
            params.measurement_run_id,
            params.frequency_band,
            params.rssi_dbm,
            params.noise_dbm,
            snr,
            signal.as_ref().and_then(|s| s.bssid.clone()),
            signal.as_ref().and_then(|s| s.ssid.clone()),
            signal.as_ref().and_then(|s| s.frequency_mhz),
            signal.as_ref().and_then(|s| s.tx_rate_mbps),
            params.iperf_tcp_upload_bps,
            params.iperf_tcp_download_bps,
            params.iperf_tcp_retransmits,
            params.iperf_udp_throughput_bps,
            params.iperf_udp_jitter_ms,
            params.iperf_udp_lost_packets,
            params.iperf_udp_total_packets,
            quality,
            params.raw_iperf_json,
        ],
    )?;

    Ok(measurement_id)
}

/// Saves a measurement result to the database (manual/raw save).
#[tauri::command]
pub fn save_measurement(
    params: SaveMeasurementParams,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let measurement_id = uuid::Uuid::new_v4().to_string();
    let quality = determine_quality(params.rssi_dbm, params.iperf_tcp_download_bps);
    let snr = match (params.rssi_dbm, params.noise_dbm) {
        (Some(r), Some(n)) => Some(r - n),
        _ => None,
    };

    conn.execute(
        "INSERT INTO measurements (
            id, measurement_point_id, measurement_run_id, frequency_band,
            rssi_dbm, noise_dbm, snr_db,
            iperf_tcp_upload_bps, iperf_tcp_download_bps, iperf_tcp_retransmits,
            iperf_udp_throughput_bps, iperf_udp_jitter_ms,
            iperf_udp_lost_packets, iperf_udp_total_packets,
            quality, raw_iperf_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        rusqlite::params![
            measurement_id,
            params.measurement_point_id,
            params.measurement_run_id,
            params.frequency_band,
            params.rssi_dbm,
            params.noise_dbm,
            snr,
            params.iperf_tcp_upload_bps,
            params.iperf_tcp_download_bps,
            params.iperf_tcp_retransmits,
            params.iperf_udp_throughput_bps,
            params.iperf_udp_jitter_ms,
            params.iperf_udp_lost_packets,
            params.iperf_udp_total_packets,
            quality,
            params.raw_iperf_json,
        ],
    )?;

    Ok(measurement_id)
}

// =============================================================================
// iPerf server check
// =============================================================================

/// Checks if an iPerf3 server is reachable.
#[tauri::command]
pub async fn check_iperf_server(
    server_ip: String,
    app: AppHandle,
) -> Result<bool, AppError> {
    let iperf = IperfManager::new();
    iperf.check_server(&app, &server_ip).await
}

// =============================================================================
// Helpers
// =============================================================================

/// Determines the measurement quality based on RSSI and TCP throughput.
///
/// Quality levels:
/// - "good": RSSI > -65 dBm AND TCP download > 50 Mbps
/// - "fair": RSSI > -75 dBm
/// - "poor": everything else
/// - "failed": no RSSI reading available
fn determine_quality(rssi: Option<f64>, tcp_download_bps: Option<f64>) -> String {
    match rssi {
        None => "failed".to_string(),
        Some(rssi_val) => {
            let tcp_mbps = tcp_download_bps
                .map(|bps| bps / 1_000_000.0)
                .unwrap_or(0.0);

            if rssi_val > -65.0 && tcp_mbps > 50.0 {
                "good".to_string()
            } else if rssi_val > -75.0 {
                "fair".to_string()
            } else {
                "poor".to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_quality_good() {
        assert_eq!(
            determine_quality(Some(-55.0), Some(100_000_000.0)),
            "good"
        );
    }

    #[test]
    fn test_determine_quality_fair() {
        // RSSI ok but throughput low
        assert_eq!(
            determine_quality(Some(-60.0), Some(30_000_000.0)),
            "fair"
        );
        // RSSI in fair range
        assert_eq!(
            determine_quality(Some(-70.0), Some(100_000_000.0)),
            "fair"
        );
    }

    #[test]
    fn test_determine_quality_poor() {
        assert_eq!(
            determine_quality(Some(-80.0), Some(10_000_000.0)),
            "poor"
        );
    }

    #[test]
    fn test_determine_quality_failed() {
        assert_eq!(determine_quality(None, None), "failed");
    }

    #[test]
    fn test_determine_quality_no_iperf() {
        // Good RSSI but no iPerf data: tcp_mbps defaults to 0 so not "good"
        assert_eq!(determine_quality(Some(-55.0), None), "fair");
    }
}
