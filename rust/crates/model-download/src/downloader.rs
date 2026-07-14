use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::runtime::Builder;

use crate::download::{self, Progress, Target};
use crate::gguf;

#[derive(Debug, Clone)]
pub struct ModelTarget {
    pub id: String,
    pub url: String,
    pub mmproj_url: Option<String>,
}

pub struct ModelDownloader {
    models_dir: PathBuf,
    legacy_dir: Option<PathBuf>,
    cancelled: AtomicBool,
    active: AtomicBool,
    migration_done: Mutex<bool>,
}

impl ModelDownloader {
    pub fn new(models_dir: impl Into<PathBuf>, legacy_dir: Option<PathBuf>) -> Self {
        let models_dir = models_dir.into();
        let _ = fs::create_dir_all(&models_dir);
        Self {
            models_dir,
            legacy_dir,
            cancelled: AtomicBool::new(false),
            active: AtomicBool::new(false),
            migration_done: Mutex::new(false),
        }
    }

    pub fn model_path(&self, target: &ModelTarget) -> PathBuf {
        self.path_for_url(target, &target.url, "model.gguf")
    }

    pub fn mmproj_path(&self, target: &ModelTarget) -> Option<PathBuf> {
        mmproj_url(target).map(|url| self.path_for_url(target, url, "mmproj.gguf"))
    }

    pub fn is_downloaded(&self, target: &ModelTarget) -> bool {
        self.expected_targets(target).iter().all(|entry| {
            let path = Path::new(&entry.destination_path);
            path.exists() && gguf::looks_like_gguf(path)
        })
    }

    pub fn is_download_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn remove_downloaded(&self, target: &ModelTarget) -> bool {
        let mut removed = false;
        for entry in self.expected_targets(target) {
            let path = Path::new(&entry.destination_path);
            if path.exists() {
                let _ = fs::remove_file(path);
                removed = true;
            }
        }
        removed
    }

    /// Returns whether a network download ran; false when everything was
    /// already present.
    pub fn download(
        &self,
        target: &ModelTarget,
        on_progress: impl FnMut(Progress),
        is_cancelled: impl Fn() -> bool,
    ) -> Result<bool, download::Error> {
        self.migrate();
        if self.is_downloaded(target) {
            return Ok(false);
        }

        self.cancelled.store(false, Ordering::SeqCst);
        self.active.store(true, Ordering::SeqCst);
        let result = gguf::download_model_files(self.expected_targets(target), on_progress, || {
            self.cancelled.load(Ordering::SeqCst) || is_cancelled()
        });
        self.active.store(false, Ordering::SeqCst);
        result.map(|()| true)
    }

    pub fn estimated_download_size(&self, target: &ModelTarget) -> Option<i64> {
        let runtime = Builder::new_current_thread()
            .enable_io()
            .enable_time()
            .build()
            .ok()?;
        runtime.block_on(async {
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(30))
                .build()
                .ok()?;
            let mut total: i64 = 0;
            let mut any = false;
            for entry in self.expected_targets(target) {
                let path = Path::new(&entry.destination_path);
                let size = if path.exists() {
                    fs::metadata(path).ok().map(|m| m.len()).filter(|s| *s > 0)
                } else {
                    download::probe_content_length(&client, &entry.url).await
                };
                if let Some(size) = size {
                    any = true;
                    total = total.saturating_add(size as i64);
                }
            }
            any.then_some(total)
        })
    }

    /// Moves files from `<legacy_dir>/models` into the models dir via a
    /// staged copy and rename, then discards the legacy dir. Retries on the
    /// next call (or process) if any file could not be moved.
    pub fn migrate(&self) {
        let mut done = self.migration_done.lock().unwrap();
        if *done {
            return;
        }
        let Some(legacy_dir) = &self.legacy_dir else {
            *done = true;
            return;
        };
        if !legacy_dir.exists() {
            *done = true;
            return;
        }

        let legacy_models = legacy_dir.join("models");
        let mut all_moved = true;
        for file in walk_files(&legacy_models) {
            let Ok(relative) = file.strip_prefix(&legacy_models) else {
                continue;
            };
            let dest = self.models_dir.join(relative);
            if dest.exists() {
                continue;
            }
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::rename(&file, &dest).is_ok() {
                continue;
            }
            let staged = PathBuf::from(format!("{}.migrating", dest.display()));
            let copied = fs::copy(&file, &staged).and_then(|_| fs::rename(&staged, &dest));
            if copied.is_err() {
                let _ = fs::remove_file(&staged);
                all_moved = false;
            }
        }
        if all_moved {
            let _ = fs::remove_dir_all(legacy_dir);
            *done = true;
        }
    }

    fn expected_targets(&self, target: &ModelTarget) -> Vec<Target> {
        let mut targets = vec![Target {
            label: "Model".to_string(),
            url: target.url.clone(),
            destination_path: self.model_path(target).display().to_string(),
        }];
        if let (Some(url), Some(path)) = (mmproj_url(target), self.mmproj_path(target)) {
            targets.push(Target {
                label: "Mmproj".to_string(),
                url: url.to_string(),
                destination_path: path.display().to_string(),
            });
        }
        targets
    }

    fn path_for_url(&self, target: &ModelTarget, url: &str, fallback: &str) -> PathBuf {
        let filename = filename_for_url(url, fallback);
        if target.id.starts_with("custom:") {
            self.models_dir
                .join("custom")
                .join(format!("{}_{filename}", sha256_hex(url)))
        } else {
            self.models_dir.join(filename)
        }
    }
}

