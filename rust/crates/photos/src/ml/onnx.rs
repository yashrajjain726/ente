use ort::{
    ep::{CPU, ExecutionProviderDispatch},
    session::{Session, builder::GraphOptimizationLevel},
};
use std::{
    fmt,
    path::{Path, PathBuf},
};

#[cfg(target_os = "android")]
use ort::ep::XNNPACK;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use ort::ep::{
    CoreML,
    coreml::{ComputeUnits, ModelFormat, SpecializationStrategy},
};
#[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
use ort::ep::{
    WebGPU,
    webgpu::{DawnBackendType, PreferredLayout},
};
#[cfg(target_os = "android")]
use std::num::NonZeroUsize;

use crate::ml::error::{MlError, MlResult};
use crate::ml::golden;
#[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
use crate::ml::webgpu;

mod coreml_cache;
mod tensor;

pub(crate) use tensor::{
    BorrowedFloatTensor, FloatTensorData, PreparedF32Input, run_f32, run_golden_tensor,
    run_i32_f32, with_prepared_float_output,
};

#[cfg(any(target_os = "ios", target_os = "macos"))]
const ENABLE_PERSISTENT_COREML_CACHE: bool = true;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ExecutionMode {
    PlatformDefault,
    CpuOnly,
}

// Identifies the successful attempt's preferred provider, not its registered
// fallback providers, for result attribution.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)] // Accelerated variants are constructed only on their target OS.
pub(crate) enum ExecutionProvider {
    CoreMl,
    WebGpu,
    Xnnpack,
    Cpu,
}

#[derive(Debug)]
pub(crate) struct ProviderPlan {
    providers: Vec<ExecutionProvider>,
    next: usize,
    selected: Option<ExecutionProvider>,
}

impl ProviderPlan {
    pub(crate) fn new(mode: ExecutionMode, model_path: &str) -> Self {
        let providers = match mode {
            ExecutionMode::PlatformDefault => platform_default_providers(model_path),
            ExecutionMode::CpuOnly => vec![ExecutionProvider::Cpu],
        };
        Self {
            providers,
            next: 0,
            selected: None,
        }
    }

    fn next_provider(&mut self) -> Option<ExecutionProvider> {
        let provider = self.providers.get(self.next).copied()?;
        self.next += 1;
        Some(provider)
    }

    fn select(&mut self, provider: ExecutionProvider) {
        self.selected = Some(provider);
    }

    pub(crate) fn selected_provider(&self) -> Option<ExecutionProvider> {
        self.selected
    }

    pub(crate) fn has_fallback(&self) -> bool {
        self.next < self.providers.len()
    }

    fn retain_last_provider_for_retry(&mut self) {
        self.selected = None;
        self.next = self.providers.len().saturating_sub(1);
    }
}

#[derive(Debug)]
pub(crate) enum SessionRunError {
    Retryable(MlError),
    Terminal(MlError),
}

pub(crate) type SessionRunResult<T> = Result<T, SessionRunError>;

impl SessionRunError {
    pub(crate) fn retryable(error: MlError) -> Self {
        Self::Retryable(error)
    }

    pub(crate) fn is_retryable(&self) -> bool {
        matches!(self, Self::Retryable(_))
    }

    pub(crate) fn into_ml_error(self) -> MlError {
        match self {
            Self::Retryable(error) | Self::Terminal(error) => error,
        }
    }
}

impl fmt::Display for SessionRunError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Retryable(error) | Self::Terminal(error) => error.fmt(formatter),
        }
    }
}

impl From<MlError> for SessionRunError {
    fn from(error: MlError) -> Self {
        Self::Terminal(error)
    }
}

impl From<SessionRunError> for MlError {
    fn from(error: SessionRunError) -> Self {
        error.into_ml_error()
    }
}

impl<R> From<ort::Error<R>> for SessionRunError {
    fn from(error: ort::Error<R>) -> Self {
        let error = MlError::Ort(error.to_string());
        if is_execution_provider_run_failure(&error) {
            Self::Retryable(error)
        } else {
            Self::Terminal(error)
        }
    }
}

