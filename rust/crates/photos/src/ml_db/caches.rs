use std::time::{SystemTime, UNIX_EPOCH};

use super::MlDb;
use super::codec::{decode_f32, encode_f32};
use super::constants::CLIP_ML_VERSION;
use super::error::Result;

const THREE_MONTHS_MILLIS: i64 = 90 * 24 * 60 * 60 * 1000;

impl MlDb {
    pub fn put_repeated_text_embedding_cache(&self, query: &str, embedding: &[f64]) -> Result<()> {
        let embedding_bytes = encode_f32(embedding.iter().map(|value| *value as f32));
        self.execute(
            "INSERT OR REPLACE INTO text_embeddings_cache (text_query, embedding, ml_version, created_at) VALUES (?, ?, ?, ?)",
            (query, embedding_bytes, CLIP_ML_VERSION, now_millis()),
        )
    }

    pub fn get_repeated_text_embedding_cache(&self, query: &str) -> Result<Option<Vec<f32>>> {
        let results: Vec<(Vec<u8>, i64, i64)> = self.read_all(
            "SELECT embedding, ml_version, created_at FROM text_embeddings_cache WHERE text_query = ?",
            [query],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        if results.is_empty() {
            return Ok(None);
        }
        let three_months_ago = now_millis() - THREE_MONTHS_MILLIS;
        for (embedding, ml_version, created_at) in &results {
            if *ml_version == CLIP_ML_VERSION && *created_at > three_months_ago {
                return Ok(Some(decode_f32(embedding)));
            }
        }
        self.execute(
            "DELETE FROM text_embeddings_cache WHERE text_query = ?",
            [query],
        )?;
        Ok(None)
    }

    pub fn put_face_id_cached_for_person_or_cluster(
        &self,
        person_or_cluster_id: &str,
        face_id: &str,
    ) -> Result<()> {
        self.execute(
            "INSERT OR REPLACE INTO face_cache (person_or_cluster_id, face_id) VALUES (?, ?)",
            [person_or_cluster_id, face_id],
        )
    }

    pub fn get_face_id_used_for_person_or_cluster(
        &self,
        person_or_cluster_id: &str,
    ) -> Result<Option<String>> {
        self.read_optional(
            "SELECT face_id FROM face_cache WHERE person_or_cluster_id = ?",
            [person_or_cluster_id],
        )
    }

    pub fn remove_face_id_cached_for_person_or_cluster(
        &self,
        person_or_cluster_id: &str,
    ) -> Result<()> {
        self.execute(
            "DELETE FROM face_cache WHERE person_or_cluster_id = ?",
            [person_or_cluster_id],
        )
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
