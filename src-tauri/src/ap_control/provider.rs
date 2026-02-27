use super::ApControllerTrait;

/// Factory that creates the appropriate AP controller based on manufacturer.
///
/// Currently supports:
/// - D-Link DAP-X2810 via Web GUI scraping
/// - Custom (manual-only, no remote control)
///
/// Future adapters: SNMP, CLI, vendor-specific APIs.
pub fn create_controller(manufacturer: &str) -> Option<Box<dyn ApControllerTrait>> {
    match manufacturer.to_lowercase().as_str() {
        // TODO: Implement in Phase 8d
        // "d-link" => Some(Box::new(DLinkWebGuiAdapter::new())),
        _ => None,
    }
}
