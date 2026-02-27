use tauri::State;

use crate::db::models::{CreateProjectParams, Project, UpdateProjectParams};
use crate::error::AppError;
use crate::state::AppState;

/// Lists all projects, ordered by last updated.
#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;
    let mut stmt = conn.prepare(
        "SELECT * FROM projects ORDER BY updated_at DESC",
    )?;
    let projects = stmt
        .query_map([], |row| Project::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(projects)
}

/// Gets a single project by ID.
#[tauri::command]
pub fn get_project(id: String, state: State<'_, AppState>) -> Result<Project, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;
    let project = conn.query_row(
        "SELECT * FROM projects WHERE id = ?1",
        [&id],
        |row| Project::from_row(row),
    )?;
    Ok(project)
}

/// Creates a new project with a default floor and heatmap settings.
#[tauri::command]
pub fn create_project(
    params: CreateProjectParams,
    state: State<'_, AppState>,
) -> Result<Project, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let project_id = uuid::Uuid::new_v4().to_string();
    let locale = params.locale.unwrap_or_else(|| "de".to_string());

    conn.execute(
        "INSERT INTO projects (id, name, description, locale) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![project_id, params.name, params.description, locale],
    )?;

    // Create default floor
    let floor_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO floors (id, project_id, name, floor_number) VALUES (?1, ?2, ?3, 0)",
        rusqlite::params![floor_id, project_id, "Ground Floor"],
    )?;

    // Create default heatmap settings
    let hs_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO heatmap_settings (id, project_id) VALUES (?1, ?2)",
        rusqlite::params![hs_id, project_id],
    )?;

    let project = conn.query_row(
        "SELECT * FROM projects WHERE id = ?1",
        [&project_id],
        |row| Project::from_row(row),
    )?;

    Ok(project)
}

/// Updates a project's name, description, and/or locale.
#[tauri::command]
pub fn update_project(
    params: UpdateProjectParams,
    state: State<'_, AppState>,
) -> Result<Project, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate locale if provided
    if let Some(ref locale) = params.locale {
        if locale != "de" && locale != "en" {
            return Err(AppError::Validation {
                message: format!("Invalid locale '{}'. Must be 'de' or 'en'.", locale),
            });
        }
    }

    // Validate name is not empty if provided
    if let Some(ref name) = params.name {
        if name.trim().is_empty() {
            return Err(AppError::Validation {
                message: "Project name must not be empty.".into(),
            });
        }
    }

    conn.execute(
        "UPDATE projects SET
            name = COALESCE(?1, name),
            description = COALESCE(?2, description),
            locale = COALESCE(?3, locale),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?4",
        rusqlite::params![params.name, params.description, params.locale, params.id],
    )?;

    let project = conn.query_row(
        "SELECT * FROM projects WHERE id = ?1",
        [&params.id],
        |row| Project::from_row(row),
    ).map_err(|_| AppError::NotFound {
        entity: "Project".into(),
        id: params.id.clone(),
    })?;

    Ok(project)
}

/// Deletes a project and all related data (cascading).
#[tauri::command]
pub fn delete_project(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;
    let rows = conn.execute("DELETE FROM projects WHERE id = ?1", [&id])?;
    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "Project".into(),
            id,
        });
    }
    Ok(())
}
