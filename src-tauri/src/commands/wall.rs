use tauri::State;

use crate::db::models::{CreateWallParams, UpdateWallParams, Wall};
use crate::error::AppError;
use crate::state::AppState;

/// Creates a new wall with its segments.
#[tauri::command]
pub fn create_wall(
    params: CreateWallParams,
    state: State<'_, AppState>,
) -> Result<Wall, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let wall_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO walls (id, floor_id, material_id) VALUES (?1, ?2, ?3)",
        rusqlite::params![wall_id, params.floor_id, params.material_id],
    )?;

    for seg in &params.segments {
        let seg_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO wall_segments (id, wall_id, segment_order, x1, y1, x2, y2)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![seg_id, wall_id, seg.segment_order, seg.x1, seg.y1, seg.x2, seg.y2],
        )?;
    }

    let wall = conn.query_row(
        "SELECT * FROM walls WHERE id = ?1",
        [&wall_id],
        |row| Wall::from_row(row),
    )?;

    Ok(wall)
}

/// Updates an existing wall (material, segments, attenuation overrides).
#[tauri::command]
pub fn update_wall(
    params: UpdateWallParams,
    state: State<'_, AppState>,
) -> Result<Wall, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    if let Some(ref material_id) = params.material_id {
        conn.execute(
            "UPDATE walls SET material_id = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?2",
            rusqlite::params![material_id, params.wall_id],
        )?;
    }

    if let Some(ref segments) = params.segments {
        conn.execute(
            "DELETE FROM wall_segments WHERE wall_id = ?1",
            [&params.wall_id],
        )?;
        for seg in segments {
            let seg_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO wall_segments (id, wall_id, segment_order, x1, y1, x2, y2)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    seg_id, params.wall_id, seg.segment_order,
                    seg.x1, seg.y1, seg.x2, seg.y2
                ],
            )?;
        }
    }

    // Update attenuation overrides if provided
    conn.execute(
        "UPDATE walls SET
            attenuation_override_24ghz = COALESCE(?1, attenuation_override_24ghz),
            attenuation_override_5ghz = COALESCE(?2, attenuation_override_5ghz),
            attenuation_override_6ghz = COALESCE(?3, attenuation_override_6ghz),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?4",
        rusqlite::params![
            params.attenuation_override_24ghz,
            params.attenuation_override_5ghz,
            params.attenuation_override_6ghz,
            params.wall_id,
        ],
    )?;

    let wall = conn.query_row(
        "SELECT * FROM walls WHERE id = ?1",
        [&params.wall_id],
        |row| Wall::from_row(row),
    )?;

    Ok(wall)
}

/// Deletes a wall and its segments (cascading).
#[tauri::command]
pub fn delete_wall(
    wall_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;
    let rows = conn.execute("DELETE FROM walls WHERE id = ?1", [&wall_id])?;
    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "Wall".into(),
            id: wall_id,
        });
    }
    Ok(())
}
