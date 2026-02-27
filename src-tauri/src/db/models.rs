use rusqlite::{Result as SqlResult, Row};
use serde::{Deserialize, Serialize};

// =============================================================================
// Frequency band enum
// =============================================================================

/// Represents the supported Wi-Fi frequency bands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FrequencyBand {
    #[serde(rename = "2.4ghz")]
    Band24Ghz,
    #[serde(rename = "5ghz")]
    Band5Ghz,
    #[serde(rename = "6ghz")]
    Band6Ghz,
}

impl FrequencyBand {
    /// Parses a frequency band string into a `FrequencyBand`.
    /// Returns `None` for unrecognized strings.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "2.4ghz" => Some(Self::Band24Ghz),
            "5ghz" => Some(Self::Band5Ghz),
            "6ghz" => Some(Self::Band6Ghz),
            _ => None,
        }
    }
}

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

    /// Creates a Floor from a row that does NOT include the `background_image` column.
    /// Used by queries that explicitly exclude the BLOB to avoid unnecessary memory usage.
    pub fn from_row_without_image(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            name: row.get("name")?,
            floor_number: row.get("floor_number")?,
            background_image: None,
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

/// Lightweight struct for returning only the floor plan image data.
#[derive(Debug, Clone, Serialize)]
pub struct FloorImage {
    pub id: String,
    pub background_image: Option<Vec<u8>>,
    pub background_image_format: Option<String>,
}

/// SQL column list for Floor queries that exclude the heavy `background_image` BLOB.
pub const FLOOR_COLUMNS_WITHOUT_IMAGE: &str =
    "id, project_id, name, floor_number, background_image_format, \
     scale_px_per_meter, width_meters, height_meters, ceiling_height_m, \
     floor_material_id, created_at, updated_at";

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
    ///
    /// Returns `None` if the band string is not recognized. Use `FrequencyBand`
    /// for a type-safe alternative via `attenuation_for_frequency_band`.
    pub fn attenuation_for_band(&self, band: &str) -> Option<f64> {
        match FrequencyBand::from_str(band) {
            Some(fb) => Some(self.attenuation_for_frequency_band(fb)),
            None => None,
        }
    }

    /// Returns the attenuation value for a typed `FrequencyBand`.
    pub fn attenuation_for_frequency_band(&self, band: FrequencyBand) -> f64 {
        match band {
            FrequencyBand::Band24Ghz => self.attenuation_24ghz_db,
            FrequencyBand::Band5Ghz => self.attenuation_5ghz_db,
            FrequencyBand::Band6Ghz => self.attenuation_6ghz_db,
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

impl MeasurementPoint {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            floor_id: row.get("floor_id")?,
            label: row.get("label")?,
            x: row.get("x")?,
            y: row.get("y")?,
            auto_generated: row.get::<_, i32>("auto_generated")? != 0,
            notes: row.get("notes")?,
            created_at: row.get("created_at")?,
        })
    }
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

impl MeasurementRun {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            floor_id: row.get("floor_id")?,
            run_number: row.get("run_number")?,
            run_type: row.get("run_type")?,
            iperf_server_ip: row.get("iperf_server_ip")?,
            status: row.get("status")?,
            started_at: row.get("started_at")?,
            completed_at: row.get("completed_at")?,
            created_at: row.get("created_at")?,
        })
    }
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

impl Measurement {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            measurement_point_id: row.get("measurement_point_id")?,
            measurement_run_id: row.get("measurement_run_id")?,
            timestamp: row.get("timestamp")?,
            frequency_band: row.get("frequency_band")?,
            rssi_dbm: row.get("rssi_dbm")?,
            noise_dbm: row.get("noise_dbm")?,
            snr_db: row.get("snr_db")?,
            connected_bssid: row.get("connected_bssid")?,
            connected_ssid: row.get("connected_ssid")?,
            frequency_mhz: row.get("frequency_mhz")?,
            tx_rate_mbps: row.get("tx_rate_mbps")?,
            iperf_tcp_upload_bps: row.get("iperf_tcp_upload_bps")?,
            iperf_tcp_download_bps: row.get("iperf_tcp_download_bps")?,
            iperf_tcp_retransmits: row.get("iperf_tcp_retransmits")?,
            iperf_udp_throughput_bps: row.get("iperf_udp_throughput_bps")?,
            iperf_udp_jitter_ms: row.get("iperf_udp_jitter_ms")?,
            iperf_udp_lost_packets: row.get("iperf_udp_lost_packets")?,
            iperf_udp_total_packets: row.get("iperf_udp_total_packets")?,
            iperf_udp_lost_percent: row.get("iperf_udp_lost_percent")?,
            rtt_mean_us: row.get("rtt_mean_us")?,
            quality: row.get("quality")?,
            raw_iperf_json: row.get("raw_iperf_json")?,
            created_at: row.get("created_at")?,
        })
    }
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

