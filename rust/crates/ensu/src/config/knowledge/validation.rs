use std::collections::HashSet;

use url::Url;

use super::{
    EMBEDDING_CONTEXT_SIZE, KNOWLEDGE_LICENSE_LABEL, KNOWLEDGE_LICENSE_URL, KnowledgeConfigError,
    KnowledgeDatasetConfig, KnowledgeEmbeddingConfig, MAX_CONTEXT_UTF8_BYTES, MAX_HITS,
    knowledge_index_contract,
};

const MAX_DATASETS: usize = 32;
const MAX_PATH_COMPONENT_BYTES: usize = 96;
const MAX_DISPLAY_BYTES: usize = 256;
const MAX_URL_BYTES: usize = 2_048;
const MAX_PROVENANCE_BYTES: usize = 4_096;

pub fn validate_knowledge_datasets(
    datasets: &[KnowledgeDatasetConfig],
) -> Result<(), KnowledgeConfigError> {
    if !(1..=MAX_DATASETS).contains(&datasets.len()) {
        return Err(KnowledgeConfigError::invalid(
            "knowledge_datasets",
            format!("must contain between 1 and {MAX_DATASETS} records"),
        ));
    }

    let mut stable_ids = HashSet::with_capacity(datasets.len());
    let mut current_identities = HashSet::with_capacity(datasets.len());
    for (index, dataset) in datasets.iter().enumerate() {
        let prefix = format!("knowledge_datasets[{index}]");
        validate_path_component(&dataset.stable_id, &format!("{prefix}.stable_id"))?;
        if !stable_ids.insert(dataset.stable_id.as_str()) {
            return Err(KnowledgeConfigError::invalid(
                &format!("{prefix}.stable_id"),
                "must be unique",
            ));
        }

        validate_path_component(
            &dataset.current_download_identity,
            &format!("{prefix}.current_download_identity"),
        )?;
        if !current_identities.insert(dataset.current_download_identity.as_str()) {
            return Err(KnowledgeConfigError::invalid(
                &format!("{prefix}.current_download_identity"),
                "must be unique",
            ));
        }

        validate_display_text(&dataset.label, &format!("{prefix}.label"))?;
        validate_artifact_base_url(
            &dataset.artifact_base_url,
            &format!("{prefix}.artifact_base_url"),
        )?;
        if dataset.download_size_bytes <= 0 {
            return Err(KnowledgeConfigError::invalid(
                &format!("{prefix}.download_size_bytes"),
                "must be greater than zero",
            ));
        }
        validate_source_url_template(
            &dataset.source_url_template,
            &format!("{prefix}.source_url_template"),
        )?;
        if !(1..=4_096).contains(&dataset.max_chars) {
            return Err(KnowledgeConfigError::invalid(
                &format!("{prefix}.max_chars"),
                "must be between 1 and 4096",
            ));
        }
        if !dataset.relevance_threshold.is_finite()
            || !(0.0..=1.0).contains(&dataset.relevance_threshold)
        {
            return Err(KnowledgeConfigError::invalid(
                &format!("{prefix}.relevance_threshold"),
                "must be finite and between 0 and 1",
            ));
        }

        let attribution = &dataset.attribution;
        validate_display_text(&attribution.credit, &format!("{prefix}.attribution.credit"))?;
        validate_display_text(
            &attribution.license_label,
            &format!("{prefix}.attribution.license_label"),
        )?;
        validate_https_url(
            &attribution.license_url,
            &format!("{prefix}.attribution.license_url"),
        )?;
        if attribution.license_label != KNOWLEDGE_LICENSE_LABEL
            || attribution.license_url != KNOWLEDGE_LICENSE_URL
        {
            return Err(KnowledgeConfigError::invalid(
                &format!("{prefix}.attribution"),
                "must use the v1 CC BY-SA 4.0 license",
            ));
        }
        validate_https_url(
            &attribution.public_pack_url,
            &format!("{prefix}.attribution.public_pack_url"),
        )?;
        validate_provenance_text(
            &attribution.build_provenance,
            &format!("{prefix}.attribution.build_provenance"),
        )?;
        validate_provenance_text(
            &attribution.modification_notice,
            &format!("{prefix}.attribution.modification_notice"),
        )?;
    }

    Ok(())
}

pub fn validate_knowledge_embedding(
    config: &KnowledgeEmbeddingConfig,
    reserved_model_ids: &[String],
) -> Result<(), KnowledgeConfigError> {
    validate_path_component(&config.target_id, "knowledge_embedding.target_id")?;
    if config.target_id.starts_with("custom") {
        return Err(KnowledgeConfigError::invalid(
            "knowledge_embedding.target_id",
            "must not start with reserved prefix 'custom'",
        ));
    }
    if reserved_model_ids.iter().any(|id| id == &config.target_id) {
        return Err(KnowledgeConfigError::invalid(
            "knowledge_embedding.target_id",
            "must not alias another model target",
        ));
    }
    validate_embedding_model_url(&config.model_url, "knowledge_embedding.model_url")?;
    let contract = knowledge_index_contract();
    let exact_fields_match = config.source_dim == contract.source_dim
        && config.dim == contract.dim
        && config.matryoshka == contract.matryoshka
        && config.query_prompt == contract.query_prompt
        && config.context_size == EMBEDDING_CONTEXT_SIZE
        && config.batch_size == EMBEDDING_CONTEXT_SIZE
        && config.micro_batch_size == EMBEDDING_CONTEXT_SIZE
        && config.max_hits == MAX_HITS
        && config.max_context_utf8_bytes == MAX_CONTEXT_UTF8_BYTES;
    if !exact_fields_match {
        return Err(KnowledgeConfigError::invalid(
            "knowledge_embedding",
            "must match the v1 embedding and retrieval contract",
        ));
    }

    Ok(())
}

