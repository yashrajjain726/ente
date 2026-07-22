mod validation;

use thiserror::Error;

pub(crate) use validation::is_path_safe_component;
pub(crate) use validation::{validate_knowledge_datasets, validate_knowledge_embedding};

pub(crate) const KNOWLEDGE_LICENSE_LABEL: &str = "CC BY-SA 4.0";
pub(crate) const KNOWLEDGE_LICENSE_URL: &str = "https://creativecommons.org/licenses/by-sa/4.0/";

pub(crate) const KNOWLEDGE_MANIFEST_FILE: &str = "manifest.json";
pub(crate) const KNOWLEDGE_VECTORS_FILE: &str = "vectors.i8";
pub(crate) const KNOWLEDGE_META_FILE: &str = "meta.zst";
pub(crate) const KNOWLEDGE_OFFSETS_FILE: &str = "meta.offsets";
pub(crate) const KNOWLEDGE_ARTIFACT_FILENAMES: [&str; 4] = [
    KNOWLEDGE_MANIFEST_FILE,
    KNOWLEDGE_VECTORS_FILE,
    KNOWLEDGE_META_FILE,
    KNOWLEDGE_OFFSETS_FILE,
];

const EMBEDDING_MODEL_IDENTITY: &str =
    "ggml-org/embeddinggemma-300M-GGUF:embeddinggemma-300M-Q8_0.gguf";
const DOCUMENT_PROMPT: &str = "title: {title} | text: {text}";
const QUERY_PROMPT: &str = "task: search result | query: {query}";
const EMBEDDING_MODEL_URL: &str = "https://huggingface.co/ente-ai/embeddinggemma-300m-gguf/resolve/957b55764bd672f51240ac026e3a23ac9459ee3c/embeddinggemma-300M-Q8_0.gguf";
const EMBEDDING_TARGET_ID: &str = "embeddinggemma-300m-q8-0";
const SOURCE_DIM: u32 = 768;
const RETRIEVAL_DIM: u32 = 512;
const EMBEDDING_CONTEXT_SIZE: u32 = 2_048;
const MAX_HITS: u32 = 3;
const MAX_CONTEXT_UTF8_BYTES: u32 = 6_000;
const MODIFICATION_NOTICE: &str = "Adapted by Ente";

