use std::fs;
use std::path::Path;

use ente_model_download::download::{self, Progress, Target};

use crate::config::{KnowledgeDatasetConfig, knowledge_artifact_urls, validate_knowledge_datasets};

pub fn download_knowledge_pack(
    pack_root: impl AsRef<Path>,
    expected_pack: &KnowledgeDatasetConfig,
    on_progress: impl FnMut(Progress),
    is_cancelled: impl Fn() -> bool,
) -> Result<(), download::Error> {
    let pack_root = pack_root.as_ref();
    let targets = knowledge_download_targets(pack_root, expected_pack)?;
    download::fetch(targets, validate_staged_file, on_progress, is_cancelled)
}

fn knowledge_download_targets(
    pack_root: &Path,
    expected_pack: &KnowledgeDatasetConfig,
) -> Result<Vec<Target>, download::Error> {
    validate_knowledge_datasets(std::slice::from_ref(expected_pack))
        .map_err(|error| download::Error::InvalidTarget(error.to_string()))?;
    let root_identity = pack_root
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            download::Error::InvalidTarget(
                "knowledge pack root must have a UTF-8 stable ID".to_string(),
            )
        })?;
    if root_identity != expected_pack.stable_id {
        return Err(download::Error::InvalidTarget(
            "knowledge pack root must end with the selected stable ID".to_string(),
        ));
    }
    fs::create_dir_all(pack_root)?;
    if !fs::symlink_metadata(pack_root)?.file_type().is_dir() {
        return Err(download::Error::InvalidTarget(
            "knowledge pack root must be a directory, not a symlink".to_string(),
        ));
    }
    let revision_directory = pack_root.join(&expected_pack.current_download_identity);
    fs::create_dir_all(&revision_directory)?;
    if !fs::symlink_metadata(&revision_directory)?
        .file_type()
        .is_dir()
    {
        return Err(download::Error::InvalidTarget(
            "knowledge revision path must be a directory, not a symlink".to_string(),
        ));
    }

    let urls = knowledge_artifact_urls(expected_pack)
        .map_err(|error| download::Error::InvalidTarget(error.to_string()))?;
    Ok(crate::config::KNOWLEDGE_ARTIFACT_FILENAMES
        .into_iter()
        .zip(urls)
        .map(|(filename, url)| Target {
            label: filename.to_owned(),
            url,
            destination_path: revision_directory.join(filename).display().to_string(),
        })
        .collect())
}

fn validate_staged_file(_target: &Target, path: &Path) -> Result<(), download::Error> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_file() && metadata.len() > 0 {
        Ok(())
    } else {
        Err(download::Error::Validation(format!(
            "{} must be a nonempty regular file",
            path.display()
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::defaults;

    #[test]
    fn constructs_only_the_four_fixed_download_targets() {
        let temp = tempfile::tempdir().unwrap();
        let expected = defaults().knowledge_datasets.remove(0);
        let pack_root = temp.path().join(&expected.stable_id);
        let targets = knowledge_download_targets(&pack_root, &expected).unwrap();
        assert_eq!(targets.len(), 4);
        for (target, filename) in targets
            .iter()
            .zip(crate::config::KNOWLEDGE_ARTIFACT_FILENAMES)
        {
            assert!(target.url.ends_with(filename));
            assert!(target.destination_path.ends_with(filename));
            assert!(
                target
                    .destination_path
                    .contains(&expected.current_download_identity)
            );
        }
    }
}
