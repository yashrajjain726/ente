use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

#[derive(Clone, Serialize, Deserialize)]
pub struct Documents {
    #[serde(with = "bytes")]
    pub original: Vec<u8>,
    #[serde(with = "optional_bytes")]
    pub public: Option<Vec<u8>>,
    #[serde(with = "optional_bytes")]
    pub private: Option<Vec<u8>>,
    #[serde(with = "optional_bytes")]
    pub shared: Option<Vec<u8>>,
}

mod bytes {
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&ente_core::b64::encode(bytes))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
        ente_core::b64::decode(&String::deserialize(deserializer)?).map_err(D::Error::custom)
    }
}

mod optional_bytes {
    use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error};

    pub fn serialize<S: Serializer>(
        bytes: &Option<Vec<u8>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        bytes
            .as_deref()
            .map(ente_core::b64::encode)
            .serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Vec<u8>>, D::Error> {
        Option::<String>::deserialize(deserializer)?
            .map(|text| ente_core::b64::decode(&text).map_err(D::Error::custom))
            .transpose()
    }
}

pub(crate) mod key {
    use ente_core::crypto::Key;
    use serde::{Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(key: &Key, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&ente_core::b64::encode(key.as_bytes()))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Key, D::Error> {
        Key::try_from_slice(&super::bytes::deserialize(deserializer)?).map_err(D::Error::custom)
    }
}

pub(crate) mod header {
    use ente_core::crypto::Header;
    use serde::{Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(header: &Header, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&ente_core::b64::encode(header.as_bytes()))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Header, D::Error> {
        Header::try_from_slice(&super::bytes::deserialize(deserializer)?).map_err(D::Error::custom)
    }
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
