use tauri::State;

use crate::db::models::Material;
use crate::error::AppError;
use crate::state::AppState;

/// Lists all materials, optionally filtered by floor/wall type.
#[tauri::command]
pub fn list_materials(
    is_floor: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<Material>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let query = match is_floor {
        Some(true) => "SELECT * FROM materials WHERE is_floor = 1 ORDER BY category, name_en",
        Some(false) => "SELECT * FROM materials WHERE is_floor = 0 ORDER BY is_quick_category DESC, category, name_en",
        None => "SELECT * FROM materials ORDER BY is_floor, is_quick_category DESC, category, name_en",
    };

    let mut stmt = conn.prepare(query)?;
    let materials = stmt
        .query_map([], |row| Material::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(materials)
}
