use base64::{Engine, engine::general_purpose::STANDARD};
use ente_core::crypto::{hash, kdf, keys, secretbox};

use crate::error::{Result, WallError};
use crate::transport::EntityKeyPayload;

pub const SECRETBOX_NONCE_BYTES: usize = secretbox::NONCE_BYTES;
pub const SECRETBOX_MAC_BYTES: usize = secretbox::MAC_BYTES;
pub const PACKED_SECRETBOX_OVERHEAD_BYTES: usize = 2 + SECRETBOX_NONCE_BYTES + SECRETBOX_MAC_BYTES;
const WALL_LINK_ACCESS_KEY_LEN: usize = 12;
const WALL_LINK_ACCESS_KEY_ALPHABET: &[u8] =
    b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

pub fn generate_key() -> Vec<u8> {
    keys::generate_key_secure().into_vec()
}

pub fn generate_wall_link_access_key() -> Result<String> {
    let seed = generate_key();
    let mut input = Vec::with_capacity(seed.len() + 32);
    input.extend_from_slice(b"ente.wall.link.access-key.random.v1");
    input.push(0);
    input.extend_from_slice(&seed);
    wall_link_access_key_from_hash_input(&input)
}

fn wall_link_access_key_from_hash_input(input: &[u8]) -> Result<String> {
    let max_unbiased_value = 256 - (256 % WALL_LINK_ACCESS_KEY_ALPHABET.len());
    let mut out = String::with_capacity(WALL_LINK_ACCESS_KEY_LEN);
    let mut counter = 0u8;

    while out.len() < WALL_LINK_ACCESS_KEY_LEN {
        let mut hash_input = Vec::with_capacity(input.len() + 1);
        hash_input.extend_from_slice(input);
        hash_input.push(counter);
        let digest = hash::hash(&hash_input, Some(64), None)?;
        for value in digest {
            if usize::from(value) >= max_unbiased_value {
                continue;
            }
            out.push(char::from(
                WALL_LINK_ACCESS_KEY_ALPHABET
                    [usize::from(value) % WALL_LINK_ACCESS_KEY_ALPHABET.len()],
            ));
            if out.len() == WALL_LINK_ACCESS_KEY_LEN {
                break;
            }
        }
        counter = counter.wrapping_add(1);
    }

    Ok(out)
}

pub fn wall_link_access_key_material(access_key: &str) -> Result<Vec<u8>> {
    let trimmed = access_key.trim();
    let is_base62 = trimmed
        .bytes()
        .all(|value| WALL_LINK_ACCESS_KEY_ALPHABET.contains(&value));
    if trimmed.len() != WALL_LINK_ACCESS_KEY_LEN || !is_base62 {
        return Err(WallError::InvalidInput(
            "invalid wall link access key".into(),
        ));
    }
    hash::hash_default(trimmed.as_bytes()).map_err(Into::into)
}

pub fn encode_b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

pub fn decode_b64(value: &str) -> Result<Vec<u8>> {
    Ok(STANDARD.decode(value.trim())?)
}

pub fn derive_wall_link_auth_key(access_key: &[u8]) -> Result<Vec<u8>> {
    Ok(kdf::derive_subkey(
        access_key,
        kdf::KEY_BYTES,
        1,
        b"wallauth",
    )?)
}

pub fn derive_wall_link_wrap_key(access_key: &[u8]) -> Result<Vec<u8>> {
    Ok(kdf::derive_subkey(
        access_key,
        kdf::KEY_BYTES,
        2,
        b"wallview",
    )?)
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
        header: encode_b64(&nonce),
    })
}

pub fn decrypt_entity_key(master_key: &[u8], payload: &EntityKeyPayload) -> Result<Vec<u8>> {
    let ciphertext = decode_b64(&payload.encrypted_key)?;
    let nonce = decode_b64(&payload.header)?;
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
    fn wall_link_keys_are_domain_separated() {
        let access_key = generate_key();
        let auth_key = derive_wall_link_auth_key(&access_key).unwrap();
        let wrap_key = derive_wall_link_wrap_key(&access_key).unwrap();
        assert_eq!(auth_key.len(), 32);
        assert_eq!(wrap_key.len(), 32);
        assert_ne!(auth_key, wrap_key);
    }

    #[test]
    fn generated_wall_link_access_key_is_short_base62() {
        let access_key = generate_wall_link_access_key().unwrap();
        let repeated = generate_wall_link_access_key().unwrap();
        assert_eq!(access_key.len(), 12);
        assert!(
            access_key
                .bytes()
                .all(|value| value.is_ascii_alphanumeric())
        );
        assert_ne!(access_key, repeated);

        let material = wall_link_access_key_material(&access_key).unwrap();
        assert_eq!(material.len(), 32);
    }

    #[test]
    fn wall_link_access_key_rejects_legacy_b64_url_key() {
        let old_key = "LqUerMGZjrvdfkd6TayOiDa9pM0pYeGcakjhhsB47Hc";
        assert!(wall_link_access_key_material(old_key).is_err());
    }

    #[test]
    fn wall_link_key_derivation_matches_vector() {
        let access_key = vec![0; 32];
        assert_eq!(
            encode_b64(&derive_wall_link_auth_key(&access_key).unwrap()),
            "Vj1NGLC2X6YPxt/RpB2Pt2DibpaKwM2iKeoonH2tnxo="
        );
        assert_eq!(
            encode_b64(&derive_wall_link_wrap_key(&access_key).unwrap()),
            "Ve3f8d1w//hbEJWhVdLtA8fgd47JbBmQARnuZ7lKSj4="
        );
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
