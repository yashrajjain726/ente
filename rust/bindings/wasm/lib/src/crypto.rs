use ente_core::{b64, crypto};
use wasm_bindgen::prelude::*;

#[cfg(feature = "crypto-file")]
mod file;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Crypto(#[from] crypto::Error),
    #[error(transparent)]
    Decode(#[from] b64::DecodeError),
}

impl Error {
    fn name(&self) -> Option<&'static str> {
        match self {
            Self::Crypto(crypto::Error::StreamTruncated) => Some("stream_truncated"),
            _ => None,
        }
    }

    fn message(&self) -> String {
        ente_core::error::chain(self)
    }
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        let js_error = js_sys::Error::new(&error.message());
        if let Some(name) = error.name() {
            js_error.set_name(name);
        }
        js_error.into()
    }
}

#[wasm_bindgen(js_name = cryptoGenerateKey)]
pub fn crypto_generate_key() -> String {
    b64::encode(crypto::Key::generate().as_bytes())
}

#[wasm_bindgen(getter_with_clone)]
pub struct EncryptedBox {
    #[wasm_bindgen(readonly, js_name = encryptedData)]
    pub encrypted_data: String,
    #[wasm_bindgen(readonly)]
    pub nonce: String,
}

#[wasm_bindgen(js_name = cryptoEncryptBox)]
pub fn crypto_encrypt_box(data_b64: &str, key_b64: &str) -> Result<EncryptedBox, Error> {
    let data = b64::decode(data_b64)?;
    let key = b64::decode(key_b64)?;

    let out = crypto::secretbox::encrypt(&data, &crypto::Key::try_from_slice(&key)?);

    Ok(EncryptedBox {
        encrypted_data: b64::encode(&out.encrypted_data),
        nonce: b64::encode(out.nonce.as_bytes()),
    })
}

#[wasm_bindgen(js_name = cryptoDecryptBox)]
pub fn crypto_decrypt_box(
    encrypted_data_b64: &str,
    nonce_b64: &str,
    key_b64: &str,
) -> Result<String, Error> {
    let ciphertext = b64::decode(encrypted_data_b64)?;
    let nonce = b64::decode(nonce_b64)?;
    let key = b64::decode(key_b64)?;

    let plaintext = crypto::secretbox::decrypt(
        &ciphertext,
        &crypto::Nonce::try_from_slice(&nonce)?,
        &crypto::Key::try_from_slice(&key)?,
    )?;
    Ok(b64::encode(&plaintext))
}

#[cfg(feature = "crypto-seal")]
#[wasm_bindgen(js_name = cryptoBoxSeal)]
pub fn crypto_box_seal(data_b64: &str, recipient_public_key_b64: &str) -> Result<String, Error> {
    let data = b64::decode(data_b64)?;
    let pk = b64::decode(recipient_public_key_b64)?;
    let sealed = crypto::sealed::seal(&data, &crypto::PublicKey::try_from_slice(&pk)?)?;
    Ok(b64::encode(&sealed))
}

#[wasm_bindgen(js_name = cryptoBoxSealOpen)]
pub fn crypto_box_seal_open(
    sealed_b64: &str,
    recipient_public_key_b64: &str,
    recipient_secret_key_b64: &str,
) -> Result<String, Error> {
    let sealed = b64::decode(sealed_b64)?;
    let pk = b64::decode(recipient_public_key_b64)?;
    let sk = b64::decode(recipient_secret_key_b64)?;
    let opened = crypto::sealed::open(
        &sealed,
        &crypto::PublicKey::try_from_slice(&pk)?,
        &crypto::SecretKey::try_from_slice(&sk)?,
    )?;
    Ok(b64::encode(&opened))
}
