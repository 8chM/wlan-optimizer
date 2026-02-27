// Custom AP adapter that generates human-readable step-by-step instructions.
//
// Since most consumer APs do not expose a programmable API, this adapter
// produces textual instructions that guide the user through manual
// configuration via the AP's web interface.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::optimizer::ParameterChange;

/// A single step in the assist-mode instruction list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistStep {
    pub step_number: i32,
    pub title_de: String,
    pub title_en: String,
    pub instruction_de: String,
    pub instruction_en: String,
    pub parameter: String,
    pub new_value: String,
}

/// Generic adapter that produces human-readable assist steps.
pub struct CustomAPAdapter;

impl CustomAPAdapter {
    /// Generates assist steps from a list of parameter changes.
    ///
    /// Changes are grouped by AP (using the AP's IP or ID) to minimize
    /// the number of login/save cycles. Within each AP group the steps are:
    /// 1. Open the web interface
    /// 2. Navigate to the relevant settings page
    /// 3. Change the parameter
    /// 4. Save and apply
    /// 5. Wait for restart
    ///
    /// The `locale` parameter ("de" or "en") does NOT filter; both languages
    /// are always included so the frontend can pick at render time.
    pub fn generate_assist_steps(changes: &[ParameterChange], _locale: &str) -> Vec<AssistStep> {
        if changes.is_empty() {
            return Vec::new();
        }

        // Group changes by access_point_id (BTreeMap for deterministic order).
        let mut by_ap: BTreeMap<String, Vec<&ParameterChange>> = BTreeMap::new();
        for change in changes {
            by_ap
                .entry(change.access_point_id.clone())
                .or_default()
                .push(change);
        }

        let mut steps: Vec<AssistStep> = Vec::new();
        let mut step_number = 1;

        for (ap_id, ap_changes) in &by_ap {
            // Step: Open web interface
            steps.push(AssistStep {
                step_number,
                title_de: "Web-Oberflaeche oeffnen".to_string(),
                title_en: "Open web interface".to_string(),
                instruction_de: format!(
                    "Oeffnen Sie die Web-Oberflaeche Ihres Access Points (AP: {}) im Browser. \
                     Typische Adresse: http://[AP_IP] (z.B. http://192.168.0.50). \
                     Melden Sie sich mit Ihren Zugangsdaten an.",
                    ap_id
                ),
                instruction_en: format!(
                    "Open your access point's web interface (AP: {}) in a browser. \
                     Typical address: http://[AP_IP] (e.g. http://192.168.0.50). \
                     Log in with your credentials.",
                    ap_id
                ),
                parameter: "login".to_string(),
                new_value: String::new(),
            });
            step_number += 1;

            // One step per parameter change
            for change in ap_changes {
                let (nav_de, nav_en) = navigation_hint(&change.parameter);
                let old_display = change
                    .old_value
                    .as_deref()
                    .unwrap_or("(unbekannt)");
                let old_display_en = change
                    .old_value
                    .as_deref()
                    .unwrap_or("(unknown)");

                let (param_label_de, param_label_en) = parameter_label(&change.parameter);

                steps.push(AssistStep {
                    step_number,
                    title_de: format!("{} aendern", param_label_de),
                    title_en: format!("Change {}", param_label_en),
                    instruction_de: format!(
                        "Navigieren Sie zu {}. \
                         Aendern Sie '{}' von {} auf {}.",
                        nav_de, param_label_de, old_display, change.new_value
                    ),
                    instruction_en: format!(
                        "Navigate to {}. \
                         Change '{}' from {} to {}.",
                        nav_en, param_label_en, old_display_en, change.new_value
                    ),
                    parameter: change.parameter.clone(),
                    new_value: change.new_value.clone(),
                });
                step_number += 1;
            }

            // Step: Save and apply
            steps.push(AssistStep {
                step_number,
                title_de: "Einstellungen speichern".to_string(),
                title_en: "Save settings".to_string(),
                instruction_de: "Klicken Sie auf 'Speichern' bzw. 'Uebernehmen', um die Aenderungen zu aktivieren.".to_string(),
                instruction_en: "Click 'Save' or 'Apply' to activate the changes.".to_string(),
                parameter: "save".to_string(),
                new_value: String::new(),
            });
            step_number += 1;

            // Step: Wait for restart
            steps.push(AssistStep {
                step_number,
                title_de: "Neustart abwarten".to_string(),
                title_en: "Wait for restart".to_string(),
                instruction_de: "Warten Sie ca. 30 Sekunden, bis der Access Point die neuen Einstellungen uebernommen hat und wieder erreichbar ist.".to_string(),
                instruction_en: "Wait approximately 30 seconds for the access point to apply the new settings and become reachable again.".to_string(),
                parameter: "restart".to_string(),
                new_value: String::new(),
            });
            step_number += 1;
        }

        steps
    }
}

