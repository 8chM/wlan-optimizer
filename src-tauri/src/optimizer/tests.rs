// Unit tests for the rule-based optimization engine.

#[cfg(test)]
mod tests {
    use crate::optimizer::rules;
    use crate::optimizer::types::*;

    // =========================================================================
    // Helper builders
    // =========================================================================

    fn make_ap(id: &str, label: &str) -> ApSnapshot {
        ApSnapshot {
            id: id.to_string(),
            label: Some(label.to_string()),
            ip_address: Some("192.168.1.1".to_string()),
            tx_power_24ghz_dbm: Some(20.0),
            tx_power_5ghz_dbm: Some(23.0),
            channel_24ghz: Some(1),
            channel_5ghz: Some(36),
            channel_width: "80".to_string(),
            enabled: true,
        }
    }

    fn make_measurement(rssi: Option<f64>, band: &str) -> MeasurementSnapshot {
        MeasurementSnapshot {
            rssi_dbm: rssi,
            frequency_band: band.to_string(),
            iperf_udp_jitter_ms: None,
            iperf_udp_lost_percent: None,
            iperf_tcp_download_bps: None,
        }
    }

    fn make_input(aps: Vec<ApSnapshot>, measurements: Vec<MeasurementSnapshot>) -> OptimizationInput {
        OptimizationInput {
            access_points: aps,
            measurements,
            floor_dimensions: Some((10.0, 8.0)),
        }
    }

    // =========================================================================
    // Channel assignment tests
    // =========================================================================

    #[test]
    fn test_channel_conflict_two_aps_same_24ghz_channel() {
        let mut ap1 = make_ap("ap1", "Living Room");
        ap1.channel_24ghz = Some(1);
        let mut ap2 = make_ap("ap2", "Bedroom");
        ap2.channel_24ghz = Some(1);

        let input = make_input(vec![ap1, ap2], vec![]);
        let changes = rules::rule_channel_assignment(&input);

        assert!(!changes.is_empty(), "Should suggest channel change");
        // One AP should keep channel 1, the other should be reassigned.
        let change = &changes[0];
        assert_eq!(change.parameter, "channel_24ghz");
        assert_eq!(change.old_value.as_deref(), Some("1"));
        // New channel should be one of the non-overlapping 2.4 GHz channels.
        let new_ch: i32 = change.new_value.parse().unwrap();
        assert!(
            [6, 11].contains(&new_ch),
            "New channel {} should be 6 or 11",
            new_ch
        );
        assert_eq!(change.priority, Priority::High);
    }

    #[test]
    fn test_channel_conflict_two_aps_same_5ghz_channel() {
        let mut ap1 = make_ap("ap1", "AP-1");
        ap1.channel_5ghz = Some(36);
        let mut ap2 = make_ap("ap2", "AP-2");
        ap2.channel_5ghz = Some(36);

        let input = make_input(vec![ap1, ap2], vec![]);
        let changes = rules::rule_channel_assignment(&input);

        let ch5_changes: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "channel_5ghz")
            .collect();

