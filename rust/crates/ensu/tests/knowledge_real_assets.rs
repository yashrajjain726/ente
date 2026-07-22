use std::env;
use std::fs;
use std::path::Path;

use ente_ensu::config::defaults;
use ente_ensu::llm::{Context, EmbeddingContextParams, Model, ModelLoadParams};
use ente_ensu::retrieval::RetrievalIndex;

const COMPATIBILITY_QUERY: &str = "how tall is mount everest";
const EXPECTED_TOP_TITLE: &str = "Mount Everest";

#[test]
fn pinned_embedding_and_pack_match_builder_top_hit() {
    let Some(model_path) = required_env("ENSU_KNOWLEDGE_EMBEDDING_GGUF") else {
        eprintln!("skipping real-asset test: ENSU_KNOWLEDGE_EMBEDDING_GGUF is unset");
        return;
    };
    let Some(pack_directory) = required_env("ENSU_KNOWLEDGE_PACK_DIR") else {
        eprintln!("skipping real-asset test: ENSU_KNOWLEDGE_PACK_DIR is unset");
        return;
    };
    let defaults = defaults();
    let embedding = defaults.knowledge_embedding;
    let model_metadata = fs::metadata(&model_path).expect("read embedding GGUF metadata");
    assert_eq!(model_metadata.len(), embedding.exact_size_bytes);
    let pack_identity = Path::new(&pack_directory)
        .file_name()
        .and_then(|name| name.to_str())
        .expect("pack directory has a UTF-8 identity");
    let dataset = defaults
        .knowledge_datasets
        .into_iter()
        .find(|dataset| {
            pack_identity == dataset.current_download_identity
                || pack_identity.starts_with(&format!("{}-", dataset.stable_id))
        })
        .expect("pack directory belongs to a bundled dataset");

    let model = Model::load(ModelLoadParams {
        model_path,
        n_gpu_layers: Some(0),
        use_mmap: Some(true),
        use_mlock: Some(false),
    })
    .expect("load pinned EmbeddingGemma");
    let context = Context::new_embedding(
        &model,
        EmbeddingContextParams {
            context_size: embedding.context_size,
            n_threads: None,
            batch_size: embedding.batch_size,
            micro_batch_size: embedding.micro_batch_size,
            source_dim: embedding.source_dim,
            dim: embedding.dim,
            query_prompt: embedding.query_prompt,
        },
    )
    .expect("create mean-pooled embedding context");
    let vector = context
        .embed(COMPATIBILITY_QUERY)
        .expect("embed real query");
    assert_eq!(vector.len(), 512);
    assert!(vector.iter().all(|value| value.is_finite()));
    let norm = vector
        .iter()
        .map(|value| f64::from(*value) * f64::from(*value))
        .sum::<f64>()
        .sqrt();
    assert!((norm - 1.0).abs() < 1e-5, "embedding norm was {norm}");

    let index = RetrievalIndex::open(pack_directory, &dataset).expect("open published pack");
    let hits = index
        .search(&vector, embedding.max_hits, dataset.relevance_threshold)
        .expect("search published pack");
    assert_eq!(
        hits.first().map(|hit| hit.title.as_str()),
        Some(EXPECTED_TOP_TITLE)
    );
}

fn required_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
