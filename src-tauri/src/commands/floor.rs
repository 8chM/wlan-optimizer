use std::collections::HashMap;

use tauri::State;

use crate::db::models::{
    AccessPoint, AccessPointWithModel, ApModel, CreateFloorParams, Floor, FloorData,
    FloorImage, Material, MeasurementPoint, UpdateFloorParams, Wall, WallSegment,
    WallWithSegments, FLOOR_COLUMNS_WITHOUT_IMAGE,
};
use crate::error::AppError;
use crate::state::AppState;

/// Creates a new floor for a project.
#[tauri::command]
pub fn create_floor(
    params: CreateFloorParams,
    state: State<'_, AppState>,
) -> Result<Floor, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate name is not empty
    if params.name.trim().is_empty() {
        return Err(AppError::Validation {
            message: "Floor name must not be empty.".into(),
        });
    }

    // Verify the project exists
    let project_exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM projects WHERE id = ?1",
        [&params.project_id],
        |row| row.get(0),
    )?;
    if !project_exists {
        return Err(AppError::NotFound {
            entity: "Project".into(),
            id: params.project_id.clone(),
        });
    }

    let floor_id = uuid::Uuid::new_v4().to_string();
    let ceiling_height = params.ceiling_height_m.unwrap_or(2.5);

    conn.execute(
        "INSERT INTO floors (id, project_id, name, floor_number, ceiling_height_m, floor_material_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            floor_id,
            params.project_id,
            params.name,
            params.floor_number,
            ceiling_height,
            params.floor_material_id,
        ],
    )?;

    let floor = conn.query_row(
        "SELECT * FROM floors WHERE id = ?1",
        [&floor_id],
        |row| Floor::from_row(row),
    )?;

    Ok(floor)
}

/// Imports a floor plan image as a BLOB into the database.
#[tauri::command]
pub fn import_floor_image(
    floor_id: String,
    image_data: Vec<u8>,
    format: String,
    state: State<'_, AppState>,
) -> Result<Floor, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate image format
    let allowed_formats = ["png", "jpg", "jpeg", "webp", "svg"];
    let format_lower = format.to_lowercase();
    if !allowed_formats.contains(&format_lower.as_str()) {
        return Err(AppError::Validation {
            message: format!(
                "Invalid image format '{}'. Allowed: {}.",
                format,
                allowed_formats.join(", ")
            ),
        });
    }

    // Validate image data is not empty
    if image_data.is_empty() {
        return Err(AppError::Validation {
            message: "Image data must not be empty.".into(),
        });
    }

    let rows = conn.execute(
        "UPDATE floors SET
            background_image = ?1,
            background_image_format = ?2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?3",
        rusqlite::params![image_data, format_lower, floor_id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "Floor".into(),
            id: floor_id,
        });
    }

    let floor = conn.query_row(
        "SELECT * FROM floors WHERE id = ?1",
        [&floor_id],
        |row| Floor::from_row(row),
    )?;

    Ok(floor)
}

/// Sets the scale (pixels per meter) and physical dimensions for a floor.
#[tauri::command]
pub fn set_floor_scale(
    floor_id: String,
    px_per_meter: f64,
    width_meters: f64,
    height_meters: f64,
    state: State<'_, AppState>,
) -> Result<Floor, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate scale values are positive
    if px_per_meter <= 0.0 {
        return Err(AppError::Validation {
            message: "Pixels per meter must be a positive value.".into(),
        });
    }
    if width_meters <= 0.0 || height_meters <= 0.0 {
        return Err(AppError::Validation {
            message: "Width and height must be positive values.".into(),
        });
    }

    let rows = conn.execute(
        "UPDATE floors SET
            scale_px_per_meter = ?1,
            width_meters = ?2,
            height_meters = ?3,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?4",
        rusqlite::params![px_per_meter, width_meters, height_meters, floor_id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "Floor".into(),
            id: floor_id,
        });
    }

    let floor = conn.query_row(
        "SELECT * FROM floors WHERE id = ?1",
        [&floor_id],
        |row| Floor::from_row(row),
    )?;

    Ok(floor)
}

