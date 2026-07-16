use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
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
    cancelled: AtomicBool,
    active: AtomicBool,
}

impl ModelDownloader {
    pub fn new(models_dir: impl Into<PathBuf>) -> Self {
        let models_dir = models_dir.into();
        let _ = fs::create_dir_all(&models_dir);
        Self {
            models_dir,
            cancelled: AtomicBool::new(false),
            active: AtomicBool::new(false),
        }
    }

    pub fn model_path(&self, target: &ModelDownloadTarget) -> PathBuf {
        let ModelDownloadTarget::Gguf {
            id,
            url,
            mmproj_url,
        } = target;
        gguf::model_path(&self.models_dir, id, url, mmproj_url.as_deref())
    }

    pub fn mmproj_path(&self, target: &ModelDownloadTarget) -> Option<PathBuf> {
        let ModelDownloadTarget::Gguf {
            id,
            url,
            mmproj_url,
        } = target;
        gguf::mmproj_path(&self.models_dir, id, url, mmproj_url.as_deref())
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
            if let Some(parent) = path.parent() {
                let _ = fs::remove_dir(parent);
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

pub fn migrate_legacy_dir(models_dir: &Path, legacy_dir: &Path, targets: &[ModelDownloadTarget]) {
    if !legacy_dir.exists() {
        return;
    }
    let legacy_models = legacy_dir.join("models");

    let mut plans: Vec<Vec<(String, &str, PathBuf)>> = Vec::new();
    for target in targets {
        let ModelDownloadTarget::Gguf {
            id,
            url,
            mmproj_url,
        } = target;
        let mmproj_url = mmproj_url.as_deref();
        let mut plan = vec![(
            url.clone(),
            "model.gguf",
            gguf::model_path(models_dir, id, url, mmproj_url),
        )];
        if let Some(dest) = gguf::mmproj_path(models_dir, id, url, mmproj_url) {
            plan.push((
                gguf::trimmed(mmproj_url).unwrap().to_string(),
                "mmproj.gguf",
                dest,
            ));
        }
        plans.push(plan);
    }

    let mut basename_counts: HashMap<String, u32> = HashMap::new();
    for plan in &plans {
        for (url, fallback, _) in plan {
            *basename_counts
                .entry(gguf::filename_for_url(url, fallback))
                .or_insert(0) += 1;
        }
    }

    let mut all_moved = true;
    for plan in &plans {
        let sources: Vec<Option<Option<PathBuf>>> = plan
            .iter()
            .map(|(url, fallback, dest)| {
                if dest.exists() {
                    return Some(None);
                }
                let basename = gguf::filename_for_url(url, fallback);
                let hashed = legacy_models
                    .join("custom")
                    .join(format!("{}_{basename}", gguf::sha256_hex(url)));
                if gguf::looks_like_gguf(&hashed) {
                    return Some(Some(hashed));
                }
                let flat = legacy_models.join(&basename);
                if basename_counts[&basename] == 1 && gguf::looks_like_gguf(&flat) {
                    return Some(Some(flat));
                }
                None
            })
            .collect();
        if sources.iter().any(Option::is_none) {
            continue;
        }
        for ((_, _, dest), source) in plan.iter().zip(sources) {
            let Some(Some(source)) = source else {
                continue;
            };
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::rename(&source, dest).is_ok() {
                continue;
            }
            let staged = PathBuf::from(format!("{}.migrating", dest.display()));
            if fs::copy(&source, &staged)
                .and_then(|_| fs::rename(&staged, dest))
                .is_err()
            {
                let _ = fs::remove_file(&staged);
                all_moved = false;
            }
        }
    }
    if all_moved {
        let _ = fs::remove_dir_all(legacy_dir);
    }
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

    fn write_gguf(path: &Path, content: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn paths_are_keyed_by_preset_id_or_custom_pair_hash() {
        let dir = scratch_dir("paths");
        let downloader = ModelDownloader::new(&dir);

        assert_eq!(
            downloader.model_path(&target("qwen-2b-q8")),
            dir.join("qwen-2b-q8/model.gguf")
        );
        assert_eq!(
            downloader.mmproj_path(&target("qwen-2b-q8")),
            Some(dir.join("qwen-2b-q8/mmproj.gguf"))
        );

        let custom = downloader.model_path(&target("custom:1"));
        let key = custom
            .parent()
            .unwrap()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert!(key.starts_with("custom-"));
        assert_eq!(key.len(), "custom-".len() + 16);
        assert_eq!(custom.file_name().unwrap(), "model.gguf");
        assert_eq!(
            downloader.mmproj_path(&target("custom:1")),
            Some(custom.with_file_name("mmproj.gguf"))
        );

        let other_mmproj = ModelDownloadTarget::Gguf {
            id: "custom:1".to_string(),
            url: "https://example.org/models/main.gguf?download=true".to_string(),
            mmproj_url: Some("https://example.org/models/other.gguf".to_string()),
        };
        assert_ne!(downloader.model_path(&other_mmproj), custom);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn is_downloaded_requires_gguf_magic_on_all_files() {
        let dir = scratch_dir("is-downloaded");
        let downloader = ModelDownloader::new(&dir);
        let target = target("qwen-2b-q8");
        let model = downloader.model_path(&target);
        let mmproj = downloader.mmproj_path(&target).unwrap();

        assert!(!downloader.is_downloaded(&target));

        write_gguf(&model, b"GGUFdata");
        assert!(!downloader.is_downloaded(&target));

        write_gguf(&mmproj, b"not-a-model");
        assert!(!downloader.is_downloaded(&target));

        write_gguf(&mmproj, b"GGUFdata");
        assert!(downloader.is_downloaded(&target));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn download_skips_when_already_present() {
        let dir = scratch_dir("skip");
        let downloader = ModelDownloader::new(&dir);
        let target = target("qwen-2b-q8");
        write_gguf(&downloader.model_path(&target), b"GGUFdata");
        write_gguf(&downloader.mmproj_path(&target).unwrap(), b"GGUFdata");

        let downloaded = downloader
            .download(&target, |_| {}, || false)
            .expect("skip without network");
        assert!(!downloaded);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn migrate_adopts_known_files_and_discards_legacy_dir() {
        let base = scratch_dir("migrate");
        let legacy = base.join("llm");
        let legacy_models = legacy.join("models");
        fs::create_dir_all(legacy_models.join("custom")).unwrap();

        fs::write(legacy_models.join("main.gguf"), b"GGUFmain").unwrap();
        fs::write(legacy_models.join("mmproj.gguf"), b"GGUFmmproj").unwrap();

        let custom_url = "https://example.org/custom/other-main.gguf";
        let custom = ModelDownloadTarget::Gguf {
            id: "custom:1".to_string(),
            url: custom_url.to_string(),
            mmproj_url: None,
        };
        fs::write(
            legacy_models
                .join("custom")
                .join(format!("{}_other-main.gguf", gguf::sha256_hex(custom_url))),
            b"GGUFcustom",
        )
        .unwrap();

        fs::write(legacy_models.join("main.gguf.tmp"), b"GGUFpartial").unwrap();
        fs::write(legacy_models.join("main.gguf.metadata.json"), b"{}").unwrap();
        fs::write(legacy_models.join("orphan.gguf"), b"GGUForphan").unwrap();

        let models_dir = base.join("models");
        let preset = target("qwen-2b-q8");
        migrate_legacy_dir(&models_dir, &legacy, &[preset.clone(), custom.clone()]);

        let downloader = ModelDownloader::new(&models_dir);
        assert_eq!(
            fs::read(downloader.model_path(&preset)).unwrap(),
            b"GGUFmain"
        );
        assert_eq!(
            fs::read(downloader.mmproj_path(&preset).unwrap()).unwrap(),
            b"GGUFmmproj"
        );
        assert_eq!(
            fs::read(downloader.model_path(&custom)).unwrap(),
            b"GGUFcustom"
        );
        assert_eq!(fs::read_dir(&models_dir).unwrap().count(), 2);
        assert!(!legacy.exists());

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn migrate_adopts_targets_only_when_every_file_resolves() {
        let base = scratch_dir("migrate-ambiguous");
        let legacy = base.join("llm");
        let legacy_models = legacy.join("models");
        fs::create_dir_all(&legacy_models).unwrap();
        fs::write(legacy_models.join("a.gguf"), b"GGUFa").unwrap();
        fs::write(legacy_models.join("b.gguf"), b"GGUFb").unwrap();
        fs::write(legacy_models.join("mmproj-F16.gguf"), b"GGUFshared").unwrap();

        let targets = ["a", "b"].map(|name| ModelDownloadTarget::Gguf {
            id: format!("preset-{name}"),
            url: format!("https://example.org/{name}/{name}.gguf"),
            mmproj_url: Some(format!("https://example.org/{name}/mmproj-F16.gguf")),
        });

        let models_dir = base.join("models");
        migrate_legacy_dir(&models_dir, &legacy, &targets);

        assert!(!models_dir.exists() || fs::read_dir(&models_dir).unwrap().count() == 0);
        assert!(!legacy.exists());

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn migrate_keeps_existing_destination_files() {
        let base = scratch_dir("migrate-existing");
        let legacy = base.join("llm");
        fs::create_dir_all(legacy.join("models")).unwrap();
        fs::write(legacy.join("models/main.gguf"), b"GGUFold").unwrap();
        fs::write(legacy.join("models/mmproj.gguf"), b"GGUFmm").unwrap();

        let models_dir = base.join("models");
        let preset = target("qwen-2b-q8");
        let downloader = ModelDownloader::new(&models_dir);
        write_gguf(&downloader.model_path(&preset), b"GGUFnew");

        migrate_legacy_dir(&models_dir, &legacy, std::slice::from_ref(&preset));

        assert_eq!(
            fs::read(downloader.model_path(&preset)).unwrap(),
            b"GGUFnew"
        );
        assert_eq!(
            fs::read(downloader.mmproj_path(&preset).unwrap()).unwrap(),
            b"GGUFmm"
        );
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
