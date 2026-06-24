use ente_core::crypto::{
    Key, Nonce, PublicKey, SecretKey, blob, encode_b64, hash, kdf, sealed, secretbox,
};
use md5::{Digest, Md5};

use crate::error::{Result, SpaceError};

pub(crate) const SECRETBOX_PAYLOAD_OVERHEAD_BYTES: usize = Nonce::BYTES + secretbox::MAC_BYTES;
pub(crate) const ASSET_PAYLOAD_OVERHEAD_BYTES: usize = blob::HEADER_BYTES + blob::ABYTES;
const SPACE_LINK_ACCESS_KEY_LEN: usize = 12;
const SPACE_LINK_ACCESS_KEY_ALPHABET: &[u8] =
    b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SPACE_LINK_AUTH_KDF_CONTEXT: &[u8; kdf::CONTEXT_BYTES] = b"spcauth1";
const SPACE_LINK_WRAP_KDF_CONTEXT: &[u8; kdf::CONTEXT_BYTES] = b"spcview1";

pub(crate) fn generate_key() -> Vec<u8> {
    Key::generate().as_bytes().to_vec()
}

pub(crate) fn generate_keypair() -> Result<(Vec<u8>, Vec<u8>)> {
    let secret_key = SecretKey::generate();
    let public_key = secret_key.public_key();
    Ok((
        public_key.as_bytes().to_vec(),
        secret_key.as_bytes().to_vec(),
    ))
}

pub(crate) fn seal_with_public_key(plaintext: &[u8], public_key: &[u8]) -> Result<Vec<u8>> {
    let public_key = PublicKey::try_from_slice(public_key)?;
    sealed::seal(plaintext, &public_key).map_err(Into::into)
}

pub(crate) fn open_with_keypair(
    ciphertext: &[u8],
    public_key: &[u8],
    secret_key: &[u8],
) -> Result<Vec<u8>> {
    let public_key = PublicKey::try_from_slice(public_key)?;
    let secret_key = SecretKey::try_from_slice(secret_key)?;
    sealed::open(ciphertext, &public_key, &secret_key).map_err(Into::into)
}

pub(crate) fn generate_space_link_access_key() -> Result<String> {
    let seed = generate_key();
    let mut input = Vec::with_capacity(seed.len() + 32);
    input.extend_from_slice(b"ente.space.link.access-key.random.v1");
    input.push(0);
    input.extend_from_slice(&seed);
    space_link_access_key_from_hash_input(&input)
}

fn space_link_access_key_from_hash_input(input: &[u8]) -> Result<String> {
    let max_unbiased_value = 256 - (256 % SPACE_LINK_ACCESS_KEY_ALPHABET.len());
    let mut out = String::with_capacity(SPACE_LINK_ACCESS_KEY_LEN);
    let mut counter = 0u8;

    while out.len() < SPACE_LINK_ACCESS_KEY_LEN {
        let mut hash_input = Vec::with_capacity(input.len() + 1);
        hash_input.extend_from_slice(input);
        hash_input.push(counter);
        let digest = hash::hash(&hash_input, Some(64), None)?;
        for value in digest {
            if usize::from(value) >= max_unbiased_value {
                continue;
            }
            out.push(char::from(
                SPACE_LINK_ACCESS_KEY_ALPHABET
                    [usize::from(value) % SPACE_LINK_ACCESS_KEY_ALPHABET.len()],
            ));
            if out.len() == SPACE_LINK_ACCESS_KEY_LEN {
                break;
            }
        }
        counter = counter.wrapping_add(1);
    }

    Ok(out)
}

pub(crate) fn space_link_access_key_material(access_key: &str) -> Result<Vec<u8>> {
    let trimmed = access_key.trim();
    let is_base62 = trimmed
        .bytes()
        .all(|value| SPACE_LINK_ACCESS_KEY_ALPHABET.contains(&value));
    if trimmed.len() != SPACE_LINK_ACCESS_KEY_LEN || !is_base62 {
        return Err(SpaceError::InvalidInput(
            "invalid space link access key".into(),
        ));
    }
    hash::hash_default(trimmed.as_bytes()).map_err(Into::into)
}

