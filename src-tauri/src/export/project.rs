// JSON and CSV project export.
//
// Serializes full project data for backup and sharing.
// - JSON: Structured hierarchical export of all project entities.
// - CSV: Flat measurement table with floor/AP/run context columns.

use rusqlite::Connection;
use serde::Serialize;

use crate::db::models::{
    AccessPoint, Floor, Measurement, MeasurementPoint, MeasurementRun, OptimizationPlan,
    OptimizationStep, Project, Wall, WallSegment, FLOOR_COLUMNS_WITHOUT_IMAGE,
};
use crate::error::AppError;

// =============================================================================
// Export data structures (JSON format)
// =============================================================================

/// Top-level export envelope containing all project data.
#[derive(Debug, Serialize)]
pub struct ProjectExport {
    pub version: String,
    pub exported_at: String,
    pub project: Project,
    pub floors: Vec<FloorExport>,
    pub optimization_plans: Vec<OptimizationPlanExport>,
}

/// A floor with all its child entities.
#[derive(Debug, Serialize)]
pub struct FloorExport {
    #[serde(flatten)]
    pub floor: Floor,
    pub walls: Vec<WallExport>,
    pub access_points: Vec<AccessPoint>,
    pub measurement_points: Vec<MeasurementPoint>,
    pub measurement_runs: Vec<MeasurementRunExport>,
}

/// A wall with its segments.
#[derive(Debug, Serialize)]
pub struct WallExport {
    #[serde(flatten)]
    pub wall: Wall,
    pub segments: Vec<WallSegment>,
}

/// A measurement run with its measurements.
#[derive(Debug, Serialize)]
pub struct MeasurementRunExport {
    #[serde(flatten)]
    pub run: MeasurementRun,
    pub measurements: Vec<Measurement>,
}

/// An optimization plan with its steps.
#[derive(Debug, Serialize)]
pub struct OptimizationPlanExport {
    #[serde(flatten)]
    pub plan: OptimizationPlan,
    pub steps: Vec<OptimizationStep>,
}

// =============================================================================
// CSV row structure
// =============================================================================

/// A single flat row for CSV export, joining measurement data with context.
struct CsvRow {
    // Project context
    project_name: String,
    // Floor context
    floor_name: String,
    floor_number: i32,
    // Measurement point context
    point_label: String,
    point_x: f64,
    point_y: f64,
    // Measurement run context
    run_number: i32,
    run_type: String,
    run_status: String,
    // Measurement data
    measurement_id: String,
    timestamp: String,
    frequency_band: String,
    rssi_dbm: Option<f64>,
    noise_dbm: Option<f64>,
    snr_db: Option<f64>,
    connected_bssid: Option<String>,
    connected_ssid: Option<String>,
    frequency_mhz: Option<i32>,
    tx_rate_mbps: Option<f64>,
    tcp_upload_bps: Option<f64>,
    tcp_download_bps: Option<f64>,
    tcp_retransmits: Option<i32>,
    udp_throughput_bps: Option<f64>,
    udp_jitter_ms: Option<f64>,
    udp_lost_packets: Option<i32>,
    udp_total_packets: Option<i32>,
    udp_lost_percent: Option<f64>,
    quality: String,
}

// =============================================================================
// Public export functions
// =============================================================================

/// Exports a complete project as a JSON string.
///
/// Gathers all project data (floors, walls, access points, measurements,
/// optimization plans) and serializes them into a structured JSON document.
pub fn export_project_json(conn: &Connection, project_id: &str) -> Result<String, AppError> {
    let export_data = gather_project_data(conn, project_id)?;
    let json = serde_json::to_string_pretty(&export_data)?;
    Ok(json)
}