pub(crate) fn build_session(
    model_path: &str,
    plan: &mut ProviderPlan,
    model_namespace: &str,
) -> MlResult<Session> {
    plan.selected = None;

    let mut errors = Vec::new();
    while let Some(execution_provider) = plan.next_provider() {
        let attempt = provider_attempt(execution_provider, model_path, model_namespace);
        if attempt.uses_webgpu {
            #[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
            {
                match build_webgpu_session_with_canary(model_path, model_namespace, attempt) {
                    Ok(session) => {
                        plan.select(execution_provider);
                        return Ok(session);
                    }
                    Err(error) => errors.push(format!("{error}")),
                }
                continue;
            }
            #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
            unreachable!("WebGPU provider attempts are not constructed on this platform");
        }

        let coreml_cache_dir = attempt.coreml_cache_dir.clone();
        match build_and_validate_session(model_path, attempt) {
            Ok(session) => {
                if let Some(cache_dir) = coreml_cache_dir {
                    coreml_cache::finalize(&cache_dir, model_path);
                }
                plan.select(execution_provider);
                return Ok(session);
            }
            Err(error) => {
                if let Some(cache_dir) = coreml_cache_dir
                    && let Err(cleanup_error) = coreml_cache::invalidate(&cache_dir)
                {
                    log::warn!(
                        "failed to invalidate CoreML cache for '{}' after session construction failed: {cleanup_error}",
                        model_file_label(model_path)
                    );
                }
                errors.push(format!("{error}"));
            }
        }
    }

    plan.retain_last_provider_for_retry();

    if has_protobuf_parse_failure(&errors) {
        return Err(MlError::CorruptModel(model_path.to_string()));
    }

    Err(MlError::Ort(format!(
        "failed to create ONNX session for model '{model_path}' across EP fallbacks: {}",
        errors.join(" | ")
    )))
}

fn is_execution_provider_run_failure(error: &MlError) -> bool {
    let MlError::Ort(message) = error else {
        return false;
    };
    let normalized = message.to_ascii_lowercase();
    normalized.contains("executionprovider")
        || normalized.contains("unknown allocation device")
        || normalized.contains("xnnpackexecutionprovider")
        || normalized.contains("coremlexecutionprovider")
        || normalized.contains("webgpu")
        || normalized.contains("wgpu")
        || normalized.contains("dawn")
        || normalized.contains("vulkan")
        || normalized.contains("vk_error")
        || normalized.contains("ep error")
}

// A CoreML self-test failure is treated as construction failure so the caller
// invalidates the possibly corrupt persistent cache. WebGPU validation stays
// inside its crash-canary window instead.
fn build_and_validate_session(model_path: &str, attempt: ProviderAttempt) -> MlResult<Session> {
    #[cfg(any(
        target_os = "android",
        target_os = "ios",
        target_os = "linux",
        target_os = "macos",
        target_os = "windows"
    ))]
    let execution_provider = attempt.execution_provider;

    #[cfg_attr(not(any(target_os = "ios", target_os = "macos")), allow(unused_mut))]
    let mut session = match build_session_with_providers(model_path, attempt) {
        Ok(session) => session,
        Err(error) => {
            #[cfg(any(
                target_os = "android",
                target_os = "ios",
                target_os = "linux",
                target_os = "macos",
                target_os = "windows"
            ))]
            record_provider_attempt_failure(
                execution_provider,
                model_path,
                "session construction",
                &error,
            );
            return Err(error);
        }
    };

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    if execution_provider == ExecutionProvider::CoreMl {
        run_session_self_test(model_path, &mut session, "CoreML")?;
    }

    Ok(session)
}

