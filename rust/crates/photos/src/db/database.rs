use std::path::Path;

use super::pool::Pool;
use super::{
    Connection, OptionalExtension, Params, Result, Row, SqliteResult, ToSql, TransactionBehavior,
    bind_placeholders, migrate, params_from_iter, types::FromSql,
};

const MAX_SQL_BIND_PARAMS_PER_QUERY: usize = 10000;

pub struct Database {
    pool: Pool,
}

impl Database {
    pub fn open(path: impl AsRef<Path>, migration_scripts: &[&str]) -> Result<Self> {
        let path = path.as_ref();
        let mut writer = Connection::open(path)?;
        migrate::migrate(&mut writer, migration_scripts)?;
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

#[cfg(test)]
mod tests {
    use super::Database;
    use crate::db::Error;

    const CREATE_ITEMS: &str = "CREATE TABLE items (id INTEGER PRIMARY KEY)";

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
}
