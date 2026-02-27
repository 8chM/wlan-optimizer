use tauri::State;

use crate::db::models::SaveMeasurementParams;
use crate::error::AppError;
use crate::state::AppState;

/// Starts a measurement at a specific point.
/// Coordinates RSSI reading + iPerf3 tests.
#[tauri::command]
pub fn start_measurement(
    measurement_point_id: String,
    measurement_run_id: String,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    // TODO: Implement full measurement flow in Phase 8d
    // 1. Read RSSI via platform module
    // 2. Run iPerf3 TCP upload/download
    // 3. Run iPerf3 UDP test
    // 4. Parse results
    // 5. Save to DB
    let _ = (&measurement_point_id, &measurement_run_id, &state);
    Err(AppError::Measurement {
        message: "Measurement module not yet implemented".into(),
    })
}

/// Saves a measurement result to the database.
#[tauri::command]
pub fn save_measurement(
    params: SaveMeasurementParams,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let measurement_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO measurements (
            id, measurement_point_id, measurement_run_id, frequency_band,
            rssi_dbm, noise_dbm,
            iperf_tcp_upload_bps, iperf_tcp_download_bps, iperf_tcp_retransmits,
            iperf_udp_throughput_bps, iperf_udp_jitter_ms,
            iperf_udp_lost_packets, iperf_udp_total_packets,
            raw_iperf_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            measurement_id,
            params.measurement_point_id,
            params.measurement_run_id,
            params.frequency_band,
            params.rssi_dbm,
            params.noise_dbm,
            params.iperf_tcp_upload_bps,
            params.iperf_tcp_download_bps,
            params.iperf_tcp_retransmits,
            params.iperf_udp_throughput_bps,
            params.iperf_udp_jitter_ms,
            params.iperf_udp_lost_packets,
            params.iperf_udp_total_packets,
            params.raw_iperf_json,
        ],
    )?;

    Ok(measurement_id)
}