/// Exports project measurement data as a CSV string.
///
/// Creates a flat table with one row per measurement, including context
/// columns for project, floor, measurement point, and measurement run.
pub fn export_project_csv(conn: &Connection, project_id: &str) -> Result<String, AppError> {
    let project = load_project(conn, project_id)?;
    let rows = gather_csv_rows(conn, project_id, &project.name)?;

    let mut csv = String::new();

    // Header row
    csv.push_str(&[
        "project_name",
        "floor_name",
        "floor_number",
        "point_label",
        "point_x",
        "point_y",
        "run_number",
        "run_type",
        "run_status",
        "measurement_id",
        "timestamp",
        "frequency_band",
        "rssi_dbm",
        "noise_dbm",
        "snr_db",
        "connected_bssid",
        "connected_ssid",
        "frequency_mhz",
        "tx_rate_mbps",
        "tcp_upload_bps",
        "tcp_download_bps",
        "tcp_retransmits",
        "udp_throughput_bps",
        "udp_jitter_ms",
        "udp_lost_packets",
        "udp_total_packets",
        "udp_lost_percent",
        "quality",
    ].join(","));
    csv.push('\n');

    // Data rows
    for row in &rows {
        let fields: Vec<String> = vec![
            csv_escape(&row.project_name),
            csv_escape(&row.floor_name),
            row.floor_number.to_string(),
            csv_escape(&row.point_label),
            row.point_x.to_string(),
            row.point_y.to_string(),
            row.run_number.to_string(),
            csv_escape(&row.run_type),
            csv_escape(&row.run_status),
            csv_escape(&row.measurement_id),
            csv_escape(&row.timestamp),
            csv_escape(&row.frequency_band),
            opt_f64_str(row.rssi_dbm),
            opt_f64_str(row.noise_dbm),
            opt_f64_str(row.snr_db),
            opt_string_str(&row.connected_bssid),
            opt_string_str(&row.connected_ssid),
            opt_i32_str(row.frequency_mhz),
            opt_f64_str(row.tx_rate_mbps),
            opt_f64_str(row.tcp_upload_bps),
            opt_f64_str(row.tcp_download_bps),
            opt_i32_str(row.tcp_retransmits),
            opt_f64_str(row.udp_throughput_bps),
            opt_f64_str(row.udp_jitter_ms),
            opt_i32_str(row.udp_lost_packets),
            opt_i32_str(row.udp_total_packets),
            opt_f64_str(row.udp_lost_percent),
            csv_escape(&row.quality),
        ];
        csv.push_str(&fields.join(","));
        csv.push('\n');
    }

    Ok(csv)
}

// =============================================================================
// Internal data gathering
// =============================================================================

/// Loads the project record or returns NotFound.
fn load_project(conn: &Connection, project_id: &str) -> Result<Project, AppError> {
    conn.query_row(
        "SELECT * FROM projects WHERE id = ?1",
        [project_id],
        |row| Project::from_row(row),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
            entity: "Project".into(),
            id: project_id.to_string(),
        },
        other => AppError::from(other),
    })
}

/// Gathers all project data into the export structure.
fn gather_project_data(
    conn: &Connection,
    project_id: &str,
) -> Result<ProjectExport, AppError> {
    let project = load_project(conn, project_id)?;

    // Load floors (without background image BLOBs)
    let floors = load_floors(conn, project_id)?;

    // Build floor exports with all child data
    let mut floor_exports = Vec::with_capacity(floors.len());
    for floor in floors {
        let walls = load_walls_with_segments(conn, &floor.id)?;
        let access_points = load_access_points(conn, &floor.id)?;
        let measurement_points = load_measurement_points(conn, &floor.id)?;
        let measurement_runs = load_measurement_runs_with_data(conn, &floor.id)?;

        floor_exports.push(FloorExport {
            floor,
            walls,
            access_points,
            measurement_points,
            measurement_runs,
        });
    }

    // Load optimization plans with steps
    let optimization_plans = load_optimization_plans(conn, project_id)?;

    let exported_at = chrono_now_iso();

    Ok(ProjectExport {
        version: "1.0".to_string(),
        exported_at,
        project,
        floors: floor_exports,
        optimization_plans,
    })
}