        assert!(!ch5_changes.is_empty(), "Should suggest 5 GHz channel change");
        let new_ch: i32 = ch5_changes[0].new_value.parse().unwrap();
        assert!(
            [44, 52, 149, 157].contains(&new_ch),
            "New 5 GHz channel {} should be non-overlapping",
            new_ch
        );
    }

    #[test]
    fn test_single_ap_no_channel_conflict() {
        let ap = make_ap("ap1", "Only AP");
        let input = make_input(vec![ap], vec![]);
        let changes = rules::rule_channel_assignment(&input);

        assert!(
            changes.is_empty(),
            "Single AP should produce no channel changes"
        );
    }

    #[test]
    fn test_channel_no_conflict_when_different_channels() {
        let mut ap1 = make_ap("ap1", "AP-1");
        ap1.channel_24ghz = Some(1);
        let mut ap2 = make_ap("ap2", "AP-2");
        ap2.channel_24ghz = Some(6);

        let input = make_input(vec![ap1, ap2], vec![]);
        let changes = rules::rule_channel_assignment(&input);

        let ch24_changes: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "channel_24ghz")
            .collect();

        assert!(
            ch24_changes.is_empty(),
            "Different channels should produce no conflict changes"
        );
    }

    // =========================================================================
    // TX power adjustment tests
    // =========================================================================

    #[test]
    fn test_tx_power_reduction_on_over_coverage() {
        let ap = make_ap("ap1", "Over-powered AP");
        // All measurements above -40 dBm (over-coverage).
        let measurements = vec![
            make_measurement(Some(-30.0), "2.4ghz"),
            make_measurement(Some(-25.0), "2.4ghz"),
            make_measurement(Some(-35.0), "2.4ghz"),
            make_measurement(Some(-28.0), "2.4ghz"),
            make_measurement(Some(-32.0), "2.4ghz"),
        ];

        let input = make_input(vec![ap], measurements);
        let changes = rules::rule_tx_power_adjustment(&input);

        let power_changes: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "tx_power_24ghz")
            .collect();

        assert!(
            !power_changes.is_empty(),
            "Should suggest TX power reduction for 2.4 GHz"
        );
        let change = power_changes[0];
        let new_power: f64 = change.new_value.parse().unwrap();
        let old_power: f64 = change.old_value.as_ref().unwrap().parse().unwrap();
        assert!(
            new_power < old_power,
            "New power {} should be less than old power {}",
            new_power,
            old_power
        );
        assert_eq!(change.priority, Priority::Medium);
    }

    #[test]
    fn test_tx_power_increase_on_poor_coverage() {
        let mut ap = make_ap("ap1", "Weak AP");
        ap.tx_power_24ghz_dbm = Some(10.0);
        // All measurements below -75 dBm (under-coverage).
        let measurements = vec![
            make_measurement(Some(-80.0), "2.4ghz"),
            make_measurement(Some(-85.0), "2.4ghz"),
            make_measurement(Some(-82.0), "2.4ghz"),
            make_measurement(Some(-78.0), "2.4ghz"),
            make_measurement(Some(-90.0), "2.4ghz"),
        ];

        let input = make_input(vec![ap], measurements);
        let changes = rules::rule_tx_power_adjustment(&input);

        let power_changes: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "tx_power_24ghz")
            .collect();

        assert!(
            !power_changes.is_empty(),
            "Should suggest TX power increase for 2.4 GHz"
        );
        let change = power_changes[0];
        let new_power: f64 = change.new_value.parse().unwrap();
        let old_power: f64 = change.old_value.as_ref().unwrap().parse().unwrap();
        assert!(
            new_power > old_power,
            "New power {} should be greater than old power {}",
            new_power,
            old_power
        );
    }

    #[test]
    fn test_tx_power_no_change_normal_coverage() {
        let ap = make_ap("ap1", "Normal AP");
        // Measurements in a normal range (between -40 and -75).
        let measurements = vec![
            make_measurement(Some(-55.0), "2.4ghz"),
            make_measurement(Some(-60.0), "2.4ghz"),
            make_measurement(Some(-50.0), "2.4ghz"),
        ];

        let input = make_input(vec![ap], measurements);
        let changes = rules::rule_tx_power_adjustment(&input);

        let power_changes_24: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "tx_power_24ghz")
            .collect();

        assert!(
            power_changes_24.is_empty(),
            "Normal coverage should not trigger power changes"
        );
    }

    #[test]
    fn test_tx_power_no_measurements() {
        let ap = make_ap("ap1", "AP");
        let input = make_input(vec![ap], vec![]);
        let changes = rules::rule_tx_power_adjustment(&input);

        assert!(
            changes.is_empty(),
            "No measurements should produce no TX power changes"
        );
    }

    #[test]
    fn test_tx_power_5ghz_reduction() {
        let ap = make_ap("ap1", "5G AP");
        // Over-coverage on 5 GHz.
        let measurements = vec![
            make_measurement(Some(-30.0), "5ghz"),
            make_measurement(Some(-25.0), "5ghz"),
            make_measurement(Some(-35.0), "5ghz"),
        ];

        let input = make_input(vec![ap], measurements);
        let changes = rules::rule_tx_power_adjustment(&input);

        let power_changes_5: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "tx_power_5ghz")
            .collect();

        assert!(
            !power_changes_5.is_empty(),
            "Should suggest 5 GHz TX power reduction"
        );
    }

    // =========================================================================
    // Channel width rule tests
    // =========================================================================

    #[test]
    fn test_channel_width_narrow_on_high_jitter() {
        let ap = make_ap("ap1", "AP-1");
        let mut m = make_measurement(Some(-55.0), "5ghz");
        m.iperf_udp_jitter_ms = Some(15.0); // Above 10ms threshold.
        m.iperf_udp_lost_percent = Some(0.5);

        let input = make_input(vec![ap], vec![m]);
        let changes = rules::rule_channel_width(&input);

        assert!(!changes.is_empty(), "Should suggest narrower channel width");
        let change = &changes[0];
        assert_eq!(change.parameter, "channel_width");
        assert_eq!(change.old_value.as_deref(), Some("80"));
        assert_eq!(change.new_value, "40");
        assert_eq!(change.priority, Priority::Low);
    }

    #[test]
    fn test_channel_width_narrow_on_high_loss() {
        let ap = make_ap("ap1", "AP-1");
        let mut m = make_measurement(Some(-55.0), "5ghz");
        m.iperf_udp_jitter_ms = Some(3.0);
        m.iperf_udp_lost_percent = Some(5.0); // Above 2% threshold.

        let input = make_input(vec![ap], vec![m]);
        let changes = rules::rule_channel_width(&input);

        assert!(
            !changes.is_empty(),
            "Should suggest narrower channel width on high loss"
        );
        assert_eq!(changes[0].new_value, "40");
    }

    #[test]
    fn test_channel_width_widen_on_low_interference() {
        let mut ap = make_ap("ap1", "AP-1");
        ap.channel_width = "40".to_string();
        let mut m = make_measurement(Some(-55.0), "5ghz");
        m.iperf_udp_jitter_ms = Some(2.0); // Well below threshold.
        m.iperf_udp_lost_percent = Some(0.1); // Well below threshold.

        let input = make_input(vec![ap], vec![m]);
        let changes = rules::rule_channel_width(&input);

        assert!(
            !changes.is_empty(),
            "Should suggest wider channel width on low interference"
        );
        assert_eq!(changes[0].new_value, "80");
    }

    #[test]
    fn test_channel_width_already_at_min() {
        let mut ap = make_ap("ap1", "AP-1");
        ap.channel_width = "20".to_string();
        let mut m = make_measurement(Some(-55.0), "5ghz");
        m.iperf_udp_jitter_ms = Some(15.0);
        m.iperf_udp_lost_percent = Some(5.0);

        let input = make_input(vec![ap], vec![m]);
        let changes = rules::rule_channel_width(&input);

        assert!(
            changes.is_empty(),
            "Already at 20 MHz, cannot narrow further"
        );
    }

    #[test]
    fn test_channel_width_no_udp_data() {
        let ap = make_ap("ap1", "AP-1");
        let m = make_measurement(Some(-55.0), "5ghz");
        // No jitter or loss data.

        let input = make_input(vec![ap], vec![m]);
        let changes = rules::rule_channel_width(&input);

        assert!(
            changes.is_empty(),
            "No UDP data should not trigger channel width changes"
        );
    }

    // =========================================================================
    // Integration: generate_optimization
    // =========================================================================

    #[test]
    fn test_generate_optimization_aggregates_rules() {
        use crate::optimizer::generate_optimization;

        let mut ap1 = make_ap("ap1", "AP-1");
        ap1.channel_24ghz = Some(1);
        let mut ap2 = make_ap("ap2", "AP-2");
        ap2.channel_24ghz = Some(1);

        let input = make_input(vec![ap1, ap2], vec![]);
        let result = generate_optimization(&input);

        // Should at minimum have channel assignment changes.
        assert!(
            !result.changes.is_empty(),
            "Aggregated result should include channel changes"
        );

        // Verify sorting by priority: High before Medium before Low.
        for window in result.changes.windows(2) {
            assert!(
                window[0].priority <= window[1].priority,
                "Changes should be sorted by priority (High < Medium < Low)"
            );
        }
    }

    #[test]
    fn test_generate_optimization_deduplicates() {
        use crate::optimizer::generate_optimization;

        let mut ap1 = make_ap("ap1", "AP-1");
        ap1.channel_24ghz = Some(1);

        // Only one AP, no conflicts.
        let input = make_input(vec![ap1], vec![]);
        let result = generate_optimization(&input);

        // No duplicates: each (ap_id, parameter) pair should appear at most once.
        let mut seen = std::collections::HashSet::new();
        for change in &result.changes {
            let key = format!("{}:{}", change.access_point_id, change.parameter);
            assert!(
                seen.insert(key.clone()),
                "Duplicate change detected: {}",
                key
            );
        }
    }

    #[test]
    fn test_disabled_ap_is_skipped() {
        let mut ap = make_ap("ap1", "Disabled AP");
        ap.enabled = false;
        ap.channel_24ghz = Some(1);

        let mut ap2 = make_ap("ap2", "Active AP");
        ap2.channel_24ghz = Some(1);

        // With one disabled, there is only 1 enabled AP on channel 1 => no conflict.
        let input = make_input(vec![ap, ap2], vec![]);
        let changes = rules::rule_channel_assignment(&input);

        let ch24: Vec<&ParameterChange> = changes
            .iter()
            .filter(|c| c.parameter == "channel_24ghz")
            .collect();

        assert!(
            ch24.is_empty(),
            "Disabled AP should not participate in channel conflict detection"
        );
    }
}