impl OptimizationPlan {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            name: row.get("name")?,
            mode: row.get("mode")?,
            status: row.get("status")?,
            predicted_rmse_improvement_db: row.get("predicted_rmse_improvement_db")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
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

impl OptimizationStep {
    pub fn from_row(row: &Row<'_>) -> SqlResult<Self> {
        Ok(Self {
            id: row.get("id")?,
            plan_id: row.get("plan_id")?,
            access_point_id: row.get("access_point_id")?,
            step_order: row.get("step_order")?,
            parameter: row.get("parameter")?,
            old_value: row.get("old_value")?,
            new_value: row.get("new_value")?,
            description_de: row.get("description_de")?,
            description_en: row.get("description_en")?,
            applied: row.get::<_, i32>("applied")? != 0,
            applied_at: row.get("applied_at")?,
        })
    }
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

// =============================================================================
// Phase 8b parameter structs
// =============================================================================

/// Partial update payload for a project.
#[derive(Debug, Deserialize)]
pub struct UpdateProjectParams {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub locale: Option<String>,
}

/// Parameters for creating a new floor.
#[derive(Debug, Deserialize)]
pub struct CreateFloorParams {
    pub project_id: String,
    pub name: String,
    pub floor_number: i32,
    pub ceiling_height_m: Option<f64>,
    pub floor_material_id: Option<String>,
}

/// Partial update payload for a floor.
#[derive(Debug, Deserialize)]
pub struct UpdateFloorParams {
    pub id: String,
    pub name: Option<String>,
    pub floor_number: Option<i32>,
    pub ceiling_height_m: Option<f64>,
    pub floor_material_id: Option<String>,
}

/// A single wall entry within a batch-create operation.
#[derive(Debug, Deserialize)]
pub struct CreateWallEntry {
    pub material_id: String,
    pub segments: Vec<SegmentParams>,
    pub attenuation_override_24ghz: Option<f64>,
    pub attenuation_override_5ghz: Option<f64>,
    pub attenuation_override_6ghz: Option<f64>,
}

/// Parameters for creating multiple walls in a single transaction.
#[derive(Debug, Deserialize)]
pub struct CreateWallsBatchParams {
    pub floor_id: String,
    pub walls: Vec<CreateWallEntry>,
}

/// Parameters for creating a user-defined material.
#[derive(Debug, Deserialize)]
pub struct CreateMaterialParams {
    pub name_de: String,
    pub name_en: String,
    pub category: String,
    pub default_thickness_cm: Option<f64>,
    pub attenuation_24ghz_db: f64,
    pub attenuation_5ghz_db: f64,
    pub attenuation_6ghz_db: f64,
    pub is_floor: Option<bool>,
    pub icon: Option<String>,
}

/// Partial update payload for a material.
#[derive(Debug, Deserialize)]
pub struct UpdateMaterialParams {
    pub id: String,
    pub name_de: Option<String>,
    pub name_en: Option<String>,
    pub category: Option<String>,
    pub default_thickness_cm: Option<f64>,
    pub attenuation_24ghz_db: Option<f64>,
    pub attenuation_5ghz_db: Option<f64>,
    pub attenuation_6ghz_db: Option<f64>,
    pub is_floor: Option<bool>,
    pub icon: Option<String>,
}

/// Parameters for creating a custom AP model.
#[derive(Debug, Deserialize)]
pub struct CreateApModelParams {
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
}

// =============================================================================
// Phase 8d parameter structs (measurement module)
// =============================================================================

/// Parameters for creating a new measurement run.
#[derive(Debug, Deserialize)]
pub struct CreateMeasurementRunParams {
    pub floor_id: String,
    pub run_number: i32,
    pub run_type: String,
    pub iperf_server_ip: Option<String>,
}

/// Parameters for creating a new measurement point.
#[derive(Debug, Deserialize)]
pub struct CreateMeasurementPointParams {
    pub floor_id: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub auto_generated: Option<bool>,
    pub notes: Option<String>,
}
