use std::{
    cell::Cell,
    path::Path,
    sync::{Mutex, MutexGuard},
};

use once_cell::sync::Lazy;
use ort::session::Session;

use crate::ml::{
    error::{MlError, MlResult},
    onnx,
};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModelPaths {
    pub face_detection: String,
    pub face_embedding: String,
    pub clip_image: String,
    pub clip_text: String,
    pub pet_face_detection: String,
    pub pet_face_embedding_dog: String,
    pub pet_face_embedding_cat: String,
    pub pet_body_detection: String,
    pub pet_body_embedding_dog: String,
    pub pet_body_embedding_cat: String,
}

#[derive(Debug)]
struct ModelSlotState {
    path: String,
    provider_plan: Option<onnx::ProviderPlan>,
    session: Option<Session>,
}

#[derive(Debug)]
struct ModelSlot {
    default_execution_mode: onnx::ExecutionMode,
    model_namespace: &'static str,
    state: Mutex<ModelSlotState>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct UsedProviders {
    pub(crate) coreml: bool,
    pub(crate) webgpu: bool,
}

impl UsedProviders {
    fn record(&mut self, provider: onnx::ExecutionProvider) {
        match provider {
            onnx::ExecutionProvider::CoreMl => self.coreml = true,
            onnx::ExecutionProvider::WebGpu => self.webgpu = true,
            onnx::ExecutionProvider::Xnnpack | onnx::ExecutionProvider::Cpu => {}
        }
    }
}

pub(crate) struct MlRuntimeView<'a> {
    runtime: &'a MlRuntime,
    model_paths: &'a ModelPaths,
    used_providers: Cell<UsedProviders>,
}

impl ModelSlot {
    fn new(default_execution_mode: onnx::ExecutionMode, model_namespace: &'static str) -> Self {
        Self {
            default_execution_mode,
            model_namespace,
            state: Mutex::new(ModelSlotState {
                path: String::new(),
                provider_plan: None,
                session: None,
            }),
        }
    }

    fn lock_state(&self) -> MutexGuard<'_, ModelSlotState> {
        match self.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    fn configure_if_requested(&self, path: &str) {
        if path.trim().is_empty() {
            return;
        }
        let mut state = self.lock_state();
        Self::set_config_locked(&mut state, path);
    }

    fn sync_indexing_residency(&self, path: &str) {
        let mut state = self.lock_state();
        if path.trim().is_empty() {
            Self::reset_slot_locked(&mut state);
            return;
        }

        Self::set_config_locked(&mut state, path);
    }

    fn release_residency(&self) {
        let mut state = self.lock_state();
        Self::clear_transient_runtime_state_locked(&mut state);
    }

