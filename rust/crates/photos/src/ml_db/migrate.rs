use crate::db::{Connection, TransactionBehavior};

use super::error::{Error, Result};
use super::schema::MIGRATION_SCRIPTS;

pub const TARGET_VERSION: i64 = MIGRATION_SCRIPTS.len() as i64;

pub fn migrate(connection: &mut Connection) -> Result<()> {
    let probed: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    check_not_downgrade(probed)?;
    if probed == TARGET_VERSION {
        return Ok(());
    }

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current: i64 = transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
    check_not_downgrade(current)?;
    if current == TARGET_VERSION {
        return Ok(());
    }
    for script in &MIGRATION_SCRIPTS[current as usize..] {
        transaction.execute_batch(script)?;
    }
    transaction.pragma_update(None, "user_version", TARGET_VERSION)?;
    transaction.commit()?;
    Ok(())
}

fn check_not_downgrade(current: i64) -> Result<()> {
    if current > TARGET_VERSION {
        return Err(Error::Downgrade {
            current,
            target: TARGET_VERSION,
        });
    }
    Ok(())
}
