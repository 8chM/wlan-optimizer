-- Migration 001: Initial schema
-- All CREATE TABLE statements from Datenmodell.md Section 2

-- 2.1 Global settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2.2 Projects
CREATE TABLE IF NOT EXISTS projects (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    description         TEXT,
    floor_plan_width_m  REAL,
    floor_plan_height_m REAL,
    locale              TEXT NOT NULL DEFAULT 'de'
                        CHECK (locale IN ('de', 'en')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- 2.4 Materials (must be before floors due to FK reference)
CREATE TABLE IF NOT EXISTS materials (
    id                   TEXT PRIMARY KEY,
    name_de              TEXT NOT NULL,
    name_en              TEXT NOT NULL,
    category             TEXT NOT NULL
                         CHECK (category IN ('light', 'medium', 'heavy', 'blocking')),
    default_thickness_cm REAL CHECK (default_thickness_cm IS NULL OR default_thickness_cm >= 0),
    attenuation_24ghz_db REAL NOT NULL CHECK (attenuation_24ghz_db >= 0),
    attenuation_5ghz_db  REAL NOT NULL CHECK (attenuation_5ghz_db >= 0),
    attenuation_6ghz_db  REAL NOT NULL CHECK (attenuation_6ghz_db >= 0),
    is_floor             INTEGER NOT NULL DEFAULT 0 CHECK (is_floor IN (0, 1)),
    is_user_defined      INTEGER NOT NULL DEFAULT 0 CHECK (is_user_defined IN (0, 1)),
    is_quick_category    INTEGER NOT NULL DEFAULT 0 CHECK (is_quick_category IN (0, 1)),
    icon                 TEXT,
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_materials_is_floor ON materials(is_floor);

-- 2.3 Floors
CREATE TABLE IF NOT EXISTS floors (
    id                      TEXT PRIMARY KEY,
    project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    floor_number            INTEGER NOT NULL DEFAULT 0,
    background_image        BLOB,
    background_image_format TEXT CHECK (background_image_format IN ('png', 'jpg', 'pdf')),
    scale_px_per_meter      REAL CHECK (scale_px_per_meter IS NULL OR scale_px_per_meter > 0),
    width_meters            REAL CHECK (width_meters IS NULL OR width_meters > 0),
    height_meters           REAL CHECK (height_meters IS NULL OR height_meters > 0),
    ceiling_height_m        REAL NOT NULL DEFAULT 2.8
                            CHECK (ceiling_height_m > 0 AND ceiling_height_m < 10),
    floor_material_id       TEXT REFERENCES materials(id) ON DELETE SET NULL,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(project_id, floor_number)
);

CREATE INDEX IF NOT EXISTS idx_floors_project ON floors(project_id);

-- 2.5 Walls & wall segments
CREATE TABLE IF NOT EXISTS walls (
    id                         TEXT PRIMARY KEY,
    floor_id                   TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    material_id                TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    attenuation_override_24ghz REAL CHECK (attenuation_override_24ghz IS NULL
                                           OR attenuation_override_24ghz >= 0),
    attenuation_override_5ghz  REAL CHECK (attenuation_override_5ghz IS NULL
                                           OR attenuation_override_5ghz >= 0),
    attenuation_override_6ghz  REAL CHECK (attenuation_override_6ghz IS NULL
                                           OR attenuation_override_6ghz >= 0),
    created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_walls_floor ON walls(floor_id);
CREATE INDEX IF NOT EXISTS idx_walls_material ON walls(material_id);

CREATE TABLE IF NOT EXISTS wall_segments (
    id            TEXT PRIMARY KEY,
    wall_id       TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
    segment_order INTEGER NOT NULL CHECK (segment_order >= 0),
    x1            REAL NOT NULL,
    y1            REAL NOT NULL,
    x2            REAL NOT NULL,
    y2            REAL NOT NULL,
    UNIQUE(wall_id, segment_order)
);

CREATE INDEX IF NOT EXISTS idx_wall_segments_wall ON wall_segments(wall_id);

-- 2.6 AP models & access points
CREATE TABLE IF NOT EXISTS ap_models (
    id                       TEXT PRIMARY KEY,
    manufacturer             TEXT NOT NULL,
    model                    TEXT NOT NULL,
    wifi_standard            TEXT CHECK (wifi_standard IN ('wifi5', 'wifi6', 'wifi6e', 'wifi7')),
    max_tx_power_24ghz_dbm   REAL CHECK (max_tx_power_24ghz_dbm IS NULL
                                         OR (max_tx_power_24ghz_dbm >= 0
                                             AND max_tx_power_24ghz_dbm <= 30)),
    max_tx_power_5ghz_dbm    REAL CHECK (max_tx_power_5ghz_dbm IS NULL
                                         OR (max_tx_power_5ghz_dbm >= 0
                                             AND max_tx_power_5ghz_dbm <= 36)),
    max_tx_power_6ghz_dbm    REAL CHECK (max_tx_power_6ghz_dbm IS NULL
                                         OR (max_tx_power_6ghz_dbm >= 0
                                             AND max_tx_power_6ghz_dbm <= 36)),
    antenna_gain_24ghz_dbi   REAL CHECK (antenna_gain_24ghz_dbi IS NULL
                                         OR (antenna_gain_24ghz_dbi >= -5
                                             AND antenna_gain_24ghz_dbi <= 20)),
    antenna_gain_5ghz_dbi    REAL CHECK (antenna_gain_5ghz_dbi IS NULL
                                         OR (antenna_gain_5ghz_dbi >= -5
                                             AND antenna_gain_5ghz_dbi <= 20)),
    antenna_gain_6ghz_dbi    REAL CHECK (antenna_gain_6ghz_dbi IS NULL
                                         OR (antenna_gain_6ghz_dbi >= -5
                                             AND antenna_gain_6ghz_dbi <= 20)),
    mimo_streams             INTEGER CHECK (mimo_streams IS NULL
                                           OR (mimo_streams >= 1 AND mimo_streams <= 16)),
    supported_channels_24ghz TEXT,
    supported_channels_5ghz  TEXT,
    supported_channels_6ghz  TEXT,
    is_user_defined          INTEGER NOT NULL DEFAULT 0 CHECK (is_user_defined IN (0, 1)),
    created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(manufacturer, model)
);

CREATE TABLE IF NOT EXISTS access_points (
    id                    TEXT PRIMARY KEY,
    floor_id              TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    ap_model_id           TEXT REFERENCES ap_models(id) ON DELETE SET NULL,
    label                 TEXT,
    x                     REAL NOT NULL,
    y                     REAL NOT NULL,
    height_m              REAL NOT NULL DEFAULT 2.5
                          CHECK (height_m > 0 AND height_m < 10),
    mounting              TEXT NOT NULL DEFAULT 'ceiling'
                          CHECK (mounting IN ('ceiling', 'wall', 'desk')),
    tx_power_24ghz_dbm    REAL CHECK (tx_power_24ghz_dbm IS NULL
                                      OR (tx_power_24ghz_dbm >= 0
                                          AND tx_power_24ghz_dbm <= 30)),
    tx_power_5ghz_dbm     REAL CHECK (tx_power_5ghz_dbm IS NULL
                                      OR (tx_power_5ghz_dbm >= 0
                                          AND tx_power_5ghz_dbm <= 36)),
    tx_power_6ghz_dbm     REAL CHECK (tx_power_6ghz_dbm IS NULL
                                      OR (tx_power_6ghz_dbm >= 0
                                          AND tx_power_6ghz_dbm <= 36)),
    channel_24ghz         INTEGER CHECK (channel_24ghz IS NULL
                                         OR (channel_24ghz >= 1 AND channel_24ghz <= 14)),
    channel_5ghz          INTEGER CHECK (channel_5ghz IS NULL
                                         OR (channel_5ghz >= 36 AND channel_5ghz <= 177)),
    channel_6ghz          INTEGER CHECK (channel_6ghz IS NULL
                                         OR (channel_6ghz >= 1 AND channel_6ghz <= 233)),
    channel_width         TEXT NOT NULL DEFAULT '80'
                          CHECK (channel_width IN ('20', '40', '80', '160')),
    band_steering_enabled INTEGER NOT NULL DEFAULT 0 CHECK (band_steering_enabled IN (0, 1)),
    ip_address            TEXT,
    ssid                  TEXT,
    enabled               INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_access_points_floor ON access_points(floor_id);
CREATE INDEX IF NOT EXISTS idx_access_points_model ON access_points(ap_model_id);

-- 2.7 Measurement points, runs & measurements
CREATE TABLE IF NOT EXISTS measurement_points (
    id             TEXT PRIMARY KEY,
    floor_id       TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    label          TEXT NOT NULL,
    x              REAL NOT NULL,
    y              REAL NOT NULL,
    auto_generated INTEGER NOT NULL DEFAULT 0 CHECK (auto_generated IN (0, 1)),
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mpoints_floor ON measurement_points(floor_id);

CREATE TABLE IF NOT EXISTS measurement_runs (
    id              TEXT PRIMARY KEY,
    floor_id        TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    run_number      INTEGER NOT NULL CHECK (run_number >= 1 AND run_number <= 3),
    run_type        TEXT NOT NULL
                    CHECK (run_type IN ('baseline', 'post_optimization', 'verification')),
    iperf_server_ip TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mruns_floor ON measurement_runs(floor_id);
CREATE INDEX IF NOT EXISTS idx_mruns_status ON measurement_runs(status);

CREATE TABLE IF NOT EXISTS measurements (
    id                       TEXT PRIMARY KEY,
    measurement_point_id     TEXT NOT NULL
                             REFERENCES measurement_points(id) ON DELETE CASCADE,
    measurement_run_id       TEXT NOT NULL
                             REFERENCES measurement_runs(id) ON DELETE CASCADE,
    timestamp                TEXT NOT NULL
                             DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    frequency_band           TEXT NOT NULL
                             CHECK (frequency_band IN ('2.4ghz', '5ghz', '6ghz')),
    rssi_dbm                 REAL CHECK (rssi_dbm IS NULL
                                         OR (rssi_dbm >= -120 AND rssi_dbm <= 0)),
    noise_dbm                REAL CHECK (noise_dbm IS NULL
                                         OR (noise_dbm >= -120 AND noise_dbm <= 0)),
    snr_db                   REAL CHECK (snr_db IS NULL
                                         OR (snr_db >= 0 AND snr_db <= 100)),
    connected_bssid          TEXT,
    connected_ssid           TEXT,
    frequency_mhz            INTEGER CHECK (frequency_mhz IS NULL
                                            OR (frequency_mhz >= 2400
                                                AND frequency_mhz <= 7200)),
    tx_rate_mbps             REAL CHECK (tx_rate_mbps IS NULL OR tx_rate_mbps >= 0),
    iperf_tcp_upload_bps     REAL CHECK (iperf_tcp_upload_bps IS NULL
                                         OR iperf_tcp_upload_bps >= 0),
    iperf_tcp_download_bps   REAL CHECK (iperf_tcp_download_bps IS NULL
                                         OR iperf_tcp_download_bps >= 0),
    iperf_tcp_retransmits    INTEGER CHECK (iperf_tcp_retransmits IS NULL
                                           OR iperf_tcp_retransmits >= 0),
    iperf_udp_throughput_bps REAL CHECK (iperf_udp_throughput_bps IS NULL
                                         OR iperf_udp_throughput_bps >= 0),
    iperf_udp_jitter_ms      REAL CHECK (iperf_udp_jitter_ms IS NULL
                                         OR iperf_udp_jitter_ms >= 0),
    iperf_udp_lost_packets   INTEGER CHECK (iperf_udp_lost_packets IS NULL
                                           OR iperf_udp_lost_packets >= 0),
    iperf_udp_total_packets  INTEGER CHECK (iperf_udp_total_packets IS NULL
                                           OR iperf_udp_total_packets >= 0),
    iperf_udp_lost_percent   REAL CHECK (iperf_udp_lost_percent IS NULL
                                         OR (iperf_udp_lost_percent >= 0
                                             AND iperf_udp_lost_percent <= 100)),
    rtt_mean_us              REAL CHECK (rtt_mean_us IS NULL OR rtt_mean_us >= 0),
    quality                  TEXT NOT NULL DEFAULT 'good'
                             CHECK (quality IN ('good', 'fair', 'poor', 'failed')),
    raw_iperf_json           TEXT,
    created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_measurements_point ON measurements(measurement_point_id);
CREATE INDEX IF NOT EXISTS idx_measurements_run ON measurements(measurement_run_id);
CREATE INDEX IF NOT EXISTS idx_measurements_band ON measurements(frequency_band);

-- 2.8 Calibration results
CREATE TABLE IF NOT EXISTS calibration_results (
    id                            TEXT PRIMARY KEY,
    measurement_run_id            TEXT NOT NULL UNIQUE
                                  REFERENCES measurement_runs(id) ON DELETE CASCADE,
    frequency_band                TEXT NOT NULL
                                  CHECK (frequency_band IN ('2.4ghz', '5ghz', '6ghz')),
    path_loss_exponent_original   REAL NOT NULL DEFAULT 3.5,
    path_loss_exponent_calibrated REAL CHECK (path_loss_exponent_calibrated IS NULL
                                              OR (path_loss_exponent_calibrated >= 1.5
                                                  AND path_loss_exponent_calibrated <= 6.0)),
    wall_correction_factor        REAL NOT NULL DEFAULT 1.0
                                  CHECK (wall_correction_factor >= 0.1
                                         AND wall_correction_factor <= 3.0),
    rmse_db                       REAL CHECK (rmse_db IS NULL OR rmse_db >= 0),
    r_squared                     REAL CHECK (r_squared IS NULL
                                              OR (r_squared >= 0 AND r_squared <= 1.0)),
    max_deviation_db              REAL CHECK (max_deviation_db IS NULL OR max_deviation_db >= 0),
    num_measurement_points        INTEGER NOT NULL CHECK (num_measurement_points >= 1),
    confidence                    TEXT NOT NULL DEFAULT 'low'
                                  CHECK (confidence IN ('high', 'medium', 'low')),
    created_at                    TEXT NOT NULL
                                  DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_calibration_run ON calibration_results(measurement_run_id);

-- 2.9 Heatmap settings
CREATE TABLE IF NOT EXISTS heatmap_settings (
    id                         TEXT PRIMARY KEY,
    project_id                 TEXT NOT NULL UNIQUE
                               REFERENCES projects(id) ON DELETE CASCADE,
    color_scheme               TEXT NOT NULL DEFAULT 'viridis'
                               CHECK (color_scheme IN ('viridis', 'jet', 'inferno')),
    grid_resolution_m          REAL NOT NULL DEFAULT 0.25
                               CHECK (grid_resolution_m >= 0.1
                                      AND grid_resolution_m <= 2.0),
    signal_threshold_excellent REAL NOT NULL DEFAULT -50.0,
    signal_threshold_good      REAL NOT NULL DEFAULT -65.0,
    signal_threshold_fair      REAL NOT NULL DEFAULT -75.0,
    signal_threshold_poor      REAL NOT NULL DEFAULT -85.0,
    receiver_gain_dbi          REAL NOT NULL DEFAULT -3.0,
    path_loss_exponent         REAL NOT NULL DEFAULT 3.5
                               CHECK (path_loss_exponent >= 1.5
                                      AND path_loss_exponent <= 6.0),
    reference_loss_24ghz       REAL NOT NULL DEFAULT 40.05,
    reference_loss_5ghz        REAL NOT NULL DEFAULT 46.42,
    reference_loss_6ghz        REAL NOT NULL DEFAULT 47.96,
    show_24ghz                 INTEGER NOT NULL DEFAULT 1 CHECK (show_24ghz IN (0, 1)),
    show_5ghz                  INTEGER NOT NULL DEFAULT 1 CHECK (show_5ghz IN (0, 1)),
    show_6ghz                  INTEGER NOT NULL DEFAULT 0 CHECK (show_6ghz IN (0, 1)),
    opacity                    REAL NOT NULL DEFAULT 0.7
                               CHECK (opacity >= 0.0 AND opacity <= 1.0),
    created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2.10 Optimization plans & steps
CREATE TABLE IF NOT EXISTS optimization_plans (
    id                            TEXT PRIMARY KEY,
    project_id                    TEXT NOT NULL
                                  REFERENCES projects(id) ON DELETE CASCADE,
    name                          TEXT,
    mode                          TEXT NOT NULL DEFAULT 'forecast'
                                  CHECK (mode IN ('forecast', 'assist', 'auto')),
    status                        TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'applied', 'verified')),
    predicted_rmse_improvement_db REAL,
    created_at                    TEXT NOT NULL
                                  DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at                    TEXT NOT NULL
                                  DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_optplans_project ON optimization_plans(project_id);

CREATE TABLE IF NOT EXISTS optimization_steps (
    id              TEXT PRIMARY KEY,
    plan_id         TEXT NOT NULL
                    REFERENCES optimization_plans(id) ON DELETE CASCADE,
    access_point_id TEXT NOT NULL
                    REFERENCES access_points(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL CHECK (step_order >= 0),
    parameter       TEXT NOT NULL
                    CHECK (parameter IN (
                        'tx_power_24ghz', 'tx_power_5ghz', 'tx_power_6ghz',
                        'channel_24ghz', 'channel_5ghz', 'channel_6ghz',
                        'channel_width', 'band_steering', 'enabled'
                    )),
    old_value       TEXT,
    new_value       TEXT,
    description_de  TEXT,
    description_en  TEXT,
    applied         INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
    applied_at      TEXT,
    UNIQUE(plan_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_optsteps_plan ON optimization_steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_optsteps_ap ON optimization_steps(access_point_id);

-- 2.11 Undo history
CREATE TABLE IF NOT EXISTS undo_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    old_data     TEXT NOT NULL,
    new_data     TEXT NOT NULL,
    description  TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_undo_project ON undo_history(project_id, id DESC);

-- Seed initial settings
INSERT INTO settings (key, value) VALUES
    ('schema_version', '1'),
    ('app_version', '0.1.0'),
    ('default_locale', 'de');
