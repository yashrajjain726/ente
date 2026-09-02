use std::collections::BTreeMap;
use std::path::Path;

use super::manifest::{collection_directory, load_published_manifest, shard_directory};
use super::shard::{NotesShardIntegrity, load_and_validate_shard};
use super::{NotesError, validate_collection_id};

const RELEVANCE_THRESHOLD: f32 = 0.50;
const MAX_HITS_PER_COLLECTION: usize = 5;
const MAX_HITS_PER_DOCUMENT: usize = 3;

#[derive(Debug, Clone, PartialEq)]
pub struct NotesSearchHit {
    pub collection_id: String,
    pub document_id: String,
    pub revision: String,
    pub score: f32,
    pub title: String,
    pub section: Option<String>,
    pub text: String,
}

struct IndexedChunk {
    document_id: String,
    revision: String,
    title: String,
    section: Option<String>,
    text: String,
    vector_offset: usize,
}

pub struct NotesCollectionIndex {
    collection_id: String,
    document_count: usize,
    last_updated_at_ms: Option<i64>,
    dimension: usize,
    scale: f32,
    chunks: Vec<IndexedChunk>,
    vectors: Vec<u8>,
}

pub struct NotesCollectionIndexSummary {
    pub document_count: usize,
    pub last_updated_at_ms: Option<i64>,
}

impl NotesCollectionIndex {
    pub fn inspect(
        index_root: impl AsRef<Path>,
        collection_id: String,
    ) -> Result<NotesCollectionIndexSummary, NotesError> {
        validate_collection_id(&collection_id)?;
        let collection_directory = collection_directory(index_root.as_ref(), &collection_id);
        let (manifest, last_updated_at_ms) =
            load_published_manifest(&collection_directory, &collection_id, true)?;
        Ok(NotesCollectionIndexSummary {
            document_count: manifest.documents.len(),
            last_updated_at_ms,
        })
    }

    pub fn open(index_root: impl AsRef<Path>, collection_id: String) -> Result<Self, NotesError> {
        validate_collection_id(&collection_id)?;
        let collection_directory = collection_directory(index_root.as_ref(), &collection_id);
        let (manifest, last_updated_at_ms) =
            load_published_manifest(&collection_directory, &collection_id, true)?;
        let dimension =
            usize::try_from(manifest.index_contract.retrieval_dimension).map_err(|_| {
                NotesError::InvalidIndex("retrieval dimension is too large".to_string())
            })?;
        let scale = manifest.index_contract.quantization_scale as f32;
        let total_chunks = manifest
            .documents
            .values()
            .try_fold(0_usize, |total, document| {
                let chunk_count = usize::try_from(document.chunk_count).map_err(|_| {
                    NotesError::InvalidIndex("manifest chunk count is too large".to_string())
                })?;
                total.checked_add(chunk_count).ok_or_else(|| {
                    NotesError::InvalidIndex("collection chunk count overflow".to_string())
                })
            })?;
        let vector_bytes = total_chunks.checked_mul(dimension).ok_or_else(|| {
            NotesError::InvalidIndex("collection vector byte length overflow".to_string())
        })?;
        let document_count = manifest.documents.len();
        let mut chunks = Vec::new();
        chunks.try_reserve_exact(total_chunks).map_err(|_| {
            NotesError::InvalidIndex("collection chunk allocation is too large".to_string())
        })?;
        let mut vectors = Vec::new();
        vectors.try_reserve_exact(vector_bytes).map_err(|_| {
            NotesError::InvalidIndex("collection vector allocation is too large".to_string())
        })?;
        for (document_id, document) in &manifest.documents {
            let loaded = load_and_validate_shard(
                &shard_directory(&collection_directory, document_id, &document.revision),
                &collection_id,
                document_id,
                &document.revision,
                document.chunk_count as usize,
                NotesShardIntegrity {
                    shard_sha256: &document.shard_sha256,
                    vectors_sha256: &document.vectors_sha256,
                },
                None,
            )?;
            let title = loaded.shard.title;
            for (chunk_index, chunk) in loaded.shard.chunks.into_iter().enumerate() {
                let start = chunk_index.checked_mul(dimension).ok_or_else(|| {
                    NotesError::InvalidIndex("shard vector offset overflow".to_string())
                })?;
                let end = start.checked_add(dimension).ok_or_else(|| {
                    NotesError::InvalidIndex("shard vector offset overflow".to_string())
                })?;
                chunks.push(IndexedChunk {
                    document_id: document_id.clone(),
                    revision: document.revision.clone(),
                    title: title.clone(),
                    section: chunk.section,
                    text: chunk.text,
                    vector_offset: vectors.len(),
                });
                vectors.extend_from_slice(&loaded.vectors[start..end]);
            }
        }
        if chunks.len() != total_chunks || vectors.len() != vector_bytes {
            return Err(NotesError::InvalidIndex(
                "loaded collection shape does not match its manifest".to_string(),
            ));
        }
        Ok(Self {
            collection_id,
            document_count,
            last_updated_at_ms,
            dimension,
            scale,
            chunks,
            vectors,
        })
    }

