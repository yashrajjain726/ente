use ente_core::{b64, crypto};
use ente_wasm_lib::crypto::Error;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(getter_with_clone)]
pub struct CryptoKeyPair {
    #[wasm_bindgen(readonly, js_name = publicKey)]
    pub public_key: String,
    #[wasm_bindgen(readonly, js_name = privateKey)]
    pub private_key: String,
}

#[wasm_bindgen(js_name = cryptoGenerateKeyPair)]
pub fn crypto_generate_keypair() -> CryptoKeyPair {
    let secret_key = crypto::SecretKey::generate();
    CryptoKeyPair {
        public_key: b64::encode(secret_key.public_key().as_bytes()),
        private_key: b64::encode(secret_key.as_bytes()),
    }
}

#[wasm_bindgen(js_name = cryptoDeriveSubKey)]
pub fn crypto_derive_subkey(
    key_b64: &str,
    subkey_len: usize,
    subkey_id: u64,
    context: &str,
) -> Result<String, Error> {
    let key = b64::decode(key_b64)?;
    let context: [u8; 8] = context.as_bytes().try_into().map_err(|_| {
        crypto::Error::InvalidKeyDerivationParams("KDF context must be exactly 8 bytes".into())
    })?;
    let subkey = crypto::kdf::derive_subkey(
        &crypto::Key::try_from_slice(&key)?,
        subkey_len,
        subkey_id,
        &context,
    )?;
    Ok(b64::encode(&subkey))
}