fn validate_path_component(value: &str, field: &str) -> Result<(), KnowledgeConfigError> {
    if is_path_safe_component(value) {
        Ok(())
    } else {
        Err(KnowledgeConfigError::invalid(
            field,
            "must be a path-safe 1-96 byte ASCII component",
        ))
    }
}

pub(crate) fn is_path_safe_component(value: &str) -> bool {
    let bytes = value.as_bytes();
    let valid_edge = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    let valid_body = |byte: u8| valid_edge(byte) || matches!(byte, b'.' | b'_' | b'-');
    !bytes.is_empty()
        && bytes.len() <= MAX_PATH_COMPONENT_BYTES
        && valid_edge(bytes[0])
        && valid_edge(bytes[bytes.len() - 1])
        && bytes.iter().copied().all(valid_body)
}

fn validate_display_text(value: &str, field: &str) -> Result<(), KnowledgeConfigError> {
    validate_text(value, field, MAX_DISPLAY_BYTES)
}

fn validate_provenance_text(value: &str, field: &str) -> Result<(), KnowledgeConfigError> {
    validate_text(value, field, MAX_PROVENANCE_BYTES)
}

fn validate_text(value: &str, field: &str, max_bytes: usize) -> Result<(), KnowledgeConfigError> {
    if value.trim().is_empty() || value.len() > max_bytes || value.chars().any(char::is_control) {
        Err(KnowledgeConfigError::invalid(
            field,
            format!("must be nonempty, control-free, and at most {max_bytes} UTF-8 bytes"),
        ))
    } else {
        Ok(())
    }
}

fn parse_https_url(value: &str, field: &str) -> Result<Url, KnowledgeConfigError> {
    if value.len() > MAX_URL_BYTES || value.chars().any(char::is_control) {
        return Err(KnowledgeConfigError::invalid(
            field,
            format!("must be control-free and at most {MAX_URL_BYTES} UTF-8 bytes"),
        ));
    }
    let url = Url::parse(value)
        .map_err(|error| KnowledgeConfigError::invalid(field, error.to_string()))?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(KnowledgeConfigError::invalid(
            field,
            "must be an HTTPS URL without credentials",
        ));
    }
    Ok(url)
}

fn validate_https_url(value: &str, field: &str) -> Result<(), KnowledgeConfigError> {
    parse_https_url(value, field).map(|_| ())
}

fn validate_source_url_template(value: &str, field: &str) -> Result<(), KnowledgeConfigError> {
    if value.len() > MAX_URL_BYTES {
        return Err(KnowledgeConfigError::invalid(
            field,
            format!("must be at most {MAX_URL_BYTES} UTF-8 bytes"),
        ));
    }
    if value.match_indices("{title}").count() != 1 {
        return Err(KnowledgeConfigError::invalid(
            field,
            "must contain exactly one {title} placeholder",
        ));
    }
    let without_title = value.replacen("{title}", "", 1);
    if without_title.contains(['{', '}']) {
        return Err(KnowledgeConfigError::invalid(
            field,
            "must not contain another brace-delimited placeholder",
        ));
    }
    parse_https_url(&value.replacen("{title}", "title", 1), field).map(|_| ())
}

pub(super) fn validate_artifact_base_url(
    value: &str,
    field: &str,
) -> Result<(), KnowledgeConfigError> {
    let url = parse_https_url(value, field)?;
    let segments = url
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .ok_or_else(|| KnowledgeConfigError::invalid(field, "must have path segments"))?;
    let pinned = url.host_str() == Some("huggingface.co")
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && value.ends_with('/')
        && segments.len() >= 8
        && segments[..4] == ["datasets", "ente-ai", "ensu-knowledge-packs", "resolve"]
        && is_commit_hash(segments[4]);
    if pinned {
        Ok(())
    } else {
        Err(KnowledgeConfigError::invalid(
            field,
            "must be an immutable Ente knowledge-pack resolver base URL",
        ))
    }
}

