use tauri::State;

use crate::db::models::{CreateMaterialParams, Material, UpdateMaterialParams};
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

/// Gets a single material by ID.
#[tauri::command]
pub fn get_material(
    id: String,
    state: State<'_, AppState>,
) -> Result<Material, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let material = conn.query_row(
        "SELECT * FROM materials WHERE id = ?1",
        [&id],
        |row| Material::from_row(row),
    ).map_err(|_| AppError::NotFound {
        entity: "Material".into(),
        id: id.clone(),
    })?;

    Ok(material)
}

/// Creates a user-defined material.
///
/// User-defined materials have `is_user_defined = true` and `is_quick_category = false`.
#[tauri::command]
pub fn create_user_material(
    params: CreateMaterialParams,
    state: State<'_, AppState>,
) -> Result<Material, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate names are not empty
    if params.name_de.trim().is_empty() || params.name_en.trim().is_empty() {
        return Err(AppError::Validation {
            message: "Material names (DE and EN) must not be empty.".into(),
        });
    }

    // Validate attenuation values are non-negative
    if params.attenuation_24ghz_db < 0.0
        || params.attenuation_5ghz_db < 0.0
        || params.attenuation_6ghz_db < 0.0
    {
        return Err(AppError::Validation {
            message: "Attenuation values must be non-negative.".into(),
        });
    }

    let material_id = uuid::Uuid::new_v4().to_string();
    let is_floor = params.is_floor.unwrap_or(false);

    conn.execute(
        "INSERT INTO materials (
            id, name_de, name_en, category, default_thickness_cm,
            attenuation_24ghz_db, attenuation_5ghz_db, attenuation_6ghz_db,
            is_floor, is_user_defined, is_quick_category, icon
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, 0, ?10)",
        rusqlite::params![
            material_id,
            params.name_de,
            params.name_en,
            params.category,
            params.default_thickness_cm,
            params.attenuation_24ghz_db,
            params.attenuation_5ghz_db,
            params.attenuation_6ghz_db,
            is_floor as i32,
            params.icon,
        ],
    )?;

    let material = conn.query_row(
        "SELECT * FROM materials WHERE id = ?1",
        [&material_id],
        |row| Material::from_row(row),
    )?;

    Ok(material)
}

/// Updates an existing material.
///
/// Only user-defined materials can have their attenuation values changed.
/// Built-in materials can only have their display names updated.
#[tauri::command]
pub fn update_material(
    params: UpdateMaterialParams,
    state: State<'_, AppState>,
) -> Result<Material, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate names if provided
    if let Some(ref name) = params.name_de {
        if name.trim().is_empty() {
            return Err(AppError::Validation {
                message: "Material name (DE) must not be empty.".into(),
            });
        }
    }
    if let Some(ref name) = params.name_en {
        if name.trim().is_empty() {
            return Err(AppError::Validation {
                message: "Material name (EN) must not be empty.".into(),
            });
        }
    }

    // Validate attenuation values if provided
    if let Some(att) = params.attenuation_24ghz_db {
        if att < 0.0 {
            return Err(AppError::Validation {
                message: "Attenuation (2.4 GHz) must be non-negative.".into(),
            });
        }
    }
    if let Some(att) = params.attenuation_5ghz_db {
        if att < 0.0 {
            return Err(AppError::Validation {
                message: "Attenuation (5 GHz) must be non-negative.".into(),
            });
        }
    }
    if let Some(att) = params.attenuation_6ghz_db {
        if att < 0.0 {
            return Err(AppError::Validation {
                message: "Attenuation (6 GHz) must be non-negative.".into(),
            });
        }
    }

    // Check if the material is built-in (not user-defined).
    // Built-in materials only allow name updates, not attenuation or structural changes.
    let is_user_defined: bool = conn
        .query_row(
            "SELECT is_user_defined FROM materials WHERE id = ?1",
            [&params.id],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .map_err(|_| AppError::NotFound {
            entity: "Material".into(),
            id: params.id.clone(),
        })?;

    let rows = if is_user_defined {
        // User-defined materials: all fields can be updated
        conn.execute(
            "UPDATE materials SET
                name_de = COALESCE(?1, name_de),
                name_en = COALESCE(?2, name_en),
                category = COALESCE(?3, category),
                default_thickness_cm = COALESCE(?4, default_thickness_cm),
                attenuation_24ghz_db = COALESCE(?5, attenuation_24ghz_db),
                attenuation_5ghz_db = COALESCE(?6, attenuation_5ghz_db),
                attenuation_6ghz_db = COALESCE(?7, attenuation_6ghz_db),
                is_floor = COALESCE(?8, is_floor),
                icon = COALESCE(?9, icon),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?10",
            rusqlite::params![
                params.name_de,
                params.name_en,
                params.category,
                params.default_thickness_cm,
                params.attenuation_24ghz_db,
                params.attenuation_5ghz_db,
                params.attenuation_6ghz_db,
                params.is_floor.map(|b| b as i32),
                params.icon,
                params.id,
            ],
        )?
    } else {
        // Built-in materials: only name_de and name_en can be updated.
        // Reject attempts to change attenuation or other structural properties.
        if params.attenuation_24ghz_db.is_some()
            || params.attenuation_5ghz_db.is_some()
            || params.attenuation_6ghz_db.is_some()
            || params.category.is_some()
            || params.default_thickness_cm.is_some()
            || params.is_floor.is_some()
            || params.icon.is_some()
        {
            return Err(AppError::Validation {
                message: "Built-in materials can only have their display names (name_de, name_en) updated.".into(),
            });
        }

        conn.execute(
            "UPDATE materials SET
                name_de = COALESCE(?1, name_de),
                name_en = COALESCE(?2, name_en),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?3",
            rusqlite::params![params.name_de, params.name_en, params.id],
        )?
    };

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "Material".into(),
            id: params.id.clone(),
        });
    }

    let material = conn.query_row(
        "SELECT * FROM materials WHERE id = ?1",
        [&params.id],
        |row| Material::from_row(row),
    )?;

    Ok(material)
}
