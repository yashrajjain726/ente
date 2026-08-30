use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use uuid::Uuid;

use super::manifest::{
    NOTES_DOCUMENTS_DIRECTORY, NOTES_MANIFEST_BACKUP_FILE, NOTES_MANIFEST_FILE, NotesManifest,
    NotesManifestDocument, collection_directory, empty_manifest, load_manifest_file,
    notes_index_contract, shard_directory, validate_manifest,
};
use super::reconcile::{IndexedNotesDocument, plan_notes_reconciliation};
use super::shard::{NOTES_SHARD_FILE, NOTES_VECTORS_FILE, NotesShard, load_and_validate_shard};
use super::{
    NOTES_CHUNK_CHARACTERS, NotesError, NotesReconciliationPlan, NotesSourceDocument,
    PreparedNotesDocument, is_valid_label, validate_collection_id, validate_document_id,
    validate_revision,
};

pub struct NotesIndexWriter {
    collection_id: String,
    collection_directory: PathBuf,
    manifest: NotesManifest,
}

impl NotesIndexWriter {
    pub fn open(index_root: impl AsRef<Path>, collection_id: String) -> Result<Self, NotesError> {
        validate_collection_id(&collection_id)?;
        ensure_directory(index_root.as_ref())?;
        let collection_directory = collection_directory(index_root.as_ref(), &collection_id);
        ensure_directory(&collection_directory)?;
        ensure_directory(&collection_directory.join(NOTES_DOCUMENTS_DIRECTORY))?;
        recover_manifest_publication(&collection_directory, &collection_id)?;

        let manifest_path = collection_directory.join(NOTES_MANIFEST_FILE);
        let manifest = if path_exists(&manifest_path)? {
            load_manifest_file(&manifest_path, &collection_id, false)?
        } else {
            empty_manifest(&collection_id)
        };
        let _ = cleanup_unreferenced_shards(&collection_directory, &manifest.documents);
        Ok(Self {
            collection_id,
            collection_directory,
            manifest,
        })
    }

    pub fn initial_inventory_complete(&self) -> bool {
        self.manifest.initial_inventory_complete
    }

    pub fn indexed_document_ids(&self) -> impl Iterator<Item = &str> {
        self.manifest.documents.keys().map(String::as_str)
    }

    pub fn plan_reconciliation(
        &self,
        inventory: &[NotesSourceDocument],
        forced_document_ids: &[String],
        force_full_hash: bool,
    ) -> Result<NotesReconciliationPlan, NotesError> {
        let indexed = self
            .manifest
            .documents
            .iter()
            .map(|(document_id, document)| IndexedNotesDocument {
                document_id: document_id.clone(),
                revision: document.revision.clone(),
                source_size: document.source_size,
                source_modified_at_ms: document.source_modified_at_ms,
            })
            .collect::<Vec<_>>();
        plan_notes_reconciliation(inventory, &indexed, forced_document_ids, force_full_hash)
    }