pub(crate) fn content_md5_base64(bytes: &[u8]) -> String {
    let digest = Md5::digest(bytes);
    encode_b64(&digest)
}

pub(crate) fn derive_space_link_auth_key(access_key: &[u8]) -> Result<Vec<u8>> {
    let access_key = Key::try_from_slice(access_key)?;
    Ok(kdf::derive_subkey(&access_key, kdf::KEY_BYTES, 1, SPACE_LINK_AUTH_KDF_CONTEXT)?.to_vec())
}

pub(crate) fn derive_space_link_wrap_key(access_key: &[u8]) -> Result<Vec<u8>> {
    let access_key = Key::try_from_slice(access_key)?;
    Ok(kdf::derive_subkey(&access_key, kdf::KEY_BYTES, 2, SPACE_LINK_WRAP_KDF_CONTEXT)?.to_vec())
}

pub(crate) fn encrypt_secretbox_payload(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    let key = Key::try_from_slice(key)?;
    Ok(secretbox::encrypt_combined(plaintext, &key))
}

pub(crate) fn decrypt_secretbox_payload(key: &[u8], payload: &[u8]) -> Result<Vec<u8>> {
    let key = Key::try_from_slice(key)?;
    secretbox::decrypt_combined(payload, &key).map_err(Into::into)
}

pub(crate) fn encrypt_asset_payload(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    let key = Key::try_from_slice(key)?;
    blob::encrypt_combined(plaintext, &key).map_err(Into::into)
}

pub(crate) fn decrypt_asset_payload(key: &[u8], payload: &[u8]) -> Result<Vec<u8>> {
    let key = Key::try_from_slice(key)?;
    blob::decrypt_combined(payload, &key).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secretbox_payload_round_trip() {
        let key = generate_key();
        let plaintext = b"hello space";
        let payload = encrypt_secretbox_payload(&key, plaintext).unwrap();
        let decrypted = decrypt_secretbox_payload(&key, &payload).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn space_link_keys_are_domain_separated() {
        let access_key = generate_key();
        let auth_key = derive_space_link_auth_key(&access_key).unwrap();
        let wrap_key = derive_space_link_wrap_key(&access_key).unwrap();
        assert_eq!(auth_key.len(), 32);
        assert_eq!(wrap_key.len(), 32);
        assert_ne!(auth_key, wrap_key);
    }

    #[test]
    fn generated_space_link_access_key_is_short_base62() {
        let access_key = generate_space_link_access_key().unwrap();
        let repeated = generate_space_link_access_key().unwrap();
        assert_eq!(access_key.len(), 12);
        assert!(
            access_key
                .bytes()
                .all(|value| value.is_ascii_alphanumeric())
        );
        assert_ne!(access_key, repeated);

        let material = space_link_access_key_material(&access_key).unwrap();
        assert_eq!(material.len(), 32);
    }

    #[test]
    fn space_link_access_key_rejects_legacy_b64_url_key() {
        let old_key = "LqUerMGZjrvdfkd6TayOiDa9pM0pYeGcakjhhsB47Hc";
        assert!(space_link_access_key_material(old_key).is_err());
    }

    #[test]
    fn space_link_key_derivation_matches_vector() {
        let access_key = vec![0; 32];
        assert_eq!(
            encode_b64(&derive_space_link_auth_key(&access_key).unwrap()),
            "5ZS0aOQUedRW2BfwBuDf2hLMRLUZNpmXz2p6CzTX4Hw="
        );
        assert_eq!(
            encode_b64(&derive_space_link_wrap_key(&access_key).unwrap()),
            "EAWvWpgRlx54HZNPCeyVy8nwjXzcBpiGlgbeK++KMeM="
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

    #[test]
    fn content_md5_base64_matches_vector() {
        assert_eq!(content_md5_base64(b"hello"), "XUFAKrxLKna5cZ2REBfFkg==");
    }
}
