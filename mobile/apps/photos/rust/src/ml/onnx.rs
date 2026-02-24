use ort::{
    CPUExecutionProvider, ExecutionProviderDispatch, GraphOptimizationLevel, Session, Tensor,
};

#[cfg(target_vendor = "apple")]
use ort::CoreMLExecutionProvider;
#[cfg(target_os = "android")]
use ort::NNAPIExecutionProvider;

use crate::ml::{
    error::{MlError, MlResult},
    runtime::ExecutionProviderPolicy,
};

pub fn build_session(model_path: &str, policy: &ExecutionProviderPolicy) -> MlResult<Session> {
    let mut builder = Session::builder()?
        .with_optimization_level(GraphOptimizationLevel::Level3)?
        .with_intra_threads(1)?
        .with_inter_threads(1)?;

    let mut providers: Vec<ExecutionProviderDispatch> = Vec::new();

    #[cfg(target_vendor = "apple")]
    if policy.prefer_coreml {
        providers.push(CoreMLExecutionProvider::default().build());
    }

    #[cfg(target_os = "android")]
    if policy.prefer_nnapi {
        providers.push(NNAPIExecutionProvider::default().build());
    }

    if policy.allow_cpu_fallback {
        providers.push(CPUExecutionProvider::default().build());
    }

    if !providers.is_empty() {
        builder = builder.with_execution_providers(providers)?;
    }

    let session = builder.commit_from_file(model_path)?;
    Ok(session)
}

pub fn run_f32(
    session: &mut Session,
    input: Vec<f32>,
    input_shape: Vec<i64>,
) -> MlResult<(Vec<i64>, Vec<f32>)> {
    let input_tensor = Tensor::<f32>::from_array((input_shape, input))?;
    let outputs = session.run(ort::inputs![input_tensor]?)?;
    if outputs.len() == 0 {
        return Err(MlError::Ort("missing first output tensor".to_string()));
    }
    let output = &outputs[0];
    let tensor = output.try_extract_tensor::<f32>()?;
    let shape = tensor.shape().iter().map(|d| *d as i64).collect::<Vec<_>>();
    let data = tensor.iter().copied().collect::<Vec<_>>();
    Ok((shape, data))
}
