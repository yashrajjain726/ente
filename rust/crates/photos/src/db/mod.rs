mod connection;
mod database;
mod error;
mod migrate;
mod pool;

pub use connection::Connection;
pub use database::Database;
pub use error::{Error, Result};
pub use rusqlite::types;
pub use rusqlite::{
    Error as SqliteError, OptionalExtension, Params, Result as SqliteResult, Row, Rows, Statement,
    ToSql, Transaction, TransactionBehavior, params, params_from_iter,
};

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
    use super::*;

    #[test]
    fn bind_placeholders_joins_question_marks() {
        assert_eq!(bind_placeholders(0), "");
        assert_eq!(bind_placeholders(1), "?");
        assert_eq!(bind_placeholders(3), "?, ?, ?");
    }
}
