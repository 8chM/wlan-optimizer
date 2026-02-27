-- Migration 003: Seed AP models
-- Values from docs/architecture/Datenmodell.md Section 3.5 + 3.6
-- Hardware reference: D-Link DAP-X2810 (CLAUDE.md)

-- D-Link DAP-X2810 (Reference AP)
-- 2.4GHz: 23 dBm TX power, 3.2 dBi antenna gain
-- 5GHz: 26 dBm TX power, 4.3 dBi antenna gain
-- Wi-Fi 6, 2x2 MU-MIMO
INSERT INTO ap_models (id, manufacturer, model, wifi_standard,
    max_tx_power_24ghz_dbm, max_tx_power_5ghz_dbm, max_tx_power_6ghz_dbm,
    antenna_gain_24ghz_dbi, antenna_gain_5ghz_dbi, antenna_gain_6ghz_dbi,
    mimo_streams,
    supported_channels_24ghz, supported_channels_5ghz, supported_channels_6ghz,
    is_user_defined) VALUES
('dap-x2810', 'D-Link', 'DAP-X2810', 'wifi6',
    23.0, 26.0, NULL,
    3.2, 4.3, NULL,
    2,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13]',
    '[36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,149,153,157,161,165]',
    NULL,
    0);

-- Custom AP template (user-defined, manual parameters)
INSERT INTO ap_models (id, manufacturer, model, wifi_standard,
    max_tx_power_24ghz_dbm, max_tx_power_5ghz_dbm, max_tx_power_6ghz_dbm,
    antenna_gain_24ghz_dbi, antenna_gain_5ghz_dbi, antenna_gain_6ghz_dbi,
    mimo_streams,
    supported_channels_24ghz, supported_channels_5ghz, supported_channels_6ghz,
    is_user_defined) VALUES
('custom-ap', 'Custom', 'Benutzerdefiniert', 'wifi6',
    20.0, 23.0, NULL,
    2.0, 3.0, NULL,
    2,
    '[1,6,11]',
    '[36,40,44,48]',
    NULL,
    1);
