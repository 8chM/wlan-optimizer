use tauri::State;

use crate::db::models::{AppSettings, HeatmapSettings, UpdateAppSettingsParams, UpdateHeatmapSettingsParams};
use crate::error::AppError;
use crate::state::AppState;

// =============================================================================
// App Settings Commands
// =============================================================================

/// Reads all application settings from the key-value settings table.
///
/// Settings are stored as individual key-value rows. This command
/// assembles them into a typed AppSettings struct.
#[tauri::command]
pub fn get_settings(
    state: State<'_, AppState>,
) -> Result<AppSettings, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let defaults = AppSettings::default();

    let locale = get_setting_value(&conn, "default_locale")
        .unwrap_or(defaults.locale);
    let theme = get_setting_value(&conn, "theme")
        .unwrap_or(defaults.theme);
    let default_color_scheme = get_setting_value(&conn, "default_color_scheme")
        .unwrap_or(defaults.default_color_scheme);
    let default_grid_resolution_m = get_setting_value(&conn, "default_grid_resolution_m")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(defaults.default_grid_resolution_m);
    let iperf_server_ip = get_setting_value(&conn, "iperf_server_ip");
    let iperf_server_port = get_setting_value(&conn, "iperf_server_port")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(defaults.iperf_server_port);
    let auto_save_enabled = get_setting_value(&conn, "auto_save_enabled")
        .map(|v| v == "1" || v == "true")
        .unwrap_or(defaults.auto_save_enabled);
    let auto_save_interval_s = get_setting_value(&conn, "auto_save_interval_s")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(defaults.auto_save_interval_s);

    Ok(AppSettings {
        locale,
        theme,
        default_color_scheme,
        default_grid_resolution_m,
        iperf_server_ip,
        iperf_server_port,
        auto_save_enabled,
        auto_save_interval_s,
    })
}

/// Updates application settings. Only provided fields are updated.
///
/// Each setting is stored as a key-value pair in the settings table.
/// Missing keys are inserted, existing keys are updated.
#[tauri::command]
pub fn update_settings(
    params: UpdateAppSettingsParams,
    state: State<'_, AppState>,
) -> Result<AppSettings, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    if let Some(ref locale) = params.locale {
        if locale != "de" && locale != "en" {
            return Err(AppError::Validation {
                message: format!("Invalid locale '{}'. Must be 'de' or 'en'.", locale),
            });
        }
        upsert_setting(&conn, "default_locale", locale)?;
    }

    if let Some(ref theme) = params.theme {
        upsert_setting(&conn, "theme", theme)?;
    }

    if let Some(ref color_scheme) = params.default_color_scheme {
        if !["viridis", "jet", "inferno"].contains(&color_scheme.as_str()) {
            return Err(AppError::Validation {
                message: format!(
                    "Invalid color scheme '{}'. Must be 'viridis', 'jet', or 'inferno'.",
                    color_scheme
                ),
            });
        }
        upsert_setting(&conn, "default_color_scheme", color_scheme)?;
    }

    if let Some(resolution) = params.default_grid_resolution_m {
        if !(0.1..=2.0).contains(&resolution) {
            return Err(AppError::Validation {
                message: "Grid resolution must be between 0.1 and 2.0 meters.".into(),
            });
        }
        upsert_setting(&conn, "default_grid_resolution_m", &resolution.to_string())?;
    }

    if let Some(ref ip) = params.iperf_server_ip {
        upsert_setting(&conn, "iperf_server_ip", ip)?;
    }

    if let Some(port) = params.iperf_server_port {
        if !(1..=65535).contains(&port) {
            return Err(AppError::Validation {
                message: "Port must be between 1 and 65535.".into(),
            });
        }
        upsert_setting(&conn, "iperf_server_port", &port.to_string())?;
    }

    if let Some(auto_save) = params.auto_save_enabled {
        upsert_setting(&conn, "auto_save_enabled", if auto_save { "1" } else { "0" })?;
    }

    if let Some(interval) = params.auto_save_interval_s {
        if interval < 10 {
            return Err(AppError::Validation {
                message: "Auto-save interval must be at least 10 seconds.".into(),
            });
        }
        upsert_setting(&conn, "auto_save_interval_s", &interval.to_string())?;
    }

    // Release lock before re-acquiring in get_settings
    drop(conn);

    get_settings(state)
}

/// Detects the system language using platform-specific APIs.
///
/// On macOS: reads AppleLanguages from user defaults.
/// On other platforms: returns "en" as fallback.
///
/// Returns an ISO 639-1 language code (e.g., "de", "en").
#[tauri::command]
pub fn get_system_language() -> Result<String, AppError> {
    #[cfg(target_os = "macos")]
    {
        // Use NSDefaults to read the system language
        let output = std::process::Command::new("defaults")
            .args(["read", "-g", "AppleLanguages"])
            .output()
            .map_err(|e| AppError::Platform {
                message: format!("Failed to read system language: {}", e),
            })?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse plist-style output: ( "de-DE", "en", ... )
            // Extract first language code
            if let Some(lang) = extract_first_language(&stdout) {
                return Ok(lang);
            }
        }

        // Fallback: try LANG environment variable
        if let Ok(lang) = std::env::var("LANG") {
            return Ok(normalize_lang_code(&lang));
        }

        Ok("de".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows/Linux: use LANG env var as best effort
        if let Ok(lang) = std::env::var("LANG") {
            return Ok(normalize_lang_code(&lang));
        }
        Ok("en".to_string())
    }
}

