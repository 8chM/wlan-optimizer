use rusqlite::{Result as SqlResult, Row};
use serde::{Deserialize, Serialize};

// =============================================================================
// Core entities
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub floor_plan_width_m: Option<f64>,
    pub floor_plan_height_m: Option<f64>,
    pub locale: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Project {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            floor_plan_width_m: row.get("floor_plan_width_m")?,
            floor_plan_height_m: row.get("floor_plan_height_m")?,
            locale: row.get("locale")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Floor {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub floor_number: i32,
    #[serde(skip)]
    pub background_image: Option<Vec<u8>>,
    pub background_image_format: Option<String>,
    pub scale_px_per_meter: Option<f64>,
    pub width_meters: Option<f64>,
    pub height_meters: Option<f64>,
    pub ceiling_height_m: f64,
    pub floor_material_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Floor {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            name: row.get("name")?,
            floor_number: row.get("floor_number")?,
            background_image: row.get("background_image")?,
            background_image_format: row.get("background_image_format")?,
            scale_px_per_meter: row.get("scale_px_per_meter")?,
            width_meters: row.get("width_meters")?,
            height_meters: row.get("height_meters")?,
            ceiling_height_m: row.get("ceiling_height_m")?,
            floor_material_id: row.get("floor_material_id")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material {
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    pub category: String,
    pub default_thickness_cm: Option<f64>,
    pub attenuation_24ghz_db: f64,
    pub attenuation_5ghz_db: f64,
    pub attenuation_6ghz_db: f64,
    pub is_floor: bool,
    pub is_user_defined: bool,
    pub is_quick_category: bool,
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Material {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            name_de: row.get("name_de")?,
            name_en: row.get("name_en")?,
            category: row.get("category")?,
            default_thickness_cm: row.get("default_thickness_cm")?,
            attenuation_24ghz_db: row.get("attenuation_24ghz_db")?,
            attenuation_5ghz_db: row.get("attenuation_5ghz_db")?,
            attenuation_6ghz_db: row.get("attenuation_6ghz_db")?,
            is_floor: row.get::<_, i32>("is_floor")? != 0,
            is_user_defined: row.get::<_, i32>("is_user_defined")? != 0,
            is_quick_category: row.get::<_, i32>("is_quick_category")? != 0,
            icon: row.get("icon")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    /// Returns the attenuation value for the requested frequency band.
    pub fn attenuation_for_band(&self, band: &str) -> f64 {
        match band {
            "2.4ghz" => self.attenuation_24ghz_db,
            "5ghz" => self.attenuation_5ghz_db,
            "6ghz" => self.attenuation_6ghz_db,
            _ => self.attenuation_5ghz_db,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wall {
    pub id: String,
    pub floor_id: String,
    pub material_id: String,
    pub attenuation_override_24ghz: Option<f64>,
    pub attenuation_override_5ghz: Option<f64>,
    pub attenuation_override_6ghz: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

impl Wall {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            floor_id: row.get("floor_id")?,
            material_id: row.get("material_id")?,
            attenuation_override_24ghz: row.get("attenuation_override_24ghz")?,
            attenuation_override_5ghz: row.get("attenuation_override_5ghz")?,
            attenuation_override_6ghz: row.get("attenuation_override_6ghz")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallSegment {
    pub id: String,
    pub wall_id: String,
    pub segment_order: i32,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
}

impl WallSegment {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            wall_id: row.get("wall_id")?,
            segment_order: row.get("segment_order")?,
            x1: row.get("x1")?,
            y1: row.get("y1")?,
            x2: row.get("x2")?,
            y2: row.get("y2")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApModel {
    pub id: String,
    pub manufacturer: String,
    pub model: String,
    pub wifi_standard: Option<String>,
    pub max_tx_power_24ghz_dbm: Option<f64>,
    pub max_tx_power_5ghz_dbm: Option<f64>,
    pub max_tx_power_6ghz_dbm: Option<f64>,
    pub antenna_gain_24ghz_dbi: Option<f64>,
    pub antenna_gain_5ghz_dbi: Option<f64>,
    pub antenna_gain_6ghz_dbi: Option<f64>,
    pub mimo_streams: Option<i32>,
    pub supported_channels_24ghz: Option<String>,
    pub supported_channels_5ghz: Option<String>,
    pub supported_channels_6ghz: Option<String>,
    pub is_user_defined: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl ApModel {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            manufacturer: row.get("manufacturer")?,
            model: row.get("model")?,
            wifi_standard: row.get("wifi_standard")?,
            max_tx_power_24ghz_dbm: row.get("max_tx_power_24ghz_dbm")?,
            max_tx_power_5ghz_dbm: row.get("max_tx_power_5ghz_dbm")?,
            max_tx_power_6ghz_dbm: row.get("max_tx_power_6ghz_dbm")?,
            antenna_gain_24ghz_dbi: row.get("antenna_gain_24ghz_dbi")?,
            antenna_gain_5ghz_dbi: row.get("antenna_gain_5ghz_dbi")?,
            antenna_gain_6ghz_dbi: row.get("antenna_gain_6ghz_dbi")?,
            mimo_streams: row.get("mimo_streams")?,
            supported_channels_24ghz: row.get("supported_channels_24ghz")?,
            supported_channels_5ghz: row.get("supported_channels_5ghz")?,
            supported_channels_6ghz: row.get("supported_channels_6ghz")?,
            is_user_defined: row.get::<_, i32>("is_user_defined")? != 0,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessPoint {
    pub id: String,
    pub floor_id: String,
    pub ap_model_id: Option<String>,
    pub label: Option<String>,
    pub x: f64,
    pub y: f64,
    pub height_m: f64,
    pub mounting: String,
    pub tx_power_24ghz_dbm: Option<f64>,
    pub tx_power_5ghz_dbm: Option<f64>,
    pub tx_power_6ghz_dbm: Option<f64>,
    pub channel_24ghz: Option<i32>,
    pub channel_5ghz: Option<i32>,
    pub channel_6ghz: Option<i32>,
    pub channel_width: String,
    pub band_steering_enabled: bool,
    pub ip_address: Option<String>,
    pub ssid: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl AccessPoint {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            floor_id: row.get("floor_id")?,
            ap_model_id: row.get("ap_model_id")?,
            label: row.get("label")?,
            x: row.get("x")?,
            y: row.get("y")?,
            height_m: row.get("height_m")?,
            mounting: row.get("mounting")?,
            tx_power_24ghz_dbm: row.get("tx_power_24ghz_dbm")?,
            tx_power_5ghz_dbm: row.get("tx_power_5ghz_dbm")?,
            tx_power_6ghz_dbm: row.get("tx_power_6ghz_dbm")?,
            channel_24ghz: row.get("channel_24ghz")?,
            channel_5ghz: row.get("channel_5ghz")?,
            channel_6ghz: row.get("channel_6ghz")?,
            channel_width: row.get("channel_width")?,
            band_steering_enabled: row.get::<_, i32>("band_steering_enabled")? != 0,
            ip_address: row.get("ip_address")?,
            ssid: row.get("ssid")?,
            enabled: row.get::<_, i32>("enabled")? != 0,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeasurementPoint {
    pub id: String,
    pub floor_id: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub auto_generated: bool,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeasurementRun {
    pub id: String,
    pub floor_id: String,
    pub run_number: i32,
    pub run_type: String,
    pub iperf_server_ip: Option<String>,
    pub status: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Measurement {
    pub id: String,
    pub measurement_point_id: String,
    pub measurement_run_id: String,
    pub timestamp: String,
    pub frequency_band: String,
    pub rssi_dbm: Option<f64>,
    pub noise_dbm: Option<f64>,
    pub snr_db: Option<f64>,
    pub connected_bssid: Option<String>,
    pub connected_ssid: Option<String>,
    pub frequency_mhz: Option<i32>,
    pub tx_rate_mbps: Option<f64>,
    pub iperf_tcp_upload_bps: Option<f64>,
    pub iperf_tcp_download_bps: Option<f64>,
    pub iperf_tcp_retransmits: Option<i32>,
    pub iperf_udp_throughput_bps: Option<f64>,
    pub iperf_udp_jitter_ms: Option<f64>,
    pub iperf_udp_lost_packets: Option<i32>,
    pub iperf_udp_total_packets: Option<i32>,
    pub iperf_udp_lost_percent: Option<f64>,
    pub rtt_mean_us: Option<f64>,
    pub quality: String,
    pub raw_iperf_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalibrationResult {
    pub id: String,
    pub measurement_run_id: String,
    pub frequency_band: String,
    pub path_loss_exponent_original: f64,
    pub path_loss_exponent_calibrated: Option<f64>,
    pub wall_correction_factor: f64,
    pub rmse_db: Option<f64>,
    pub r_squared: Option<f64>,
    pub max_deviation_db: Option<f64>,
    pub num_measurement_points: i32,
    pub confidence: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapSettings {
    pub id: String,
    pub project_id: String,
    pub color_scheme: String,
    pub grid_resolution_m: f64,
    pub signal_threshold_excellent: f64,
    pub signal_threshold_good: f64,
    pub signal_threshold_fair: f64,
    pub signal_threshold_poor: f64,
    pub receiver_gain_dbi: f64,
    pub path_loss_exponent: f64,
    pub reference_loss_24ghz: f64,
    pub reference_loss_5ghz: f64,
    pub reference_loss_6ghz: f64,
    pub show_24ghz: bool,
    pub show_5ghz: bool,
    pub show_6ghz: bool,
    pub opacity: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationPlan {
    pub id: String,
    pub project_id: String,
    pub name: Option<String>,
    pub mode: String,
    pub status: String,
    pub predicted_rmse_improvement_db: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationStep {
    pub id: String,
    pub plan_id: String,
    pub access_point_id: String,
    pub step_order: i32,
    pub parameter: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub description_de: Option<String>,
    pub description_en: Option<String>,
    pub applied: bool,
    pub applied_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoEntry {
    pub id: i64,
    pub project_id: String,
    pub command_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub old_data: String,
    pub new_data: String,
    pub description: Option<String>,
    pub created_at: String,
}

// =============================================================================
// App Settings (key-value store)
// =============================================================================

/// Application-wide settings, stored as key-value pairs in the settings table.
/// This struct provides a typed view over the settings table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub locale: String,
    pub theme: String,
    pub default_color_scheme: String,
    pub default_grid_resolution_m: f64,
    pub iperf_server_ip: Option<String>,
    pub iperf_server_port: i32,
    pub auto_save_enabled: bool,
    pub auto_save_interval_s: i32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            locale: "de".to_string(),
            theme: "system".to_string(),
            default_color_scheme: "viridis".to_string(),
            default_grid_resolution_m: 0.25,
            iperf_server_ip: None,
            iperf_server_port: 5201,
            auto_save_enabled: true,
            auto_save_interval_s: 60,
        }
    }
}

/// Partial update payload for application settings.
#[derive(Debug, Deserialize)]
pub struct UpdateAppSettingsParams {
    pub locale: Option<String>,
    pub theme: Option<String>,
    pub default_color_scheme: Option<String>,
    pub default_grid_resolution_m: Option<f64>,
    pub iperf_server_ip: Option<String>,
    pub iperf_server_port: Option<i32>,
    pub auto_save_enabled: Option<bool>,
    pub auto_save_interval_s: Option<i32>,
}

// =============================================================================
// Composite types (returned by IPC queries)
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct WallWithSegments {
    #[serde(flatten)]
    pub wall: Wall,
    pub material: Material,
    pub segments: Vec<WallSegment>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccessPointWithModel {
    #[serde(flatten)]
    pub access_point: AccessPoint,
    pub ap_model: Option<ApModel>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FloorData {
    pub floor: Floor,
    pub walls: Vec<WallWithSegments>,
    pub access_points: Vec<AccessPointWithModel>,
    pub measurement_points: Vec<MeasurementPoint>,
}

// =============================================================================
// Tauri command parameter structs
// =============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateProjectParams {
    pub name: String,
    pub description: Option<String>,
    pub locale: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWallParams {
    pub floor_id: String,
    pub material_id: String,
    pub segments: Vec<SegmentParams>,
}

#[derive(Debug, Deserialize)]
pub struct SegmentParams {
    pub segment_order: i32,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWallParams {
    pub wall_id: String,
    pub material_id: Option<String>,
    pub segments: Option<Vec<SegmentParams>>,
    pub attenuation_override_24ghz: Option<f64>,
    pub attenuation_override_5ghz: Option<f64>,
    pub attenuation_override_6ghz: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccessPointParams {
    pub floor_id: String,
    pub ap_model_id: Option<String>,
    pub label: Option<String>,
    pub x: f64,
    pub y: f64,
    pub height_m: Option<f64>,
    pub mounting: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccessPointParams {
    pub access_point_id: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub height_m: Option<f64>,
    pub mounting: Option<String>,
    pub tx_power_24ghz_dbm: Option<f64>,
    pub tx_power_5ghz_dbm: Option<f64>,
    pub channel_24ghz: Option<i32>,
    pub channel_5ghz: Option<i32>,
    pub channel_width: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateHeatmapSettingsParams {
    pub project_id: String,
    pub color_scheme: Option<String>,
    pub grid_resolution_m: Option<f64>,
    pub path_loss_exponent: Option<f64>,
    pub opacity: Option<f64>,
    pub show_24ghz: Option<bool>,
    pub show_5ghz: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SaveMeasurementParams {
    pub measurement_point_id: String,
    pub measurement_run_id: String,
    pub frequency_band: String,
    pub rssi_dbm: Option<f64>,
    pub noise_dbm: Option<f64>,
    pub iperf_tcp_upload_bps: Option<f64>,
    pub iperf_tcp_download_bps: Option<f64>,
    pub iperf_tcp_retransmits: Option<i32>,
    pub iperf_udp_throughput_bps: Option<f64>,
    pub iperf_udp_jitter_ms: Option<f64>,
    pub iperf_udp_lost_packets: Option<i32>,
    pub iperf_udp_total_packets: Option<i32>,
    pub raw_iperf_json: Option<String>,
}
