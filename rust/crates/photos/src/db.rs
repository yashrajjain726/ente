use std::ops::{Deref, DerefMut};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use rusqlite::{OpenFlags, types::FromSql};

pub use rusqlite::types;
pub use rusqlite::{
    Error as SqliteError, OptionalExtension, Params, Result as SqliteResult, Row, Rows, Statement,
    ToSql, Transaction, TransactionBehavior, params, params_from_iter,
};

const WRITER_PRAGMAS: &str = "PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA journal_size_limit = 6291456;";
const BUSY_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_SQL_BIND_PARAMS_PER_QUERY: usize = 10000;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Sqlite(#[from] SqliteError),
    #[error("currentVersion({current}) cannot be greater than toVersion({target})")]
    Downgrade { current: i64, target: i64 },
}

pub type Result<T> = std::result::Result<T, Error>;

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

pub struct Database {
    pool: Pool,
}

impl Database {
    pub fn open(path: impl AsRef<Path>, migration_scripts: &[&str]) -> Result<Self> {
        let path = path.as_ref();
        let mut writer = Connection::open(path)?;
        migrate(&mut writer, migration_scripts)?;
        let readers = [
            Connection::open_read_only(path)?,
            Connection::open_read_only(path)?,
        ];
        Ok(Self {
            pool: Pool::new(writer, readers),
        })
    }

    pub fn read_all<C: FromIterator<T>, T, P: Params>(
        &self,
        sql: &str,
        parameters: P,
        map: impl FnMut(&Row<'_>) -> SqliteResult<T>,
    ) -> Result<C> {
        self.pool.read(|connection| {
            let mut statement = connection.prepare(sql)?;
            let rows = statement.query_map(parameters, map)?;
            Ok(rows.collect::<SqliteResult<C>>()?)
        })
    }

    pub fn read_column<C: FromIterator<T>, T: FromSql, P: Params>(
        &self,
        sql: &str,
        parameters: P,
    ) -> Result<C> {
        self.read_all(sql, parameters, |row| row.get(0))
    }

    pub fn read_value<T: FromSql>(&self, sql: &str, parameters: impl Params) -> Result<T> {
        self.pool
            .read(|connection| Ok(connection.query_row(sql, parameters, |row| row.get(0))?))
    }

    pub fn read_optional<T: FromSql>(
        &self,
        sql: &str,
        parameters: impl Params,
    ) -> Result<Option<T>> {
        self.pool.read(|connection| {
            Ok(connection
                .query_row(sql, parameters, |row| row.get(0))
                .optional()?)
        })
    }

    pub fn execute(&self, sql: &str, parameters: impl Params) -> Result<()> {
        self.pool.write(|connection| {
            connection.execute(sql, parameters)?;
            Ok(())
        })
    }

    pub fn execute_chunked_in<I: ToSql>(&self, sql: &str, ids: &[I]) -> Result<()> {
        self.pool.write(|connection| {
            for chunk in ids.chunks(MAX_SQL_BIND_PARAMS_PER_QUERY) {
                let sql = sql.replacen("{}", &bind_placeholders(chunk.len()), 1);
                connection.execute(&sql, params_from_iter(chunk))?;
            }
            Ok(())
        })
    }

    pub fn execute_statements<'a>(
        &self,
        statements: impl IntoIterator<Item = &'a str>,
    ) -> Result<()> {
        self.pool.write(|connection| {
            for statement in statements {
                connection.execute_batch(statement)?;
            }
            Ok(())
        })
    }

    pub fn write_batch<P: Params>(
        &self,
        sql: &str,
        parameter_sets: impl IntoIterator<Item = P>,
    ) -> Result<()> {
        self.pool.write(|connection| {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            {
                let mut statement = transaction.prepare(sql)?;
                for parameters in parameter_sets {
                    statement.execute(parameters)?;
                }
            }
            transaction.commit()?;
            Ok(())
        })
    }
}

struct Pool {
    writer: Mutex<Connection>,
    readers: [Mutex<Connection>; 2],
}

impl Pool {
    fn new(writer: Connection, readers: [Connection; 2]) -> Self {
        let [first, second] = readers;
        Self {
            writer: Mutex::new(writer),
            readers: [Mutex::new(first), Mutex::new(second)],
        }
    }

    fn read<T>(&self, query: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        for reader in &self.readers {
            if let Ok(connection) = reader.try_lock() {
                return query(&connection);
            }
        }
        query(&lock(&self.readers[0]))
    }

    fn write<T>(&self, statement: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        statement(&mut lock(&self.writer))
    }
}

fn lock(connection: &Mutex<Connection>) -> MutexGuard<'_, Connection> {
    connection.lock().unwrap_or_else(PoisonError::into_inner)
}

fn migrate(connection: &mut Connection, scripts: &[&str]) -> Result<()> {
    let target = scripts.len() as i64;
    let probed: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    check_not_downgrade(probed, target)?;
    if probed == target {
        return Ok(());
    }

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current: i64 = transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
    check_not_downgrade(current, target)?;
    if current == target {
        return Ok(());
    }
    for script in &scripts[current as usize..] {
        transaction.execute_batch(script)?;
    }
    transaction.pragma_update(None, "user_version", target)?;
    transaction.commit()?;
    Ok(())
}

fn check_not_downgrade(current: i64, target: i64) -> Result<()> {
    if current > target {
        return Err(Error::Downgrade { current, target });
    }
    Ok(())
}

pub fn bind_placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

pub(crate) fn pair<A: types::FromSql, B: types::FromSql>(row: &Row<'_>) -> SqliteResult<(A, B)> {
    Ok((row.get(0)?, row.get(1)?))
}

