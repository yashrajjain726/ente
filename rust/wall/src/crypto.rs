use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use ente_core::crypto::{keys, secretbox};
use sha2::{Digest, Sha256};

use crate::error::{Result, WallError};
use crate::transport::EntityKeyPayload;

pub const SECRETBOX_NONCE_BYTES: usize = secretbox::NONCE_BYTES;

pub fn generate_key() -> Vec<u8> {
    keys::generate_key_secure().into_vec()
}

pub fn encode_b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

pub fn decode_b64(value: &str) -> Result<Vec<u8>> {
    Ok(STANDARD.decode(value.trim())?)
}

pub fn encode_b64_url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn decode_b64_url(value: &str) -> Result<Vec<u8>> {
    Ok(URL_SAFE_NO_PAD.decode(value.trim())?)
}

pub fn derive_labeled_key(secret: &[u8], label: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(secret);
    hasher.update(label.as_bytes());
    hasher.finalize().to_vec()
}

pub fn encrypt_secretbox_split(key: &[u8], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    let encrypted = secretbox::encrypt_with_key(plaintext, key)?;
    Ok((encrypted.ciphertext, encrypted.nonce))
}

pub fn decrypt_secretbox_split(key: &[u8], ciphertext: &[u8], nonce: &[u8]) -> Result<Vec<u8>> {
    if nonce.len() != SECRETBOX_NONCE_BYTES {
        return Err(WallError::InvalidInput(
            "invalid secretbox nonce length".into(),
        ));
    }
    secretbox::decrypt(ciphertext, nonce, key).map_err(Into::into)
}

pub fn encrypt_secretbox_packed(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    let (ciphertext, nonce) = encrypt_secretbox_split(key, plaintext)?;
    Ok(pack_payload(&ciphertext, &nonce))
}

pub fn decrypt_secretbox_packed(key: &[u8], packed: &[u8]) -> Result<Vec<u8>> {
    let (ciphertext, nonce) = unpack_payload(packed)?;
    decrypt_secretbox_split(key, &ciphertext, &nonce)
}

pub fn encrypt_entity_key(master_key: &[u8], plaintext: &[u8]) -> Result<EntityKeyPayload> {
    let (ciphertext, nonce) = encrypt_secretbox_split(master_key, plaintext)?;
    Ok(EntityKeyPayload {
        encrypted_key: encode_b64(&ciphertext),
        nonce: encode_b64(&nonce),
    })
}

pub fn decrypt_entity_key(master_key: &[u8], payload: &EntityKeyPayload) -> Result<Vec<u8>> {
    let ciphertext = decode_b64(&payload.encrypted_key)?;
    let nonce = decode_b64(&payload.nonce)?;
    decrypt_secretbox_split(master_key, &ciphertext, &nonce)
}

pub fn pack_payload(ciphertext: &[u8], nonce: &[u8]) -> Vec<u8> {
    if ciphertext.is_empty() && nonce.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(2 + nonce.len() + ciphertext.len());
    out.extend_from_slice(&(nonce.len() as u16).to_be_bytes());
    out.extend_from_slice(nonce);
    out.extend_from_slice(ciphertext);
    out
}

pub fn unpack_payload(packed: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    if packed.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    if packed.len() < 2 {
        return Err(WallError::InvalidInput("packed payload too short".into()));
    }
    let nonce_len = u16::from_be_bytes([packed[0], packed[1]]) as usize;
    if packed.len() < 2 + nonce_len {
        return Err(WallError::InvalidInput("packed payload truncated".into()));
    }
    Ok((
        packed[2 + nonce_len..].to_vec(),
        packed[2..2 + nonce_len].to_vec(),
    ))
}

pub fn encrypt_asset_payload(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    encrypt_secretbox_packed(key, plaintext)
}

pub fn decrypt_asset_payload(key: &[u8], payload: &[u8]) -> Result<Vec<u8>> {
    decrypt_secretbox_packed(key, payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packed_secretbox_round_trip() {
        let key = generate_key();
        let plaintext = b"hello wall";
        let packed = encrypt_secretbox_packed(&key, plaintext).unwrap();
        let decrypted = decrypt_secretbox_packed(&key, &packed).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn labeled_key_matches_frontend_ordering() {
        let secret = b"secret";
        let derived = derive_labeled_key(secret, "wall-link-login-v1");
        let expected = {
            let mut hasher = Sha256::new();
            hasher.update(secret);
            hasher.update(b"wall-link-login-v1");
            hasher.finalize().to_vec()
        };
        assert_eq!(derived, expected);
    }

    #[test]
    fn asset_round_trip() {
        let key = generate_key();
        let plaintext = b"asset-bytes";
        let encrypted = encrypt_asset_payload(&key, plaintext).unwrap();
        let decrypted = decrypt_asset_payload(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }
}
