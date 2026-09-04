use std::ops::{Deref, DerefMut};
use std::path::Path;

pub use rusqlite::types;
pub use rusqlite::{
    Error, OptionalExtension, Params, Result, Row, Rows, Statement, ToSql, Transaction,
    TransactionBehavior, params, params_from_iter,
};

const OPEN_PRAGMAS: &str = "PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA journal_size_limit = 6291456;
PRAGMA busy_timeout = 30000;";

pub struct Connection(rusqlite::Connection);

impl Connection {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = rusqlite::Connection::open(path)?;
        connection.execute_batch(OPEN_PRAGMAS)?;
        Ok(Self(connection))
    }

    pub fn open_in_memory() -> Result<Self> {
        Ok(Self(rusqlite::Connection::open_in_memory()?))
    }
}

impl Deref for Connection {
    type Target = rusqlite::Connection;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Connection {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

pub fn bind_placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pragma<T: types::FromSql>(connection: &Connection, name: &str) -> T {
        connection
            .pragma_query_value(None, name, |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn open_applies_connection_pragmas() {
        let directory = tempfile::tempdir().unwrap();
        let connection = Connection::open(directory.path().join("test.db")).unwrap();
        assert_eq!(pragma::<String>(&connection, "journal_mode"), "wal");
        assert_eq!(pragma::<i64>(&connection, "synchronous"), 1);
        assert_eq!(pragma::<i64>(&connection, "journal_size_limit"), 6291456);
        assert_eq!(pragma::<i64>(&connection, "busy_timeout"), 30000);
    }

    #[test]
    fn in_memory_connection_runs_statements() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (7);")
            .unwrap();
        let id: i64 = connection
            .query_row("SELECT id FROM t", (), |row| row.get(0))
            .unwrap();
        assert_eq!(id, 7);
    }

    #[test]
    fn bind_placeholders_joins_question_marks() {
        assert_eq!(bind_placeholders(0), "");
        assert_eq!(bind_placeholders(1), "?");
        assert_eq!(bind_placeholders(3), "?, ?, ?");
    }
}
