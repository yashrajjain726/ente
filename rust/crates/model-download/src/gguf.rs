use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::download::{self, Progress, Target};

const MIN_MODEL_BYTES: u64 = 1024 * 1024;

pub fn download_model_files(
    targets: Vec<Target>,
    on_progress: impl FnMut(Progress),
    is_cancelled: impl Fn() -> bool,
) -> Result<(), download::Error> {
    download::fetch(targets, validate_gguf, on_progress, is_cancelled)
}

pub(crate) fn expected_targets(
    models_dir: &Path,
    id: &str,
    url: &str,
    mmproj_url: Option<&str>,
) -> Vec<Target> {
    let mut targets = vec![Target {
        label: "Model".to_string(),
        url: url.to_string(),
        destination_path: model_path(models_dir, id, url).display().to_string(),
    }];
    if let Some(mmproj_url) = trimmed(mmproj_url) {
        targets.push(Target {
            label: "Mmproj".to_string(),
            url: mmproj_url.to_string(),
            destination_path: path_for_url(models_dir, id, mmproj_url, "mmproj.gguf")
                .display()
                .to_string(),
        });
    }
    targets
}

pub(crate) fn model_path(models_dir: &Path, id: &str, url: &str) -> PathBuf {
    path_for_url(models_dir, id, url, "model.gguf")
}

pub(crate) fn mmproj_path(
    models_dir: &Path,
    id: &str,
    mmproj_url: Option<&str>,
) -> Option<PathBuf> {
    trimmed(mmproj_url).map(|url| path_for_url(models_dir, id, url, "mmproj.gguf"))
}

pub(crate) fn looks_like_gguf(path: &Path) -> bool {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return false,
    };
    let mut header = [0u8; 4];
    file.read_exact(&mut header).is_ok() && &header == b"GGUF"
}

fn validate_gguf(_target: &Target, path: &Path) -> Result<(), download::Error> {
    if file_size(path).is_none_or(|size| size < MIN_MODEL_BYTES) {
        return Err(download::Error::Validation(format!(
            "{} is too small to be a model file",
            path.display()
        )));
    }
    if !looks_like_gguf(path) {
        return Err(download::Error::Validation(format!(
            "{} is not a valid GGUF file",
            path.display()
        )));
    }
    Ok(())
}

fn trimmed(url: Option<&str>) -> Option<&str> {
    url.map(str::trim).filter(|url| !url.is_empty())
}

fn path_for_url(models_dir: &Path, id: &str, url: &str, fallback: &str) -> PathBuf {
    let filename = filename_for_url(url, fallback);
    if id.starts_with("custom:") {
        models_dir
            .join("custom")
            .join(format!("{}_{filename}", sha256_hex(url)))
    } else {
        models_dir.join(filename)
    }
}

fn filename_for_url(url: &str, fallback: &str) -> String {
    let without_query = url.split(['?', '#']).next().unwrap_or(url);
    let name = without_query.rsplit('/').next().unwrap_or("");
    if name.trim().is_empty() {
        fallback.to_string()
    } else {
        name.to_string()
    }
}

fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn file_size(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|metadata| metadata.len())
}