    pub fn document_count(&self) -> usize {
        self.document_count
    }

    pub fn last_updated_at_ms(&self) -> Option<i64> {
        self.last_updated_at_ms
    }

    pub fn estimated_heap_bytes(&self) -> usize {
        self.collection_id
            .capacity()
            .saturating_add(
                self.chunks
                    .capacity()
                    .saturating_mul(std::mem::size_of::<IndexedChunk>()),
            )
            .saturating_add(self.vectors.capacity())
            .saturating_add(self.chunks.iter().fold(0_usize, |total, chunk| {
                total
                    .saturating_add(chunk.document_id.capacity())
                    .saturating_add(chunk.revision.capacity())
                    .saturating_add(chunk.title.capacity())
                    .saturating_add(chunk.section.as_ref().map_or(0, String::capacity))
                    .saturating_add(chunk.text.capacity())
            }))
    }

    pub fn search(&self, query: &[f32]) -> Result<Vec<NotesSearchHit>, NotesError> {
        validate_search(query, self.dimension)?;
        let mut ranked = self
            .chunks
            .iter()
            .map(|chunk| {
                let vector =
                    &self.vectors[chunk.vector_offset..chunk.vector_offset + self.dimension];
                let score = query
                    .iter()
                    .zip(vector)
                    .map(|(query, stored)| *query * f32::from(*stored as i8))
                    .sum::<f32>()
                    / self.scale;
                (score, chunk)
            })
            .filter(|(score, _)| score.is_finite() && *score >= RELEVANCE_THRESHOLD)
            .collect::<Vec<_>>();
        ranked.sort_unstable_by(|(left_score, left), (right_score, right)| {
            right_score
                .total_cmp(left_score)
                .then_with(|| left.document_id.cmp(&right.document_id))
                .then_with(|| left.vector_offset.cmp(&right.vector_offset))
        });

        let mut document_counts = BTreeMap::<&str, usize>::new();
        let mut hits = Vec::with_capacity(MAX_HITS_PER_COLLECTION.min(ranked.len()));
        for (score, chunk) in ranked {
            let count = document_counts
                .entry(chunk.document_id.as_str())
                .or_default();
            if *count >= MAX_HITS_PER_DOCUMENT {
                continue;
            }
            *count += 1;
            hits.push(NotesSearchHit {
                collection_id: self.collection_id.clone(),
                document_id: chunk.document_id.clone(),
                revision: chunk.revision.clone(),
                score,
                title: chunk.title.clone(),
                section: chunk.section.clone(),
                text: chunk.text.clone(),
            });
            if hits.len() == MAX_HITS_PER_COLLECTION {
                break;
            }
        }
        Ok(hits)
    }
}

fn validate_search(query: &[f32], dimension: usize) -> Result<(), NotesError> {
    if query.len() != dimension {
        return Err(NotesError::InvalidInput(format!(
            "query has {} dimensions; expected {dimension}",
            query.len()
        )));
    }
    if query.iter().any(|component| !component.is_finite()) {
        return Err(NotesError::InvalidInput(
            "query contains a non-finite component".to_string(),
        ));
    }
    Ok(())
}