// The durable canary remains armed through construction and self-test, so
// crashes and soft failures both count toward quarantine.
#[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
fn build_webgpu_session_with_canary(
    model_path: &str,
    model_namespace: &str,
    attempt: ProviderAttempt,
) -> MlResult<Session> {
    // Fail closed: without a durable failure record, a crash during the
    // attempt would go unnoticed and the crash loop protection would be lost.
    let canary = match webgpu::arm_canary(model_path, model_namespace) {
        Ok(canary) => canary,
        Err(error) => {
            let error = MlError::Ort(format!("failed to arm WebGPU crash canary: {error}"));
            record_provider_attempt_failure(
                ExecutionProvider::WebGpu,
                model_path,
                "crash-canary setup",
                &error,
            );
            return Err(error);
        }
    };
    #[cfg(target_os = "android")]
    {
        match webgpu::check_adapter() {
            webgpu::AdapterCheck::Allowed => {}
            webgpu::AdapterCheck::Denied => {
                canary.disarm();
                return Err(MlError::Ort(
                    "WebGPU skipped: GPU adapter is not on the allowlist".to_string(),
                ));
            }
            webgpu::AdapterCheck::Failed => {
                let error = MlError::Ort("WebGPU skipped: Vulkan adapter probe failed".to_string());
                record_provider_attempt_failure(
                    ExecutionProvider::WebGpu,
                    model_path,
                    "adapter probe",
                    &error,
                );
                return Err(error);
            }
        }
    }
    let mut session = match build_session_with_providers(model_path, attempt) {
        Ok(session) => session,
        Err(error) => {
            record_provider_attempt_failure(
                ExecutionProvider::WebGpu,
                model_path,
                "session construction",
                &error,
            );
            return Err(error);
        }
    };
    run_session_self_test(model_path, &mut session, "WebGPU")?;
    canary.disarm();
    Ok(session)
}

#[cfg(any(
    target_os = "android",
    target_os = "ios",
    target_os = "linux",
    target_os = "macos",
    target_os = "windows"
))]
fn record_provider_attempt_failure(
    provider: ExecutionProvider,
    model_path: &str,
    stage: &str,
    error: &MlError,
) {
    if let Some(message) = provider_attempt_failure_message(provider, model_path, stage, error) {
        log::warn!("{message}");
    }
}

#[cfg(any(
    target_os = "android",
    target_os = "ios",
    target_os = "linux",
    target_os = "macos",
    target_os = "windows",
    test
))]
fn provider_attempt_failure_message(
    provider: ExecutionProvider,
    model_path: &str,
    stage: &str,
    error: &MlError,
) -> Option<String> {
    let provider_label = match provider {
        ExecutionProvider::CoreMl => "CoreML",
        ExecutionProvider::WebGpu => "WebGPU",
        ExecutionProvider::Xnnpack => "XNNPACK",
        ExecutionProvider::Cpu => return None,
    };
    Some(format!(
        "{provider_label} {stage} failed for '{}': {error}; falling back to the next execution provider",
        model_file_label(model_path)
    ))
}

#[cfg(any(
    target_os = "android",
    target_os = "ios",
    target_os = "linux",
    target_os = "macos",
    target_os = "windows"
))]
fn run_session_self_test(
    model_path: &str,
    session: &mut Session,
    provider_label: &str,
) -> MlResult<()> {
    let model_file = model_file_label(model_path);
    let Some(entry) = golden::lookup(model_path) else {
        return Err(MlError::Ort(format!(
            "golden self-test entry missing for '{model_file}'"
        )));
    };
    let golden_input = golden::prepare_input(entry).map_err(|reason| {
        MlError::Ort(format!(
            "golden self-test input invalid for '{model_file}': {reason}"
        ))
    })?;
    let zero_input = golden_input.zeroed();

    // Warm up pipeline creation and the first dispatch with an input that is
    // deliberately different from the golden. If a later dispatch reuses
    // this result, the golden comparison below rejects the session.
    let zero_output = match run_golden_tensor(session, entry.input_shape, &zero_input) {
        Ok(output) => output,
        Err(error) => {
            log::warn!(
                "{provider_label} zero-input warm-up inference failed for '{model_file}': \
                 {error}; falling back to the next execution provider"
            );
            return Err(error.into());
        }
    };
    if let Err(reason) = golden::validate_output(entry, &zero_output) {
        log::error!(
            "{provider_label} zero-input warm-up failed for '{model_file}': {reason}; \
             falling back to the next execution provider"
        );
        return Err(MlError::Ort(format!(
            "zero-input warm-up failed for '{model_file}': {reason}"
        )));
    }
    log::info!("{provider_label} zero-input warm-up for '{model_file}' passed");

    let golden_output = match run_golden_tensor(session, entry.input_shape, &golden_input) {
        Ok(output) => output,
        Err(error) => {
            // Surface inference failures too: without this, a provider that
            // cannot execute the golden input would fall back invisibly (the
            // session-build error is swallowed once the next attempt succeeds).
            log::warn!(
                "{provider_label} golden self-test inference failed for '{model_file}': \
                 {error}; falling back to the next execution provider"
            );
            return Err(error.into());
        }
    };
    match golden::compare_output(entry, &golden_output) {
        Ok(distance) => {
            log::info!(
                "{provider_label} golden self-test for '{model_file}' passed \
                 ({} {distance:.2e})",
                entry.metric.label()
            );
            Ok(())
        }
        Err(reason) => {
            log::error!(
                "{provider_label} golden self-test failed for '{model_file}': {reason}; \
                 falling back to the next execution provider"
            );
            Err(MlError::Ort(format!(
                "golden self-test failed for '{model_file}': {reason}"
            )))
        }
    }
}

