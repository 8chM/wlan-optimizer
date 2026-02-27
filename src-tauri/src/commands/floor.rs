use tauri::State;

use crate::db::models::{
    AccessPoint, AccessPointWithModel, ApModel, Floor, FloorData, Material,
    MeasurementPoint, Wall, WallSegment, WallWithSegments,
};
use crate::error::AppError;
use crate::state::AppState;

/// Loads all data for a single floor (walls, APs, measurement points).
/// This is the primary data-loading command for the editor view.
#[tauri::command]
pub fn get_floor_data(
    floor_id: String,
    state: State<'_, AppState>,
) -> Result<FloorData, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Load floor
    let floor = conn.query_row(
        "SELECT * FROM floors WHERE id = ?1",
        [&floor_id],
        |row| Floor::from_row(row),
    )?;

    // Load walls with segments and materials
    let mut wall_stmt = conn.prepare(
        "SELECT * FROM walls WHERE floor_id = ?1 ORDER BY created_at",
    )?;
    let walls_raw: Vec<Wall> = wall_stmt
        .query_map([&floor_id], |row| Wall::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut walls: Vec<WallWithSegments> = Vec::new();
    for wall in walls_raw {
        let material = conn.query_row(
            "SELECT * FROM materials WHERE id = ?1",
            [&wall.material_id],
            |row| Material::from_row(row),
        )?;

        let mut seg_stmt = conn.prepare(
            "SELECT * FROM wall_segments WHERE wall_id = ?1 ORDER BY segment_order",
        )?;
        let segments: Vec<WallSegment> = seg_stmt
            .query_map([&wall.id], |row| WallSegment::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        walls.push(WallWithSegments {
            wall,
            material,
            segments,
        });
    }

    // Load access points with models
    let mut ap_stmt = conn.prepare(
        "SELECT * FROM access_points WHERE floor_id = ?1 ORDER BY created_at",
    )?;
    let aps_raw: Vec<AccessPoint> = ap_stmt
        .query_map([&floor_id], |row| AccessPoint::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut access_points: Vec<AccessPointWithModel> = Vec::new();
    for ap in aps_raw {
        let ap_model = if let Some(ref model_id) = ap.ap_model_id {
            conn.query_row(
                "SELECT * FROM ap_models WHERE id = ?1",
                [model_id],
                |row| ApModel::from_row(row),
            )
            .ok()
        } else {
            None
        };
        access_points.push(AccessPointWithModel {
            access_point: ap,
            ap_model,
        });
    }

    // Load measurement points
    let mut mp_stmt = conn.prepare(
        "SELECT * FROM measurement_points WHERE floor_id = ?1 ORDER BY label",
    )?;
    let measurement_points: Vec<MeasurementPoint> = mp_stmt
        .query_map([&floor_id], |row| {
            Ok(MeasurementPoint {
                id: row.get("id")?,
                floor_id: row.get("floor_id")?,
                label: row.get("label")?,
                x: row.get("x")?,
                y: row.get("y")?,
                auto_generated: row.get::<_, i32>("auto_generated")? != 0,
                notes: row.get("notes")?,
                created_at: row.get("created_at")?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(FloorData {
        floor,
        walls,
        access_points,
        measurement_points,
    })
}