    fn run<T>(
        &self,
        path: &str,
        error_msg: &str,
        mut operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<(T, onnx::ExecutionProvider)> {
        if path.trim().is_empty() {
            return Err(MlError::InvalidRequest(error_msg.to_string()));
        }

        loop {
            let mut state = self.lock_state();
            Self::set_config_locked(&mut state, path);
            self.ensure_loaded_locked(&mut state, error_msg)?;

            let execution_provider = state
                .provider_plan
                .as_ref()
                .and_then(onnx::ProviderPlan::selected_provider)
                .expect("loaded session must have a selected execution provider");
            let session = state
                .session
                .as_mut()
                .expect("session must be loaded before model execution");
            let result = operation(session);
            match result {
                Ok(value) => return Ok((value, execution_provider)),
                Err(error) => {
                    if self.retry_after_provider_failure_locked(&mut state, &error) {
                        continue;
                    }
                    return Err(error.into_ml_error());
                }
            }
        }
    }

    fn retry_after_provider_failure_locked(
        &self,
        state: &mut ModelSlotState,
        error: &onnx::SessionRunError,
    ) -> bool {
        if !error.is_retryable()
            || !state
                .provider_plan
                .as_ref()
                .is_some_and(onnx::ProviderPlan::has_fallback)
        {
            return false;
        }

        state.session = None;
        log::warn!(
            "execution provider failed, retrying model with the next provider fallback: {error}"
        );
        true
    }

    fn set_config_locked(state: &mut ModelSlotState, path: &str) {
        if state.path == path {
            return;
        }
        state.path = path.to_string();
        state.provider_plan = None;
        state.session = None;
    }

    fn clear_transient_runtime_state_locked(state: &mut ModelSlotState) {
        state.provider_plan = None;
        state.session = None;
    }

    fn reset_slot_locked(state: &mut ModelSlotState) {
        state.path.clear();
        Self::clear_transient_runtime_state_locked(state);
    }

    fn ensure_loaded_locked(&self, state: &mut ModelSlotState, error_msg: &str) -> MlResult<()> {
        if state.path.trim().is_empty() {
            return Err(MlError::InvalidRequest(error_msg.to_string()));
        }
        if state.session.is_some() {
            return Ok(());
        }

        let provider_plan = state.provider_plan.get_or_insert_with(|| {
            onnx::ProviderPlan::new(self.default_execution_mode, &state.path)
        });
        let model_name = Path::new(&state.path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&state.path);
        log::info!(
            "loading {model_name} with {:?} execution",
            self.default_execution_mode
        );
        let t = std::time::Instant::now();
        let session = onnx::build_session(&state.path, provider_plan, self.model_namespace)?;
        let execution_provider = provider_plan
            .selected_provider()
            .expect("successful session build must select an execution provider");
        log::info!(
            "loaded {model_name} with {execution_provider:?} in {:?}",
            t.elapsed()
        );
        state.session = Some(session);
        Ok(())
    }
}

#[derive(Debug)]
struct MlRuntime {
    face_detection: ModelSlot,
    face_embedding: ModelSlot,
    clip_image: ModelSlot,
    clip_text: ModelSlot,
    pet_face_detection: ModelSlot,
    pet_face_embedding_dog: ModelSlot,
    pet_face_embedding_cat: ModelSlot,
    pet_body_detection: ModelSlot,
    pet_body_embedding_dog: ModelSlot,
    pet_body_embedding_cat: ModelSlot,
}

static GLOBAL_RUNTIME: Lazy<MlRuntime> = Lazy::new(MlRuntime::new);

impl MlRuntime {
    fn new() -> Self {
        let platform_default = onnx::ExecutionMode::PlatformDefault;
        let cpu_only = onnx::ExecutionMode::CpuOnly;

        Self {
            face_detection: ModelSlot::new(platform_default, "face-detection"),
            face_embedding: ModelSlot::new(platform_default, "face-embedding"),
            clip_image: ModelSlot::new(platform_default, "clip-image"),
            // The quantized CLIP text graph is heavily partitioned by both
            // CoreML and WebGPU, making their mixed CPU/GPU execution slower
            // than running the complete model on CPU.
            clip_text: ModelSlot::new(cpu_only, "clip-text"),
            // Pet models stay CPU-only due to device-specific FP16 failures.
            pet_face_detection: ModelSlot::new(cpu_only, "pet-face-detection"),
            pet_face_embedding_dog: ModelSlot::new(cpu_only, "pet-face-embedding-dog"),
            pet_face_embedding_cat: ModelSlot::new(cpu_only, "pet-face-embedding-cat"),
            pet_body_detection: ModelSlot::new(cpu_only, "pet-body-detection"),
            pet_body_embedding_dog: ModelSlot::new(cpu_only, "pet-body-embedding-dog"),
            pet_body_embedding_cat: ModelSlot::new(cpu_only, "pet-body-embedding-cat"),
        }
    }

    fn configure_requested_models(&self, model_paths: &ModelPaths) {
        self.face_detection
            .configure_if_requested(&model_paths.face_detection);
        self.face_embedding
            .configure_if_requested(&model_paths.face_embedding);
        self.clip_image
            .configure_if_requested(&model_paths.clip_image);
        self.clip_text
            .configure_if_requested(&model_paths.clip_text);
        self.pet_face_detection
            .configure_if_requested(&model_paths.pet_face_detection);
        self.pet_face_embedding_dog
            .configure_if_requested(&model_paths.pet_face_embedding_dog);
        self.pet_face_embedding_cat
            .configure_if_requested(&model_paths.pet_face_embedding_cat);
        self.pet_body_detection
            .configure_if_requested(&model_paths.pet_body_detection);
        self.pet_body_embedding_dog
            .configure_if_requested(&model_paths.pet_body_embedding_dog);
        self.pet_body_embedding_cat
            .configure_if_requested(&model_paths.pet_body_embedding_cat);
    }

    fn prepare_indexing_models(&self, model_paths: &ModelPaths) {
        self.face_detection
            .sync_indexing_residency(&model_paths.face_detection);
        self.face_embedding
            .sync_indexing_residency(&model_paths.face_embedding);
        self.clip_image
            .sync_indexing_residency(&model_paths.clip_image);
        self.pet_face_detection
            .sync_indexing_residency(&model_paths.pet_face_detection);
        self.pet_face_embedding_dog
            .sync_indexing_residency(&model_paths.pet_face_embedding_dog);
        self.pet_face_embedding_cat
            .sync_indexing_residency(&model_paths.pet_face_embedding_cat);
        self.pet_body_detection
            .sync_indexing_residency(&model_paths.pet_body_detection);
        self.pet_body_embedding_dog
            .sync_indexing_residency(&model_paths.pet_body_embedding_dog);
        self.pet_body_embedding_cat
            .sync_indexing_residency(&model_paths.pet_body_embedding_cat);
    }

