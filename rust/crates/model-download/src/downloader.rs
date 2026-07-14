use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::runtime::Builder;

use crate::download::{self, Progress, Target};
use crate::gguf;

#[derive(Debug, Clone)]
pub enum ModelDownloadTarget {
    Gguf {
        id: String,
        url: String,
        mmproj_url: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub struct ModelDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: i32,
    pub status: String,
    pub log_line: Option<String>,
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

    pub fn model_path(&self, target: &ModelDownloadTarget) -> PathBuf {
        let ModelDownloadTarget::Gguf { id, url, .. } = target;
        gguf::model_path(&self.models_dir, id, url)
    }

    pub fn mmproj_path(&self, target: &ModelDownloadTarget) -> Option<PathBuf> {
        let ModelDownloadTarget::Gguf { id, mmproj_url, .. } = target;
        gguf::mmproj_path(&self.models_dir, id, mmproj_url.as_deref())
    }

    pub fn is_downloaded(&self, target: &ModelDownloadTarget) -> bool {
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

    pub fn remove_downloaded(&self, target: &ModelDownloadTarget) -> bool {
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
        target: &ModelDownloadTarget,
        mut on_progress: impl FnMut(ModelDownloadProgress),
        is_cancelled: impl Fn() -> bool,
    ) -> Result<bool, download::Error> {
        self.migrate();
        if self.is_downloaded(target) {
            return Ok(false);
        }

        self.cancelled.store(false, Ordering::SeqCst);
        self.active.store(true, Ordering::SeqCst);
        let result = gguf::download_model_files(
            self.expected_targets(target),
            |progress| on_progress(display_progress(progress)),
            || self.cancelled.load(Ordering::SeqCst) || is_cancelled(),
        );
        self.active.store(false, Ordering::SeqCst);
        result.map(|()| true)
    }

    pub fn estimated_download_size(&self, target: &ModelDownloadTarget) -> Option<i64> {
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

    fn expected_targets(&self, target: &ModelDownloadTarget) -> Vec<Target> {
        let ModelDownloadTarget::Gguf {
            id,
            url,
            mmproj_url,
        } = target;
        gguf::expected_targets(&self.models_dir, id, url, mmproj_url.as_deref())
    }
}

fn display_progress(progress: Progress) -> ModelDownloadProgress {
    let total = progress.total_bytes.filter(|total| *total > 0);
    let percent = total
        .map(|total| ((progress.downloaded_bytes * 100 / total) as i32).clamp(0, 99))
        .unwrap_or(0);
    let status = if let Some(total) = total {
        format!(
            "Downloading... {} / {}",
            format_bytes(progress.downloaded_bytes),
            format_bytes(total)
        )
    } else if progress.file_downloaded_bytes > 0 {
        format!(
            "Downloading {}... {}",
            progress.label.to_lowercase(),
            format_bytes(progress.file_downloaded_bytes)
        )
    } else {
        format!("Downloading {}...", progress.label.to_lowercase())
    };
    let log_line = if progress.file_complete {
        Some(format!(
            "Model download file complete label={} bytes={} elapsedMs={} rate={}/s retries={}",
            progress.label,
            progress.file_downloaded_bytes,
            progress.file_elapsed_ms,
            format_bytes(rate_bytes(progress.file_bytes_per_second)),
            progress.file_retry_count
        ))
    } else if progress.complete {
        Some(format!(
            "Model download complete bytes={} elapsedMs={} rate={}/s retries={}",
            progress.downloaded_bytes,
            progress.elapsed_ms,
            format_bytes(rate_bytes(progress.bytes_per_second)),
            progress.retry_count
        ))
    } else {
        None
    };

    ModelDownloadProgress {
        downloaded_bytes: progress.downloaded_bytes,
        total_bytes: progress.total_bytes,
        percent,
        status,
        log_line,
    }
}

fn rate_bytes(bytes_per_second: f64) -> u64 {
    if bytes_per_second.is_finite() && bytes_per_second > 0.0 {
        bytes_per_second as u64
    } else {
        0
    }
}

pub fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit = 0;
    while size >= 1024.0 && unit < UNITS.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }
    format!("{size:.1} {}", UNITS[unit])
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

    fn target(id: &str) -> ModelDownloadTarget {
        ModelDownloadTarget::Gguf {
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

    #[test]
    fn display_progress_composes_percent_and_status() {
        let progress = Progress {
            label: "Model".to_string(),
            downloaded_bytes: 512 * 1024 * 1024,
            total_bytes: Some(2 * 1024 * 1024 * 1024),
            file_downloaded_bytes: 512 * 1024 * 1024,
            file_total_bytes: Some(2 * 1024 * 1024 * 1024),
            percentage: 25.0,
            elapsed_ms: 0,
            bytes_per_second: 0.0,
            file_elapsed_ms: 0,
            file_bytes_per_second: 0.0,
            retry_count: 0,
            file_retry_count: 0,
            file_complete: false,
            complete: false,
        };

        let display = display_progress(progress);
        assert_eq!(display.percent, 25);
        assert_eq!(display.status, "Downloading... 512.0 MB / 2.0 GB");
        assert_eq!(display.log_line, None);

        let unknown_total = Progress {
            total_bytes: None,
            ..display_to_progress_stub()
        };
        let display = display_progress(unknown_total);
        assert_eq!(display.percent, 0);
        assert_eq!(display.status, "Downloading model... 100.0 B");

        let file_complete = Progress {
            file_complete: true,
            file_bytes_per_second: 2048.0,
            ..display_to_progress_stub()
        };
        let display = display_progress(file_complete);
        assert_eq!(
            display.log_line.as_deref(),
            Some(
                "Model download file complete label=Model bytes=100 elapsedMs=0 rate=2.0 KB/s retries=0"
            )
        );
    }

    fn display_to_progress_stub() -> Progress {
        Progress {
            label: "Model".to_string(),
            downloaded_bytes: 100,
            total_bytes: None,
            file_downloaded_bytes: 100,
            file_total_bytes: None,
            percentage: 0.0,
            elapsed_ms: 0,
            bytes_per_second: 0.0,
            file_elapsed_ms: 0,
            file_bytes_per_second: 0.0,
            retry_count: 0,
            file_retry_count: 0,
            file_complete: false,
            complete: false,
        }
    }
}