fn model_file_label(model_path: &str) -> &str {
    Path::new(model_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(model_path)
}

fn has_protobuf_parse_failure(errors: &[String]) -> bool {
    errors.iter().any(|error| {
        error
            .to_ascii_lowercase()
            .contains("protobuf parsing failed")
    })
}

struct ProviderAttempt {
    providers: Vec<ExecutionProviderDispatch>,
    disable_intra_op_spinning: bool,
    coreml_cache_dir: Option<PathBuf>,
    uses_webgpu: bool,
    execution_provider: ExecutionProvider,
}

impl ProviderAttempt {
    fn cpu_only() -> Self {
        Self {
            providers: vec![CPU::default().with_arena_allocator(true).build()],
            disable_intra_op_spinning: false,
            coreml_cache_dir: None,
            uses_webgpu: false,
            execution_provider: ExecutionProvider::Cpu,
        }
    }
}

fn provider_attempt(
    provider: ExecutionProvider,
    _model_path: &str,
    _model_namespace: &str,
) -> ProviderAttempt {
    match provider {
        ExecutionProvider::Cpu => ProviderAttempt::cpu_only(),
        #[cfg(any(target_os = "ios", target_os = "macos"))]
        ExecutionProvider::CoreMl => {
            let (coreml_provider, coreml_cache_dir) =
                coreml_provider(_model_path, _model_namespace);
            ProviderAttempt {
                providers: vec![
                    coreml_provider,
                    CPU::default().with_arena_allocator(true).build(),
                ],
                disable_intra_op_spinning: false,
                coreml_cache_dir,
                uses_webgpu: false,
                execution_provider: ExecutionProvider::CoreMl,
            }
        }
        #[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
        ExecutionProvider::WebGpu => ProviderAttempt {
            providers: webgpu_attempt_providers(),
            disable_intra_op_spinning: true,
            coreml_cache_dir: None,
            uses_webgpu: true,
            execution_provider: ExecutionProvider::WebGpu,
        },
        #[cfg(target_os = "android")]
        ExecutionProvider::Xnnpack => xnnpack_attempt(),
        #[allow(unreachable_patterns)]
        _ => unreachable!("provider is not available on this platform"),
    }
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn platform_default_providers(model_path: &str) -> Vec<ExecutionProvider> {
    let mut providers = Vec::new();
    if golden_entry_required(model_path, "CoreML") {
        providers.push(ExecutionProvider::CoreMl);
    }
    providers.push(ExecutionProvider::Cpu);
    providers
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn coreml_provider(
    model_path: &str,
    model_namespace: &str,
) -> (ExecutionProviderDispatch, Option<PathBuf>) {
    let mut provider = CoreML::default()
        .with_model_format(ModelFormat::MLProgram)
        .with_compute_units(ComputeUnits::All)
        .with_specialization_strategy(SpecializationStrategy::Default);

    let mut prepared_cache_dir = None;
    if ENABLE_PERSISTENT_COREML_CACHE {
        match coreml_cache::prepare_directory(model_path, model_namespace) {
            Ok(cache_dir) => {
                provider = provider.with_model_cache_dir(cache_dir.to_string_lossy());
                prepared_cache_dir = Some(cache_dir);
            }
            Err(error) => {
                log::warn!(
                    "failed to prepare persistent CoreML cache for '{}'; continuing without it: {error}",
                    model_file_label(model_path)
                );
            }
        }
    } else {
        coreml_cache::remove(model_path);
    }

    (provider.build().error_on_failure(), prepared_cache_dir)
}

#[cfg(target_os = "android")]
fn platform_default_providers(model_path: &str) -> Vec<ExecutionProvider> {
    let mut providers = Vec::new();
    if webgpu::attempt_permitted(model_path) && golden_entry_required(model_path, "WebGPU") {
        providers.push(ExecutionProvider::WebGpu);
    }
    providers.push(ExecutionProvider::Xnnpack);
    providers.push(ExecutionProvider::Cpu);
    providers
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn platform_default_providers(model_path: &str) -> Vec<ExecutionProvider> {
    let mut providers = Vec::new();
    if webgpu::attempt_permitted(model_path) && golden_entry_required(model_path, "WebGPU") {
        providers.push(ExecutionProvider::WebGpu);
    }
    providers.push(ExecutionProvider::Cpu);
    providers
}

// Missing goldens fail closed, usually indicating they were not regenerated
// after an update.
#[cfg(any(
    target_os = "android",
    target_os = "ios",
    target_os = "linux",
    target_os = "macos",
    target_os = "windows"
))]
fn golden_entry_required(model_path: &str, provider_label: &str) -> bool {
    if golden::lookup(model_path).is_some() {
        return true;
    }
    log::error!(
        "no golden self-test entry for '{}'; {provider_label} disabled for this model",
        model_file_label(model_path)
    );
    false
}

#[cfg(any(target_os = "android", target_os = "linux", target_os = "windows"))]
fn webgpu_provider() -> ExecutionProviderDispatch {
    let provider = WebGPU::default().with_preferred_layout(PreferredLayout::NCHW);
    #[cfg(any(target_os = "android", target_os = "linux"))]
    let provider = provider.with_dawn_backend_type(DawnBackendType::Vulkan);
    #[cfg(target_os = "windows")]
    let provider = provider.with_dawn_backend_type(DawnBackendType::D3D12);
    provider.build().error_on_failure()
}

#[cfg(target_os = "android")]
fn webgpu_attempt_providers() -> Vec<ExecutionProviderDispatch> {
    vec![
        webgpu_provider(),
        xnnpack_provider().fail_silently(),
        CPU::default().with_arena_allocator(true).build(),
    ]
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn webgpu_attempt_providers() -> Vec<ExecutionProviderDispatch> {
    vec![
        webgpu_provider(),
        CPU::default().with_arena_allocator(true).build(),
    ]
}

#[cfg(not(any(
    target_os = "ios",
    target_os = "android",
    target_os = "linux",
    target_os = "macos",
    target_os = "windows"
)))]
fn platform_default_providers(_model_path: &str) -> Vec<ExecutionProvider> {
    vec![ExecutionProvider::Cpu]
}

