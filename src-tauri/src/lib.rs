pub mod ap_control;
pub mod commands;
pub mod db;
pub mod error;
pub mod export;
pub mod measurement;
pub mod platform;
pub mod state;

use state::AppState;

/// Builds and runs the Tauri application with all plugins and state.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let app_state = AppState::new(app.handle())?;
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::list_projects,
            commands::project::get_project,
            commands::project::create_project,
            commands::project::delete_project,
            commands::floor::get_floor_data,
            commands::wall::create_wall,
            commands::wall::update_wall,
            commands::wall::delete_wall,
            commands::access_point::create_access_point,
            commands::access_point::update_access_point,
            commands::access_point::delete_access_point,
            commands::material::list_materials,
            commands::ap_model::list_ap_models,
            commands::measurement::start_measurement,
            commands::measurement::save_measurement,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_system_language,
            commands::settings::get_heatmap_settings,
            commands::settings::update_heatmap_settings,
            commands::export::export_project,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running WLAN-Optimizer");
}
