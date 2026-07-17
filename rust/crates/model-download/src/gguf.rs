use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

pub(crate) fn storage_key(id: &str, url: &str, mmproj_url: Option<&str>) -> String {
    if id.starts_with("custom") {
        let pair = format!("{url}\n{}", trimmed(mmproj_url).unwrap_or(""));
        format!("custom-{}", &sha256_hex(&pair)[..16])
    } else {
        id.to_string()
    }
}

pub(crate) fn model_dir(
    models_dir: &Path,
    id: &str,
    url: &str,
    mmproj_url: Option<&str>,
) -> PathBuf {
    models_dir.join(storage_key(id, url, mmproj_url))
}

pub(crate) fn model_path(
    models_dir: &Path,
    id: &str,
    url: &str,
    mmproj_url: Option<&str>,
) -> PathBuf {
    model_dir(models_dir, id, url, mmproj_url).join("model.gguf")
}

pub(crate) fn mmproj_path(
    models_dir: &Path,
    id: &str,
    url: &str,
    mmproj_url: Option<&str>,
) -> Option<PathBuf> {
    trimmed(mmproj_url)?;
    Some(model_dir(models_dir, id, url, mmproj_url).join("mmproj.gguf"))
}

pub(crate) fn looks_like_gguf(path: &Path) -> bool {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return false,
    };
    let mut header = [0u8; 4];
    file.read_exact(&mut header).is_ok() && &header == b"GGUF"
}

pub(crate) fn trimmed(url: Option<&str>) -> Option<&str> {
    url.map(str::trim).filter(|url| !url.is_empty())
}

pub(crate) fn filename_for_url(url: &str, fallback: &str) -> String {
    let without_query = url.split(['?', '#']).next().unwrap_or(url);
    let name = without_query.rsplit('/').next().unwrap_or("");
    if name.trim().is_empty() {
        fallback.to_string()
    } else {
        name.to_string()
    }
}

pub(crate) fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
