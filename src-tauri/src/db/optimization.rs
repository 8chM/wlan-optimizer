// Database query functions for the optimization module.
//
// Handles CRUD operations for optimization_plans and optimization_steps tables.

use rusqlite::{params, Connection};

use crate::error::AppError;

use super::models::{OptimizationPlan, OptimizationStep};

/// Inserts a new optimization plan into the database.
/// Returns the created OptimizationPlan.
pub fn insert_optimization_plan(
    conn: &Connection,
    project_id: &str,
    name: Option<&str>,
    mode: &str,
) -> Result<OptimizationPlan, AppError> {
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO optimization_plans (id, project_id, name, mode)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, project_id, name, mode],
    )?;

    let plan = conn.query_row(
        "SELECT * FROM optimization_plans WHERE id = ?1",
        [&id],
        |row| OptimizationPlan::from_row(row),
    )?;

    Ok(plan)
}

/// Input data for a single optimization step to be inserted.
pub struct NewOptimizationStep {
    pub access_point_id: String,
    pub step_order: i32,
    pub parameter: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub description_de: Option<String>,
    pub description_en: Option<String>,
}

/// Inserts multiple optimization steps for a plan in a single transaction.
/// Returns the created OptimizationStep records.
pub fn insert_optimization_steps(
    conn: &Connection,
    plan_id: &str,
    steps: &[NewOptimizationStep],
) -> Result<Vec<OptimizationStep>, AppError> {
    let tx = conn.unchecked_transaction()?;
    let mut ids: Vec<String> = Vec::with_capacity(steps.len());

    for step in steps {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO optimization_steps (
                id, plan_id, access_point_id, step_order,
                parameter, old_value, new_value,
                description_de, description_en
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                plan_id,
                step.access_point_id,
                step.step_order,
                step.parameter,
                step.old_value,
                step.new_value,
                step.description_de,
                step.description_en,
            ],
        )?;
        ids.push(id);
    }

    // Read back the inserted steps in order.
    let mut result = Vec::with_capacity(ids.len());
    for id in &ids {
        let step = tx.query_row(
            "SELECT * FROM optimization_steps WHERE id = ?1",
            [id],
            |row| OptimizationStep::from_row(row),
        )?;
        result.push(step);
    }

    tx.commit()?;
    Ok(result)
}

/// Fetches an optimization plan with all its steps.
/// Returns (plan, steps) where steps are ordered by step_order.
pub fn get_optimization_plan(
    conn: &Connection,
    plan_id: &str,
) -> Result<(OptimizationPlan, Vec<OptimizationStep>), AppError> {
    let plan = conn
        .query_row(
            "SELECT * FROM optimization_plans WHERE id = ?1",
            [plan_id],
            |row| OptimizationPlan::from_row(row),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
                entity: "OptimizationPlan".into(),
                id: plan_id.to_string(),
            },
            other => AppError::from(other),
        })?;

    let mut stmt = conn.prepare(
        "SELECT * FROM optimization_steps WHERE plan_id = ?1 ORDER BY step_order",
    )?;

    let steps = stmt
        .query_map([plan_id], |row| OptimizationStep::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok((plan, steps))
}

/// Lists all optimization plans for a project, ordered by creation time (newest first).
pub fn list_optimization_plans(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<OptimizationPlan>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT * FROM optimization_plans WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;

    let plans = stmt
        .query_map([project_id], |row| OptimizationPlan::from_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(plans)
}

/// Marks a single optimization step as applied (or unapplied).
/// Sets applied_at to the current timestamp when applied=true, or NULL when false.
pub fn update_optimization_step_applied(
    conn: &Connection,
    step_id: &str,
    applied: bool,
) -> Result<(), AppError> {
    let applied_int = if applied { 1 } else { 0 };

    let rows = conn.execute(
        "UPDATE optimization_steps SET
            applied = ?1,
            applied_at = CASE
                WHEN ?1 = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                ELSE NULL
            END
         WHERE id = ?2",
        params![applied_int, step_id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "OptimizationStep".into(),
            id: step_id.to_string(),
        });
    }

    Ok(())
}

/// Updates the status of an optimization plan.
/// Valid statuses: draft, applied, verified (enforced by DB CHECK constraint).
pub fn update_optimization_plan_status(
    conn: &Connection,
    plan_id: &str,
    status: &str,
) -> Result<(), AppError> {
    // Validate status value before hitting the DB constraint.
    match status {
        "draft" | "applied" | "verified" => {}
        _ => {
            return Err(AppError::Validation {
                message: format!(
                    "Invalid optimization plan status '{}'. Must be one of: draft, applied, verified",
                    status
                ),
            });
        }
    }

    let rows = conn.execute(
        "UPDATE optimization_plans SET
            status = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?2",
        params![status, plan_id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound {
            entity: "OptimizationPlan".into(),
            id: plan_id.to_string(),
        });
    }

    Ok(())
}
