pub mod backend;
mod caches;
mod clip;
pub mod codec;
pub mod constants;
mod error;
mod filedata;
mod migrate;
mod pool;
pub mod schema;
pub mod types;

use std::path::Path;

use crate::db::{
    Connection, OptionalExtension, Params, Row, ToSql, TransactionBehavior, bind_placeholders,
    params_from_iter, types::FromSql,
};

pub use backend::{Backend, decide};
pub use error::{Error, Result};
pub use migrate::TARGET_VERSION;
pub use types::*;

use constants::MAX_SQL_BIND_PARAMS_PER_QUERY;
use pool::Pool;

pub struct MlDb {
    pool: Pool,
}

impl MlDb {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let mut writer = Connection::open(path)?;
        migrate::migrate(&mut writer)?;
        let readers = [Connection::open(path)?, Connection::open(path)?];
        Ok(Self {
            pool: Pool::new(writer, readers),
        })
    }

    pub fn clear_non_pet_tables(&self) -> Result<()> {
        self.execute_statements([
            schema::DELETE_FACES,
            schema::DELETE_FACE_CLUSTERS,
            schema::DELETE_CLUSTER_PERSON,
            schema::DELETE_CLUSTER_SUMMARY,
            schema::DELETE_CLUSTER_CENTROID_VECTOR_ID_MAPPING,
            schema::DELETE_NOT_PERSON_FEEDBACK,
            schema::DELETE_CLIP_EMBEDDINGS,
            schema::DELETE_FILE_DATA,
        ])
    }

    pub fn clear_pet_tables(&self) -> Result<()> {
        self.execute_statements([
            schema::DELETE_PET_FACES,
            schema::DELETE_PET_BODIES,
            schema::DELETE_PET_FACE_VECTOR_ID_MAPPING,
            schema::DELETE_PET_BODY_VECTOR_ID_MAPPING,
        ])
    }

    fn read_all<C: FromIterator<T>, T, P: Params>(
        &self,
        sql: &str,
        parameters: P,
        map: impl FnMut(&Row<'_>) -> crate::db::Result<T>,
    ) -> Result<C> {
        self.pool.read(|connection| {
            let mut statement = connection.prepare(sql)?;
            let rows = statement.query_map(parameters, map)?;
            Ok(rows.collect::<crate::db::Result<C>>()?)
        })
    }

    fn read_column<C: FromIterator<T>, T: FromSql, P: Params>(
        &self,
        sql: &str,
        parameters: P,
    ) -> Result<C> {
        self.read_all(sql, parameters, |row| row.get(0))
    }

    fn read_value<T: FromSql>(&self, sql: &str, parameters: impl Params) -> Result<T> {
        self.pool
            .read(|connection| Ok(connection.query_row(sql, parameters, |row| row.get(0))?))
    }

    fn read_optional<T: FromSql>(&self, sql: &str, parameters: impl Params) -> Result<Option<T>> {
        self.pool.read(|connection| {
            Ok(connection
                .query_row(sql, parameters, |row| row.get(0))
                .optional()?)
        })
    }

    fn execute(&self, sql: &str, parameters: impl Params) -> Result<()> {
        self.pool.write(|connection| {
            connection.execute(sql, parameters)?;
            Ok(())
        })
    }

    fn execute_chunked_in<I: ToSql>(&self, sql: &str, ids: &[I]) -> Result<()> {
        self.pool.write(|connection| {
            for chunk in ids.chunks(MAX_SQL_BIND_PARAMS_PER_QUERY) {
                let sql = expand_in_clause(sql, chunk.len());
                connection.execute(&sql, params_from_iter(chunk))?;
            }
            Ok(())
        })
    }

    fn execute_statements<'a>(&self, statements: impl IntoIterator<Item = &'a str>) -> Result<()> {
        self.pool.write(|connection| {
            for statement in statements {
                connection.execute_batch(statement)?;
            }
            Ok(())
        })
    }

    fn write_batch<P: Params>(
        &self,
        sql: &str,
        parameter_sets: impl IntoIterator<Item = P>,
    ) -> Result<()> {
        self.pool
            .write(|connection| batch_execute(connection, sql, parameter_sets))
    }
}

fn batch_execute<P: Params>(
    connection: &mut Connection,
    sql: &str,
    parameter_sets: impl IntoIterator<Item = P>,
) -> Result<()> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    {
        let mut statement = transaction.prepare(sql)?;
        for parameters in parameter_sets {
            statement.execute(parameters)?;
        }
    }
    transaction.commit()?;
    Ok(())
}

fn expand_in_clause(sql: &str, count: usize) -> String {
    sql.replacen("{}", &bind_placeholders(count), 1)
}

fn pair<A: FromSql, B: FromSql>(row: &Row<'_>) -> crate::db::Result<(A, B)> {
    Ok((row.get(0)?, row.get(1)?))
}

fn optional_parameter(value: &Option<impl ToSql>) -> Vec<&dyn ToSql> {
    value.iter().map(|value| value as &dyn ToSql).collect()
}
