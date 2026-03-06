use tauri::State;

use crate::db::models::{AccessPoint, CreateAccessPointParams, UpdateAccessPointParams};
use crate::error::AppError;
use crate::state::AppState;

/// Creates a new access point on a floor.
#[tauri::command]
pub fn create_access_point(
    params: CreateAccessPointParams,
    state: State<'_, AppState>,
) -> Result<AccessPoint, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let ap_id = uuid::Uuid::new_v4().to_string();
    let height = params.height_m.unwrap_or(2.5);
    let mounting = params.mounting.unwrap_or_else(|| "ceiling".to_string());

    conn.execute(
        "INSERT INTO access_points (id, floor_id, ap_model_id, label, x, y, height_m, mounting)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            ap_id, params.floor_id, params.ap_model_id, params.label,
            params.x, params.y, height, mounting,
        ],
    )?;

    let ap = conn.query_row(
        "SELECT * FROM access_points WHERE id = ?1",
        [&ap_id],
        |row| AccessPoint::from_row(row),
    )?;

    Ok(ap)
}

/// Updates an existing access point.
#[tauri::command]
pub fn update_access_point(
    params: UpdateAccessPointParams,
    state: State<'_, AppState>,
) -> Result<AccessPoint, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    conn.execute(
        "UPDATE access_points SET
            x = COALESCE(?1, x),
            y = COALESCE(?2, y),
            height_m = COALESCE(?3, height_m),
            mounting = COALESCE(?4, mounting),
            tx_power_24ghz_dbm = COALESCE(?5, tx_power_24ghz_dbm),
            tx_power_5ghz_dbm = COALESCE(?6, tx_power_5ghz_dbm),
            tx_power_6ghz_dbm = COALESCE(?7, tx_power_6ghz_dbm),
            channel_24ghz = COALESCE(?8, channel_24ghz),
            channel_5ghz = COALESCE(?9, channel_5ghz),
            channel_6ghz = COALESCE(?10, channel_6ghz),
            channel_width = COALESCE(?11, channel_width),
            enabled = COALESCE(?12, enabled),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?13",
        rusqlite::params![
            params.x, params.y, params.height_m, params.mounting,
            params.tx_power_24ghz_dbm, params.tx_power_5ghz_dbm, params.tx_power_6ghz_dbm,
            params.channel_24ghz, params.channel_5ghz, params.channel_6ghz,
            params.channel_width, params.enabled,
            params.access_point_id,
        ],
    )?;

    let ap = conn.query_row(
        "SELECT * FROM access_points WHERE id = ?1",
        [&params.access_point_id],
        |row| AccessPoint::from_row(row),
    )?;

    Ok(ap)
}

/// Deletes an access point.
#[tauri::command]
pub fn delete_access_point(
    access_point_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;
    let rows = conn.execute(
        "DELETE FROM access_points WHERE id = ?1",
        [&access_point_id],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "AccessPoint".into(),
            id: access_point_id,
        });
    }
    Ok(())
}
