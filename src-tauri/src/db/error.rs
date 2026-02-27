use serde::Serialize;
use thiserror::Error;

/// Database-specific error types for detailed error handling.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum DbError {
    #[error("Record not found: {entity} with ID {id}")]
    NotFound { entity: String, id: String },

    #[error("Foreign key violation: {message}")]
    ForeignKeyViolation { message: String },

    #[error("Unique constraint violation: {message}")]
    UniqueViolation { message: String },

    #[error("Validation error: {message}")]
    ValidationError { message: String },

    #[error("Database error: {message}")]
    InternalError { message: String },

    #[error("Migration failed: {version} - {message}")]
    MigrationError { version: String, message: String },
}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => DbError::NotFound {
                entity: "unknown".into(),
                id: "unknown".into(),
            },
            _ => DbError::InternalError {
                message: err.to_string(),
            },
        }
    }
}
