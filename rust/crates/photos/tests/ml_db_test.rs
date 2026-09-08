use std::collections::{HashMap, HashSet};
use std::fmt::Debug;
use std::path::Path;

use ente_photos::db::Connection;
use ente_photos::ml_db::codec::encode_f32;
use ente_photos::ml_db::constants::CLIP_EMBEDDING_DIMENSIONS;
use ente_photos::ml_db::schema::ALL_TABLES;
use ente_photos::ml_db::{
    ClipEmbedding, ClipRow, Error, FdStatus, MlDb, PreviewInfo, TARGET_VERSION,
};
use tempfile::TempDir;

type Query<T> = fn(&MlDb) -> Result<T, Error>;

macro_rules! cases {
    ($($name:literal: $expected:expr => |$db:ident| $query:expr),* $(,)?) => {
        [$(($name, $expected, |$db| $query)),*]
    };
}

fn open() -> (TempDir, MlDb) {
    let directory = tempfile::tempdir().unwrap();
    let db = MlDb::open(directory.path().join("ente.ml.db")).unwrap();
    (directory, db)
}

fn user_version(path: &Path) -> i64 {
    Connection::open(path)
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
}

fn index_count(path: &Path) -> i64 {
    Connection::open(path)
        .unwrap()
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_fcClusterID'",
            (),
            |row| row.get(0),
        )
        .unwrap()
}

fn clip(file_id: i64, embedding: Vec<f64>) -> ClipEmbedding {
    ClipEmbedding {
        file_id,
        embedding,
        version: 1,
    }
}

fn full_clip(file_id: i64) -> ClipEmbedding {
    clip(file_id, vec![0.25; CLIP_EMBEDDING_DIMENSIONS])
}

fn status(file_id: i64, data_type: &str, object_id: Option<&str>) -> FdStatus {
    FdStatus {
        file_id,
        user_id: 42,
        data_type: data_type.to_string(),
        size: file_id * 10,
        object_id: object_id.map(str::to_string),
        object_nonce: None,
        updated_at: 1000,
    }
}

fn preview(object_id: &str, object_size: i64) -> PreviewInfo {
    PreviewInfo {
        object_id: object_id.to_string(),
        object_size,
    }
}

fn ids<const N: usize>(values: [i64; N]) -> HashSet<i64> {
    HashSet::from(values)
}

fn check_seeded<T: PartialEq + Debug>(cases: &[(&str, T, Query<T>)]) {
    let (_directory, db) = seeded();
    for (name, expected, query) in cases {
        assert_eq!(&query(&db).unwrap(), expected, "{name}");
    }
}

fn seeded() -> (TempDir, MlDb) {
    let (directory, db) = open();
    db.insert_clip_rows(&[
        full_clip(1),
        ClipEmbedding {
            version: 2,
            ..full_clip(2)
        },
        clip(3, vec![1.0, 2.0]),
        clip(4, vec![]),
    ])
    .unwrap();
    db.put_fd_status(&[
        status(1, "vid_preview", Some("obj1")),
        status(2, "mldata", None),
        status(3, "vid_preview", Some("obj3")),
    ])
    .unwrap();
    db.put_repeated_text_embedding_cache("dog", &[0.5, -1.0])
        .unwrap();
    db.put_face_id_cached_for_person_or_cluster("p1", "1_0")
        .unwrap();
    (directory, db)
}

#[test]
fn ml_db_is_send_and_sync() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<MlDb>();
}

#[test]
fn open_migrates_to_target_version_and_creates_all_tables() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("ente.ml.db");
    let _db = MlDb::open(&path).unwrap();
    assert_eq!(TARGET_VERSION, 15);
    assert_eq!(user_version(&path), 15);
    let connection = Connection::open(&path).unwrap();
    for table in ALL_TABLES {
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "missing table {table}");
    }
    assert_eq!(index_count(&path), 1);
}

#[test]
fn reopen_is_idempotent_and_keeps_data() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("ente.ml.db");
    {
        let db = MlDb::open(&path).unwrap();
        db.insert_clip_rows(&[full_clip(1)]).unwrap();
    }
    let db = MlDb::open(&path).unwrap();
    assert_eq!(user_version(&path), 15);
    assert_eq!(db.count_clip_rows().unwrap(), 1);
}

