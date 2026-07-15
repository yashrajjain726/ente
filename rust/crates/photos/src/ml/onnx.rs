use ort::{
    ep::{CPU, ExecutionProviderDispatch},
    session::{Session, builder::GraphOptimizationLevel},
    value::{Tensor, TensorElementType, TensorRef, ValueType},
};
use std::cell::OnceCell;

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

/// An f32 model input that can be borrowed by multiple sessions.
///
/// The FP16 representation is created lazily and retained so that a shared
/// preprocessing result only pays the conversion cost once.
pub(crate) struct PreparedF32Input {
    f32_data: Vec<f32>,
    f16_data: OnceCell<Vec<half::f16>>,
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

pub(crate) fn build_session(model_path: &str, mode: ExecutionMode) -> MlResult<Session> {
    let primary = provider_attempt(mode);
    let retry_with_cpu_only = primary.retry_with_cpu_only;
    let mut attempts = vec![primary];
    if retry_with_cpu_only {
        attempts.push(ProviderAttempt::cpu_only());
    }

    let mut errors = Vec::new();
    for attempt in attempts {
        match build_session_with_providers(model_path, attempt) {
            Ok(session) => return Ok(session),
            Err(error) => errors.push(format!("{error}")),
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
}

impl ProviderAttempt {
    fn cpu_only() -> Self {
        Self {
            providers: vec![CPU::default().with_arena_allocator(true).build()],
            retry_with_cpu_only: false,
            disable_intra_op_spinning: false,
        }
    }
}

fn provider_attempt(mode: ExecutionMode) -> ProviderAttempt {
    match mode {
        ExecutionMode::PlatformDefault => platform_default_attempt(),
        ExecutionMode::CpuOnly => ProviderAttempt::cpu_only(),
    }
}

#[cfg(target_os = "ios")]
fn platform_default_attempt() -> ProviderAttempt {
    ProviderAttempt {
        providers: vec![
            CoreML::default()
                .with_model_format(ModelFormat::MLProgram)
                .with_compute_units(ComputeUnits::All)
                .with_specialization_strategy(SpecializationStrategy::Default)
                .build()
                .error_on_failure(),
            CPU::default().with_arena_allocator(true).build(),
        ],
        retry_with_cpu_only: true,
        disable_intra_op_spinning: false,
    }
}

#[cfg(target_os = "android")]
fn platform_default_attempt() -> ProviderAttempt {
    ProviderAttempt {
        providers: vec![
            xnnpack_provider(),
            CPU::default().with_arena_allocator(true).build(),
        ],
        retry_with_cpu_only: true,
        disable_intra_op_spinning: true,
    }
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn platform_default_attempt() -> ProviderAttempt {
    ProviderAttempt::cpu_only()
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
pub fn run_f32<const N: usize>(
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
///
/// Native f32 output is borrowed directly from ONNX Runtime. FP16 output uses
/// a temporary f32 conversion buffer because postprocessing operates on f32.
pub(crate) fn with_prepared_f32_output<const N: usize, T>(
    session: &mut Session,
    input: &PreparedF32Input,
    input_shape: [i64; N],
    consume: impl FnOnce(&[i64], &[f32]) -> MlResult<T>,
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
        consume(tensor_shape, tensor_data)
    } else {
        let (tensor_shape, tensor_data) = output.try_extract_tensor::<half::f16>()?;
        let mut data = vec![0.0; tensor_data.len()];
        tensor_data.convert_to_f32_slice(&mut data);
        consume(tensor_shape, &data)
    }
}

pub fn run_i32_f32<const N: usize>(
    session: &mut Session,
    input: Vec<i32>,
    input_shape: [i64; N],
) -> MlResult<(Vec<i64>, Vec<f32>)> {
    let input_tensor = Tensor::<i32>::from_array((input_shape, input))?;
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
    use super::has_protobuf_parse_failure;

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
}
