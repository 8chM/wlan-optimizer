use super::custom_adapter::{AssistStep, CustomAPAdapter};
use super::ApControllerTrait;

use crate::optimizer::ParameterChange;

/// Factory that creates the appropriate AP controller based on manufacturer.
///
/// Currently supports:
/// - D-Link DAP-X2810 via Web GUI scraping (TODO)
/// - Custom (manual-only, no remote control)
///
/// Future adapters: SNMP, CLI, vendor-specific APIs.
pub fn create_controller(manufacturer: &str) -> Option<Box<dyn ApControllerTrait>> {
    match manufacturer.to_lowercase().as_str() {
        // TODO: Implement vendor-specific adapters in later phases
        // "d-link" => Some(Box::new(DLinkWebGuiAdapter::new())),
        _ => None,
    }
}

/// Returns human-readable assist steps for the given parameter changes.
/// Uses the CustomAPAdapter as fallback when no vendor-specific controller
/// is available.
pub fn generate_assist_steps(changes: &[ParameterChange], locale: &str) -> Vec<AssistStep> {
    CustomAPAdapter::generate_assist_steps(changes, locale)
}