#[test]
fn open_refuses_downgrade() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("ente.ml.db");
    drop(MlDb::open(&path).unwrap());
    Connection::open(&path)
        .unwrap()
        .pragma_update(None, "user_version", 16)
        .unwrap();
    match MlDb::open(&path) {
        Err(Error::Database(ente_photos::db::Error::Downgrade { current, target })) => {
            assert_eq!(current, 16);
            assert_eq!(target, 15);
        }
        other => panic!("expected downgrade error, got {:?}", other.err()),
    }
}

#[test]
fn partial_migration_runs_remaining_scripts() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("ente.ml.db");
    {
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(ente_photos::ml_db::schema::CREATE_FACES_TABLE)
            .unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();
    }
    let db = MlDb::open(&path).unwrap();
    assert_eq!(user_version(&path), 15);
    assert_eq!(db.count_clip_rows().unwrap(), 0);
}

#[test]
fn seeded_counts() {
    check_seeded(&cases![
        "clip files": 4 => |db| db.get_clip_indexed_file_count(1),
        "clip files v2": 1 => |db| db.get_clip_indexed_file_count(2),
        "clip vectorizable": 2 => |db| db.get_clip_vectorizable_file_count(1),
        "clip vectorizable v2": 1 => |db| db.get_clip_vectorizable_file_count(2),
        "clip rows": 4 => |db| db.count_clip_rows(),
    ]);
}

#[test]
fn seeded_file_id_sets() {
    check_seeded(&cases![
        "fd data": ids([1, 2, 3]) => |db| db.get_file_ids_with_fd_data(None),
        "fd mldata": ids([2]) => |db| db.get_file_ids_with_fd_data(Some("mldata")),
    ]);
}

#[test]
fn seeded_optional_values() {
    check_seeded(&cases![
        "cached face p1": Some("1_0".to_string()) =>
            |db| db.get_face_id_used_for_person_or_cluster("p1"),
        "cached face p2": None => |db| db.get_face_id_used_for_person_or_cluster("p2"),
    ]);
    check_seeded(&cases![
        "cached dog": Some(vec![0.5, -1.0]) => |db| db.get_repeated_text_embedding_cache("dog"),
        "uncached cat": None => |db| db.get_repeated_text_embedding_cache("cat"),
    ]);
}

#[test]
fn seeded_maps() {
    check_seeded(&cases![
        "clip versions": HashMap::from([(1, 1), (2, 2), (3, 1), (4, 1)]) =>
            |db| db.clip_indexed_file_with_version(),
    ]);
    check_seeded(&cases![
        "video previews": HashMap::from([(1, preview("obj1", 10)), (3, preview("obj3", 30))]) =>
            |db| db.get_file_ids_vid_preview(),
    ]);
}

#[test]
fn seeded_rows() {
    let (_directory, db) = seeded();
    let mut vectors = db.get_all_clip_vectors().unwrap();
    vectors.sort_by_key(|vector| vector.file_id);
    let dimensions: Vec<(i64, usize)> = vectors
        .iter()
        .map(|v| (v.file_id, v.embedding.len()))
        .collect();
    assert_eq!(
        dimensions,
        vec![
            (1, CLIP_EMBEDDING_DIMENSIONS),
            (2, CLIP_EMBEDDING_DIMENSIONS),
            (3, 2)
        ]
    );
    assert_eq!(vectors[2].embedding, vec![1.0f32, 2.0]);
    let page = db.get_clip_rows_page(2, 1).unwrap();
    let clip_row = |file_id, embedding: Vec<f32>| ClipRow {
        file_id,
        embedding: encode_f32(embedding),
    };
    assert_eq!(
        page,
        vec![
            clip_row(3, vec![1.0, 2.0]),
            clip_row(2, vec![0.25; CLIP_EMBEDDING_DIMENSIONS])
        ]
    );
}

