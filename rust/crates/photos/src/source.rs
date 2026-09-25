use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

#[derive(Clone, Serialize, Deserialize)]
pub struct Documents {
    pub original: Vec<u8>,
    pub public: Option<Vec<u8>>,
    pub private: Option<Vec<u8>>,
    pub shared: Option<Vec<u8>>,
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct MetadataError(pub &'static str);

pub fn parse<T: DeserializeOwned>(bytes: &[u8], context: &'static str) -> Result<T, MetadataError> {
    serde_json::from_slice(bytes).map_err(|_| MetadataError(context))
}

pub fn optional<T: DeserializeOwned + Default>(
    bytes: Option<&[u8]>,
    context: &'static str,
) -> Result<T, MetadataError> {
    bytes
        .map(|bytes| parse(bytes, context))
        .transpose()
        .map(Option::unwrap_or_default)
}

pub fn unfamiliar(bytes: Option<&[u8]>, known: &[&str], warnings: &mut Vec<String>) {
    if let Some(bytes) = bytes
        && let Ok(Value::Object(fields)) = serde_json::from_slice(bytes)
    {
        for key in fields.keys() {
            if !known.contains(&key.as_str()) {
                warnings.push(key.clone());
            }
        }
    }
}
