pub mod backend;
mod caches;
mod clip;
pub mod codec;
pub mod constants;
mod error;
mod filedata;
pub mod schema;
pub mod types;

use std::path::Path;

use crate::db::Database;

pub use backend::{Backend, decide};
pub use error::{Error, Result};
pub use types::*;

pub const TARGET_VERSION: i64 = schema::MIGRATION_SCRIPTS.len() as i64;

pub struct MlDb {
    db: Database,
}

impl MlDb {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Ok(Self {
            db: Database::open(path, &schema::MIGRATION_SCRIPTS)?,
        })
    }

    pub fn clear_non_pet_tables(&self) -> Result<()> {
        self.db
            .execute_statements([
                schema::DELETE_FACES,
                schema::DELETE_FACE_CLUSTERS,
                schema::DELETE_CLUSTER_PERSON,
                schema::DELETE_CLUSTER_SUMMARY,
                schema::DELETE_CLUSTER_CENTROID_VECTOR_ID_MAPPING,
                schema::DELETE_NOT_PERSON_FEEDBACK,
                schema::DELETE_CLIP_EMBEDDINGS,
                schema::DELETE_FILE_DATA,
            ])
            .map_err(Into::into)
    }

    pub fn clear_pet_tables(&self) -> Result<()> {
        self.db
            .execute_statements([
                schema::DELETE_PET_FACES,
                schema::DELETE_PET_BODIES,
                schema::DELETE_PET_FACE_VECTOR_ID_MAPPING,
                schema::DELETE_PET_BODY_VECTOR_ID_MAPPING,
            ])
            .map_err(Into::into)
    }
}
