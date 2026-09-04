pub const FACES_TABLE: &str = "faces";
pub const FACE_CLUSTERS_TABLE: &str = "face_clusters";
pub const CLUSTER_PERSON_TABLE: &str = "cluster_person";
pub const CLUSTER_SUMMARY_TABLE: &str = "cluster_summary";
pub const NOT_PERSON_FEEDBACK_TABLE: &str = "not_person_feedback";
pub const CLIP_TABLE: &str = "clip";
pub const FILEDATA_TABLE: &str = "filedata";
pub const FACE_CACHE_TABLE: &str = "face_cache";
pub const TEXT_EMBEDDINGS_CACHE_TABLE: &str = "text_embeddings_cache";
pub const CLUSTER_CENTROID_VECTOR_ID_MAP_TABLE: &str = "cluster_centroid_vector_id_map";
pub const PET_FACES_TABLE: &str = "pet_faces";
pub const PET_BODIES_TABLE: &str = "pet_bodies";
pub const PET_FACE_VECTOR_ID_MAP_TABLE: &str = "pet_face_vector_id_map";
pub const PET_BODY_VECTOR_ID_MAP_TABLE: &str = "pet_body_vector_id_map";

pub const ALL_TABLES: [&str; 14] = [
    FACES_TABLE,
    FACE_CLUSTERS_TABLE,
    CLUSTER_PERSON_TABLE,
    CLUSTER_SUMMARY_TABLE,
    NOT_PERSON_FEEDBACK_TABLE,
    CLIP_TABLE,
    FILEDATA_TABLE,
    FACE_CACHE_TABLE,
    TEXT_EMBEDDINGS_CACHE_TABLE,
    CLUSTER_CENTROID_VECTOR_ID_MAP_TABLE,
    PET_FACES_TABLE,
    PET_BODIES_TABLE,
    PET_FACE_VECTOR_ID_MAP_TABLE,
    PET_BODY_VECTOR_ID_MAP_TABLE,
];

pub const CREATE_FACES_TABLE: &str = "CREATE TABLE IF NOT EXISTS faces (
  file_id INTEGER NOT NULL,
  face_id TEXT NOT NULL UNIQUE,
  detection TEXT NOT NULL,
  embedding BLOB NOT NULL,
  score REAL NOT NULL,
  blur REAL NOT NULL DEFAULT 10000.0,
  is_sideways INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  ml_version INTEGER NOT NULL DEFAULT -1,
  PRIMARY KEY(file_id, face_id)
);";

pub const CREATE_FACE_CLUSTERS_TABLE: &str = "CREATE TABLE IF NOT EXISTS face_clusters (
  face_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  PRIMARY KEY(face_id)
);";

pub const FC_CLUSTER_ID_INDEX: &str =
    "CREATE INDEX IF NOT EXISTS idx_fcClusterID ON face_clusters(cluster_id);";

pub const CREATE_CLUSTER_PERSON_TABLE: &str = "CREATE TABLE IF NOT EXISTS cluster_person (
  person_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  PRIMARY KEY(person_id, cluster_id)
);";

pub const CREATE_CLUSTER_SUMMARY_TABLE: &str = "CREATE TABLE IF NOT EXISTS cluster_summary (
  cluster_id TEXT NOT NULL,
  avg BLOB NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(cluster_id)
);";

pub const CREATE_CLUSTER_CENTROID_VECTOR_ID_MAPPING_TABLE: &str =
    "CREATE TABLE IF NOT EXISTS cluster_centroid_vector_id_map (
  cluster_vector_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  cluster_id TEXT NOT NULL UNIQUE
);";

pub const CREATE_NOT_PERSON_FEEDBACK_TABLE: &str =
    "CREATE TABLE IF NOT EXISTS not_person_feedback (
  person_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  PRIMARY KEY(person_id, cluster_id)
);";

pub const CREATE_CLIP_EMBEDDINGS_TABLE: &str = "CREATE TABLE IF NOT EXISTS clip (
  file_id INTEGER NOT NULL,
  embedding BLOB NOT NULL,
  ml_version INTEGER NOT NULL,
  PRIMARY KEY (file_id)
);";

pub const CREATE_FILE_DATA_TABLE: &str = "CREATE TABLE IF NOT EXISTS filedata (
  file_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  obj_id TEXT,
  obj_nonce TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (file_id, type)
);";