pub(crate) fn optional_parameter(value: &Option<impl ToSql>) -> Vec<&dyn ToSql> {
    value.iter().map(|value| value as &dyn ToSql).collect()
}

#[cfg(test)]
mod tests {
    use super::{Connection, Database, Error, bind_placeholders, types};

    const CREATE_ITEMS: &str = "CREATE TABLE items (id INTEGER PRIMARY KEY)";
    const ADD_LABEL: &str = "ALTER TABLE items ADD COLUMN label TEXT NOT NULL DEFAULT 'item'";

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

    #[test]
    fn reader_queries_reject_writes() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(directory.path().join("items.db"), &[CREATE_ITEMS]).unwrap();
        db.execute("INSERT INTO items (id) VALUES (?)", [7])
            .unwrap();
        let deleted: Result<Vec<i64>, _> = db.read_column("DELETE FROM items RETURNING id", ());
        assert!(matches!(deleted, Err(Error::Sqlite(_))));
        assert_eq!(
            db.read_column::<Vec<i64>, _, _>("SELECT id FROM items", ())
                .unwrap(),
            [7]
        );
    }

    #[test]
    fn failed_batch_rolls_back_and_writer_recovers() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(directory.path().join("items.db"), &[CREATE_ITEMS]).unwrap();
        assert!(
            db.write_batch("INSERT INTO items (id) VALUES (?)", [[1], [2], [1]])
                .is_err()
        );
        assert_eq!(
            db.read_value::<i64>("SELECT COUNT(*) FROM items", ())
                .unwrap(),
            0
        );
        db.execute("INSERT INTO items (id) VALUES (?)", [3])
            .unwrap();
        assert_eq!(
            db.read_column::<Vec<i64>, _, _>("SELECT id FROM items", ())
                .unwrap(),
            [3]
        );
    }

    #[test]
    fn chunked_delete_handles_large_and_empty_id_lists() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(directory.path().join("items.db"), &[CREATE_ITEMS]).unwrap();
        let ids: Vec<i64> = (0..10_001).collect();
        db.write_batch(
            "INSERT INTO items (id) VALUES (?)",
            ids.iter().map(|id| [id]),
        )
        .unwrap();
        db.execute_chunked_in::<i64>("DELETE FROM items WHERE id IN ({})", &[])
            .unwrap();
        assert_eq!(
            db.read_value::<i64>("SELECT COUNT(*) FROM items", ())
                .unwrap(),
            10_001
        );
        db.execute_chunked_in("DELETE FROM items WHERE id IN ({})", &ids)
            .unwrap();
        assert_eq!(
            db.read_value::<i64>("SELECT COUNT(*) FROM items", ())
                .unwrap(),
            0
        );
    }

    #[test]
    fn open_migrates_a_caller_schema_and_refuses_downgrade() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("items.db");
        {
            let db = Database::open(&path, &[CREATE_ITEMS]).unwrap();
            db.execute("INSERT INTO items (id) VALUES (?)", [7])
                .unwrap();
        }
        {
            let db = Database::open(&path, &[CREATE_ITEMS, ADD_LABEL]).unwrap();
            assert_eq!(db.read_value::<i64>("PRAGMA user_version", ()).unwrap(), 2);
            assert_eq!(
                db.read_optional::<String>("SELECT label FROM items WHERE id = ?", [7])
                    .unwrap(),
                Some("item".to_string())
            );
            assert_eq!(
                db.read_optional::<String>("SELECT label FROM items WHERE id = ?", [8])
                    .unwrap(),
                None
            );
        }
        let db = Database::open(&path, &[CREATE_ITEMS, ADD_LABEL]).unwrap();
        assert_eq!(
            db.read_value::<i64>("SELECT COUNT(*) FROM items", ())
                .unwrap(),
            1
        );
        assert!(matches!(
            Database::open(&path, &[CREATE_ITEMS]),
            Err(Error::Downgrade {
                current: 2,
                target: 1
            })
        ));
    }

    #[test]
    fn failed_migration_keeps_previous_schema_and_version() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("items.db");
        {
            let db = Database::open(&path, &[CREATE_ITEMS]).unwrap();
            db.execute("INSERT INTO items (id) VALUES (?)", [7])
                .unwrap();
        }
        assert!(
            Database::open(
                &path,
                &[
                    CREATE_ITEMS,
                    ADD_LABEL,
                    "INSERT INTO missing_table VALUES (1)"
                ]
            )
            .is_err()
        );
        {
            let connection = Connection::open(&path).unwrap();
            let version: i64 = connection
                .pragma_query_value(None, "user_version", |row| row.get(0))
                .unwrap();
            assert_eq!(version, 1);
            let columns: Vec<String> = connection
                .prepare("SELECT name FROM pragma_table_info('items')")
                .unwrap()
                .query_map((), |row| row.get(0))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap();
            assert_eq!(columns, ["id"]);
        }
        let db = Database::open(&path, &[CREATE_ITEMS, ADD_LABEL]).unwrap();
        assert_eq!(db.read_value::<i64>("SELECT id FROM items", ()).unwrap(), 7);
        assert_eq!(db.read_value::<i64>("PRAGMA user_version", ()).unwrap(), 2);
    }

    #[test]
    fn bind_placeholders_joins_question_marks() {
        assert_eq!(bind_placeholders(0), "");
        assert_eq!(bind_placeholders(1), "?");
        assert_eq!(bind_placeholders(3), "?, ?, ?");
    }
}