#[derive(Debug, Clone, PartialEq)]
pub struct KnowledgeEmbeddingConfig {
    pub model_url: String,
    pub target_id: String,
    pub source_dim: u32,
    pub dim: u32,
    pub matryoshka: bool,
    pub query_prompt: String,
    pub context_size: u32,
    pub batch_size: u32,
    pub micro_batch_size: u32,
    pub max_hits: u32,
    pub max_context_utf8_bytes: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AttributionConfig {
    pub credit: String,
    pub license_label: String,
    pub license_url: String,
    pub public_pack_url: String,
    pub build_provenance: String,
    pub modification_notice: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct KnowledgeDatasetConfig {
    pub stable_id: String,
    pub label: String,
    pub current_download_identity: String,
    pub artifact_base_url: String,
    pub download_size_bytes: i64,
    pub max_chars: u32,
    pub source_url_template: String,
    pub relevance_threshold: f32,
    pub attribution: AttributionConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeIndexContract {
    pub model: String,
    pub source_dim: u32,
    pub matryoshka: bool,
    pub doc_prompt: String,
    pub query_prompt: String,
    pub dim: u32,
    pub quant: String,
    pub scale: u32,
    pub meta_codec: String,
    pub meta_rows_per_block: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{0}")]
pub struct KnowledgeConfigError(String);

impl KnowledgeConfigError {
    fn invalid(field: &str, reason: impl AsRef<str>) -> Self {
        Self(format!("invalid {field}: {}", reason.as_ref()))
    }
}

pub(crate) fn knowledge_index_contract() -> KnowledgeIndexContract {
    KnowledgeIndexContract {
        model: EMBEDDING_MODEL_IDENTITY.to_owned(),
        source_dim: SOURCE_DIM,
        matryoshka: true,
        doc_prompt: DOCUMENT_PROMPT.to_owned(),
        query_prompt: QUERY_PROMPT.to_owned(),
        dim: RETRIEVAL_DIM,
        quant: "int8".to_owned(),
        scale: 127,
        meta_codec: "zstd-blocks".to_owned(),
        meta_rows_per_block: 128,
    }
}

pub(crate) fn knowledge_embedding_config() -> KnowledgeEmbeddingConfig {
    let contract = knowledge_index_contract();
    KnowledgeEmbeddingConfig {
        model_url: EMBEDDING_MODEL_URL.to_owned(),
        target_id: EMBEDDING_TARGET_ID.to_owned(),
        source_dim: contract.source_dim,
        dim: contract.dim,
        matryoshka: contract.matryoshka,
        query_prompt: contract.query_prompt,
        context_size: EMBEDDING_CONTEXT_SIZE,
        batch_size: EMBEDDING_CONTEXT_SIZE,
        micro_batch_size: EMBEDDING_CONTEXT_SIZE,
        max_hits: MAX_HITS,
        max_context_utf8_bytes: MAX_CONTEXT_UTF8_BYTES,
    }
}

pub(crate) fn knowledge_datasets() -> Vec<KnowledgeDatasetConfig> {
    vec![
        KnowledgeDatasetConfig {
            stable_id: "simplewiki".to_owned(),
            label: "Simple English Wikipedia".to_owned(),
            current_download_identity: "simplewiki-2026-07-02".to_owned(),
            artifact_base_url: "https://huggingface.co/datasets/ente-ai/ensu-knowledge-packs/resolve/a13b90e443dcdc1561ac777ea17ee6ed4703e35f/simplewiki/data/".to_owned(),
            download_size_bytes: 167_849_446,
            max_chars: 600,
            source_url_template: "https://simple.wikipedia.org/wiki/{title}".to_owned(),
            relevance_threshold: 0.46,
            attribution: AttributionConfig {
                credit: "Simple English Wikipedia contributors".to_owned(),
                license_label: KNOWLEDGE_LICENSE_LABEL.to_owned(),
                license_url: KNOWLEDGE_LICENSE_URL.to_owned(),
                public_pack_url: "https://huggingface.co/datasets/ente-ai/ensu-knowledge-packs/tree/a13b90e443dcdc1561ac777ea17ee6ed4703e35f/simplewiki".to_owned(),
                build_provenance: "Simple English Wikipedia dump dated 2026-07-02".to_owned(),
                modification_notice: MODIFICATION_NOTICE.to_owned(),
            },
        },
        KnowledgeDatasetConfig {
            stable_id: "wikibooks".to_owned(),
            label: "Wikibooks".to_owned(),
            current_download_identity: "enwikibooks-2026-07-02".to_owned(),
            artifact_base_url: "https://huggingface.co/datasets/ente-ai/ensu-knowledge-packs/resolve/a13b90e443dcdc1561ac777ea17ee6ed4703e35f/wikibooks/data/".to_owned(),
            download_size_bytes: 202_595_475,
            max_chars: 1_400,
            source_url_template: "https://en.wikibooks.org/wiki/{title}".to_owned(),
            relevance_threshold: 0.50,
            attribution: AttributionConfig {
                credit: "Wikibooks contributors".to_owned(),
                license_label: KNOWLEDGE_LICENSE_LABEL.to_owned(),
                license_url: KNOWLEDGE_LICENSE_URL.to_owned(),
                public_pack_url: "https://huggingface.co/datasets/ente-ai/ensu-knowledge-packs/tree/a13b90e443dcdc1561ac777ea17ee6ed4703e35f/wikibooks".to_owned(),
                build_provenance: "English Wikibooks dump dated 2026-07-02".to_owned(),
                modification_notice: MODIFICATION_NOTICE.to_owned(),
            },
        },
    ]
}

pub(crate) fn knowledge_artifact_urls(
    dataset: &KnowledgeDatasetConfig,
) -> Result<[String; 4], KnowledgeConfigError> {
    validation::validate_artifact_base_url(&dataset.artifact_base_url, "artifact_base_url")?;
    Ok(KNOWLEDGE_ARTIFACT_FILENAMES.map(|name| format!("{}{name}", dataset.artifact_base_url)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artifact_urls_append_only_fixed_names() {
        let urls = knowledge_artifact_urls(&knowledge_datasets()[0]).unwrap();
        assert_eq!(
            urls.each_ref()
                .map(|url| url.rsplit('/').next().unwrap().to_owned()),
            KNOWLEDGE_ARTIFACT_FILENAMES.map(str::to_owned)
        );
        assert!(urls.iter().all(|url| {
            url.contains("/resolve/a13b90e443dcdc1561ac777ea17ee6ed4703e35f/simplewiki/data/")
        }));
    }

    #[test]
    fn pinned_catalog_and_embedding_are_valid() {
        let datasets = knowledge_datasets();
        validate_knowledge_datasets(&datasets).unwrap();
        let embedding = knowledge_embedding_config();
        validate_knowledge_embedding(&embedding, &[]).unwrap();

        assert_eq!(datasets.len(), 2);
        assert_eq!(datasets[0].stable_id, "simplewiki");
        assert_eq!(datasets[1].stable_id, "wikibooks");
        assert!(
            datasets
                .iter()
                .all(|dataset| dataset.attribution.modification_notice == "Adapted by Ente")
        );
        assert_eq!(datasets[0].download_size_bytes, 167_849_446);
        assert_eq!(datasets[1].download_size_bytes, 202_595_475);
        assert_eq!(knowledge_index_contract().source_dim, 768);
        assert_eq!(knowledge_index_contract().dim, 512);
    }
}
