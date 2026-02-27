use serde::Serialize;
use thiserror::Error;

/// Top-level application error that wraps all subsystem errors.
///
/// Implements `Serialize` so Tauri can return it as a structured JSON error
/// to the frontend. The `serde(tag = "kind", content = "data")` encoding
/// produces `{ "kind": "Database", "data": { "message": "..." } }`.
///
/// Error variants match the architecture spec (Architektur.md section 7.3):
/// Database, Validation, Network, APConnection, Measurement, IPerf,
/// Platform, Export, FileIO, NotFound, Internal.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum AppError {
    #[error("Database error: {message}")]
    Database { message: String },

    #[error("Not found: {entity} with ID {id}")]
    NotFound { entity: String, id: String },

    #[error("Validation error: {message}")]
    Validation { message: String },

    #[error("Network error: {message}")]
    Network { message: String },

    #[error("AP connection error: {message}")]
    APConnection { message: String },

    #[error("Measurement error: {message}")]
    Measurement { message: String },

    #[error("iPerf3 error: {message}")]
    IPerf { message: String },

    #[error("Platform error: {message}")]
    Platform { message: String },

    #[error("Export error: {message}")]
    Export { message: String },

    #[error("File I/O error: {message}")]
    FileIO { message: String },

    #[error("Internal error: {message}")]
    Internal { message: String },
}

// ─── Automatic conversions from external error types ─────────────

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound {
                entity: "unknown".into(),
                id: "unknown".into(),
            },
            _ => AppError::Database {
                message: err.to_string(),
            },
        }
    }
}


impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Internal {
            message: format!("JSON serialization error: {}", err),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::FileIO {
            message: format!("IO error: {}", err),
        }
    }
}