#[test]
fn clip_rows_replace_and_delete() {
    let (_directory, db) = seeded();
    db.insert_clip_rows(&[]).unwrap();
    db.insert_clip_rows(&[clip(1, vec![1.0])]).unwrap();
    db.insert_clip_rows(&[clip(3, vec![3.0]), full_clip(5)])
        .unwrap();
    assert_eq!(
        db.clip_indexed_file_with_version().unwrap(),
        HashMap::from([(1, 1), (2, 2), (3, 1), (4, 1), (5, 1)])
    );
    let mut vectors = db.get_all_clip_vectors().unwrap();
    vectors.sort_by_key(|vector| vector.file_id);
    assert_eq!(vectors[0].embedding, vec![1.0f32]);
    assert_eq!(vectors[2].embedding, vec![3.0f32]);
    assert_eq!(db.get_clip_vectorizable_file_count(1).unwrap(), 2);

    db.delete_clip_rows(&[]).unwrap();
    db.delete_clip_rows(&[1, 3]).unwrap();
    assert_eq!(db.count_clip_rows().unwrap(), 3);
    db.delete_all_clip_rows().unwrap();
    assert_eq!(db.count_clip_rows().unwrap(), 0);
}

#[test]
fn filedata_upsert() {
    let (_directory, db) = seeded();
    db.put_fd_status(&[]).unwrap();
    db.put_fd_status(&[status(1, "vid_preview", Some("obj1b"))])
        .unwrap();
    assert_eq!(
        db.get_file_ids_vid_preview().unwrap(),
        HashMap::from([(1, preview("obj1b", 10)), (3, preview("obj3", 30))])
    );
    assert_eq!(db.get_file_ids_with_fd_data(None).unwrap(), ids([1, 2, 3]));
}

#[test]
fn text_embedding_cache_replaces_and_expires() {
    let (directory, db) = seeded();
    db.put_repeated_text_embedding_cache("dog", &[2.0]).unwrap();
    assert_eq!(
        db.get_repeated_text_embedding_cache("dog").unwrap(),
        Some(vec![2.0f32])
    );

    let connection = Connection::open(directory.path().join("ente.ml.db")).unwrap();
    connection
        .execute(
            "UPDATE text_embeddings_cache SET created_at = 1 WHERE text_query = ?",
            ["dog"],
        )
        .unwrap();
    assert_eq!(db.get_repeated_text_embedding_cache("dog").unwrap(), None);
    let remaining: i64 = connection
        .query_row("SELECT COUNT(*) FROM text_embeddings_cache", (), |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(remaining, 0);
}

#[test]
fn face_cache_replaces_and_removes() {
    let (_directory, db) = seeded();
    db.put_face_id_cached_for_person_or_cluster("p1", "2_0")
        .unwrap();
    assert_eq!(
        db.get_face_id_used_for_person_or_cluster("p1").unwrap(),
        Some("2_0".to_string())
    );
    db.remove_face_id_cached_for_person_or_cluster("p1")
        .unwrap();
    assert_eq!(
        db.get_face_id_used_for_person_or_cluster("p1").unwrap(),
        None
    );
}

#[test]
fn clear_non_pet_tables_leaves_pets_and_caches() {
    let (_directory, db) = seeded();
    db.clear_non_pet_tables().unwrap();
    assert_eq!(db.count_clip_rows().unwrap(), 0);
    assert!(db.get_file_ids_with_fd_data(None).unwrap().is_empty());
    assert_eq!(
        db.get_face_id_used_for_person_or_cluster("p1").unwrap(),
        Some("1_0".to_string())
    );
    assert_eq!(
        db.get_repeated_text_embedding_cache("dog").unwrap(),
        Some(vec![0.5f32, -1.0])
    );
}

#[test]
fn clear_pet_tables_leaves_non_pet_tables() {
    let (directory, db) = seeded();
    let connection = Connection::open(directory.path().join("ente.ml.db")).unwrap();
    connection
        .execute_batch(
            "INSERT INTO pet_face_vector_id_map (pet_face_id) VALUES ('1_pet_0');
             INSERT INTO pet_body_vector_id_map (pet_body_id) VALUES ('1_body_0');",
        )
        .unwrap();
    db.clear_pet_tables().unwrap();
    let row_count = |table: &str| -> i64 {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), (), |row| {
                row.get(0)
            })
            .unwrap()
    };
    assert_eq!(row_count("pet_face_vector_id_map"), 0);
    assert_eq!(row_count("pet_body_vector_id_map"), 0);
    assert_eq!(db.count_clip_rows().unwrap(), 4);
    assert_eq!(db.get_file_ids_with_fd_data(None).unwrap(), ids([1, 2, 3]));
    assert_eq!(
        db.get_face_id_used_for_person_or_cluster("p1").unwrap(),
        Some("1_0".to_string())
    );
}