/// Returns navigation hints for the AP web interface based on the parameter.
fn navigation_hint(parameter: &str) -> (&'static str, &'static str) {
    match parameter {
        "channel_24ghz" => (
            "WLAN-Einstellungen > 2,4 GHz Einstellungen",
            "Wireless Settings > 2.4 GHz Settings",
        ),
        "channel_5ghz" => (
            "WLAN-Einstellungen > 5 GHz Einstellungen",
            "Wireless Settings > 5 GHz Settings",
        ),
        "channel_6ghz" => (
            "WLAN-Einstellungen > 6 GHz Einstellungen",
            "Wireless Settings > 6 GHz Settings",
        ),
        "tx_power_24ghz" => (
            "WLAN-Einstellungen > 2,4 GHz Einstellungen > Sendeleistung",
            "Wireless Settings > 2.4 GHz Settings > TX Power",
        ),
        "tx_power_5ghz" => (
            "WLAN-Einstellungen > 5 GHz Einstellungen > Sendeleistung",
            "Wireless Settings > 5 GHz Settings > TX Power",
        ),
        "tx_power_6ghz" => (
            "WLAN-Einstellungen > 6 GHz Einstellungen > Sendeleistung",
            "Wireless Settings > 6 GHz Settings > TX Power",
        ),
        "channel_width" => (
            "WLAN-Einstellungen > Kanalbreite",
            "Wireless Settings > Channel Width",
        ),
        "band_steering" => (
            "WLAN-Einstellungen > Band Steering",
            "Wireless Settings > Band Steering",
        ),
        "enabled" => (
            "WLAN-Einstellungen > Funkmodul aktivieren/deaktivieren",
            "Wireless Settings > Enable/Disable Radio",
        ),
        _ => (
            "WLAN-Einstellungen",
            "Wireless Settings",
        ),
    }
}

/// Returns human-readable labels for parameter names.
fn parameter_label(parameter: &str) -> (&'static str, &'static str) {
    match parameter {
        "channel_24ghz" => ("Kanal (2,4 GHz)", "Channel (2.4 GHz)"),
        "channel_5ghz" => ("Kanal (5 GHz)", "Channel (5 GHz)"),
        "channel_6ghz" => ("Kanal (6 GHz)", "Channel (6 GHz)"),
        "tx_power_24ghz" => ("Sendeleistung (2,4 GHz)", "TX Power (2.4 GHz)"),
        "tx_power_5ghz" => ("Sendeleistung (5 GHz)", "TX Power (5 GHz)"),
        "tx_power_6ghz" => ("Sendeleistung (6 GHz)", "TX Power (6 GHz)"),
        "channel_width" => ("Kanalbreite", "Channel Width"),
        "band_steering" => ("Band Steering", "Band Steering"),
        "enabled" => ("Funkmodul", "Radio"),
        _ => ("Parameter", "Parameter"),
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::optimizer::types::Priority;

    fn make_change(ap_id: &str, param: &str, old: &str, new: &str) -> ParameterChange {
        ParameterChange {
            access_point_id: ap_id.to_string(),
            parameter: param.to_string(),
            old_value: Some(old.to_string()),
            new_value: new.to_string(),
            description_de: "Test DE".to_string(),
            description_en: "Test EN".to_string(),
            priority: Priority::High,
        }
    }

    #[test]
    fn test_empty_changes_returns_empty_steps() {
        let steps = CustomAPAdapter::generate_assist_steps(&[], "de");
        assert!(steps.is_empty());
    }

    #[test]
    fn test_single_ap_single_change() {
        let changes = vec![make_change("ap1", "channel_24ghz", "1", "6")];
        let steps = CustomAPAdapter::generate_assist_steps(&changes, "de");

        // Expected: open (1) + change (1) + save (1) + wait (1) = 4 steps.
        assert_eq!(steps.len(), 4);
        assert_eq!(steps[0].step_number, 1);
        assert!(steps[0].title_en.contains("Open"));
        assert_eq!(steps[1].parameter, "channel_24ghz");
        assert_eq!(steps[1].new_value, "6");
        assert!(steps[2].title_en.contains("Save"));
        assert!(steps[3].title_en.contains("Wait"));
    }

    #[test]
    fn test_single_ap_multiple_changes() {
        let changes = vec![
            make_change("ap1", "channel_24ghz", "1", "6"),
            make_change("ap1", "tx_power_24ghz", "20", "17"),
        ];
        let steps = CustomAPAdapter::generate_assist_steps(&changes, "en");

        // Expected: open (1) + 2 changes + save (1) + wait (1) = 5 steps.
        assert_eq!(steps.len(), 5);
        assert_eq!(steps[1].parameter, "channel_24ghz");
        assert_eq!(steps[2].parameter, "tx_power_24ghz");
    }

    #[test]
    fn test_multiple_aps_grouped() {
        let changes = vec![
            make_change("ap1", "channel_24ghz", "1", "6"),
            make_change("ap2", "channel_24ghz", "1", "11"),
        ];
        let steps = CustomAPAdapter::generate_assist_steps(&changes, "de");

        // 2 APs: each gets open + change + save + wait = 4 steps each = 8 total.
        assert_eq!(steps.len(), 8);

        // Verify step numbering is continuous.
        for (i, step) in steps.iter().enumerate() {
            assert_eq!(step.step_number, (i + 1) as i32);
        }
    }

    #[test]
    fn test_bilingual_output() {
        let changes = vec![make_change("ap1", "channel_5ghz", "36", "44")];
        let steps = CustomAPAdapter::generate_assist_steps(&changes, "de");

        // All steps should have both DE and EN content.
        for step in &steps {
            assert!(!step.title_de.is_empty());
            assert!(!step.title_en.is_empty());
            assert!(!step.instruction_de.is_empty());
            assert!(!step.instruction_en.is_empty());
        }
    }

    #[test]
    fn test_navigation_hint_channel_width() {
        let changes = vec![make_change("ap1", "channel_width", "80", "40")];
        let steps = CustomAPAdapter::generate_assist_steps(&changes, "en");

        let change_step = &steps[1]; // Index 1 is the parameter change step.
        assert!(change_step.instruction_en.contains("Channel Width"));
        assert!(change_step.instruction_de.contains("Kanalbreite"));
    }
}
