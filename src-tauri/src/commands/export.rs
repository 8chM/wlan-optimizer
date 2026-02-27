use tauri::State;

use crate::error::AppError;
use crate::export::project;
use crate::state::AppState;

/// Exports a project in the specified format (json or csv).
///
/// Returns the serialized data as a String. The frontend handles
/// file saving via the Tauri dialog plugin.
#[tauri::command]
pub fn export_project(
    project_id: String,
    format: String,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    // Validate format
    let format_lower = format.to_lowercase();
    if format_lower != "json" && format_lower != "csv" {
        return Err(AppError::Validation {
            message: format!(
                "Invalid export format '{}'. Must be 'json' or 'csv'.",
                format
            ),
        });
    }

    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    match format_lower.as_str() {
        "json" => project::export_project_json(&conn, &project_id),
        "csv" => project::export_project_csv(&conn, &project_id),
        _ => unreachable!(),
    }
}
