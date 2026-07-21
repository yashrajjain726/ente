//! Durable crash canary for the Android WebGPU execution provider.
//!
//! The only goal of this module is to prevent an infinite crash loop on the
//! rare device where Dawn/Vulkan hard-crashes the process while a WebGPU
//! session is built or first dispatched. It intentionally does nothing more.
//!
//! Mechanics: immediately before a WebGPU session is built, a per-model
//! counter file next to the model is incremented and fsynced ("armed"). After
//! the session has been built *and* has survived one warm-up inference, the
//! file is removed ("disarmed"). A crash, kill, or soft failure in between
//! leaves the incremented counter behind. Once any model's counter reaches
//! [`MAX_CONSECUTIVE_FAILURES`], WebGPU is no longer attempted for models in
//! that directory — durably, across process restarts.
//!
//! A single interrupted attempt (e.g. Android killing the app mid-indexing)
//! is therefore tolerated: only consecutive failures with no intervening
//! success trip the breaker, which a genuine crash loop does deterministically
//! within a few launches.
//!
//! Everything here is called from `onnx::build_session` while the caller
//! holds the per-model slot lock, so accesses to one model's counter file are
//! already serialized and no in-memory state is needed beyond the enable flag.

#[cfg(target_os = "android")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(any(target_os = "android", test))]
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Bump the version to discard all previous canary state, e.g. after a major
/// ONNX Runtime or Dawn upgrade that warrants re-trialing quarantined devices.
#[cfg(any(target_os = "android", test))]
const CANARY_FILE_PREFIX: &str = ".ente-webgpu-canary-v1.";

/// Number of consecutive failed or interrupted WebGPU attempts for one model
/// after which WebGPU is durably disabled.
#[cfg(any(target_os = "android", test))]
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// WebGPU is opt-in while the custom Android ONNX Runtime build is being
/// validated; the app-side policy also gates on device eligibility.
#[cfg(target_os = "android")]
static WEBGPU_ENABLED: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_enabled(enabled: bool) {
    #[cfg(target_os = "android")]
    WEBGPU_ENABLED.store(enabled, Ordering::Relaxed);
    #[cfg(not(target_os = "android"))]
    let _ = enabled;
}

/// Whether a WebGPU session may be attempted for this model. False when the
/// app has not opted in, or when any model in the same directory has tripped
/// the crash canary. Fails closed on IO errors.
#[cfg(target_os = "android")]
pub(crate) fn attempt_permitted(model_path: &str) -> bool {
    WEBGPU_ENABLED.load(Ordering::Relaxed)
        && chromium_compatible_adapter_available()
        && model_dir(model_path).is_some_and(|dir| !quarantined(&dir))
}

/// Chromium-compatible Vulkan adapter filtering will be implemented here via
/// `ash`. Keeping this inside the Rust eligibility path ensures an unsupported
/// adapter cannot be bypassed by any Dart inference entry point.
#[cfg(target_os = "android")]
fn chromium_compatible_adapter_available() -> bool {
    true
}

/// A durable record of an in-flight WebGPU attempt for one model. Dropping it
/// without calling [`ArmedCanary::disarm`] leaves the attempt recorded as
/// failed, which is exactly what a crash does implicitly.
#[cfg(any(target_os = "android", test))]
pub(crate) struct ArmedCanary {
    path: PathBuf,
}

/// Increments and fsyncs the model's consecutive-failure counter before a
/// WebGPU attempt. On error the caller must skip WebGPU (fail closed): without
/// a durable record, a crash during the attempt would go unnoticed.
#[cfg(any(target_os = "android", test))]
pub(crate) fn arm_canary(model_path: &str, model_namespace: &str) -> io::Result<ArmedCanary> {
    let dir = model_dir(model_path).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "cannot derive WebGPU canary directory from model path",
        )
    })?;
    let path = dir.join(format!("{CANARY_FILE_PREFIX}{model_namespace}"));
    let failures = read_failure_count(&path)?;
    persist_failure_count(&path, failures.saturating_add(1))?;
    Ok(ArmedCanary { path })
}

#[cfg(any(target_os = "android", test))]
impl ArmedCanary {
    /// Marks the attempt as successful by removing the counter file, resetting
    /// the model's consecutive-failure count to zero.
    pub(crate) fn disarm(self) {
        if let Err(error) = remove_file_durably(&self.path) {
            crate::ml::runtime::rt_log(&format!(
                "failed to disarm WebGPU crash canary at '{}': {error}",
                self.path.display()
            ));
        }
    }
}