    fn release_indexing_models(&self) {
        self.face_detection.release_residency();
        self.face_embedding.release_residency();
        self.clip_image.release_residency();
        self.pet_face_detection.release_residency();
        self.pet_face_embedding_dog.release_residency();
        self.pet_face_embedding_cat.release_residency();
        self.pet_body_detection.release_residency();
        self.pet_body_embedding_dog.release_residency();
        self.pet_body_embedding_cat.release_residency();
    }

    fn view<'a>(&'a self, model_paths: &'a ModelPaths) -> MlRuntimeView<'a> {
        MlRuntimeView {
            runtime: self,
            model_paths,
            used_providers: Cell::new(UsedProviders::default()),
        }
    }
}

impl<'a> MlRuntimeView<'a> {
    pub(crate) fn used_providers(&self) -> UsedProviders {
        self.used_providers.get()
    }

    fn run_tracked<T>(
        &self,
        slot: &ModelSlot,
        path: &str,
        error_msg: &str,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        let (value, execution_provider) = slot.run(path, error_msg, operation)?;
        let mut used = self.used_providers.get();
        used.record(execution_provider);
        self.used_providers.set(used);
        Ok(value)
    }

    pub(crate) fn with_face_detection_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.face_detection,
            &self.model_paths.face_detection,
            "missing model path: faceDetectionModelPath is required when runFaces is true",
            operation,
        )
    }

    pub(crate) fn with_face_embedding_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.face_embedding,
            &self.model_paths.face_embedding,
            "missing model path: faceEmbeddingModelPath is required when runFaces is true",
            operation,
        )
    }

    pub(crate) fn with_clip_image_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.clip_image,
            &self.model_paths.clip_image,
            "missing model path: clipImageModelPath is required when runClip is true",
            operation,
        )
    }

    pub(crate) fn with_clip_text_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.clip_text,
            &self.model_paths.clip_text,
            "missing model path: clipTextModelPath is required when running clip text",
            operation,
        )
    }

    pub(crate) fn with_pet_face_detection_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.pet_face_detection,
            &self.model_paths.pet_face_detection,
            "missing model path: petFaceDetectionModelPath is required when runPets is true",
            operation,
        )
    }

    pub(crate) fn with_pet_face_embedding_dog_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.pet_face_embedding_dog,
            &self.model_paths.pet_face_embedding_dog,
            "missing model path: petFaceEmbeddingDogModelPath is required",
            operation,
        )
    }

    pub(crate) fn with_pet_face_embedding_cat_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.pet_face_embedding_cat,
            &self.model_paths.pet_face_embedding_cat,
            "missing model path: petFaceEmbeddingCatModelPath is required",
            operation,
        )
    }

    pub(crate) fn with_pet_body_detection_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.pet_body_detection,
            &self.model_paths.pet_body_detection,
            "missing model path: petBodyDetectionModelPath is required when runPets is true",
            operation,
        )
    }

    pub(crate) fn with_pet_body_embedding_dog_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.pet_body_embedding_dog,
            &self.model_paths.pet_body_embedding_dog,
            "missing model path: petBodyEmbeddingDogModelPath is required",
            operation,
        )
    }

    pub(crate) fn with_pet_body_embedding_cat_session<T>(
        &self,
        operation: impl FnMut(&mut Session) -> onnx::SessionRunResult<T>,
    ) -> MlResult<T> {
        self.run_tracked(
            &self.runtime.pet_body_embedding_cat,
            &self.model_paths.pet_body_embedding_cat,
            "missing model path: petBodyEmbeddingCatModelPath is required",
            operation,
        )
    }
}

pub(crate) fn ensure_runtime(model_paths: &ModelPaths) {
    GLOBAL_RUNTIME.configure_requested_models(model_paths);
}

pub(crate) fn prepare_runtime(model_paths: &ModelPaths) {
    GLOBAL_RUNTIME.prepare_indexing_models(model_paths);
}

