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

#[cfg(test)]
mod tests {
    use crate::db::{Connection, Database, Error};

    const CREATE_ITEMS: &str = "CREATE TABLE items (id INTEGER PRIMARY KEY)";
    const ADD_LABEL: &str = "ALTER TABLE items ADD COLUMN label TEXT NOT NULL DEFAULT 'item'";

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
}
