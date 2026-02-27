// Tauri IPC commands for the optimization module.
//
// Provides commands to generate, retrieve, list, and update optimization plans.

use tauri::State;

use crate::db::models::{OptimizationPlan, OptimizationStep};
use crate::db::optimization as db_optimization;
use crate::error::AppError;
use crate::optimizer;
use crate::optimizer::types::{ApSnapshot, MeasurementSnapshot, OptimizationInput};
use crate::state::AppState;

use serde::{Deserialize, Serialize};

/// Response type for a plan with its steps (returned via IPC).
/// Uses explicit `plan` + `steps` nesting (no flatten) to match the TypeScript interface.
#[derive(Debug, Clone, Serialize)]
pub struct OptimizationPlanWithSteps {
    pub plan: OptimizationPlan,
    pub steps: Vec<OptimizationStep>,
}

/// Parameters for generate_optimization_plan.
#[derive(Debug, Deserialize)]
pub struct GenerateOptimizationPlanParams {
    pub project_id: String,
    pub floor_id: String,
    pub name: Option<String>,
}

/// Generates a new optimization plan by reading APs + measurements from the DB,
/// running the rule-based optimizer, and saving the resulting plan and steps.
#[tauri::command]
pub fn generate_optimization_plan(
    params: GenerateOptimizationPlanParams,
    state: State<'_, AppState>,
) -> Result<OptimizationPlanWithSteps, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    // Verify floor exists and belongs to the project (single query for both checks).
    let (floor_project_id, floor_dims): (String, Option<(f64, f64)>) = conn
        .query_row(
            "SELECT project_id, width_meters, height_meters FROM floors WHERE id = ?1",
            [&params.floor_id],
            |row| {
                let pid: String = row.get(0)?;
                let w: Option<f64> = row.get(1)?;
                let h: Option<f64> = row.get(2)?;
                Ok((pid, w.zip(h)))
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
                entity: "Floor".into(),
                id: params.floor_id.clone(),
            },
            other => AppError::from(other),
        })?;

    if floor_project_id != params.project_id {
        return Err(AppError::Validation {
            message: format!(
                "Floor '{}' does not belong to project '{}'",
                params.floor_id, params.project_id
            ),
        });
    }

    // Load access points for this floor.
    let mut ap_stmt = conn.prepare(
        "SELECT id, label, ip_address, tx_power_24ghz_dbm, tx_power_5ghz_dbm,
                channel_24ghz, channel_5ghz, channel_width, enabled
         FROM access_points WHERE floor_id = ?1",
    )?;

    let access_points: Vec<ApSnapshot> = ap_stmt
        .query_map([&params.floor_id], |row| {
            Ok(ApSnapshot {
                id: row.get("id")?,
                label: row.get("label")?,
                ip_address: row.get("ip_address")?,
                tx_power_24ghz_dbm: row.get("tx_power_24ghz_dbm")?,
                tx_power_5ghz_dbm: row.get("tx_power_5ghz_dbm")?,
                channel_24ghz: row.get("channel_24ghz")?,
                channel_5ghz: row.get("channel_5ghz")?,
                channel_width: row.get("channel_width")?,
                enabled: row.get::<_, i32>("enabled")? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if access_points.is_empty() {
        return Err(AppError::Validation {
            message: "No access points found on this floor. Add at least one AP before generating an optimization plan.".into(),
        });
    }

    // Load measurements for this floor (from all completed runs).
    let mut meas_stmt = conn.prepare(
        "SELECT m.rssi_dbm, m.frequency_band, m.iperf_udp_jitter_ms,
                m.iperf_udp_lost_percent, m.iperf_tcp_download_bps
         FROM measurements m
         INNER JOIN measurement_points mp ON m.measurement_point_id = mp.id
         INNER JOIN measurement_runs mr ON m.measurement_run_id = mr.id
         WHERE mp.floor_id = ?1 AND mr.status = 'completed'",
    )?;

    let measurements: Vec<MeasurementSnapshot> = meas_stmt
        .query_map([&params.floor_id], |row| {
            Ok(MeasurementSnapshot {
                rssi_dbm: row.get("rssi_dbm")?,
                frequency_band: row.get("frequency_band")?,
                iperf_udp_jitter_ms: row.get("iperf_udp_jitter_ms")?,
                iperf_udp_lost_percent: row.get("iperf_udp_lost_percent")?,
                iperf_tcp_download_bps: row.get("iperf_tcp_download_bps")?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Build optimization input and run the engine.
    let input = OptimizationInput {
        access_points,
        measurements,
        floor_dimensions: floor_dims,
    };

    let result = optimizer::generate_optimization(&input);

    if result.changes.is_empty() {
        return Err(AppError::Validation {
            message: "No optimization suggestions could be generated for the current configuration.".into(),
        });
    }

    // Save the plan to the database.
    let plan_name = params.name.as_deref().unwrap_or("Optimization Plan");
    let plan = db_optimization::insert_optimization_plan(
        &conn,
        &params.project_id,
        Some(plan_name),
        "forecast",
    )?;

    // Convert ParameterChanges to NewOptimizationSteps.
    let new_steps: Vec<db_optimization::NewOptimizationStep> = result
        .changes
        .iter()
        .enumerate()
        .map(|(idx, change)| db_optimization::NewOptimizationStep {
            access_point_id: change.access_point_id.clone(),
            step_order: idx as i32,
            parameter: change.parameter.clone(),
            old_value: change.old_value.clone(),
            new_value: Some(change.new_value.clone()),
            description_de: Some(change.description_de.clone()),
            description_en: Some(change.description_en.clone()),
        })
        .collect();

    let steps = db_optimization::insert_optimization_steps(&conn, &plan.id, &new_steps)?;

    Ok(OptimizationPlanWithSteps { plan, steps })
}

/// Retrieves a single optimization plan with all its steps.
#[tauri::command]
pub fn get_optimization_plan(
    plan_id: String,
    state: State<'_, AppState>,
) -> Result<OptimizationPlanWithSteps, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let (plan, steps) = db_optimization::get_optimization_plan(&conn, &plan_id)?;

    Ok(OptimizationPlanWithSteps { plan, steps })
}

/// Lists all optimization plans for a project (without steps).
#[tauri::command]
pub fn list_optimization_plans(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<OptimizationPlan>, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_optimization::list_optimization_plans(&conn, &project_id)
}

/// Marks an optimization step as applied or unapplied.
#[tauri::command]
pub fn update_optimization_step(
    step_id: String,
    applied: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_optimization::update_optimization_step_applied(&conn, &step_id, applied)
}

/// Updates the status of an optimization plan (draft, applied, verified).
#[tauri::command]
pub fn update_optimization_plan_status(
    plan_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    db_optimization::update_optimization_plan_status(&conn, &plan_id, &status)
}