fn mmproj_url(target: &ModelTarget) -> Option<&str> {
    target
        .mmproj_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
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

fn walk_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return files;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            files.extend(walk_files(&path));
        } else if path.is_file() {
            files.push(path);
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ente-model-download-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create test dir");
        dir
    }

    fn target(id: &str) -> ModelTarget {
        ModelTarget {
            id: id.to_string(),
            url: "https://example.org/models/main.gguf?download=true".to_string(),
            mmproj_url: Some("https://example.org/models/mmproj.gguf".to_string()),
        }
    }

    #[test]
    fn paths_use_url_filenames_and_hash_custom_models() {
        let dir = scratch_dir("paths");
        let downloader = ModelDownloader::new(&dir, None);

        assert_eq!(
            downloader.model_path(&target("default:1")),
            dir.join("main.gguf")
        );
        assert_eq!(
            downloader.mmproj_path(&target("default:1")),
            Some(dir.join("mmproj.gguf"))
        );

        let custom = downloader.model_path(&target("custom:1"));
        assert_eq!(custom.parent(), Some(dir.join("custom").as_path()));
        let name = custom.file_name().unwrap().to_string_lossy().into_owned();
        let (hash, filename) = name.split_once('_').expect("hash prefix");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(filename, "main.gguf");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn is_downloaded_requires_gguf_magic_on_all_files() {
        let dir = scratch_dir("is-downloaded");
        let downloader = ModelDownloader::new(&dir, None);
        let target = target("default:1");

        assert!(!downloader.is_downloaded(&target));

        fs::write(dir.join("main.gguf"), b"GGUFdata").unwrap();
        assert!(!downloader.is_downloaded(&target));

        fs::write(dir.join("mmproj.gguf"), b"not-a-model").unwrap();
        assert!(!downloader.is_downloaded(&target));

        fs::write(dir.join("mmproj.gguf"), b"GGUFdata").unwrap();
        assert!(downloader.is_downloaded(&target));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn download_skips_when_already_present() {
        let dir = scratch_dir("skip");
        let downloader = ModelDownloader::new(&dir, None);
        let target = target("default:1");
        fs::write(dir.join("main.gguf"), b"GGUFdata").unwrap();
        fs::write(dir.join("mmproj.gguf"), b"GGUFdata").unwrap();

        let downloaded = downloader
            .download(&target, |_| {}, || false)
            .expect("skip without network");
        assert!(!downloaded);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn migrate_moves_files_and_discards_legacy_dir() {
        let base = scratch_dir("migrate");
        let legacy = base.join("llm");
        let legacy_models = legacy.join("models");
        fs::create_dir_all(legacy_models.join("custom")).unwrap();
        fs::write(legacy_models.join("main.gguf"), b"GGUFmain").unwrap();
        fs::write(legacy_models.join("custom/abc_x.gguf"), b"GGUFcustom").unwrap();
        fs::write(legacy.join("stale.tmp"), b"junk").unwrap();

        let models_dir = base.join("models");
        let downloader = ModelDownloader::new(&models_dir, Some(legacy.clone()));
        downloader.migrate();

        assert_eq!(fs::read(models_dir.join("main.gguf")).unwrap(), b"GGUFmain");
        assert_eq!(
            fs::read(models_dir.join("custom/abc_x.gguf")).unwrap(),
            b"GGUFcustom"
        );
        assert!(!legacy.exists());

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn migrate_keeps_existing_destination_files() {
        let base = scratch_dir("migrate-existing");
        let legacy = base.join("llm");
        fs::create_dir_all(legacy.join("models")).unwrap();
        fs::write(legacy.join("models/main.gguf"), b"GGUFold").unwrap();

        let models_dir = base.join("models");
        fs::create_dir_all(&models_dir).unwrap();
        fs::write(models_dir.join("main.gguf"), b"GGUFnew").unwrap();

        let downloader = ModelDownloader::new(&models_dir, Some(legacy.clone()));
        downloader.migrate();

        assert_eq!(fs::read(models_dir.join("main.gguf")).unwrap(), b"GGUFnew");
        assert!(!legacy.exists());

        let _ = fs::remove_dir_all(base);
    }
}
