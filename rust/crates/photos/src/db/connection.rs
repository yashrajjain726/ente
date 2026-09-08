use std::ops::{Deref, DerefMut};
use std::path::Path;
use std::time::Duration;

use rusqlite::OpenFlags;

use super::Result;

const WRITER_PRAGMAS: &str = "PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA journal_size_limit = 6291456;";
const BUSY_TIMEOUT: Duration = Duration::from_secs(30);

pub struct Connection(rusqlite::Connection);

impl Connection {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = rusqlite::Connection::open(path)?;
        connection.busy_timeout(BUSY_TIMEOUT)?;
        connection.execute_batch(WRITER_PRAGMAS)?;
        Ok(Self(connection))
    }

    pub fn open_read_only(path: impl AsRef<Path>) -> Result<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let connection = rusqlite::Connection::open_with_flags(path, flags)?;
        connection.busy_timeout(BUSY_TIMEOUT)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::types;

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
    fn read_only_connection_reads_wal_without_changing_writer_settings() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.db");
        let writer = Connection::open(&path).unwrap();
        writer
            .execute_batch("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (7);")
            .unwrap();
        let reader = Connection::open_read_only(&path).unwrap();
        let id: i64 = reader
            .query_row("SELECT id FROM t", (), |row| row.get(0))
            .unwrap();
        assert_eq!(id, 7);
        assert!(reader.execute("INSERT INTO t VALUES (8)", ()).is_err());
        assert_eq!(pragma::<String>(&reader, "journal_mode"), "wal");
        assert_eq!(pragma::<i64>(&reader, "busy_timeout"), 30000);
        assert_eq!(pragma::<i64>(&writer, "synchronous"), 1);
        assert_eq!(pragma::<i64>(&writer, "journal_size_limit"), 6291456);
    }

    #[test]
    fn read_only_connection_does_not_create_database() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("missing.db");
        assert!(Connection::open_read_only(&path).is_err());
        assert!(!path.exists());
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
}