/// Returns the current UTC timestamp as an ISO 8601 string.
/// Uses SQLite's strftime for consistency with the rest of the codebase.
fn chrono_now_iso() -> String {
    // We don't have chrono as a dependency, so construct a simple timestamp
    // from std. This is for the export metadata only, not DB storage.
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();

    // Simple UTC timestamp formatting (no chrono dependency needed)
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Calculate year/month/day from days since epoch (1970-01-01)
    let (year, month, day) = days_to_ymd(days_since_epoch);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

/// Converts days since Unix epoch to (year, month, day).
fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// =============================================================================
// Database query helpers
// =============================================================================

fn load_floors(conn: &Connection, project_id: &str) -> Result<Vec<Floor>, AppError> {
    let query = format!(
        "SELECT {} FROM floors WHERE project_id = ?1 ORDER BY floor_number ASC",
        FLOOR_COLUMNS_WITHOUT_IMAGE,
    );
    let mut stmt = conn.prepare(&query)?;
    let floors = stmt
        .query_map([project_id], |row| Floor::from_row_without_image(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(floors)
}

fn load_walls_with_segments(
    conn: &Connection,
    floor_id: &str,
) -> Result<Vec<WallExport>, AppError> {
    // Load walls
    let mut wall_stmt = conn.prepare(
        "SELECT * FROM walls WHERE floor_id = ?1 ORDER BY created_at",
    )?;
    let walls: Vec<Wall> = wall_stmt
        .query_map([floor_id], |row| Wall::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    // Load all segments for this floor's walls in one query
    let mut seg_stmt = conn.prepare(
        "SELECT ws.* FROM wall_segments ws
         INNER JOIN walls w ON ws.wall_id = w.id
         WHERE w.floor_id = ?1
         ORDER BY ws.wall_id, ws.segment_order",
    )?;
    let all_segments: Vec<WallSegment> = seg_stmt
        .query_map([floor_id], |row| WallSegment::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    // Group segments by wall_id
    let mut segments_by_wall: std::collections::HashMap<String, Vec<WallSegment>> =
        std::collections::HashMap::new();
    for segment in all_segments {
        segments_by_wall
            .entry(segment.wall_id.clone())
            .or_default()
            .push(segment);
    }

    // Assemble wall exports
    let wall_exports = walls
        .into_iter()
        .map(|wall| {
            let segments = segments_by_wall.remove(&wall.id).unwrap_or_default();
            WallExport { wall, segments }
        })
        .collect();

    Ok(wall_exports)
}

fn load_access_points(
    conn: &Connection,
    floor_id: &str,
) -> Result<Vec<AccessPoint>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT * FROM access_points WHERE floor_id = ?1 ORDER BY created_at",
    )?;
    let aps = stmt
        .query_map([floor_id], |row| AccessPoint::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(aps)
}

fn load_measurement_points(
    conn: &Connection,
    floor_id: &str,
) -> Result<Vec<MeasurementPoint>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT * FROM measurement_points WHERE floor_id = ?1 ORDER BY label",
    )?;
    let points = stmt
        .query_map([floor_id], |row| MeasurementPoint::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(points)
}

fn load_measurement_runs_with_data(
    conn: &Connection,
    floor_id: &str,
) -> Result<Vec<MeasurementRunExport>, AppError> {
    let mut run_stmt = conn.prepare(
        "SELECT * FROM measurement_runs WHERE floor_id = ?1 ORDER BY run_number",
    )?;
    let runs: Vec<MeasurementRun> = run_stmt
        .query_map([floor_id], |row| MeasurementRun::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut run_exports = Vec::with_capacity(runs.len());
    for run in runs {
        let mut m_stmt = conn.prepare(
            "SELECT * FROM measurements WHERE measurement_run_id = ?1 ORDER BY created_at",
        )?;
        let measurements: Vec<Measurement> = m_stmt
            .query_map([&run.id], |row| Measurement::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        run_exports.push(MeasurementRunExport {
            run,
            measurements,
        });
    }

    Ok(run_exports)
}

fn load_optimization_plans(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<OptimizationPlanExport>, AppError> {
    let mut plan_stmt = conn.prepare(
        "SELECT * FROM optimization_plans WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;
    let plans: Vec<OptimizationPlan> = plan_stmt
        .query_map([project_id], |row| OptimizationPlan::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut plan_exports = Vec::with_capacity(plans.len());
    for plan in plans {
        let mut step_stmt = conn.prepare(
            "SELECT * FROM optimization_steps WHERE plan_id = ?1 ORDER BY step_order",
        )?;
        let steps: Vec<OptimizationStep> = step_stmt
            .query_map([&plan.id], |row| OptimizationStep::from_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        plan_exports.push(OptimizationPlanExport { plan, steps });
    }

    Ok(plan_exports)
}

// =============================================================================
// CSV row gathering (flat join across all tables)
// =============================================================================

fn gather_csv_rows(
    conn: &Connection,
    project_id: &str,
    project_name: &str,
) -> Result<Vec<CsvRow>, AppError> {
    // Use a single JOIN query to gather all measurement data with context
    let mut stmt = conn.prepare(
        "SELECT
            f.name AS floor_name,
            f.floor_number,
            mp.label AS point_label,
            mp.x AS point_x,
            mp.y AS point_y,
            mr.run_number,
            mr.run_type,
            mr.status AS run_status,
            m.id AS measurement_id,
            m.timestamp,
            m.frequency_band,
            m.rssi_dbm,
            m.noise_dbm,
            m.snr_db,
            m.connected_bssid,
            m.connected_ssid,
            m.frequency_mhz,
            m.tx_rate_mbps,
            m.iperf_tcp_upload_bps,
            m.iperf_tcp_download_bps,
            m.iperf_tcp_retransmits,
            m.iperf_udp_throughput_bps,
            m.iperf_udp_jitter_ms,
            m.iperf_udp_lost_packets,
            m.iperf_udp_total_packets,
            m.iperf_udp_lost_percent,
            m.quality
         FROM measurements m
         INNER JOIN measurement_points mp ON m.measurement_point_id = mp.id
         INNER JOIN measurement_runs mr ON m.measurement_run_id = mr.id
         INNER JOIN floors f ON mr.floor_id = f.id
         WHERE f.project_id = ?1
         ORDER BY f.floor_number, mr.run_number, mp.label, m.timestamp",
    )?;

    let rows = stmt
        .query_map([project_id], |row| {
            Ok(CsvRow {
                project_name: project_name.to_string(),
                floor_name: row.get("floor_name")?,
                floor_number: row.get("floor_number")?,
                point_label: row.get("point_label")?,
                point_x: row.get("point_x")?,
                point_y: row.get("point_y")?,
                run_number: row.get("run_number")?,
                run_type: row.get("run_type")?,
                run_status: row.get("run_status")?,
                measurement_id: row.get("measurement_id")?,
                timestamp: row.get("timestamp")?,
                frequency_band: row.get("frequency_band")?,
                rssi_dbm: row.get("rssi_dbm")?,
                noise_dbm: row.get("noise_dbm")?,
                snr_db: row.get("snr_db")?,
                connected_bssid: row.get("connected_bssid")?,
                connected_ssid: row.get("connected_ssid")?,
                frequency_mhz: row.get("frequency_mhz")?,
                tx_rate_mbps: row.get("tx_rate_mbps")?,
                tcp_upload_bps: row.get("iperf_tcp_upload_bps")?,
                tcp_download_bps: row.get("iperf_tcp_download_bps")?,
                tcp_retransmits: row.get("iperf_tcp_retransmits")?,
                udp_throughput_bps: row.get("iperf_udp_throughput_bps")?,
                udp_jitter_ms: row.get("iperf_udp_jitter_ms")?,
                udp_lost_packets: row.get("iperf_udp_lost_packets")?,
                udp_total_packets: row.get("iperf_udp_total_packets")?,
                udp_lost_percent: row.get("iperf_udp_lost_percent")?,
                quality: row.get("quality")?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

// =============================================================================
// CSV formatting helpers
// =============================================================================

/// Escapes a string value for CSV output.
/// Wraps in double quotes if the value contains a comma, quote, or newline.
fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// Formats an optional f64 as a string, returning empty string for None.
fn opt_f64_str(value: Option<f64>) -> String {
    match value {
        Some(v) => v.to_string(),
        None => String::new(),
    }
}

/// Formats an optional i32 as a string, returning empty string for None.
fn opt_i32_str(value: Option<i32>) -> String {
    match value {
        Some(v) => v.to_string(),
        None => String::new(),
    }
}

/// Formats an optional String as a CSV-safe string, returning empty string for None.
fn opt_string_str(value: &Option<String>) -> String {
    match value {
        Some(v) => csv_escape(v),
        None => String::new(),
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_csv_escape_plain() {
        assert_eq!(csv_escape("hello"), "hello");
    }

    #[test]
    fn test_csv_escape_comma() {
        assert_eq!(csv_escape("hello,world"), "\"hello,world\"");
    }

    #[test]
    fn test_csv_escape_quote() {
        assert_eq!(csv_escape("say \"hi\""), "\"say \"\"hi\"\"\"");
    }

    #[test]
    fn test_csv_escape_newline() {
        assert_eq!(csv_escape("line1\nline2"), "\"line1\nline2\"");
    }

    #[test]
    fn test_opt_f64_str_some() {
        assert_eq!(opt_f64_str(Some(-65.5)), "-65.5");
    }

    #[test]
    fn test_opt_f64_str_none() {
        assert_eq!(opt_f64_str(None), "");
    }

    #[test]
    fn test_opt_i32_str_some() {
        assert_eq!(opt_i32_str(Some(42)), "42");
    }

    #[test]
    fn test_opt_i32_str_none() {
        assert_eq!(opt_i32_str(None), "");
    }

    #[test]
    fn test_opt_string_str_some() {
        assert_eq!(opt_string_str(&Some("test".to_string())), "test");
    }

    #[test]
    fn test_opt_string_str_none() {
        assert_eq!(opt_string_str(&None), "");
    }

    #[test]
    fn test_opt_string_str_with_comma() {
        assert_eq!(
            opt_string_str(&Some("a,b".to_string())),
            "\"a,b\""
        );
    }

    #[test]
    fn test_days_to_ymd_epoch() {
        let (y, m, d) = days_to_ymd(0);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    #[test]
    fn test_days_to_ymd_known_date() {
        // 2024-01-01 = 19723 days since epoch
        let (y, m, d) = days_to_ymd(19723);
        assert_eq!((y, m, d), (2024, 1, 1));
    }
}
