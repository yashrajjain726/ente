use ente_ensu::config;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreset {
    id: String,
    title: String,
    url: String,
    sha256: String,
    mmproj_url: Option<String>,
    mmproj_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedModelPolicy {
    default_model: ModelPreset,
    visible_models: Vec<ModelPreset>,
    allowed_preferred_models: Vec<ModelPreset>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Defaults {
    mobile_system_prompt_body: String,
    desktop_system_prompt_body: String,
    system_prompt_date_placeholder: String,
    session_summary_system_prompt: String,
    mobile_default_model: ModelPreset,
    mobile_model_presets: Vec<ModelPreset>,
    desktop_default_model: ModelPreset,
    desktop_model_presets: Vec<ModelPreset>,
}

impl From<config::ModelPreset> for ModelPreset {
    fn from(p: config::ModelPreset) -> Self {
        Self {
            id: p.id,
            title: p.title,
            url: p.url,
            sha256: p.sha256,
            mmproj_url: p.mmproj_url,
            mmproj_sha256: p.mmproj_sha256,
        }
    }
}

impl From<config::ResolvedModelPolicy> for ResolvedModelPolicy {
    fn from(value: config::ResolvedModelPolicy) -> Self {
        Self {
            default_model: value.default_model.into(),
            visible_models: value.visible_models.into_iter().map(Into::into).collect(),
            allowed_preferred_models: value
                .allowed_preferred_models
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}

impl From<config::Defaults> for Defaults {
    fn from(d: config::Defaults) -> Self {
        Self {
            mobile_system_prompt_body: d.mobile_system_prompt_body,
            desktop_system_prompt_body: d.desktop_system_prompt_body,
            system_prompt_date_placeholder: d.system_prompt_date_placeholder,
            session_summary_system_prompt: d.session_summary_system_prompt,
            mobile_default_model: d.mobile_default_model.into(),
            mobile_model_presets: d.mobile_model_presets.into_iter().map(Into::into).collect(),
            desktop_default_model: d.desktop_default_model.into(),
            desktop_model_presets: d
                .desktop_model_presets
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}

#[tauri::command]
pub fn config_defaults() -> Defaults {
    config::defaults().into()
}

#[tauri::command]
pub fn desktop_model_policy(total_memory_bytes: Option<u64>) -> ResolvedModelPolicy {
    config::resolve_model_policy(config::ModelRuntimeSurface::Desktop, total_memory_bytes).into()
}