/// Updates a floor's metadata (name, ceiling height, etc.).
#[tauri::command]
pub fn update_floor(
    params: UpdateFloorParams,
    state: State<'_, AppState>,
) -> Result<Floor, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Validate name if provided
    if let Some(ref name) = params.name {
        if name.trim().is_empty() {
            return Err(AppError::Validation {
                message: "Floor name must not be empty.".into(),
            });
        }
    }

    // Validate ceiling height if provided
    if let Some(ceiling_height) = params.ceiling_height_m {
        if ceiling_height <= 0.0 {
            return Err(AppError::Validation {
                message: "Ceiling height must be a positive value.".into(),
            });
        }
    }

    let rows = conn.execute(
        "UPDATE floors SET
            name = COALESCE(?1, name),
            floor_number = COALESCE(?2, floor_number),
            ceiling_height_m = COALESCE(?3, ceiling_height_m),
            floor_material_id = COALESCE(?4, floor_material_id),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?5",
        rusqlite::params![
            params.name,
            params.floor_number,
            params.ceiling_height_m,
            params.floor_material_id,
            params.id,
        ],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "Floor".into(),
            id: params.id.clone(),
        });
    }

    let floor = conn.query_row(
        "SELECT * FROM floors WHERE id = ?1",
        [&params.id],
        |row| Floor::from_row(row),
    )?;

    Ok(floor)
}