pub(crate) fn with_runtime<R>(
    model_paths: &ModelPaths,
    func: impl FnOnce(&MlRuntimeView<'_>) -> MlResult<R>,
) -> MlResult<R> {
    ensure_runtime(model_paths);

    let runtime_view = GLOBAL_RUNTIME.view(model_paths);
    func(&runtime_view)
}

pub(crate) fn release_runtime() {
    GLOBAL_RUNTIME.release_indexing_models();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configure_requested_models_preserves_unrequested_slots() {
        let runtime = MlRuntime::new();

        runtime.configure_requested_models(&ModelPaths {
            clip_text: "clip_text.onnx".to_string(),
            ..ModelPaths::default()
        });

        runtime.configure_requested_models(&ModelPaths {
            face_detection: "face.onnx".to_string(),
            ..ModelPaths::default()
        });

        let clip_text = runtime.clip_text.lock_state();
        assert_eq!(clip_text.path, "clip_text.onnx");
    }

    #[test]
    fn runtime_accepts_single_use_operation() {
        let value = String::from("once");

        let result = with_runtime(&ModelPaths::default(), move |_| Ok(value));

        assert_eq!(result.unwrap(), "once");
    }

    #[test]
    fn release_indexing_models_keeps_clip_text_state() {
        let runtime = MlRuntime::new();

        {
            let mut clip_text = runtime.clip_text.lock_state();
            clip_text.path = "clip_text.onnx".to_string();
            clip_text.provider_plan = Some(onnx::ProviderPlan::new(
                onnx::ExecutionMode::CpuOnly,
                "clip_text.onnx",
            ));
        }
        {
            let mut face_detection = runtime.face_detection.lock_state();
            face_detection.path = "face.onnx".to_string();
            face_detection.provider_plan = Some(onnx::ProviderPlan::new(
                onnx::ExecutionMode::CpuOnly,
                "face.onnx",
            ));
        }

        runtime.release_indexing_models();

        let clip_text = runtime.clip_text.lock_state();
        assert_eq!(clip_text.path, "clip_text.onnx");
        assert!(clip_text.provider_plan.is_some());

        let face_detection = runtime.face_detection.lock_state();
        assert!(face_detection.provider_plan.is_none());
    }

    #[test]
    fn prepare_indexing_models_configures_without_loading_sessions() {
        let runtime = MlRuntime::new();

        runtime.prepare_indexing_models(&ModelPaths {
            face_detection: "face.onnx".to_string(),
            face_embedding: "embed.onnx".to_string(),
            clip_image: "clip.onnx".to_string(),
            ..ModelPaths::default()
        });

        let face_detection = runtime.face_detection.lock_state();
        assert_eq!(face_detection.path, "face.onnx");
        assert!(face_detection.session.is_none());

        let face_embedding = runtime.face_embedding.lock_state();
        assert_eq!(face_embedding.path, "embed.onnx");
        assert!(face_embedding.session.is_none());

        let clip_image = runtime.clip_image.lock_state();
        assert_eq!(clip_image.path, "clip.onnx");
        assert!(clip_image.session.is_none());
    }

    #[test]
    fn sync_indexing_residency_clears_disabled_slots() {
        let slot = ModelSlot::new(onnx::ExecutionMode::PlatformDefault, "test-model");

        {
            let mut state = slot.lock_state();
            state.path = "pet.onnx".to_string();
            state.provider_plan = Some(onnx::ProviderPlan::new(
                onnx::ExecutionMode::CpuOnly,
                "pet.onnx",
            ));
        }

        slot.sync_indexing_residency("");

        let state = slot.lock_state();
        assert!(state.path.is_empty());
        assert!(state.provider_plan.is_none());
        assert!(state.session.is_none());
    }

    #[test]
    fn release_residency_resets_transient_cpu_fallback_for_any_slot() {
        let slot = ModelSlot::new(onnx::ExecutionMode::PlatformDefault, "test-model");

        {
            let mut state = slot.lock_state();
            state.path = "clip_text.onnx".to_string();
            state.provider_plan = Some(onnx::ProviderPlan::new(
                onnx::ExecutionMode::CpuOnly,
                "clip_text.onnx",
            ));
        }

        slot.release_residency();

        let state = slot.lock_state();
        assert!(state.provider_plan.is_none());
        assert!(state.session.is_none());
    }

    #[test]
    fn model_execution_modes_match_platform_policy() {
        let runtime = MlRuntime::new();
        let expected_pet_mode = onnx::ExecutionMode::CpuOnly;

        assert_eq!(
            runtime.face_detection.default_execution_mode,
            onnx::ExecutionMode::PlatformDefault
        );
        assert_eq!(
            runtime.face_embedding.default_execution_mode,
            onnx::ExecutionMode::PlatformDefault
        );
        assert_eq!(
            runtime.clip_image.default_execution_mode,
            onnx::ExecutionMode::PlatformDefault
        );
        assert_eq!(
            runtime.clip_text.default_execution_mode,
            onnx::ExecutionMode::CpuOnly
        );
        assert_eq!(
            runtime.pet_face_detection.default_execution_mode,
            expected_pet_mode
        );
        assert_eq!(
            runtime.pet_face_embedding_dog.default_execution_mode,
            expected_pet_mode
        );
        assert_eq!(
            runtime.pet_face_embedding_cat.default_execution_mode,
            expected_pet_mode
        );
        assert_eq!(
            runtime.pet_body_detection.default_execution_mode,
            expected_pet_mode
        );
        assert_eq!(
            runtime.pet_body_embedding_dog.default_execution_mode,
            expected_pet_mode
        );
        assert_eq!(
            runtime.pet_body_embedding_cat.default_execution_mode,
            expected_pet_mode
        );
    }
}
