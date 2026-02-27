use rusqlite::Connection;
use tauri::AppHandle;
use tauri::Manager;

use crate::error::AppError;

use super::migrations;

/// Initializes the SQLite database connection.
///
/// The database file is stored in the Tauri app data directory.
/// On first run, all migrations are applied automatically.
pub fn initialize(app_handle: &AppHandle) -> Result<Connection, AppError> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal {
            message: format!("Failed to resolve app data directory: {}", e),
        })?;

    // Ensure the directory exists
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("wlan-optimizer.db");
    let conn = Connection::open(&db_path).map_err(|e| AppError::Database {
        message: format!("Failed to open database at {:?}: {}", db_path, e),
    })?;

    // Set recommended PRAGMAs for performance and correctness
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;",
    )
    .map_err(|e| AppError::Database {
        message: format!("Failed to set PRAGMAs: {}", e),
    })?;

    // Run all pending migrations
    migrations::run_migrations(&conn).map_err(|e| AppError::Database {
        message: format!("Migration failed: {}", e),
    })?;

    log::info!("Database initialized at {:?}", db_path);

    Ok(conn)
}
