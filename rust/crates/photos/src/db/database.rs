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
