use std::num::NonZeroUsize;
use std::path::Path;
use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

pub use rusqlite;

use rusqlite::{Connection, OpenFlags, Result, Transaction, TransactionBehavior};

const BUSY_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug)]
pub struct OpenOptions {
    pub reader_count: NonZeroUsize,
}

impl Default for OpenOptions {
    fn default() -> Self {
        Self {
            reader_count: NonZeroUsize::MIN,
        }
    }
}

pub struct Database {
    pool: Pool,
}

impl Database {
    pub fn open<E: From<rusqlite::Error>>(
        path: impl AsRef<Path>,
        options: OpenOptions,
        initialize: impl FnOnce(&mut Connection) -> std::result::Result<(), E>,
    ) -> std::result::Result<Self, E> {
        let path = path.as_ref();
        let mut writer = Connection::open(path)?;
        writer.busy_timeout(BUSY_TIMEOUT)?;
        writer.pragma_update(None, "journal_mode", "WAL")?;
        initialize(&mut writer)?;
        let readers = (0..options.reader_count.get())
            .map(|_| open_reader(path))
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            pool: Pool::new(writer, readers),
        })
    }

    pub fn read<T>(&self, read: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        self.pool.read(read)
    }

    pub fn write<T>(&self, write: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        self.pool.write(write)
    }

    pub fn write_transaction<T>(
        &self,
        write: impl FnOnce(&Transaction<'_>) -> Result<T>,
    ) -> Result<T> {
        self.write(|connection| {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let result = write(&transaction)?;
            transaction.commit()?;
            Ok(result)
        })
    }
}

fn open_reader(path: &Path) -> Result<Connection> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
        | OpenFlags::SQLITE_OPEN_URI
        | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = Connection::open_with_flags(path, flags)?;
    connection.busy_timeout(BUSY_TIMEOUT)?;
    Ok(connection)
}

struct Pool {
    writer: Mutex<Connection>,
    readers: Mutex<Vec<Connection>>,
    reader_available: Condvar,
}

impl Pool {
    fn new(writer: Connection, readers: Vec<Connection>) -> Self {
        Self {
            writer: Mutex::new(writer),
            readers: Mutex::new(readers),
            reader_available: Condvar::new(),
        }
    }

    fn acquire_reader(&self) -> Reader<'_> {
        let mut readers = lock(&self.readers);
        loop {
            if let Some(connection) = readers.pop() {
                return Reader {
                    pool: self,
                    connection: Some(connection),
                };
            }
            readers = self
                .reader_available
                .wait(readers)
                .unwrap_or_else(PoisonError::into_inner);
        }
    }

    fn read<T>(&self, query: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        let mut reader = self.acquire_reader();
        #[expect(
            clippy::expect_used,
            reason = "acquire_reader returns a guard owning a connection"
        )]
        query(
            reader
                .connection
                .as_mut()
                .expect("acquired reader owns a connection"),
        )
    }

    fn write<T>(&self, statement: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        statement(&mut lock(&self.writer))
    }
}

struct Reader<'a> {
    pool: &'a Pool,
    connection: Option<Connection>,
}

