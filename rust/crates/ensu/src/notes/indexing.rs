use std::collections::BTreeMap;
use std::path::Path;

use super::{NotesError, NotesIndexWriter, NotesSourceDocument, PreparedNotesDocument};

const INITIAL_CHECKPOINT_DOCUMENTS: usize = 64;
const INITIAL_CHECKPOINT_CHUNKS: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotesDocumentLoad {
    Prepared {
        document: PreparedNotesDocument,
        source: NotesSourceDocument,
    },
    Unindexable {
        source: NotesSourceDocument,
    },
    Changed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotesRevisionStatus {
    Matches { source: NotesSourceDocument },
    Changed,
}

struct PreparedSummary {
    revision_and_chunks: Option<(String, u32)>,
    source: NotesSourceDocument,
}

#[derive(Debug)]
pub enum NotesIndexingError<E> {
    Notes(NotesError),
    Adapter(E),
}

impl<E> From<NotesError> for NotesIndexingError<E> {
    fn from(error: NotesError) -> Self {
        Self::Notes(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotesIndexInput<'a> {
    pub index_root: &'a Path,
    pub collection_id: String,
    pub inventory: Vec<NotesSourceDocument>,
    pub forced_document_ids: &'a [String],
    pub force_full_hash: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotesIndexProgress {
    pub percentage: u8,
    pub processed_document_count: u64,
    pub indexed_document_count: u64,
    pub total_document_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotesIndexOutcome {
    pub changed_during_indexing: Option<String>,
    pub unchecked_document_ids: Vec<String>,
    pub indexed_document_count: u64,
}

impl NotesIndexOutcome {
    pub fn ready(&self) -> bool {
        self.changed_during_indexing.is_none() && self.indexed_document_count > 0
    }
}

pub fn index_notes_collection<E>(
    input: NotesIndexInput<'_>,
    mut check_for_cancellation: impl FnMut() -> Result<(), E>,
    mut load_document: impl FnMut(&str) -> Result<NotesDocumentLoad, E>,
    mut embed_document: impl FnMut(&PreparedNotesDocument) -> Result<Option<Vec<Vec<f32>>>, E>,
    mut verify_revision: impl FnMut(&str, &str) -> Result<NotesRevisionStatus, E>,
    mut on_progress: impl FnMut(NotesIndexProgress),
) -> Result<NotesIndexOutcome, NotesIndexingError<E>> {
    let NotesIndexInput {
        index_root,
        collection_id,
        inventory,
        forced_document_ids,
        force_full_hash,
    } = input;
    check_for_cancellation().map_err(NotesIndexingError::Adapter)?;
    NotesIndexWriter::validate_inventory_capacity(&collection_id, &inventory)?;
    let mut writer = NotesIndexWriter::open(index_root, collection_id.clone())?;
    let index_was_ready = writer.initial_inventory_complete();
    let plan = writer.plan_reconciliation(&inventory, forced_document_ids, force_full_hash)?;
    writer.commit_deletions(&plan.deleted_document_ids)?;

    let source_document_count = inventory.len() as u64;
    let requested = plan.content_required_document_ids;
    let mut prepared_summaries = BTreeMap::<String, PreparedSummary>::new();
    let mut prepared_chunk_counts = BTreeMap::<String, u32>::new();
    for document_id in &requested {
        check_for_cancellation().map_err(NotesIndexingError::Adapter)?;
        let (prepared, source) =
            match load_document(document_id).map_err(NotesIndexingError::Adapter)? {
                NotesDocumentLoad::Prepared { document, source } => (Some(document), source),
                NotesDocumentLoad::Unindexable { source } => (None, source),
                NotesDocumentLoad::Changed => {
                    return changed_during_indexing_outcome(
                        &mut writer,
                        index_was_ready,
                        document_id,
                        &requested,
                        0,
                    );
                }
            };
        if source.document_id != *document_id {
            return Err(NotesError::InvalidInput(
                "loaded source metadata does not match its document ID".to_string(),
            )
            .into());
        }
        let revision_and_chunks = prepared
            .map(|prepared| {
                let chunk_count = u32::try_from(prepared.chunks.len()).map_err(|_| {
                    NotesError::CollectionTooLarge(
                        "The folder contains too many note chunks to index".to_string(),
                    )
                })?;
                Ok::<_, NotesError>((prepared.revision, chunk_count))
            })
            .transpose()?;
        let chunk_count = revision_and_chunks.as_ref().map_or(0, |(_, count)| *count);
        prepared_chunk_counts.insert(document_id.clone(), chunk_count);
        prepared_summaries.insert(
            document_id.clone(),
            PreparedSummary {
                revision_and_chunks,
                source,
            },
        );
    }
    let mut verified_inventory = inventory.clone();
    let inventory_positions = verified_inventory
        .iter()
        .enumerate()
        .map(|(index, source)| (source.document_id.clone(), index))
        .collect::<BTreeMap<_, _>>();
    for (document_id, summary) in &prepared_summaries {
        let index = *inventory_positions
            .get(document_id)
            .expect("reconciliation returns a source inventory document");
        verified_inventory[index] = summary.source.clone();
    }
    NotesIndexWriter::validate_inventory_capacity(&collection_id, &verified_inventory)?;
    writer.validate_reconciliation_capacity(&verified_inventory, &prepared_chunk_counts)?;

    let mut progress_document_count = source_document_count.saturating_sub(requested.len() as u64);
    report_indexing_progress(
        &writer,
        progress_document_count,
        source_document_count,
        &mut on_progress,
    );
    let mut processed_requested = 0_usize;
    let mut embedded_documents = 0_usize;
    let mut embedded_chunks = 0_usize;
    let mut next_document_checkpoint = INITIAL_CHECKPOINT_DOCUMENTS;
    let mut next_chunk_checkpoint = INITIAL_CHECKPOINT_CHUNKS;
    for document_id in &requested {
        check_for_cancellation().map_err(NotesIndexingError::Adapter)?;
        let (prepared, source_metadata) =
            match load_document(document_id).map_err(NotesIndexingError::Adapter)? {
                NotesDocumentLoad::Prepared { document, source } => (Some(document), source),
                NotesDocumentLoad::Unindexable { source } => (None, source),
                NotesDocumentLoad::Changed => {
                    return changed_during_indexing_outcome(
                        &mut writer,
                        index_was_ready,
                        document_id,
                        &requested,
                        processed_requested,
                    );
                }
            };
        let prepared_matches_preflight =
            prepared_summaries.get(document_id).is_some_and(|summary| {
                summary.source == source_metadata
                    && match (&summary.revision_and_chunks, prepared.as_ref()) {
                        (None, None) => true,
                        (Some((revision, chunk_count)), Some(prepared)) => {
                            prepared.revision == *revision
                                && prepared.chunks.len() == *chunk_count as usize
                        }
                        _ => false,
                    }
            });
        if !prepared_matches_preflight {
            return changed_during_indexing_outcome(
                &mut writer,
                index_was_ready,
                document_id,
                &requested,
                processed_requested,
            );
        }
        let Some(prepared) = prepared else {
            writer.commit_deletions(std::slice::from_ref(document_id))?;
            processed_requested += 1;
            progress_document_count += 1;
            report_indexing_progress(
                &writer,
                progress_document_count,
                source_document_count,
                &mut on_progress,
            );
            continue;
        };
        let validated = match writer.validate_document(&prepared, &source_metadata) {
            Ok(validated) => validated,
            Err(NotesError::InvalidInput(_)) => {
                writer.commit_deletions(std::slice::from_ref(document_id))?;
                processed_requested += 1;
                progress_document_count += 1;
                report_indexing_progress(
                    &writer,
                    progress_document_count,
                    source_document_count,
                    &mut on_progress,
                );
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        let Some(embeddings) = embed_document(&prepared).map_err(NotesIndexingError::Adapter)?
        else {
            writer.commit_deletions(std::slice::from_ref(document_id))?;
            processed_requested += 1;
            progress_document_count += 1;
            report_indexing_progress(
                &writer,
                progress_document_count,
                source_document_count,
                &mut on_progress,
            );
            continue;
        };
        check_for_cancellation().map_err(NotesIndexingError::Adapter)?;
        let NotesRevisionStatus::Matches {
            source: verified_source,
        } = verify_revision(document_id, &prepared.revision)
            .map_err(NotesIndexingError::Adapter)?
        else {
            return changed_during_indexing_outcome(
                &mut writer,
                index_was_ready,
                document_id,
                &requested,
                processed_requested,
            );
        };
        if verified_source != source_metadata {
            return changed_during_indexing_outcome(
                &mut writer,
                index_was_ready,
                document_id,
                &requested,
                processed_requested,
            );
        }
        writer.commit_validated_document(validated, &embeddings)?;
        processed_requested += 1;
        progress_document_count += 1;
        report_indexing_progress(
            &writer,
            progress_document_count,
            source_document_count,
            &mut on_progress,
        );
        embedded_documents += 1;
        embedded_chunks += prepared.chunks.len();
        if processed_requested < requested.len()
            && (embedded_documents >= next_document_checkpoint
                || embedded_chunks >= next_chunk_checkpoint)
        {
            writer.publish(index_was_ready)?;
            next_document_checkpoint = next_document_checkpoint.saturating_mul(2);
            next_chunk_checkpoint = next_chunk_checkpoint.saturating_mul(2);
        }
    }

    writer.publish(true)?;
    Ok(NotesIndexOutcome {
        changed_during_indexing: None,
        unchecked_document_ids: Vec::new(),
        indexed_document_count: writer.indexed_document_count() as u64,
    })
}

fn report_indexing_progress(
    writer: &NotesIndexWriter,
    processed_document_count: u64,
    total_document_count: u64,
    on_progress: &mut impl FnMut(NotesIndexProgress),
) {
    on_progress(NotesIndexProgress {
        percentage: indexing_progress(processed_document_count, total_document_count),
        processed_document_count,
        indexed_document_count: writer.indexed_document_count() as u64,
        total_document_count,
    });
}

fn indexing_progress(processed_document_count: u64, source_document_count: u64) -> u8 {
    if source_document_count == 0 {
        return 100;
    }
    (processed_document_count
        .min(source_document_count)
        .saturating_mul(100)
        / source_document_count) as u8
}

fn changed_during_indexing_outcome<E>(
    writer: &mut NotesIndexWriter,
    index_was_ready: bool,
    document_id: &str,
    requested: &[String],
    processed_requested: usize,
) -> Result<NotesIndexOutcome, NotesIndexingError<E>> {
    writer.publish(index_was_ready)?;
    Ok(NotesIndexOutcome {
        changed_during_indexing: Some(document_id.to_string()),
        unchecked_document_ids: requested
            .iter()
            .skip(processed_requested)
            .cloned()
            .collect(),
        indexed_document_count: writer.indexed_document_count() as u64,
    })
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;
    use crate::notes::{NotesCollectionIndex, prepare_notes_document};

    const COLLECTION_ID: &str = "123e4567-e89b-12d3-a456-426614174000";

    fn source() -> NotesSourceDocument {
        source_at(1)
    }

    fn source_at(modified_at_ms: i64) -> NotesSourceDocument {
        NotesSourceDocument {
            document_id: "note.md".to_string(),
            size: 4,
            modified_at_ms: Some(modified_at_ms),
        }
    }

    fn embedding(prepared: &PreparedNotesDocument) -> Vec<Vec<f32>> {
        prepared
            .chunks
            .iter()
            .map(|_| {
                let mut embedding = vec![0.0; 512];
                embedding[0] = 1.0;
                embedding
            })
            .collect()
    }

    #[test]
    fn coordinates_platform_callbacks_and_publishes_the_index() {
        let temp = tempfile::tempdir().unwrap();
        let prepared = prepare_notes_document("note.md", b"note").unwrap();
        let verified_source = source_at(2);
        let progress = RefCell::new(Vec::new());
        let outcome = index_notes_collection::<()>(
            NotesIndexInput {
                index_root: temp.path(),
                collection_id: COLLECTION_ID.to_string(),
                inventory: vec![source_at(1)],
                forced_document_ids: &[],
                force_full_hash: false,
            },
            || Ok(()),
            |_| {
                Ok(NotesDocumentLoad::Prepared {
                    document: prepared.clone(),
                    source: verified_source.clone(),
                })
            },
            |document| Ok(Some(embedding(document))),
            |_, _| {
                Ok(NotesRevisionStatus::Matches {
                    source: verified_source.clone(),
                })
            },
            |value| progress.borrow_mut().push(value),
        )
        .unwrap();

        assert!(outcome.ready());
        let progress = progress.borrow();
        assert_eq!(
            progress.as_slice(),
            [
                NotesIndexProgress {
                    percentage: 0,
                    processed_document_count: 0,
                    indexed_document_count: 0,
                    total_document_count: 1,
                },
                NotesIndexProgress {
                    percentage: 100,
                    processed_document_count: 1,
                    indexed_document_count: 1,
                    total_document_count: 1,
                },
            ]
        );
        let index = NotesCollectionIndex::open(temp.path(), COLLECTION_ID.to_string()).unwrap();
        assert_eq!(index.document_count(), 1);
        let writer = NotesIndexWriter::open(temp.path(), COLLECTION_ID.to_string()).unwrap();
        assert!(
            writer
                .plan_reconciliation(&[verified_source], &[], false)
                .unwrap()
                .is_up_to_date()
        );
    }

    #[test]
    fn preserves_the_previous_publication_when_a_source_changes() {
        let temp = tempfile::tempdir().unwrap();
        let previous = prepare_notes_document("note.md", b"previous note").unwrap();
        let mut writer = NotesIndexWriter::open(temp.path(), COLLECTION_ID.to_string()).unwrap();
        writer
            .commit_document(&previous, &embedding(&previous), &source())
            .unwrap();
        writer.publish(true).unwrap();

        let prepared = prepare_notes_document("note.md", b"updated note").unwrap();
        let updated_source = source_at(2);
        let load_count = Cell::new(0);
        let outcome = index_notes_collection::<()>(
            NotesIndexInput {
                index_root: temp.path(),
                collection_id: COLLECTION_ID.to_string(),
                inventory: vec![updated_source.clone()],
                forced_document_ids: &[],
                force_full_hash: false,
            },
            || Ok(()),
            |_| {
                load_count.set(load_count.get() + 1);
                Ok(if load_count.get() == 1 {
                    NotesDocumentLoad::Prepared {
                        document: prepared.clone(),
                        source: updated_source.clone(),
                    }
                } else {
                    NotesDocumentLoad::Changed
                })
            },
            |document| Ok(Some(embedding(document))),
            |_, _| {
                Ok(NotesRevisionStatus::Matches {
                    source: updated_source.clone(),
                })
            },
            |_| {},
        )
        .unwrap();

        assert_eq!(outcome.changed_during_indexing.as_deref(), Some("note.md"));
        assert_eq!(outcome.unchecked_document_ids, ["note.md"]);
        let index = NotesCollectionIndex::open(temp.path(), COLLECTION_ID.to_string()).unwrap();
        let hits = index.search(&embedding(&previous)[0]).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].text, "previous note");
    }

    #[test]
    fn stops_before_embedding_when_source_metadata_changes_after_preflight() {
        let temp = tempfile::tempdir().unwrap();
        let prepared = prepare_notes_document("note.md", b"note").unwrap();
        let load_count = Cell::new(0);
        let embed_count = Cell::new(0);
        let outcome = index_notes_collection::<()>(
            NotesIndexInput {
                index_root: temp.path(),
                collection_id: COLLECTION_ID.to_string(),
                inventory: vec![source()],
                forced_document_ids: &[],
                force_full_hash: false,
            },
            || Ok(()),
            |_| {
                load_count.set(load_count.get() + 1);
                Ok(NotesDocumentLoad::Prepared {
                    document: prepared.clone(),
                    source: source_at(load_count.get()),
                })
            },
            |_| {
                embed_count.set(embed_count.get() + 1);
                Ok(Some(embedding(&prepared)))
            },
            |_, _| Ok(NotesRevisionStatus::Matches { source: source() }),
            |_| {},
        )
        .unwrap();

        assert_eq!(outcome.changed_during_indexing.as_deref(), Some("note.md"));
        assert_eq!(embed_count.get(), 0);
    }
}