    pub fn commit_document(
        &mut self,
        prepared: &PreparedNotesDocument,
        embeddings: &[Vec<f32>],
        source_metadata: &NotesSourceDocument,
    ) -> Result<(), NotesError> {
        validate_prepared_document(prepared, source_metadata)?;
        if embeddings.len() != prepared.chunks.len() {
            return Err(NotesError::InvalidInput(
                "embedding count does not match prepared chunks".to_string(),
            ));
        }
        let vector_dimension = usize::try_from(notes_index_contract().retrieval_dimension)
            .map_err(|_| NotesError::InvalidInput("vector dimension is too large".to_string()))?;
        let vector_bytes_len = embeddings
            .len()
            .checked_mul(vector_dimension)
            .ok_or_else(|| NotesError::InvalidInput("vector byte length overflow".to_string()))?;
        let mut vector_bytes = Vec::new();
        vector_bytes
            .try_reserve_exact(vector_bytes_len)
            .map_err(|_| NotesError::InvalidInput("vector allocation is too large".to_string()))?;
        let scale = notes_index_contract().quantization_scale as f32;
        for embedding in embeddings {
            if embedding.len() != vector_dimension
                || embedding.iter().any(|component| !component.is_finite())
            {
                return Err(NotesError::InvalidInput(
                    "embedding shape or values are invalid".to_string(),
                ));
            }
            vector_bytes.extend(embedding.iter().map(|component| {
                (component.clamp(-1.0, 1.0) * scale)
                    .round_ties_even()
                    .clamp(-scale, scale) as i8 as u8
            }));
        }

        let final_directory = shard_directory(
            &self.collection_directory,
            &prepared.document_id,
            &prepared.revision,
        );
        if path_exists(&final_directory)? {
            match load_and_validate_shard(
                &final_directory,
                &self.collection_id,
                &prepared.document_id,
                &prepared.revision,
                prepared.chunks.len(),
                Some(prepared),
            ) {
                Ok(_) => {
                    self.activate_document(prepared, source_metadata)?;
                    return Ok(());
                }
                Err(
                    NotesError::InvalidIndex(_)
                    | NotesError::IncompatibleIndex
                    | NotesError::Json(_),
                ) => remove_owned_entry(&final_directory)?,
                Err(error) => return Err(error),
            }
        }

        let parent = final_directory
            .parent()
            .ok_or_else(|| NotesError::InvalidIndex("shard directory has no parent".to_string()))?;
        ensure_directory(parent)?;
        let temporary_directory = parent.join(format!(
            ".{}.tmp-{}",
            prepared.revision,
            Uuid::new_v4().hyphenated()
        ));
        fs::create_dir(&temporary_directory)?;
        let write_result = (|| {
            let shard = NotesShard::from_prepared(&self.collection_id, prepared);
            write_new_file(
                &temporary_directory.join(NOTES_SHARD_FILE),
                &serde_json::to_vec(&shard)?,
            )?;
            write_new_file(&temporary_directory.join(NOTES_VECTORS_FILE), &vector_bytes)?;
            load_and_validate_shard(
                &temporary_directory,
                &self.collection_id,
                &prepared.document_id,
                &prepared.revision,
                prepared.chunks.len(),
                Some(prepared),
            )?;
            match fs::rename(&temporary_directory, &final_directory) {
                Ok(()) => Ok(()),
                Err(_) if path_exists(&final_directory)? => {
                    load_and_validate_shard(
                        &final_directory,
                        &self.collection_id,
                        &prepared.document_id,
                        &prepared.revision,
                        prepared.chunks.len(),
                        Some(prepared),
                    )?;
                    Ok(())
                }
                Err(rename_error) => Err(NotesError::Io(rename_error)),
            }
        })();
        if path_exists(&temporary_directory).unwrap_or(false) {
            let _ = remove_owned_entry(&temporary_directory);
        }
        write_result?;
        self.activate_document(prepared, source_metadata)
    }

    pub fn commit_deletions(&mut self, document_ids: &[String]) -> Result<(), NotesError> {
        for document_id in document_ids {
            validate_document_id(document_id)?;
            self.manifest.documents.remove(document_id);
        }
        Ok(())
    }

    pub fn publish(&mut self, initial_complete: bool) -> Result<(), NotesError> {
        self.manifest.initial_inventory_complete = initial_complete;
        validate_manifest(&self.manifest, &self.collection_id, false)?;
        publish_manifest_atomically(
            &self.collection_directory,
            &self.manifest,
            &self.collection_id,
        )?;
        let _ = cleanup_unreferenced_shards(&self.collection_directory, &self.manifest.documents);
        Ok(())
    }

    fn activate_document(
        &mut self,
        prepared: &PreparedNotesDocument,
        source_metadata: &NotesSourceDocument,
    ) -> Result<(), NotesError> {
        let chunk_count = u32::try_from(prepared.chunks.len()).map_err(|_| {
            NotesError::InvalidInput("prepared document has too many chunks".to_string())
        })?;
        self.manifest.documents.insert(
            prepared.document_id.clone(),
            NotesManifestDocument {
                revision: prepared.revision.clone(),
                source_size: source_metadata.size,
                source_modified_at_ms: source_metadata.modified_at_ms,
                chunk_count,
            },
        );
        Ok(())
    }
}

