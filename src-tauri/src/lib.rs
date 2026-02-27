pub mod ap_control;
pub mod commands;
pub mod db;
pub mod error;
pub mod export;
pub mod measurement;
pub mod optimizer;
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
            // Project commands
            commands::project::list_projects,
            commands::project::get_project,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            // Floor commands
            commands::floor::create_floor,
            commands::floor::import_floor_image,
            commands::floor::set_floor_scale,
            commands::floor::update_floor,
            commands::floor::get_floors_by_project,
            commands::floor::get_floor_data,
            commands::floor::get_floor_image,
            // Wall commands
            commands::wall::create_wall,
            commands::wall::update_wall,
            commands::wall::delete_wall,
            commands::wall::create_walls_batch,
            // Access point commands
            commands::access_point::create_access_point,
            commands::access_point::update_access_point,
            commands::access_point::delete_access_point,
            // Material commands
            commands::material::list_materials,
            commands::material::get_material,
            commands::material::create_user_material,
            commands::material::update_material,
            // AP model commands
            commands::ap_model::list_ap_models,
            commands::ap_model::get_ap_model,
            commands::ap_model::create_custom_ap_model,
            // Measurement commands
            commands::measurement::start_measurement,
            commands::measurement::save_measurement,
            commands::measurement::create_measurement_run,
            commands::measurement::create_measurement_point,
            commands::measurement::get_measurement_runs,
            commands::measurement::get_measurements_by_run,
            commands::measurement::cancel_measurement,
            commands::measurement::update_measurement_run_status,
            commands::measurement::check_iperf_server,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_system_language,
            commands::settings::get_heatmap_settings,
            commands::settings::update_heatmap_settings,
            // Export commands
            commands::export::export_project,
            // Optimization commands
            commands::optimization::generate_optimization_plan,
            commands::optimization::get_optimization_plan,
            commands::optimization::list_optimization_plans,
            commands::optimization::update_optimization_step,
            commands::optimization::update_optimization_plan_status,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running WLAN-Optimizer");
}
