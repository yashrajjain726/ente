use std::collections::HashMap;

use crate::db::pair;

use super::MlDb;
use super::codec::{decode_f32, encode_f32};
use super::constants::CLIP_EMBEDDING_BYTES_LENGTH;
use super::error::Result;
use super::schema::DELETE_CLIP_EMBEDDINGS;
use super::types::{ClipEmbedding, ClipRow, EmbeddingVector};

impl MlDb {
    pub fn get_all_clip_vectors(&self) -> Result<Vec<EmbeddingVector>> {
        let rows: Vec<(i64, Vec<u8>)> =
            self.db
                .read_all("SELECT file_id, embedding FROM clip", (), pair)?;
        Ok(rows
            .into_iter()
            .map(|(file_id, embedding)| EmbeddingVector {
                file_id,
                embedding: decode_f32(&embedding),
            })
            .filter(|vector| !vector.embedding.is_empty())
            .collect())
    }

    pub fn clip_indexed_file_with_version(&self) -> Result<HashMap<i64, i64>> {
        self.db
            .read_all("SELECT file_id , ml_version FROM clip", (), pair)
            .map_err(Into::into)
    }

    pub fn get_clip_indexed_file_count(&self, minimum_ml_version: i64) -> Result<i64> {
        self.db
            .read_value(
                "SELECT COUNT(DISTINCT file_id) as count FROM clip WHERE ml_version >= ?",
                [minimum_ml_version],
            )
            .map_err(Into::into)
    }

    pub fn get_clip_vectorizable_file_count(&self, minimum_ml_version: i64) -> Result<i64> {
        self.db.read_value(
            "SELECT COUNT(DISTINCT file_id) as count FROM clip WHERE ml_version >= ? AND LENGTH(embedding) = ?",
            [minimum_ml_version, CLIP_EMBEDDING_BYTES_LENGTH],
        ).map_err(Into::into)
    }

    pub fn insert_clip_rows(&self, embeddings: &[ClipEmbedding]) -> Result<()> {
        if let [embedding] = embeddings {
            return self
                .db
                .execute(
                    "INSERT OR REPLACE INTO clip (file_id, embedding, ml_version) VALUES (?, ?, ?)",
                    clip_row(embedding),
                )
                .map_err(Into::into);
        }
        self.db
            .write_batch(
                "INSERT OR REPLACE INTO clip (file_id, embedding, ml_version) values(?, ?, ?)",
                embeddings.iter().map(clip_row),
            )
            .map_err(Into::into)
    }

    pub fn delete_clip_rows(&self, file_ids: &[i64]) -> Result<()> {
        self.db
            .execute_chunked_in("DELETE FROM clip WHERE file_id IN ({})", file_ids)
            .map_err(Into::into)
    }

    pub fn delete_all_clip_rows(&self) -> Result<()> {
        self.db
            .execute_statements([DELETE_CLIP_EMBEDDINGS])
            .map_err(Into::into)
    }

    pub fn count_clip_rows(&self) -> Result<i64> {
        self.db
            .read_value("SELECT COUNT(file_id) as total FROM clip", ())
            .map_err(Into::into)
    }

    pub fn get_clip_rows_page(&self, limit: i64, offset: i64) -> Result<Vec<ClipRow>> {
        self.db
            .read_all(
                "SELECT file_id, embedding FROM clip ORDER BY file_id DESC LIMIT ? OFFSET ?",
                [limit, offset],
                |row| {
                    Ok(ClipRow {
                        file_id: row.get(0)?,
                        embedding: row.get(1)?,
                    })
                },
            )
            .map_err(Into::into)
    }
}

fn clip_row(embedding: &ClipEmbedding) -> (i64, Vec<u8>, i64) {
    (
        embedding.file_id,
        encode_f32(embedding.embedding.iter().map(|value| *value as f32)),
        embedding.version,
    )
}
