// JSON project export/import
//
// Serializes/deserializes full project data for backup and sharing.
//
// TODO: Implement in Phase 8e

use crate::error::AppError;

/// Exports a complete project as a JSON string.
pub fn export_project_json(_project_id: &str) -> Result<String, AppError> {
    Err(AppError::Export {
        message: "Project export not yet implemented".into(),
    })
}

/// Imports a project from a JSON string.
pub fn import_project_json(_json: &str) -> Result<String, AppError> {
    Err(AppError::Export {
        message: "Project import not yet implemented".into(),
    })
}
