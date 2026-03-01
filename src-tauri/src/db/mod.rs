pub mod store;

use rusqlite::Connection;
use std::path::Path;

const SCHEMA: &str = include_str!("schema.sql");

/// Initialize the database at the given path, creating tables if needed.
pub fn init_db(path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    migrate(&conn);
    Ok(conn)
}

/// Run migrations for existing databases.
fn migrate(conn: &Connection) {
    // Add inline_conversations column if missing (added after initial schema)
    let has_col: bool = conn
        .prepare("SELECT inline_conversations FROM notes LIMIT 0")
        .is_ok();
    if !has_col {
        let _ = conn.execute_batch(
            "ALTER TABLE notes ADD COLUMN inline_conversations TEXT;",
        );
    }
}

#[cfg(test)]
pub fn init_memory_db() -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}
