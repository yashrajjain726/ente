use super::{Connection, Error, Result, TransactionBehavior};

pub(super) fn migrate(connection: &mut Connection, scripts: &[&str]) -> Result<()> {
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