/// Lists all floors for a given project, ordered by floor number.
/// Excludes the `background_image` BLOB to keep the response lightweight.
#[tauri::command]
pub fn get_floors_by_project(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Floor>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let query = format!(
        "SELECT {} FROM floors WHERE project_id = ?1 ORDER BY floor_number ASC",
        FLOOR_COLUMNS_WITHOUT_IMAGE,
    );
    let mut stmt = conn.prepare(&query)?;
    let floors = stmt
        .query_map([&project_id], |row| Floor::from_row_without_image(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(floors)
}

/// Loads all data for a single floor (walls, APs, measurement points).
/// This is the primary data-loading command for the editor view.
///
/// Uses batch queries (5 total) instead of N+1 queries per wall/AP:
/// 1. Floor (without background_image BLOB)
/// 2. Walls with Materials via JOIN
/// 3. All WallSegments for the floor
/// 4. Access Points with AP Models via LEFT JOIN
/// 5. Measurement Points
#[tauri::command]
pub fn get_floor_data(
    floor_id: String,
    state: State<'_, AppState>,
) -> Result<FloorData, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Query 1: Load floor (without background_image BLOB)
    let floor_query = format!(
        "SELECT {} FROM floors WHERE id = ?1",
        FLOOR_COLUMNS_WITHOUT_IMAGE,
    );
    let floor = conn.query_row(&floor_query, [&floor_id], |row| {
        Floor::from_row_without_image(row)
    })?;

    // Query 2: Load all walls + their materials via JOIN (1 query instead of N)
    let mut wall_mat_stmt = conn.prepare(
        "SELECT
            w.id AS w_id, w.floor_id AS w_floor_id, w.material_id AS w_material_id,
            w.attenuation_override_24ghz, w.attenuation_override_5ghz,
            w.attenuation_override_6ghz,
            w.created_at AS w_created_at, w.updated_at AS w_updated_at,
            m.id AS m_id, m.name_de, m.name_en, m.category, m.default_thickness_cm,
            m.attenuation_24ghz_db, m.attenuation_5ghz_db, m.attenuation_6ghz_db,
            m.is_floor, m.is_user_defined, m.is_quick_category, m.icon,
            m.created_at AS m_created_at, m.updated_at AS m_updated_at
         FROM walls w
         INNER JOIN materials m ON w.material_id = m.id
         WHERE w.floor_id = ?1
         ORDER BY w.created_at",
    )?;

    let walls_with_materials: Vec<(Wall, Material)> = wall_mat_stmt
        .query_map([&floor_id], |row| {
            let wall = Wall {
                id: row.get("w_id")?,
                floor_id: row.get("w_floor_id")?,
                material_id: row.get("w_material_id")?,
                attenuation_override_24ghz: row.get("attenuation_override_24ghz")?,
                attenuation_override_5ghz: row.get("attenuation_override_5ghz")?,
                attenuation_override_6ghz: row.get("attenuation_override_6ghz")?,
                created_at: row.get("w_created_at")?,
                updated_at: row.get("w_updated_at")?,
            };
            let material = Material {
                id: row.get("m_id")?,
                name_de: row.get("name_de")?,
                name_en: row.get("name_en")?,
                category: row.get("category")?,
                default_thickness_cm: row.get("default_thickness_cm")?,
                attenuation_24ghz_db: row.get("attenuation_24ghz_db")?,
                attenuation_5ghz_db: row.get("attenuation_5ghz_db")?,
                attenuation_6ghz_db: row.get("attenuation_6ghz_db")?,
                is_floor: row.get::<_, i32>("is_floor")? != 0,
                is_user_defined: row.get::<_, i32>("is_user_defined")? != 0,
                is_quick_category: row.get::<_, i32>("is_quick_category")? != 0,
                icon: row.get("icon")?,
                created_at: row.get("m_created_at")?,
                updated_at: row.get("m_updated_at")?,
            };
            Ok((wall, material))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Query 3: Load ALL wall segments for this floor in one batch
    let mut seg_stmt = conn.prepare(
        "SELECT ws.* FROM wall_segments ws
         INNER JOIN walls w ON ws.wall_id = w.id
         WHERE w.floor_id = ?1
         ORDER BY ws.wall_id, ws.segment_order",
    )?;
    let all_segments: Vec<WallSegment> = seg_stmt
        .query_map([&floor_id], |row| WallSegment::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    // Group segments by wall_id in Rust
    let mut segments_by_wall: HashMap<String, Vec<WallSegment>> = HashMap::new();
    for segment in all_segments {
        segments_by_wall
            .entry(segment.wall_id.clone())
            .or_default()
            .push(segment);
    }

    // Assemble WallWithSegments from the batch data
    let walls: Vec<WallWithSegments> = walls_with_materials
        .into_iter()
        .map(|(wall, material)| {
            let segments = segments_by_wall.remove(&wall.id).unwrap_or_default();
            WallWithSegments {
                wall,
                material,
                segments,
            }
        })
        .collect();

    // Query 4: Load access points with models via LEFT JOIN (1 query instead of N)
    let mut ap_stmt = conn.prepare(
        "SELECT
            ap.id AS ap_id, ap.floor_id AS ap_floor_id, ap.ap_model_id,
            ap.label, ap.x, ap.y, ap.height_m, ap.mounting,
            ap.tx_power_24ghz_dbm, ap.tx_power_5ghz_dbm, ap.tx_power_6ghz_dbm,
            ap.channel_24ghz, ap.channel_5ghz, ap.channel_6ghz,
            ap.channel_width, ap.band_steering_enabled,
            ap.ip_address, ap.ssid, ap.enabled,
            ap.created_at AS ap_created_at, ap.updated_at AS ap_updated_at,
            apm.id AS apm_id, apm.manufacturer, apm.model, apm.wifi_standard,
            apm.max_tx_power_24ghz_dbm, apm.max_tx_power_5ghz_dbm,
            apm.max_tx_power_6ghz_dbm,
            apm.antenna_gain_24ghz_dbi, apm.antenna_gain_5ghz_dbi,
            apm.antenna_gain_6ghz_dbi,
            apm.mimo_streams,
            apm.supported_channels_24ghz, apm.supported_channels_5ghz,
            apm.supported_channels_6ghz,
            apm.is_user_defined AS apm_is_user_defined,
            apm.created_at AS apm_created_at, apm.updated_at AS apm_updated_at
         FROM access_points ap
         LEFT JOIN ap_models apm ON ap.ap_model_id = apm.id
         WHERE ap.floor_id = ?1
         ORDER BY ap.created_at",
    )?;

    let access_points: Vec<AccessPointWithModel> = ap_stmt
        .query_map([&floor_id], |row| {
            let access_point = AccessPoint {
                id: row.get("ap_id")?,
                floor_id: row.get("ap_floor_id")?,
                ap_model_id: row.get("ap_model_id")?,
                label: row.get("label")?,
                x: row.get("x")?,
                y: row.get("y")?,
                height_m: row.get("height_m")?,
                mounting: row.get("mounting")?,
                tx_power_24ghz_dbm: row.get("tx_power_24ghz_dbm")?,
                tx_power_5ghz_dbm: row.get("tx_power_5ghz_dbm")?,
                tx_power_6ghz_dbm: row.get("tx_power_6ghz_dbm")?,
                channel_24ghz: row.get("channel_24ghz")?,
                channel_5ghz: row.get("channel_5ghz")?,
                channel_6ghz: row.get("channel_6ghz")?,
                channel_width: row.get("channel_width")?,
                band_steering_enabled: row.get::<_, i32>("band_steering_enabled")? != 0,
                ip_address: row.get("ip_address")?,
                ssid: row.get("ssid")?,
                enabled: row.get::<_, i32>("enabled")? != 0,
                created_at: row.get("ap_created_at")?,
                updated_at: row.get("ap_updated_at")?,
            };
            let ap_model: Option<ApModel> = match row.get::<_, Option<String>>("apm_id")? {
                Some(apm_id) => Some(ApModel {
                    id: apm_id,
                    manufacturer: row.get("manufacturer")?,
                    model: row.get("model")?,
                    wifi_standard: row.get("wifi_standard")?,
                    max_tx_power_24ghz_dbm: row.get("max_tx_power_24ghz_dbm")?,
                    max_tx_power_5ghz_dbm: row.get("max_tx_power_5ghz_dbm")?,
                    max_tx_power_6ghz_dbm: row.get("max_tx_power_6ghz_dbm")?,
                    antenna_gain_24ghz_dbi: row.get("antenna_gain_24ghz_dbi")?,
                    antenna_gain_5ghz_dbi: row.get("antenna_gain_5ghz_dbi")?,
                    antenna_gain_6ghz_dbi: row.get("antenna_gain_6ghz_dbi")?,
                    mimo_streams: row.get("mimo_streams")?,
                    supported_channels_24ghz: row.get("supported_channels_24ghz")?,
                    supported_channels_5ghz: row.get("supported_channels_5ghz")?,
                    supported_channels_6ghz: row.get("supported_channels_6ghz")?,
                    is_user_defined: row.get::<_, i32>("apm_is_user_defined")? != 0,
                    created_at: row.get("apm_created_at")?,
                    updated_at: row.get("apm_updated_at")?,
                }),
                None => None,
            };
            Ok(AccessPointWithModel {
                access_point,
                ap_model,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Query 5: Load measurement points (single query, no N+1 here)
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

/// Loads only the floor plan image data for a specific floor.
/// Use this command when the frontend needs to display the background image,
/// rather than loading it with every `get_floor_data` call.
#[tauri::command]
pub fn get_floor_image(
    floor_id: String,
    state: State<'_, AppState>,
) -> Result<Option<FloorImage>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let result = conn.query_row(
        "SELECT id, background_image, background_image_format FROM floors WHERE id = ?1",
        [&floor_id],
        |row| {
            let image: Option<Vec<u8>> = row.get("background_image")?;
            let format: Option<String> = row.get("background_image_format")?;
            let id: String = row.get("id")?;
            Ok((id, image, format))
        },
    );

    match result {
        Ok((id, Some(image), format)) => Ok(Some(FloorImage {
            id,
            background_image: Some(image),
            background_image_format: format,
        })),
        Ok((_, None, _)) => Ok(None),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound {
            entity: "Floor".into(),
            id: floor_id,
        }),
        Err(e) => Err(AppError::from(e)),
    }
}
