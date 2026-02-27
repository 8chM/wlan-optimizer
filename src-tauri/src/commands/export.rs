use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

/// Exports a project as JSON.
#[tauri::command]
pub fn export_project(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    // TODO: Implement full export in Phase 8e
    let _ = (&project_id, &state);
    Err(AppError::Export {
        message: "Export module not yet implemented".into(),
    })
}
