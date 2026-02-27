use tauri::State;

use crate::db::models::{ApModel, CreateApModelParams};
use crate::error::AppError;
use crate::state::AppState;

/// Lists all available AP models (built-in + user-defined).
///
/// Results are ordered with built-in models first, then user-defined,
/// each group sorted alphabetically by manufacturer and model name.
#[tauri::command]
pub fn list_ap_models(state: State<'_, AppState>) -> Result<Vec<ApModel>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let mut stmt = conn.prepare(
        "SELECT * FROM ap_models ORDER BY is_user_defined, manufacturer, model",
    )?;
    let models = stmt
        .query_map([], |row| ApModel::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(models)
}

/// Gets a single AP model by ID.
#[tauri::command]
pub fn get_ap_model(
    id: String,
    state: State<'_, AppState>,
) -> Result<ApModel, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let model = conn.query_row(
        "SELECT * FROM ap_models WHERE id = ?1",
        [&id],
        |row| ApModel::from_row(row),
    ).map_err(|_| AppError::NotFound {
        entity: "ApModel".into(),
        id: id.clone(),
    })?;

    Ok(model)
}

/// Creates a custom (user-defined) AP model.
///
/// User-defined AP models have `is_user_defined = true` and can be edited or deleted.
#[tauri::command]
pub fn create_custom_ap_model(
    params: CreateApModelParams,
    state: State<'_, AppState>,
) -> Result<ApModel, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate required fields
    if params.manufacturer.trim().is_empty() {
        return Err(AppError::Validation {
            message: "Manufacturer must not be empty.".into(),
        });
    }
    if params.model.trim().is_empty() {
        return Err(AppError::Validation {
            message: "Model name must not be empty.".into(),
        });
    }

    // Validate TX power values if provided (must be reasonable range)
    for (label, value) in [
        ("2.4 GHz TX power", params.max_tx_power_24ghz_dbm),
        ("5 GHz TX power", params.max_tx_power_5ghz_dbm),
        ("6 GHz TX power", params.max_tx_power_6ghz_dbm),
    ] {
        if let Some(power) = value {
            if power < 0.0 || power > 36.0 {
                return Err(AppError::Validation {
                    message: format!("{} must be between 0 and 36 dBm.", label),
                });
            }
        }
    }

    // Validate antenna gain values if provided
    for (label, value) in [
        ("2.4 GHz antenna gain", params.antenna_gain_24ghz_dbi),
        ("5 GHz antenna gain", params.antenna_gain_5ghz_dbi),
        ("6 GHz antenna gain", params.antenna_gain_6ghz_dbi),
    ] {
        if let Some(gain) = value {
            if gain < 0.0 || gain > 20.0 {
                return Err(AppError::Validation {
                    message: format!("{} must be between 0 and 20 dBi.", label),
                });
            }
        }
    }

    let model_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO ap_models (
            id, manufacturer, model, wifi_standard,
            max_tx_power_24ghz_dbm, max_tx_power_5ghz_dbm, max_tx_power_6ghz_dbm,
            antenna_gain_24ghz_dbi, antenna_gain_5ghz_dbi, antenna_gain_6ghz_dbi,
            mimo_streams,
            supported_channels_24ghz, supported_channels_5ghz, supported_channels_6ghz,
            is_user_defined
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1)",
        rusqlite::params![
            model_id,
            params.manufacturer,
            params.model,
            params.wifi_standard,
            params.max_tx_power_24ghz_dbm,
            params.max_tx_power_5ghz_dbm,
            params.max_tx_power_6ghz_dbm,
            params.antenna_gain_24ghz_dbi,
            params.antenna_gain_5ghz_dbi,
            params.antenna_gain_6ghz_dbi,
            params.mimo_streams,
            params.supported_channels_24ghz,
            params.supported_channels_5ghz,
            params.supported_channels_6ghz,
        ],
    )?;

    let ap_model = conn.query_row(
        "SELECT * FROM ap_models WHERE id = ?1",
        [&model_id],
        |row| ApModel::from_row(row),
    )?;

    Ok(ap_model)
}