impl Drop for Reader<'_> {
    fn drop(&mut self) {
        if let Some(connection) = self.connection.take() {
            lock(&self.pool.readers).push(connection);
            self.pool.reader_available.notify_one();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use std::num::NonZeroUsize;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::sync::mpsc::{self, RecvTimeoutError};
    use std::thread;
    use std::time::Duration;

    use rusqlite::{Connection, Result};

    use super::{Database, OpenOptions, lock, open_reader};

    fn open() -> (tempfile::TempDir, Database) {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(
            directory.path().join("items.db"),
            OpenOptions::default(),
            |connection| connection.execute_batch("CREATE TABLE items (id INTEGER PRIMARY KEY)"),
        )
        .unwrap();
        (directory, db)
    }

    fn value(db: &Database, sql: &str) -> i64 {
        db.read(|connection| connection.query_row(sql, (), |row| row.get(0)))
            .unwrap()
    }

    #[test]
    fn database_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Database>();
    }

    #[test]
    fn open_initializes_before_readers_and_configures_connections() {
        let (_directory, db) = open();
        db.write(|connection| {
            let journal: String =
                connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
            let timeout: i64 =
                connection.pragma_query_value(None, "busy_timeout", |row| row.get(0))?;
            assert_eq!(journal, "wal");
            assert_eq!(timeout, 30000);
            connection.execute("INSERT INTO items VALUES (7)", ())
        })
        .unwrap();
        assert_eq!(value(&db, "SELECT id FROM items"), 7);
        assert_eq!(value(&db, "PRAGMA busy_timeout"), 30000);
        assert!(
            db.read(|connection| connection.execute("DELETE FROM items", ()))
                .is_err()
        );
        assert_eq!(value(&db, "SELECT id FROM items"), 7);
    }

    #[test]
    fn open_preserves_an_existing_schema_version() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("items.db");
        {
            let connection = Connection::open(&path).unwrap();
            connection.execute_batch("CREATE TABLE items (id INTEGER); INSERT INTO items VALUES (7); PRAGMA user_version = 42;").unwrap();
        }
        let db = Database::open(&path, OpenOptions::default(), |_| {
            Ok::<_, rusqlite::Error>(())
        })
        .unwrap();
        assert_eq!(value(&db, "PRAGMA user_version"), 42);
        assert_eq!(value(&db, "SELECT id FROM items"), 7);
    }

    #[test]
    fn open_propagates_the_initializers_error_type() {
        #[derive(Debug, PartialEq, Eq)]
        struct InitializationError(String);

        impl From<rusqlite::Error> for InitializationError {
            fn from(error: rusqlite::Error) -> Self {
                Self(error.to_string())
            }
        }

        let directory = tempfile::tempdir().unwrap();
        let result = Database::open(
            directory.path().join("items.db"),
            OpenOptions::default(),
            |_| Err(InitializationError("schema initialization failed".into())),
        );
        assert!(
            matches!(result, Err(InitializationError(message)) if message == "schema initialization failed")
        );
    }

    #[test]
    fn read_only_connection_does_not_create_database() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("missing.db");
        assert!(open_reader(&path).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn write_transactions_commit_or_rollback_and_writer_recovers() {
        let (_directory, db) = open();
        let result = db.write_transaction(|transaction| {
            transaction.execute("INSERT INTO items VALUES (?)", [1])?;
            transaction.execute("INSERT INTO missing_table VALUES (?)", [2])?;
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(value(&db, "SELECT COUNT(*) FROM items"), 0);

        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                let _: Result<()> = db.write_transaction(|transaction| {
                    transaction.execute("INSERT INTO items VALUES (?)", [3])?;
                    panic!("transaction callback failed");
                });
            }))
            .is_err()
        );
        assert_eq!(value(&db, "SELECT COUNT(*) FROM items"), 0);
        let total = db
            .write_transaction(|transaction| {
                transaction.execute("INSERT INTO items VALUES (?)", [1])?;
                transaction.execute("INSERT INTO items VALUES (?)", [2])?;
                transaction.query_row("SELECT SUM(id) FROM items", (), |row| row.get::<_, i64>(0))
            })
            .unwrap();
        assert_eq!(total, 3);
        assert_eq!(value(&db, "SELECT SUM(id) FROM items"), 3);
    }

    #[test]
    fn reader_can_use_a_snapshot_while_the_writer_commits() {
        let (_directory, db) = open();
        db.write(|connection| connection.execute("INSERT INTO items VALUES (?)", [1]))
            .unwrap();
        let counts = db
            .read(|connection| {
                let transaction = connection.transaction()?;
                let before: i64 =
                    transaction.query_row("SELECT COUNT(*) FROM items", (), |row| row.get(0))?;
                db.write(|writer| writer.execute("INSERT INTO items VALUES (?)", [2]))?;
                let after: i64 =
                    transaction.query_row("SELECT COUNT(*) FROM items", (), |row| row.get(0))?;
                assert!(
                    transaction
                        .execute("INSERT INTO items VALUES (?)", [3])
                        .is_err()
                );
                transaction.commit()?;
                Ok((before, after))
            })
            .unwrap();
        assert_eq!(counts, (1, 1));
        assert_eq!(value(&db, "SELECT COUNT(*) FROM items"), 2);
    }

    #[test]
    fn configured_readers_bound_concurrency_and_wake_on_any_returned_connection() {
        for reader_count in [1, 2, 3] {
            let directory = tempfile::tempdir().unwrap();
            let db = Database::open(
                directory.path().join("items.db"),
                OpenOptions {
                    reader_count: NonZeroUsize::new(reader_count).unwrap(),
                },
                |_| Ok::<_, rusqlite::Error>(()),
            )
            .unwrap();

            thread::scope(|scope| {
                let mut release_readers = Vec::new();
                for _ in 0..reader_count {
                    let (entered_tx, entered_rx) = mpsc::channel();
                    let (release_tx, release_rx) = mpsc::channel();
                    release_readers.push(release_tx);
                    let db = &db;
                    scope.spawn(move || {
                        db.read(|connection| {
                            connection.query_row("SELECT 1", (), |_| Ok(()))?;
                            entered_tx.send(()).unwrap();
                            release_rx.recv().unwrap();
                            Ok(())
                        })
                        .unwrap();
                    });
                    entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                }

                let (result_tx, result_rx) = mpsc::channel();
                let db = &db;
                scope.spawn(move || {
                    result_tx.send(value(db, "SELECT 7")).unwrap();
                });
                let was_blocked = matches!(
                    result_rx.recv_timeout(Duration::from_millis(100)),
                    Err(RecvTimeoutError::Timeout)
                );
                release_readers.pop().unwrap().send(()).unwrap();
                let result = result_rx.recv_timeout(Duration::from_secs(5));
                for release in release_readers {
                    release.send(()).unwrap();
                }
                assert!(was_blocked);
                assert_eq!(result.unwrap(), 7);
            });
        }
    }

    #[test]
    fn reader_returns_to_pool_after_a_callback_panics() {
        let (_directory, db) = open();
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                let _: Result<()> = db.read(|connection| {
                    connection.query_row("SELECT 1", (), |_| Ok(()))?;
                    panic!("reader callback failed");
                });
            }))
            .is_err()
        );
        assert_eq!(lock(&db.pool.readers).len(), 1);
        assert_eq!(value(&db, "SELECT 7"), 7);
    }
}
