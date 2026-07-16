use ort::{
    ep::{CPU, ExecutionProviderDispatch},
    session::{Session, builder::GraphOptimizationLevel},
    value::{Tensor, TensorElementType, TensorRef, ValueType},
};
use std::{
    cell::OnceCell,
    path::{Path, PathBuf},
};

use half::prelude::{HalfFloatSliceExt, HalfFloatVecExt};

#[cfg(target_os = "android")]
use ort::ep::XNNPACK;
#[cfg(target_os = "ios")]
use ort::ep::{
    CoreML,
    coreml::{ComputeUnits, ModelFormat, SpecializationStrategy},
};
#[cfg(target_os = "android")]
use std::num::NonZeroUsize;

use crate::ml::error::{MlError, MlResult};

#[cfg(any(target_os = "ios", test))]
const COREML_CACHE_SCHEMA: &str = "ort-1_27-mlprogram-all-default-v1";
const COREML_CACHE_COMPLETE_MARKER: &str = ".ente-cache-complete";

/// An f32 model input that can be borrowed by multiple sessions.
///
/// The FP16 representation is created lazily and retained so that a shared
/// preprocessing result only pays the conversion cost once.
pub(crate) struct PreparedF32Input {
    f32_data: Vec<f32>,
    f16_data: OnceCell<Vec<half::f16>>,
}