pub const CREATE_FACE_CACHE_TABLE: &str = "CREATE TABLE IF NOT EXISTS face_cache (
  person_or_cluster_id TEXT NOT NULL UNIQUE,
  face_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (person_or_cluster_id)
);";

pub const CREATE_TEXT_EMBEDDINGS_CACHE_TABLE: &str =
    "CREATE TABLE IF NOT EXISTS text_embeddings_cache (
  text_query TEXT NOT NULL,
  embedding BLOB NOT NULL,
  ml_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (text_query)
);";

pub const CREATE_PET_FACES_TABLE: &str = "CREATE TABLE IF NOT EXISTS pet_faces (
  file_id INTEGER NOT NULL,
  pet_face_id TEXT NOT NULL UNIQUE,
  detection TEXT NOT NULL,
  face_vector_id INTEGER UNIQUE,
  species INTEGER NOT NULL,
  score REAL NOT NULL,
  height INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  ml_version INTEGER NOT NULL DEFAULT -1,
  PRIMARY KEY(file_id, pet_face_id)
);";

pub const CREATE_PET_BODIES_TABLE: &str = "CREATE TABLE IF NOT EXISTS pet_bodies (
  file_id INTEGER NOT NULL,
  pet_body_id TEXT NOT NULL UNIQUE,
  detection TEXT NOT NULL,
  body_vector_id INTEGER UNIQUE,
  species INTEGER NOT NULL,
  score REAL NOT NULL,
  height INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  ml_version INTEGER NOT NULL DEFAULT -1,
  PRIMARY KEY(file_id, pet_body_id)
);";

pub const CREATE_PET_FACE_VECTOR_ID_MAPPING_TABLE: &str =
    "CREATE TABLE IF NOT EXISTS pet_face_vector_id_map (
  pet_face_vector_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  pet_face_id TEXT NOT NULL UNIQUE
);";

pub const CREATE_PET_BODY_VECTOR_ID_MAPPING_TABLE: &str =
    "CREATE TABLE IF NOT EXISTS pet_body_vector_id_map (
  pet_body_vector_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  pet_body_id TEXT NOT NULL UNIQUE
);";

pub const MIGRATION_SCRIPTS: [&str; 15] = [
    CREATE_FACES_TABLE,
    CREATE_FACE_CLUSTERS_TABLE,
    CREATE_CLUSTER_PERSON_TABLE,
    CREATE_CLUSTER_SUMMARY_TABLE,
    CREATE_NOT_PERSON_FEEDBACK_TABLE,
    FC_CLUSTER_ID_INDEX,
    CREATE_CLIP_EMBEDDINGS_TABLE,
    CREATE_FILE_DATA_TABLE,
    CREATE_FACE_CACHE_TABLE,
    CREATE_TEXT_EMBEDDINGS_CACHE_TABLE,
    CREATE_CLUSTER_CENTROID_VECTOR_ID_MAPPING_TABLE,
    CREATE_PET_FACES_TABLE,
    CREATE_PET_BODIES_TABLE,
    CREATE_PET_FACE_VECTOR_ID_MAPPING_TABLE,
    CREATE_PET_BODY_VECTOR_ID_MAPPING_TABLE,
];

pub const DELETE_FACES: &str = "DELETE FROM faces";
pub const DELETE_FACE_CLUSTERS: &str = "DELETE FROM face_clusters";
pub const DELETE_CLUSTER_PERSON: &str = "DELETE FROM cluster_person";
pub const DELETE_CLUSTER_SUMMARY: &str = "DELETE FROM cluster_summary";
pub const DELETE_CLUSTER_CENTROID_VECTOR_ID_MAPPING: &str =
    "DELETE FROM cluster_centroid_vector_id_map";
pub const DELETE_NOT_PERSON_FEEDBACK: &str = "DELETE FROM not_person_feedback";
pub const DELETE_CLIP_EMBEDDINGS: &str = "DELETE FROM clip";
pub const DELETE_FILE_DATA: &str = "DELETE FROM filedata";
pub const DELETE_PET_FACES: &str = "DELETE FROM pet_faces";
pub const DELETE_PET_BODIES: &str = "DELETE FROM pet_bodies";
pub const DELETE_PET_FACE_VECTOR_ID_MAPPING: &str = "DELETE FROM pet_face_vector_id_map";
pub const DELETE_PET_BODY_VECTOR_ID_MAPPING: &str = "DELETE FROM pet_body_vector_id_map";
