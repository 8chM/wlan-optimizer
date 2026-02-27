use super::error::DbError;

/// Embedded SQL migration files.
/// Each entry is (version, sql_content).
/// Migrations are applied in order; already-applied ones are skipped.
const MIGRATIONS: &[(&str, &str)] = &[
    ("001", include_str!("migrations/001_initial_schema.sql")),
    ("002", include_str!("migrations/002_seed_materials.sql")),
    ("003", include_str!("migrations/003_seed_ap_models.sql")),
];

/// Runs all pending migrations against the given database connection.
///
/// Creates the `_migrations` tracking table if it does not exist,
/// then applies each migration that has not been applied yet.
pub fn run_migrations(conn: &rusqlite::Connection) -> Result<(), DbError> {
    // Create migrations tracking table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version    TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
                       DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );",
    )?;

    for (version, sql) in MIGRATIONS {
        let applied: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            [version],
            |row| row.get(0),
        )?;

        if !applied {
            conn.execute_batch(sql).map_err(|e| DbError::MigrationError {
                version: version.to_string(),
                message: e.to_string(),
            })?;

            conn.execute(
                "INSERT INTO _migrations (version) VALUES (?1)",
                [version],
            )?;

            log::info!("Migration {} applied", version);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migrations_run_successfully() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        // Verify migrations table has entries
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();
        // Running again should not fail
        run_migrations(&conn).unwrap();
    }
}