#[cfg(target_os = "android")]
fn xnnpack_provider() -> ExecutionProviderDispatch {
    XNNPACK::default()
        .with_intra_op_num_threads(NonZeroUsize::new(4).expect("four is non-zero"))
        .build()
        .error_on_failure()
}

#[cfg(target_os = "android")]
fn xnnpack_attempt() -> ProviderAttempt {
    ProviderAttempt {
        providers: vec![
            xnnpack_provider(),
            CPU::default().with_arena_allocator(true).build(),
        ],
        disable_intra_op_spinning: true,
        coreml_cache_dir: None,
        uses_webgpu: false,
        execution_provider: ExecutionProvider::Xnnpack,
    }
}

fn build_session_with_providers(model_path: &str, attempt: ProviderAttempt) -> MlResult<Session> {
    let mut builder = Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::All)?
        .with_intra_threads(1)?
        .with_inter_threads(1)?;

    if attempt.disable_intra_op_spinning {
        builder = builder.with_intra_op_spinning(false)?;
    }
    builder = builder.with_execution_providers(attempt.providers)?;

    let session = builder.commit_from_file(model_path)?;
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::{
        ExecutionMode, ExecutionProvider, ProviderPlan, has_protobuf_parse_failure,
        is_execution_provider_run_failure, provider_attempt_failure_message,
    };

    #[test]
    fn provider_plan_resumes_after_the_concrete_selected_provider() {
        let mut plan = ProviderPlan {
            providers: vec![
                ExecutionProvider::WebGpu,
                ExecutionProvider::Xnnpack,
                ExecutionProvider::Cpu,
            ],
            next: 0,
            selected: None,
        };

        assert_eq!(plan.next_provider(), Some(ExecutionProvider::WebGpu));
        assert_eq!(plan.next_provider(), Some(ExecutionProvider::Xnnpack));
        plan.select(ExecutionProvider::Xnnpack);

        assert_eq!(plan.selected_provider(), Some(ExecutionProvider::Xnnpack));
        assert!(plan.has_fallback());
        assert_eq!(plan.next_provider(), Some(ExecutionProvider::Cpu));
        assert!(!plan.has_fallback());
    }

    #[test]
    fn cpu_only_provider_plan_is_bounded() {
        let mut plan = ProviderPlan::new(ExecutionMode::CpuOnly, "model.onnx");

        assert_eq!(plan.next_provider(), Some(ExecutionProvider::Cpu));
        assert_eq!(plan.next_provider(), None);
        assert!(!plan.has_fallback());
    }

    #[test]
    fn exhausted_provider_plan_retries_only_the_final_provider() {
        let mut plan = ProviderPlan {
            providers: vec![
                ExecutionProvider::WebGpu,
                ExecutionProvider::Xnnpack,
                ExecutionProvider::Cpu,
            ],
            next: 0,
            selected: None,
        };

        while plan.next_provider().is_some() {}
        plan.retain_last_provider_for_retry();

        assert_eq!(plan.next_provider(), Some(ExecutionProvider::Cpu));
        assert_eq!(plan.next_provider(), None);
    }

    #[test]
    fn classifies_only_provider_related_ort_run_failures_as_retryable() {
        assert!(is_execution_provider_run_failure(&super::MlError::Ort(
            "WebGPU EP error: VK_ERROR_DEVICE_LOST".to_string()
        )));
        assert!(!is_execution_provider_run_failure(&super::MlError::Ort(
            "invalid tensor shape".to_string()
        )));
        assert!(!is_execution_provider_run_failure(
            &super::MlError::Postprocess("WebGPU".to_string())
        ));

        let terminal = super::SessionRunError::from(super::MlError::Ort(
            "WebGPU text from a typed terminal error".to_string(),
        ));
        assert!(!terminal.is_retryable());
    }

    #[test]
    fn detects_protobuf_parse_failure() {
        assert!(has_protobuf_parse_failure(&[String::from(
            "Load model failed:Protobuf parsing failed.",
        )]));
    }

    #[test]
    fn ignores_other_onnx_errors() {
        assert!(!has_protobuf_parse_failure(&[String::from(
            "Load model failed: missing initializer",
        )]));
    }

    #[test]
    fn reports_accelerated_provider_attempt_failures_with_model_context() {
        let error = super::MlError::Ort("provider registration failed".to_string());
        let message = provider_attempt_failure_message(
            ExecutionProvider::CoreMl,
            "/models/face.onnx",
            "session construction",
            &error,
        )
        .unwrap();

        assert!(message.contains("CoreML session construction failed"));
        assert!(message.contains("'face.onnx'"));
        assert!(message.contains("provider registration failed"));
        assert!(message.contains("falling back"));
    }

    #[test]
    fn does_not_report_final_cpu_construction_failure_as_a_fallback() {
        let error = super::MlError::Ort("session construction failed".to_string());

        assert!(
            provider_attempt_failure_message(
                ExecutionProvider::Cpu,
                "/models/face.onnx",
                "session construction",
                &error,
            )
            .is_none()
        );
    }
}
