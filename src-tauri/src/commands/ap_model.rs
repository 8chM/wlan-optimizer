use tauri::State;

use crate::db::models::ApModel;
use crate::error::AppError;
use crate::state::AppState;

/// Lists all available AP models (built-in + user-defined).
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