#[derive(Clone, Copy)]
pub(crate) enum BorrowedFloatTensor<'a> {
    F32(&'a [f32]),
    F16(&'a [half::f16]),
}

pub(crate) trait FloatTensorData: Copy {
    fn len(self) -> usize;
    fn value(self, index: usize) -> f32;
}

impl FloatTensorData for &[f32] {
    fn len(self) -> usize {
        <[f32]>::len(self)
    }

    #[inline]
    fn value(self, index: usize) -> f32 {
        self[index]
    }
}

impl FloatTensorData for &[half::f16] {
    fn len(self) -> usize {
        <[half::f16]>::len(self)
    }

    #[inline]
    fn value(self, index: usize) -> f32 {
        self[index].to_f32()
    }
}

impl PreparedF32Input {
    pub(crate) fn new(data: Vec<f32>) -> Self {
        Self {
            f32_data: data,
            f16_data: OnceCell::new(),
        }
    }

    fn f16_data(&self) -> &[half::f16] {
        self.f16_data
            .get_or_init(|| Vec::<half::f16>::from_f32_slice(&self.f32_data))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ExecutionMode {
    PlatformDefault,
    CpuOnly,
}

pub(crate) fn build_session(
    model_path: &str,
    mode: ExecutionMode,
    coreml_cache_namespace: &str,
) -> MlResult<Session> {
    let primary = provider_attempt(mode, model_path, coreml_cache_namespace);
    let retry_with_cpu_only = primary.retry_with_cpu_only;
    let mut attempts = vec![primary];
    if retry_with_cpu_only {
        attempts.push(ProviderAttempt::cpu_only());
    }

    let mut errors = Vec::new();
    for attempt in attempts {
        let coreml_cache_dir = attempt.coreml_cache_dir.clone();
        match build_session_with_providers(model_path, attempt) {
            Ok(session) => {
                if let Some(cache_dir) = coreml_cache_dir
                    && let Err(error) = mark_coreml_cache_complete(&cache_dir)
                {
                    eprintln!(
                        "[ml][rt] failed to mark CoreML cache complete at '{}': {error}",
                        cache_dir.display()
                    );
                }
                return Ok(session);
            }
            Err(error) => {
                if let Some(cache_dir) = coreml_cache_dir
                    && let Err(cleanup_error) = invalidate_coreml_cache(&cache_dir)
                {
                    eprintln!(
                        "[ml][rt] failed to invalidate CoreML cache at '{}' after session construction failed: {cleanup_error}",
                        cache_dir.display()
                    );
                }
                errors.push(format!("{error}"));
            }
        }
    }

    if has_protobuf_parse_failure(&errors) {
        return Err(MlError::CorruptModel(model_path.to_string()));
    }

    Err(MlError::Ort(format!(
        "failed to create ONNX session for model '{model_path}' across EP fallbacks: {}",
        errors.join(" | ")
    )))
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
    retry_with_cpu_only: bool,
    disable_intra_op_spinning: bool,
    coreml_cache_dir: Option<PathBuf>,
}

impl ProviderAttempt {
    fn cpu_only() -> Self {
        Self {
            providers: vec![CPU::default().with_arena_allocator(true).build()],
            retry_with_cpu_only: false,
            disable_intra_op_spinning: false,
            coreml_cache_dir: None,
        }
    }
}

fn provider_attempt(
    mode: ExecutionMode,
    model_path: &str,
    coreml_cache_namespace: &str,
) -> ProviderAttempt {
    match mode {
        ExecutionMode::PlatformDefault => {
            platform_default_attempt(model_path, coreml_cache_namespace)
        }
        ExecutionMode::CpuOnly => ProviderAttempt::cpu_only(),
    }
}

#[cfg(target_os = "ios")]
fn platform_default_attempt(model_path: &str, coreml_cache_namespace: &str) -> ProviderAttempt {
    let (coreml_provider, coreml_cache_dir) = coreml_provider(model_path, coreml_cache_namespace);
    ProviderAttempt {
        providers: vec![
            coreml_provider,
            CPU::default().with_arena_allocator(true).build(),
        ],
        retry_with_cpu_only: true,
        disable_intra_op_spinning: false,
        coreml_cache_dir,
    }
}

#[cfg(target_os = "ios")]
fn coreml_provider(
    model_path: &str,
    cache_namespace: &str,
) -> (ExecutionProviderDispatch, Option<PathBuf>) {
    let mut provider = CoreML::default()
        .with_model_format(ModelFormat::MLProgram)
        .with_compute_units(ComputeUnits::All)
        .with_specialization_strategy(SpecializationStrategy::Default);

    let mut prepared_cache_dir = None;
    match prepare_coreml_cache_directory(model_path, cache_namespace) {
        Ok(cache_dir) => {
            provider = provider.with_model_cache_dir(cache_dir.to_string_lossy());
            prepared_cache_dir = Some(cache_dir);
        }
        Err(error) => {
            eprintln!(
                "[ml][rt] failed to prepare persistent CoreML cache for '{model_path}'; continuing without it: {error}"
            );
        }
    }

    (provider.build().error_on_failure(), prepared_cache_dir)
}

#[cfg(target_os = "android")]
fn platform_default_attempt(_model_path: &str, _coreml_cache_namespace: &str) -> ProviderAttempt {
    ProviderAttempt {
        providers: vec![
            xnnpack_provider(),
            CPU::default().with_arena_allocator(true).build(),
        ],
        retry_with_cpu_only: true,
        disable_intra_op_spinning: true,
        coreml_cache_dir: None,
    }
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn platform_default_attempt(_model_path: &str, _coreml_cache_namespace: &str) -> ProviderAttempt {
    ProviderAttempt::cpu_only()
}

#[cfg(target_os = "ios")]
fn prepare_coreml_cache_directory(
    model_path: &str,
    cache_namespace: &str,
) -> std::io::Result<PathBuf> {
    let model_path = Path::new(model_path);
    let model_cache_root =
        coreml_cache_root(model_path).join(sanitize_cache_component(cache_namespace));
    std::fs::create_dir_all(&model_cache_root)?;

    let cache_key = coreml_model_cache_key(model_path)?;
    prune_superseded_coreml_cache_directories(&model_cache_root, &cache_key)?;

    let cache_dir = model_cache_root.join(cache_key);
    prepare_coreml_cache_entry(&cache_dir)?;
    Ok(cache_dir)
}

/// A missing completion marker means the process stopped before ONNX Runtime
/// finished constructing the session. Recreate the directory so ORT cannot
/// mistake a partial model package for a valid cache hit.
#[cfg(any(target_os = "ios", test))]
fn prepare_coreml_cache_entry(cache_dir: &Path) -> std::io::Result<()> {
    if cache_dir.exists() && !coreml_cache_complete_marker(cache_dir).is_file() {
        std::fs::remove_dir_all(cache_dir)?;
    }
    std::fs::create_dir_all(cache_dir)
}

fn mark_coreml_cache_complete(cache_dir: &Path) -> std::io::Result<()> {
    std::fs::write(coreml_cache_complete_marker(cache_dir), [])
}

fn invalidate_coreml_cache(cache_dir: &Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(cache_dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn coreml_cache_complete_marker(cache_dir: &Path) -> PathBuf {
    cache_dir.join(COREML_CACHE_COMPLETE_MARKER)
}

/// Keep generated CoreML artifacts in Library/Caches so iOS can evict them and
/// exclude them from backups. Model files are stored below Library/Application
/// Support; fall back to the process temporary directory for unusual layouts.
#[cfg(any(target_os = "ios", test))]
fn coreml_cache_root(model_path: &Path) -> PathBuf {
    let cache_base = model_path
        .ancestors()
        .find(|ancestor| ancestor.file_name().is_some_and(|name| name == "Library"))
        .map(|library| library.join("Caches"))
        .unwrap_or_else(std::env::temp_dir);

    cache_base
        .join("ente")
        .join("ml")
        .join("coreml")
        .join(COREML_CACHE_SCHEMA)
}

/// Include the filename and file metadata in the directory name because ONNX
/// Runtime's internal CoreML cache key does not necessarily change when only
/// model weights change.
#[cfg(any(target_os = "ios", test))]
fn coreml_model_cache_key(model_path: &Path) -> std::io::Result<String> {
    use std::time::UNIX_EPOCH;

    let metadata = std::fs::metadata(model_path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    Ok(format!(
        "{}-{}-{}-{}",
        sanitize_cache_component(
            model_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("model")
        ),
        metadata.len(),
        modified.as_secs(),
        modified.subsec_nanos()
    ))
}

#[cfg(any(target_os = "ios", test))]
fn sanitize_cache_component(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

/// Retain exactly one generated cache for each logical model slot. The active
/// directory is identity-specific so ONNX Runtime cannot reuse stale output.
#[cfg(any(target_os = "ios", test))]
fn prune_superseded_coreml_cache_directories(
    model_cache_root: &Path,
    current_cache_key: &str,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(model_cache_root)? {
        let entry = entry?;
        if entry.file_name() == current_cache_key || !entry.file_type()?.is_dir() {
            continue;
        }
        std::fs::remove_dir_all(entry.path())?;
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn xnnpack_provider() -> ExecutionProviderDispatch {
    XNNPACK::default()
        .with_intra_op_num_threads(NonZeroUsize::new(4).expect("four is non-zero"))
        .build()
        .error_on_failure()
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

/// Returns true if the session's first input expects FP16 tensors.
fn session_expects_f16(session: &Session) -> bool {
    session
        .inputs()
        .first()
        .and_then(|i| match i.dtype() {
            ValueType::Tensor { ty, .. } => Some(*ty == TensorElementType::Float16),
            _ => None,
        })
        .unwrap_or(false)
}

/// Run inference accepting f32 data and returning f32 results.
/// Automatically converts inputs/outputs for FP16 models.
pub(crate) fn run_f32<const N: usize>(
    session: &mut Session,
    input: Vec<f32>,
    input_shape: [i64; N],
) -> MlResult<(Vec<i64>, Vec<f32>)> {
    let outputs = if session_expects_f16(session) {
        let f16_input = Vec::<half::f16>::from_f32_slice(&input);
        let input_tensor = Tensor::<half::f16>::from_array((input_shape, f16_input))?;
        session.run(ort::inputs![input_tensor])?
    } else {
        let input_tensor = Tensor::<f32>::from_array((input_shape, input))?;
        session.run(ort::inputs![input_tensor])?
    };

    if outputs.len() == 0 {
        return Err(MlError::Ort("missing first output tensor".to_string()));
    }
    let output = &outputs[0];

    // Extract output: try f32 first, fall back to f16 with conversion.
    if let Ok((tensor_shape, tensor_data)) = output.try_extract_tensor::<f32>() {
        let shape = tensor_shape.iter().copied().collect::<Vec<_>>();
        let data = tensor_data.to_vec();
        Ok((shape, data))
    } else {
        let (tensor_shape, tensor_data) = output.try_extract_tensor::<half::f16>()?;
        let shape = tensor_shape.iter().copied().collect::<Vec<_>>();
        let mut data = vec![0.0; tensor_data.len()];
        tensor_data.convert_to_f32_slice(&mut data);
        Ok((shape, data))
    }
}

/// Run inference using a reusable input and process the first output in place.
/// Both f32 and f16 outputs remain borrowed from ONNX Runtime; consumers
/// convert only the values they inspect.
pub(crate) fn with_prepared_float_output<const N: usize, T>(
    session: &mut Session,
    input: &PreparedF32Input,
    input_shape: [i64; N],
    consume: impl FnOnce(&[i64], BorrowedFloatTensor<'_>) -> MlResult<T>,
) -> MlResult<T> {
    let outputs = if session_expects_f16(session) {
        let input_tensor =
            TensorRef::<half::f16>::from_array_view((input_shape, input.f16_data()))?;
        session.run(ort::inputs![input_tensor])?
    } else {
        let input_tensor =
            TensorRef::<f32>::from_array_view((input_shape, input.f32_data.as_slice()))?;
        session.run(ort::inputs![input_tensor])?
    };

    if outputs.len() == 0 {
        return Err(MlError::Ort("missing first output tensor".to_string()));
    }
    let output = &outputs[0];
    if let Ok((tensor_shape, tensor_data)) = output.try_extract_tensor::<f32>() {
        consume(tensor_shape, BorrowedFloatTensor::F32(tensor_data))
    } else {
        let (tensor_shape, tensor_data) = output.try_extract_tensor::<half::f16>()?;
        consume(tensor_shape, BorrowedFloatTensor::F16(tensor_data))
    }
}

pub(crate) fn run_i32_f32<const N: usize>(
    session: &mut Session,
    input: &[i32],
    input_shape: [i64; N],
) -> MlResult<(Vec<i64>, Vec<f32>)> {
    let input_tensor = TensorRef::<i32>::from_array_view((input_shape, input))?;
    let outputs = session.run(ort::inputs![input_tensor])?;
    if outputs.len() == 0 {
        return Err(MlError::Ort("missing first output tensor".to_string()));
    }
    let output = &outputs[0];
    let (tensor_shape, tensor_data) = output.try_extract_tensor::<f32>()?;
    let shape = tensor_shape.iter().copied().collect::<Vec<_>>();
    let data = tensor_data.to_vec();
    Ok((shape, data))
}

#[cfg(test)]
mod tests {
    use std::{io::Write, path::Path};

    use super::{
        coreml_cache_root, coreml_model_cache_key, has_protobuf_parse_failure,
        invalidate_coreml_cache, mark_coreml_cache_complete, prepare_coreml_cache_entry,
        prune_superseded_coreml_cache_directories, sanitize_cache_component,
    };

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
    fn places_coreml_cache_in_library_caches() {
        let model = Path::new(
            "/var/mobile/Containers/Data/Application/APP/Library/Application Support/assets/model.onnx",
        );

        assert_eq!(
            coreml_cache_root(model),
            Path::new(
                "/var/mobile/Containers/Data/Application/APP/Library/Caches/ente/ml/coreml/ort-1_27-mlprogram-all-default-v1"
            )
        );
    }

    #[test]
    fn coreml_cache_key_changes_when_model_file_changes() {
        let mut model = tempfile::NamedTempFile::new().unwrap();
        model.write_all(b"first").unwrap();
        model.flush().unwrap();
        let first_key = coreml_model_cache_key(model.path()).unwrap();

        model.write_all(b" version").unwrap();
        model.flush().unwrap();
        let second_key = coreml_model_cache_key(model.path()).unwrap();

        assert_ne!(first_key, second_key);
    }

    #[test]
    fn sanitizes_coreml_cache_component() {
        assert_eq!(
            sanitize_cache_component("model name.onnx"),
            "model_name.onnx"
        );
    }

    #[test]
    fn prunes_only_superseded_directories_for_one_model() {
        let root = tempfile::tempdir().unwrap();
        let old_cache = root.path().join("old");
        let current_cache = root.path().join("current");
        std::fs::create_dir(&old_cache).unwrap();
        std::fs::create_dir(&current_cache).unwrap();
        std::fs::write(root.path().join("marker"), b"keep").unwrap();

        prune_superseded_coreml_cache_directories(root.path(), "current").unwrap();

        assert!(!old_cache.exists());
        assert!(current_cache.exists());
        assert!(root.path().join("marker").exists());
    }

    #[test]
    fn replaces_an_incomplete_coreml_cache_entry() {
        let root = tempfile::tempdir().unwrap();
        let cache_dir = root.path().join("current");
        std::fs::create_dir(&cache_dir).unwrap();
        let partial_artifact = cache_dir.join("partial.mlmodelc");
        std::fs::write(&partial_artifact, b"partial").unwrap();

        prepare_coreml_cache_entry(&cache_dir).unwrap();

        assert!(cache_dir.is_dir());
        assert!(!partial_artifact.exists());
    }

    #[test]
    fn preserves_a_completed_coreml_cache_entry() {
        let root = tempfile::tempdir().unwrap();
        let cache_dir = root.path().join("current");
        std::fs::create_dir(&cache_dir).unwrap();
        let artifact = cache_dir.join("model.mlmodelc");
        std::fs::write(&artifact, b"complete").unwrap();
        mark_coreml_cache_complete(&cache_dir).unwrap();

        prepare_coreml_cache_entry(&cache_dir).unwrap();

        assert!(artifact.exists());
    }

    #[test]
    fn invalidates_a_failed_coreml_cache_entry() {
        let root = tempfile::tempdir().unwrap();
        let cache_dir = root.path().join("current");
        std::fs::create_dir(&cache_dir).unwrap();

        invalidate_coreml_cache(&cache_dir).unwrap();

        assert!(!cache_dir.exists());
        invalidate_coreml_cache(&cache_dir).unwrap();
    }
}