fn validate_embedding_model_url(value: &str, field: &str) -> Result<(), KnowledgeConfigError> {
    let url = parse_https_url(value, field)?;
    let segments = url
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .ok_or_else(|| KnowledgeConfigError::invalid(field, "must have path segments"))?;
    let pinned = url.host_str() == Some("huggingface.co")
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && segments.len() == 5
        && segments[..3] == ["ente-ai", "embeddinggemma-300m-gguf", "resolve"]
        && is_commit_hash(segments[3])
        && !segments[4].is_empty();
    if pinned {
        Ok(())
    } else {
        Err(KnowledgeConfigError::invalid(
            field,
            "must be an immutable Ente EmbeddingGemma resolver URL",
        ))
    }
}

fn is_commit_hash(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::super::{EMBEDDING_TARGET_ID, knowledge_datasets, knowledge_embedding_config};
    use super::*;

    fn valid_datasets() -> Vec<KnowledgeDatasetConfig> {
        knowledge_datasets()
    }

    #[test]
    fn rejects_empty_oversized_and_duplicate_catalogs() {
        assert!(validate_knowledge_datasets(&[]).is_err());

        let mut too_many = Vec::new();
        for index in 0..=MAX_DATASETS {
            let mut dataset = valid_datasets().remove(0);
            dataset.stable_id = format!("pack-{index}");
            dataset.current_download_identity = format!("revision-{index}");
            too_many.push(dataset);
        }
        assert!(validate_knowledge_datasets(&too_many).is_err());

        let mut duplicate = valid_datasets();
        duplicate[1].stable_id = duplicate[0].stable_id.clone();
        assert!(validate_knowledge_datasets(&duplicate).is_err());
        duplicate[1].stable_id = "wikibooks".to_owned();
        duplicate[1].current_download_identity = duplicate[0].current_download_identity.clone();
        assert!(validate_knowledge_datasets(&duplicate).is_err());
    }

    #[test]
    fn rejects_path_unsafe_ids_and_boundary_overflow() {
        for invalid in [
            "",
            ".",
            "..",
            "UPPER",
            "-starts",
            "ends-",
            "has/slash",
            " spaced ",
        ] {
            let mut datasets = valid_datasets();
            datasets[0].stable_id = invalid.to_owned();
            assert!(
                validate_knowledge_datasets(&datasets).is_err(),
                "accepted {invalid:?}"
            );
        }

        let mut datasets = valid_datasets();
        datasets[0].stable_id = format!("a{}z", "b".repeat(MAX_PATH_COMPONENT_BYTES - 2));
        validate_knowledge_datasets(&datasets).unwrap();
        datasets[0].stable_id.push('z');
        assert!(validate_knowledge_datasets(&datasets).is_err());
    }

    #[test]
    fn rejects_invalid_dataset_strings_numbers_and_urls() {
        let mut datasets = valid_datasets();
        datasets[0].label = "\u{0000}".to_owned();
        assert!(validate_knowledge_datasets(&datasets).is_err());

        let mut datasets = valid_datasets();
        datasets[0].attribution.build_provenance = "x".repeat(MAX_PROVENANCE_BYTES + 1);
        assert!(validate_knowledge_datasets(&datasets).is_err());

        let mut datasets = valid_datasets();
        datasets[0].max_chars = 0;
        assert!(validate_knowledge_datasets(&datasets).is_err());
        datasets[0].max_chars = 4_097;
        assert!(validate_knowledge_datasets(&datasets).is_err());

        let mut datasets = valid_datasets();
        datasets[0].download_size_bytes = 0;
        assert!(validate_knowledge_datasets(&datasets).is_err());
        datasets[0].download_size_bytes = -1;
        assert!(validate_knowledge_datasets(&datasets).is_err());

        let mut datasets = valid_datasets();
        datasets[0].relevance_threshold = f32::NAN;
        assert!(validate_knowledge_datasets(&datasets).is_err());
        datasets[0].relevance_threshold = 1.01;
        assert!(validate_knowledge_datasets(&datasets).is_err());

        let mut datasets = valid_datasets();
        datasets[0].artifact_base_url = datasets[0].artifact_base_url.replace(
            "/resolve/a13b90e443dcdc1561ac777ea17ee6ed4703e35f/",
            "/resolve/main/",
        );
        assert!(validate_knowledge_datasets(&datasets).is_err());

        let mut datasets = valid_datasets();
        datasets[0].source_url_template = "http://example.com/{title}/{section}".to_owned();
        assert!(validate_knowledge_datasets(&datasets).is_err());
    }

    #[test]
    fn rejects_invalid_embedding_contract_and_model_aliases() {
        let mut config = knowledge_embedding_config();
        config.target_id = "custom-embedding".to_owned();
        assert!(validate_knowledge_embedding(&config, &[]).is_err());

        let mut config = knowledge_embedding_config();
        assert!(validate_knowledge_embedding(&config, &[config.target_id.clone()]).is_err());
        config.target_id = EMBEDDING_TARGET_ID.to_owned();
        config.model_url = config
            .model_url
            .replace("957b55764bd672f51240ac026e3a23ac9459ee3c", "main");
        assert!(validate_knowledge_embedding(&config, &[]).is_err());

        let mut config = knowledge_embedding_config();
        config.dim = 768;
        assert!(validate_knowledge_embedding(&config, &[]).is_err());
    }
}