fn validate_prepared_document(
    prepared: &PreparedNotesDocument,
    source_metadata: &NotesSourceDocument,
) -> Result<(), NotesError> {
    source_metadata.validate()?;
    validate_document_id(&prepared.document_id)?;
    validate_revision(&prepared.revision)?;
    if prepared.document_id != source_metadata.document_id {
        return Err(NotesError::InvalidInput(
            "prepared document does not match its source metadata".to_string(),
        ));
    }
    if !is_valid_label(&prepared.title) {
        return Err(NotesError::InvalidInput(
            "prepared title length is outside the supported range".to_string(),
        ));
    }
    if prepared.chunks.is_empty() {
        return Err(NotesError::InvalidInput(
            "prepared document must contain chunks".to_string(),
        ));
    }
    for chunk in &prepared.chunks {
        if chunk
            .section
            .as_ref()
            .is_some_and(|section| !is_valid_label(section))
        {
            return Err(NotesError::InvalidInput(
                "prepared chunk section is invalid".to_string(),
            ));
        }
        if chunk.text.trim().is_empty() || chunk.text.chars().count() > NOTES_CHUNK_CHARACTERS {
            return Err(NotesError::InvalidInput(
                "prepared chunk text is invalid".to_string(),
            ));
        }
    }
    Ok(())
}

fn ensure_directory(path: &Path) -> Result<(), NotesError> {
    if !path_exists(path)? {
        fs::create_dir_all(path)?;
    }
    if !fs::symlink_metadata(path)?.file_type().is_dir() {
        return Err(NotesError::InvalidIndex(
            "Notes store path must be a directory".to_string(),
        ));
    }
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

fn path_exists(path: &Path) -> Result<bool, NotesError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), NotesError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn publish_manifest_atomically(
    collection_directory: &Path,
    manifest: &NotesManifest,
    collection_id: &str,
) -> Result<(), NotesError> {
    let manifest_path = collection_directory.join(NOTES_MANIFEST_FILE);
    let backup_path = collection_directory.join(NOTES_MANIFEST_BACKUP_FILE);
    if path_exists(&backup_path)? {
        remove_owned_entry(&backup_path)?;
    }
    let temporary_path =
        collection_directory.join(format!(".manifest.tmp-{}", Uuid::new_v4().hyphenated()));
    let mut bytes = serde_json::to_vec_pretty(manifest)?;
    bytes.push(b'\n');
    write_new_file(&temporary_path, &bytes)?;
    load_manifest_file(&temporary_path, collection_id, false)?;

    let had_active = path_exists(&manifest_path)?;
    if had_active {
        fs::rename(&manifest_path, &backup_path)?;
    }
    if let Err(error) = fs::rename(&temporary_path, &manifest_path) {
        if had_active && path_exists(&backup_path).unwrap_or(false) {
            let _ = fs::rename(&backup_path, &manifest_path);
        }
        let _ = fs::remove_file(&temporary_path);
        return Err(error.into());
    }
    if path_exists(&backup_path)? {
        remove_owned_entry(&backup_path)?;
    }
    Ok(())
}

