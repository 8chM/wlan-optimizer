// Database query functions for the measurement module.
//
// Handles CRUD operations for measurement_runs, measurement_points,
// and measurements tables.

use rusqlite::Connection;

use crate::error::AppError;

use super::models::{
    CreateMeasurementPointParams, CreateMeasurementRunParams, Measurement, MeasurementPoint,
    MeasurementRun,
};

/// Inserts a new measurement run into the database.
/// Returns the created MeasurementRun.
pub fn insert_measurement_run(
    conn: &Connection,
    params: &CreateMeasurementRunParams,
) -> Result<MeasurementRun, AppError> {
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO measurement_runs (id, floor_id, run_number, run_type, iperf_server_ip)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, params.floor_id, params.run_number, params.run_type, params.iperf_server_ip],
    )?;

    let run = conn.query_row(
        "SELECT * FROM measurement_runs WHERE id = ?1",
        [&id],
        |row| MeasurementRun::from_row(row),
    )?;

    Ok(run)
}

/// Inserts a new measurement point into the database.
/// Returns the created MeasurementPoint.
pub fn insert_measurement_point(
    conn: &Connection,
    params: &CreateMeasurementPointParams,
) -> Result<MeasurementPoint, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let auto_generated = params.auto_generated.unwrap_or(false) as i32;

    conn.execute(
        "INSERT INTO measurement_points (id, floor_id, label, x, y, auto_generated, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, params.floor_id, params.label, params.x, params.y, auto_generated, params.notes],
    )?;

    let point = conn.query_row(
        "SELECT * FROM measurement_points WHERE id = ?1",
        [&id],
        |row| MeasurementPoint::from_row(row),
    )?;

    Ok(point)
}

/// Fetches all measurement runs for a given floor, ordered by run_number.
pub fn get_measurement_runs_by_floor(
    conn: &Connection,
    floor_id: &str,
) -> Result<Vec<MeasurementRun>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT * FROM measurement_runs WHERE floor_id = ?1 ORDER BY run_number",
    )?;

    let runs = stmt
        .query_map([floor_id], |row| MeasurementRun::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(runs)
}

/// Fetches all measurements for a given measurement run, ordered by created_at.
pub fn get_measurements_by_run(
    conn: &Connection,
    measurement_run_id: &str,
) -> Result<Vec<Measurement>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT * FROM measurements WHERE measurement_run_id = ?1 ORDER BY created_at",
    )?;

    let measurements = stmt
        .query_map([measurement_run_id], |row| Measurement::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(measurements)
}

/// Updates the status of a measurement run.
/// Automatically sets completed_at when status is 'completed' or 'failed'.
pub fn update_run_status(
    conn: &Connection,
    measurement_run_id: &str,
    status: &str,
) -> Result<(), AppError> {
    // Validate status value
    match status {
        "pending" | "in_progress" | "completed" | "failed" => {}
        _ => {
            return Err(AppError::Validation {
                message: format!(
                    "Invalid measurement run status '{}'. Must be one of: pending, in_progress, completed, failed",
                    status
                ),
            });
        }
    }

    let rows = conn.execute(
        "UPDATE measurement_runs
         SET status = ?1,
             started_at = CASE
                 WHEN ?1 = 'in_progress' AND started_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 ELSE started_at
             END,
             completed_at = CASE
                 WHEN ?1 IN ('completed', 'failed') THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 ELSE completed_at
             END
         WHERE id = ?2",
        rusqlite::params![status, measurement_run_id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "MeasurementRun".into(),
            id: measurement_run_id.to_string(),
        });
    }

    Ok(())
}

/// Cancels a measurement run by setting its status to 'failed'.
/// Only cancels if the run is currently 'in_progress'.
pub fn cancel_run(
    conn: &Connection,
    measurement_run_id: &str,
) -> Result<(), AppError> {
    let rows = conn.execute(
        "UPDATE measurement_runs
         SET status = 'failed',
             completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND status = 'in_progress'",
        [measurement_run_id],
    )?;

    if rows == 0 {
        return Err(AppError::Validation {
            message: format!(
                "Measurement run '{}' is not in 'in_progress' status or does not exist",
                measurement_run_id
            ),
        });
    }

    Ok(())
}
