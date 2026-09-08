use ente_photos::db::{Connection, Database, Error};

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