#[cfg(any(target_os = "android", test))]
fn model_dir(model_path: &str) -> Option<PathBuf> {
    if model_path.trim().is_empty() {
        return None;
    }
    Path::new(model_path)
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .map(Path::to_path_buf)
}

/// True if any model's canary in this directory records too many consecutive
/// failures. Unreadable state fails closed.
#[cfg(any(target_os = "android", test))]
fn quarantined(dir: &Path) -> bool {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return true,
    };
    for entry in entries {
        let Ok(entry) = entry else {
            return true;
        };
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        if !name.starts_with(CANARY_FILE_PREFIX) {
            continue;
        }
        match read_failure_count(&entry.path()) {
            Ok(failures) if failures < MAX_CONSECUTIVE_FAILURES => {}
            _ => return true,
        }
    }
    false
}

/// A missing file means zero consecutive failures. Unparseable contents are an
/// error so that callers fail closed.
#[cfg(any(target_os = "android", test))]
fn read_failure_count(path: &Path) -> io::Result<u32> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    };
    contents.trim().parse::<u32>().map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("invalid WebGPU canary contents at '{}'", path.display()),
        )
    })
}

#[cfg(any(target_os = "android", test))]
fn persist_failure_count(path: &Path, failures: u32) -> io::Result<()> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)?;
    file.write_all(format!("{failures}\n").as_bytes())?;
    file.sync_all()?;
    sync_parent(path)
}

#[cfg(any(target_os = "android", test))]
fn remove_file_durably(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => sync_parent(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(any(target_os = "android", test))]
fn sync_parent(path: &Path) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "WebGPU canary path has no parent directory",
        )
    })?;
    File::open(parent)?.sync_all()
}

#[cfg(test)]
mod tests {
    use super::{MAX_CONSECUTIVE_FAILURES, arm_canary, quarantined};

    fn model_path(dir: &std::path::Path) -> String {
        dir.join("model.onnx").to_string_lossy().into_owned()
    }

    #[test]
    fn single_interrupted_attempt_does_not_quarantine() {
        let dir = tempfile::tempdir().unwrap();
        let model = model_path(dir.path());

        // Dropped without disarming, as after a crash or background kill.
        drop(arm_canary(&model, "clip-image").unwrap());

        assert!(!quarantined(dir.path()));
    }

    #[test]
    fn consecutive_interrupted_attempts_quarantine() {
        let dir = tempfile::tempdir().unwrap();
        let model = model_path(dir.path());

        for attempt in 1..=MAX_CONSECUTIVE_FAILURES {
            assert!(
                !quarantined(dir.path()),
                "quarantined before attempt {attempt}"
            );
            drop(arm_canary(&model, "clip-image").unwrap());
        }

        assert!(quarantined(dir.path()));
    }

    #[test]
    fn successful_attempt_resets_consecutive_failures() {
        let dir = tempfile::tempdir().unwrap();
        let model = model_path(dir.path());

        drop(arm_canary(&model, "clip-image").unwrap());
        drop(arm_canary(&model, "clip-image").unwrap());
        arm_canary(&model, "clip-image").unwrap().disarm();

        assert!(!quarantined(dir.path()));
        drop(arm_canary(&model, "clip-image").unwrap());
        assert!(!quarantined(dir.path()));
    }

    #[test]
    fn failures_do_not_accumulate_across_models() {
        let dir = tempfile::tempdir().unwrap();
        let model = model_path(dir.path());

        drop(arm_canary(&model, "clip-image").unwrap());
        drop(arm_canary(&model, "face-detection").unwrap());
        drop(arm_canary(&model, "face-embedding").unwrap());

        assert!(!quarantined(dir.path()));
    }

    #[test]
    fn one_tripped_model_quarantines_the_whole_directory() {
        let dir = tempfile::tempdir().unwrap();
        let model = model_path(dir.path());

        for _ in 0..MAX_CONSECUTIVE_FAILURES {
            drop(arm_canary(&model, "clip-image").unwrap());
        }
        arm_canary(&model, "face-detection").unwrap().disarm();

        assert!(quarantined(dir.path()));
    }

    #[test]
    fn unreadable_canary_state_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path()
                .join(format!("{}clip-image", super::CANARY_FILE_PREFIX)),
            b"not a number",
        )
        .unwrap();

        assert!(quarantined(dir.path()));
    }
}