// =============================================================================
// Heatmap Settings Commands
// =============================================================================

/// Gets the heatmap settings for a project.
#[tauri::command]
pub fn get_heatmap_settings(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<HeatmapSettings, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    let settings = conn.query_row(
        "SELECT * FROM heatmap_settings WHERE project_id = ?1",
        [&project_id],
        |row| {
            Ok(HeatmapSettings {
                id: row.get("id")?,
                project_id: row.get("project_id")?,
                color_scheme: row.get("color_scheme")?,
                grid_resolution_m: row.get("grid_resolution_m")?,
                signal_threshold_excellent: row.get("signal_threshold_excellent")?,
                signal_threshold_good: row.get("signal_threshold_good")?,
                signal_threshold_fair: row.get("signal_threshold_fair")?,
                signal_threshold_poor: row.get("signal_threshold_poor")?,
                receiver_gain_dbi: row.get("receiver_gain_dbi")?,
                path_loss_exponent: row.get("path_loss_exponent")?,
                reference_loss_24ghz: row.get("reference_loss_24ghz")?,
                reference_loss_5ghz: row.get("reference_loss_5ghz")?,
                reference_loss_6ghz: row.get("reference_loss_6ghz")?,
                show_24ghz: row.get::<_, i32>("show_24ghz")? != 0,
                show_5ghz: row.get::<_, i32>("show_5ghz")? != 0,
                show_6ghz: row.get::<_, i32>("show_6ghz")? != 0,
                opacity: row.get("opacity")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        },
    )?;

    Ok(settings)
}

/// Updates heatmap settings for a project.
#[tauri::command]
pub fn update_heatmap_settings(
    params: UpdateHeatmapSettingsParams,
    state: State<'_, AppState>,
) -> Result<HeatmapSettings, AppError> {
    let conn = state.db.lock().map_err(|e| AppError::Internal {
        message: format!("Failed to acquire DB lock: {}", e),
    })?;

    conn.execute(
        "UPDATE heatmap_settings SET
            color_scheme = COALESCE(?1, color_scheme),
            grid_resolution_m = COALESCE(?2, grid_resolution_m),
            path_loss_exponent = COALESCE(?3, path_loss_exponent),
            opacity = COALESCE(?4, opacity),
            show_24ghz = COALESCE(?5, show_24ghz),
            show_5ghz = COALESCE(?6, show_5ghz),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE project_id = ?7",
        rusqlite::params![
            params.color_scheme, params.grid_resolution_m,
            params.path_loss_exponent, params.opacity,
            params.show_24ghz, params.show_5ghz,
            params.project_id,
        ],
    )?;

    // Release lock before re-acquiring for fetch
    drop(conn);

    // Return updated settings
    get_heatmap_settings(params.project_id, state)
}

// =============================================================================
// Helper functions
// =============================================================================

/// Reads a single setting value from the settings table.
fn get_setting_value(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

/// Inserts or updates a setting in the key-value settings table.
fn upsert_setting(
    conn: &rusqlite::Connection,
    key: &str,
    value: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

/// Extracts the first ISO 639-1 language code from macOS AppleLanguages output.
///
/// Input format: `(\n    "de-DE",\n    "en",\n)`
/// Returns: `"de"`
#[cfg(target_os = "macos")]
fn extract_first_language(plist_output: &str) -> Option<String> {
    for line in plist_output.lines() {
        let trimmed = line.trim().trim_matches(|c: char| c == '(' || c == ')' || c == ',');
        let trimmed = trimmed.trim().trim_matches('"');
        if !trimmed.is_empty() && trimmed.chars().next().map_or(false, |c| c.is_alphabetic()) {
            return Some(normalize_lang_code(trimmed));
        }
    }
    None
}

/// Normalizes a language string to a 2-letter ISO 639-1 code.
///
/// "de-DE" -> "de", "en_US.UTF-8" -> "en", "de" -> "de"
fn normalize_lang_code(raw: &str) -> String {
    let lower = raw.to_lowercase();
    // Take first 2 chars before any separator
    let code: String = lower
        .chars()
        .take_while(|c| c.is_alphabetic())
        .take(2)
        .collect();

    match code.as_str() {
        "de" => "de".to_string(),
        "en" => "en".to_string(),
        _ => "en".to_string(), // Default to English for unknown languages
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_lang_code() {
        assert_eq!(normalize_lang_code("de-DE"), "de");
        assert_eq!(normalize_lang_code("en_US.UTF-8"), "en");
        assert_eq!(normalize_lang_code("de"), "de");
        assert_eq!(normalize_lang_code("en"), "en");
        assert_eq!(normalize_lang_code("fr-FR"), "en"); // Unsupported -> English
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_extract_first_language() {
        let input = r#"(
    "de-DE",
    "en",
    "fr-FR"
)"#;
        assert_eq!(extract_first_language(input), Some("de".to_string()));

        let english = r#"(
    "en-US",
    "de"
)"#;
        assert_eq!(extract_first_language(english), Some("en".to_string()));
    }
}