fn recover_manifest_publication(
    collection_directory: &Path,
    collection_id: &str,
) -> Result<(), NotesError> {
    let manifest_path = collection_directory.join(NOTES_MANIFEST_FILE);
    let backup_path = collection_directory.join(NOTES_MANIFEST_BACKUP_FILE);
    let has_manifest = path_exists(&manifest_path)?;
    let has_backup = path_exists(&backup_path)?;
    match (has_manifest, has_backup) {
        (false, true) => {
            load_manifest_file(&backup_path, collection_id, false)?;
            fs::rename(&backup_path, &manifest_path)?;
        }
        (true, true) => match load_manifest_file(&manifest_path, collection_id, false) {
            Ok(_) => remove_owned_entry(&backup_path)?,
            Err(primary_error) => {
                load_manifest_file(&backup_path, collection_id, false)?;
                remove_owned_entry(&manifest_path)?;
                fs::rename(&backup_path, &manifest_path).map_err(|_| primary_error)?;
            }
        },
        _ => {}
    }
    for entry in fs::read_dir(collection_directory)? {
        let entry = entry?;
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with(".manifest.tmp-")
        {
            remove_owned_entry(&entry.path())?;
        }
    }
    Ok(())
}

fn cleanup_unreferenced_shards(
    collection_directory: &Path,
    documents: &BTreeMap<String, NotesManifestDocument>,
) -> Result<(), NotesError> {
    use super::manifest::document_storage_id;

    let keep = documents
        .iter()
        .map(|(document_id, document)| (document_storage_id(document_id), &document.revision))
        .collect::<BTreeMap<_, _>>();
    let documents_directory = collection_directory.join(NOTES_DOCUMENTS_DIRECTORY);
    for document_entry in fs::read_dir(&documents_directory)? {
        let document_entry = document_entry?;
        let name = document_entry.file_name().to_string_lossy().into_owned();
        let Some(active_revision) = keep.get(&name) else {
            remove_owned_entry(&document_entry.path())?;
            continue;
        };
        if !document_entry.file_type()?.is_dir() {
            remove_owned_entry(&document_entry.path())?;
            continue;
        }
        for revision_entry in fs::read_dir(document_entry.path())? {
            let revision_entry = revision_entry?;
            if revision_entry.file_name().to_string_lossy() != active_revision.as_str() {
                remove_owned_entry(&revision_entry.path())?;
            }
        }
    }
    Ok(())
}

fn remove_owned_entry(path: &Path) -> Result<(), NotesError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{NotesCollectionIndex, prepare_notes_document};

    fn collection() -> String {
        "123e4567-e89b-12d3-a456-426614174000".to_string()
    }

    fn prepared(id: &str, text: &str) -> PreparedNotesDocument {
        prepare_notes_document(id, text.as_bytes()).unwrap()
    }

    fn metadata(prepared: &PreparedNotesDocument, size: usize) -> NotesSourceDocument {
        NotesSourceDocument {
            document_id: prepared.document_id.clone(),
            size: size as u64,
            modified_at_ms: Some(1_000),
        }
    }

    fn embeddings(prepared: &PreparedNotesDocument, scores: &[f32]) -> Vec<Vec<f32>> {
        assert_eq!(prepared.chunks.len(), scores.len());
        scores
            .iter()
            .map(|score| {
                let mut embedding = vec![0.0; 512];
                embedding[0] = *score;
                embedding
            })
            .collect()
    }

    #[test]
    fn writes_opens_and_searches_documents() {
        let temp = tempfile::tempdir().unwrap();
        let first_text = "first document";
        let first = prepared("first.md", first_text);
        let second = prepared("second.md", "second document");
        let mut writer = NotesIndexWriter::open(temp.path(), collection()).unwrap();
        writer
            .commit_document(
                &first,
                &embeddings(&first, &[1.0]),
                &metadata(&first, first_text.len()),
            )
            .unwrap();
        writer
            .commit_document(
                &second,
                &embeddings(&second, &[0.8]),
                &metadata(&second, "second document".len()),
            )
            .unwrap();
        writer.publish(true).unwrap();

        let index = NotesCollectionIndex::open(temp.path(), collection()).unwrap();
        assert_eq!(index.document_count(), 2);
        assert!(index.last_updated_at_ms().is_some());
        let mut query = vec![0.0; 512];
        query[0] = 1.0;
        let hits = index.search(&query).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].document_id, "first.md");
        assert_eq!(hits[1].document_id, "second.md");
        assert!(hits[0].score > hits[1].score);
    }
}
