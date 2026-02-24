use std::sync::Mutex;

use once_cell::sync::Lazy;
use ort::Session;

use crate::ml::{
    error::{MlError, MlResult},
    onnx,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionProviderPolicy {
    pub prefer_coreml: bool,
    pub prefer_nnapi: bool,
    pub allow_cpu_fallback: bool,
}

impl Default for ExecutionProviderPolicy {
    fn default() -> Self {
        Self {
            prefer_coreml: true,
            prefer_nnapi: true,
            allow_cpu_fallback: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelPaths {
    pub face_detection: String,
    pub face_embedding: String,
    pub clip_image: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MlRuntimeConfig {
    pub model_paths: ModelPaths,
    pub provider_policy: ExecutionProviderPolicy,
}

#[derive(Debug)]
pub struct MlRuntime {
    pub face_detection: Session,
    pub face_embedding: Session,
    pub clip_image: Session,
}

#[derive(Debug)]
struct RuntimeState {
    config: MlRuntimeConfig,
    runtime: MlRuntime,
}

static GLOBAL_RUNTIME: Lazy<Mutex<Option<RuntimeState>>> = Lazy::new(|| Mutex::new(None));

fn create_runtime(config: &MlRuntimeConfig) -> MlResult<MlRuntime> {
    let face_detection =
        onnx::build_session(&config.model_paths.face_detection, &config.provider_policy)?;
    let face_embedding =
        onnx::build_session(&config.model_paths.face_embedding, &config.provider_policy)?;
    let clip_image = onnx::build_session(&config.model_paths.clip_image, &config.provider_policy)?;
    Ok(MlRuntime {
        face_detection,
        face_embedding,
        clip_image,
    })
}

fn lock_runtime() -> std::sync::MutexGuard<'static, Option<RuntimeState>> {
    match GLOBAL_RUNTIME.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            // Recover from a previous panic by clearing runtime state.
            let mut guard = poisoned.into_inner();
            *guard = None;
            guard
        }
    }
}

pub fn ensure_runtime(config: &MlRuntimeConfig) -> MlResult<()> {
    let should_rebuild = {
        let guard = lock_runtime();
        match guard.as_ref() {
            Some(existing) => existing.config != *config,
            None => true,
        }
    };

    if should_rebuild {
        let runtime = create_runtime(config)?;
        let mut guard = lock_runtime();
        *guard = Some(RuntimeState {
            config: config.clone(),
            runtime,
        });
    }
    Ok(())
}

pub fn with_runtime_mut<F, R>(config: &MlRuntimeConfig, func: F) -> MlResult<R>
where
    F: FnOnce(&mut MlRuntime) -> MlResult<R>,
{
    ensure_runtime(config)?;
    let mut guard = lock_runtime();
    let state = guard
        .as_mut()
        .ok_or_else(|| MlError::Runtime("runtime is not initialized".to_string()))?;
    func(&mut state.runtime)
}

pub fn release_runtime() -> MlResult<()> {
    let mut guard = lock_runtime();
    *guard = None;
    Ok(())
}
