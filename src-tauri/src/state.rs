use std::sync::Mutex;

use rusqlite::Connection;
use tauri::AppHandle;

use crate::db::connection;
use crate::error::AppError;

/// Shared application state managed by Tauri.
///
/// Holds the SQLite database connection behind a Mutex for
/// safe concurrent access from multiple IPC commands.
pub struct AppState {
    pub db: Mutex<Connection>,
}

impl AppState {
    /// Creates a new AppState, initializing the database and running migrations.
    pub fn new(app_handle: &AppHandle) -> Result<Self, AppError> {
        let conn = connection::initialize(app_handle)?;
        Ok(Self {
            db: Mutex::new(conn),
        })
    }
}
