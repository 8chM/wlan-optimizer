// Optimization module: rule-based WLAN parameter optimization.
//
// Provides the core optimization engine that analyzes AP configurations
// and measurement data to generate parameter change suggestions.
//
// Architecture:
// - `types`: Input/output data structures.
// - `rules`: Individual heuristic rules (channel, TX power, channel width).
// - `generate_optimization`: Top-level function that runs all rules,
//   deduplicates, and sorts by priority.

pub mod rules;
#[cfg(test)]
mod tests;
pub mod types;

pub use types::{
    ApSnapshot, MeasurementSnapshot, OptimizationInput, OptimizationResult, ParameterChange,
    Priority,
};

use std::collections::HashSet;

/// Runs all optimization rules against the given input and returns
/// a deduplicated, priority-sorted list of parameter changes.
pub fn generate_optimization(input: &OptimizationInput) -> OptimizationResult {
    let mut all_changes: Vec<ParameterChange> = Vec::new();

    // Run each rule and collect results.
    all_changes.extend(rules::rule_channel_assignment(input));
    all_changes.extend(rules::rule_tx_power_adjustment(input));
    all_changes.extend(rules::rule_channel_width(input));

    // Deduplicate: keep the first (highest-priority) change per (ap_id, parameter).
    let mut seen = HashSet::new();
    all_changes.retain(|change| {
        let key = format!("{}:{}", change.access_point_id, change.parameter);
        seen.insert(key)
    });

    // Sort by priority: High < Medium < Low (derived Ord on Priority).
    all_changes.sort_by(|a, b| a.priority.cmp(&b.priority));

    OptimizationResult {
        changes: all_changes,
    }
}
