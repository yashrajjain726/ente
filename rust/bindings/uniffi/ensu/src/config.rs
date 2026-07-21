use ente_ensu::config;

#[derive(Debug, Clone, uniffi::Record)]
pub struct ConfigModelPreset {
    pub id: String,
    pub title: String,
    pub url: String,
    pub mmproj_url: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct KnowledgeEmbeddingConfig {
    pub model_url: String,
    pub target_id: String,
    pub exact_size_bytes: u64,
    pub source_dim: u32,
    pub dim: u32,
    pub query_prompt: String,
    pub context_size: u32,
    pub batch_size: u32,
    pub micro_batch_size: u32,
    pub max_hits: u32,
    pub max_context_utf8_bytes: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct AttributionConfig {
    pub credit: String,
    pub license_label: String,
    pub license_url: String,
    pub public_pack_url: String,
    pub build_provenance: String,
    pub modification_notice: String,
}

#[derive(Debug, Clone, uniffi::Record)]
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

#[derive(Debug, Clone, uniffi::Record)]
pub struct ConfigDefaults {
    pub mobile_system_prompt_body: String,
    pub desktop_system_prompt_body: String,
    pub system_prompt_date_placeholder: String,
    pub session_summary_system_prompt: String,
    pub mobile_default_model: ConfigModelPreset,
    pub mobile_model_presets: Vec<ConfigModelPreset>,
    pub desktop_default_model: ConfigModelPreset,
    pub desktop_model_presets: Vec<ConfigModelPreset>,
    pub transcription_model: ConfigModelPreset,
    pub voice_activity_model: ConfigModelPreset,
    pub knowledge_embedding: KnowledgeEmbeddingConfig,
    pub knowledge_datasets: Vec<KnowledgeDatasetConfig>,
}

impl From<config::ModelPreset> for ConfigModelPreset {
    fn from(value: config::ModelPreset) -> Self {
        Self {
            id: value.id,
            title: value.title,
            url: value.url,
            mmproj_url: value.mmproj_url,
        }
    }
}

impl From<config::KnowledgeEmbeddingConfig> for KnowledgeEmbeddingConfig {
    fn from(value: config::KnowledgeEmbeddingConfig) -> Self {
        Self {
            model_url: value.model_url,
            target_id: value.target_id,
            exact_size_bytes: value.exact_size_bytes,
            source_dim: value.source_dim,
            dim: value.dim,
            query_prompt: value.query_prompt,
            context_size: value.context_size,
            batch_size: value.batch_size,
            micro_batch_size: value.micro_batch_size,
            max_hits: value.max_hits,
            max_context_utf8_bytes: value.max_context_utf8_bytes,
        }
    }
}

impl From<config::AttributionConfig> for AttributionConfig {
    fn from(value: config::AttributionConfig) -> Self {
        Self {
            credit: value.credit,
            license_label: value.license_label,
            license_url: value.license_url,
            public_pack_url: value.public_pack_url,
            build_provenance: value.build_provenance,
            modification_notice: value.modification_notice,
        }
    }
}

impl From<AttributionConfig> for config::AttributionConfig {
    fn from(value: AttributionConfig) -> Self {
        Self {
            credit: value.credit,
            license_label: value.license_label,
            license_url: value.license_url,
            public_pack_url: value.public_pack_url,
            build_provenance: value.build_provenance,
            modification_notice: value.modification_notice,
        }
    }
}

impl From<config::KnowledgeDatasetConfig> for KnowledgeDatasetConfig {
    fn from(value: config::KnowledgeDatasetConfig) -> Self {
        Self {
            stable_id: value.stable_id,
            label: value.label,
            current_download_identity: value.current_download_identity,
            artifact_base_url: value.artifact_base_url,
            download_size_bytes: value.download_size_bytes,
            max_chars: value.max_chars,
            source_url_template: value.source_url_template,
            relevance_threshold: value.relevance_threshold,
            attribution: value.attribution.into(),
        }
    }
}

impl From<KnowledgeDatasetConfig> for config::KnowledgeDatasetConfig {
    fn from(value: KnowledgeDatasetConfig) -> Self {
        Self {
            stable_id: value.stable_id,
            label: value.label,
            current_download_identity: value.current_download_identity,
            artifact_base_url: value.artifact_base_url,
            download_size_bytes: value.download_size_bytes,
            max_chars: value.max_chars,
            source_url_template: value.source_url_template,
            relevance_threshold: value.relevance_threshold,
            attribution: value.attribution.into(),
        }
    }
}

impl From<config::Defaults> for ConfigDefaults {
    fn from(value: config::Defaults) -> Self {
        Self {
            mobile_system_prompt_body: value.mobile_system_prompt_body,
            desktop_system_prompt_body: value.desktop_system_prompt_body,
            system_prompt_date_placeholder: value.system_prompt_date_placeholder,
            session_summary_system_prompt: value.session_summary_system_prompt,
            mobile_default_model: value.mobile_default_model.into(),
            mobile_model_presets: value
                .mobile_model_presets
                .into_iter()
                .map(Into::into)
                .collect(),
            desktop_default_model: value.desktop_default_model.into(),
            desktop_model_presets: value
                .desktop_model_presets
                .into_iter()
                .map(Into::into)
                .collect(),
            transcription_model: value.transcription_model.into(),
            voice_activity_model: value.voice_activity_model.into(),
            knowledge_embedding: value.knowledge_embedding.into(),
            knowledge_datasets: value
                .knowledge_datasets
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}

#[uniffi::export]
pub fn config_defaults() -> ConfigDefaults {
    config::defaults().into()
}
