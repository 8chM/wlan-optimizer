use tauri::State;

use crate::db::models::{CreateWallParams, CreateWallsBatchParams, UpdateWallParams, Wall};
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

    // Verify the wall exists before performing any updates
    let wall_exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM walls WHERE id = ?1",
        [&params.wall_id],
        |row| row.get(0),
    )?;
    if !wall_exists {
        return Err(AppError::NotFound {
            entity: "Wall".into(),
            id: params.wall_id.clone(),
        });
    }

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

/// Creates multiple walls in a single transaction for batch operations.
///
/// All walls are created atomically: if any wall fails, none are persisted.
#[tauri::command]
pub fn create_walls_batch(
    params: CreateWallsBatchParams,
    state: State<'_, AppState>,
) -> Result<Vec<Wall>, AppError> {
    let mut conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    if params.walls.is_empty() {
        return Err(AppError::Validation {
            message: "Walls list must not be empty.".into(),
        });
    }

    // Verify the floor exists
    let floor_exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM floors WHERE id = ?1",
        [&params.floor_id],
        |row| row.get(0),
    )?;
    if !floor_exists {
        return Err(AppError::NotFound {
            entity: "Floor".into(),
            id: params.floor_id.clone(),
        });
    }

    let tx = conn.transaction().map_err(|e| AppError::Database {
        message: format!("Failed to begin transaction: {}", e),
    })?;

    let mut wall_ids: Vec<String> = Vec::with_capacity(params.walls.len());

    for entry in &params.walls {
        if entry.segments.is_empty() {
            // Dropping tx without commit triggers automatic rollback
            return Err(AppError::Validation {
                message: "Each wall must have at least one segment.".into(),
            });
        }

        let wall_id = uuid::Uuid::new_v4().to_string();

        tx.execute(
            "INSERT INTO walls (id, floor_id, material_id, attenuation_override_24ghz, attenuation_override_5ghz, attenuation_override_6ghz)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                wall_id,
                params.floor_id,
                entry.material_id,
                entry.attenuation_override_24ghz,
                entry.attenuation_override_5ghz,
                entry.attenuation_override_6ghz,
            ],
        )?;

        for seg in &entry.segments {
            let seg_id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO wall_segments (id, wall_id, segment_order, x1, y1, x2, y2)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    seg_id, wall_id, seg.segment_order,
                    seg.x1, seg.y1, seg.x2, seg.y2
                ],
            )?;
        }

        wall_ids.push(wall_id);
    }

    tx.commit().map_err(|e| AppError::Database {
        message: format!("Failed to commit transaction: {}", e),
    })?;

    // Fetch all created walls
    let mut walls: Vec<Wall> = Vec::with_capacity(wall_ids.len());
    for wall_id in &wall_ids {
        let wall = conn.query_row(
            "SELECT * FROM walls WHERE id = ?1",
            [wall_id],
            |row| Wall::from_row(row),
        )?;
        walls.push(wall);
    }

    Ok(walls)
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
