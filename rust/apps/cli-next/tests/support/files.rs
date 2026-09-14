use ente_core::crypto::{secretbox, stream};

use super::*;

#[test]
fn file_pages_preserve_membership_changes_and_metadata() {
    let mut server = mockito::Server::new();
    let home = TestHome::new();
    home.seed(&server.url());
    let collection_key = Key::generate();
    let albums = server
        .mock("GET", "/collections/v2")
        .match_query(mockito::Matcher::Any)
        .with_body(
            json!({"collections": [
                collection(1, "First", &collection_key),
                collection(2, "Second", &collection_key)
            ]})
            .to_string(),
        )
        .expect_at_least(1)
        .create();
    let (first, _) = remote_file(10, &collection_key, b"original");
    let mut second = first.clone();
    second["id"] = json!(11);
    let mut removed = second.clone();
    removed["updationTime"] = json!(20);
    removed["file"]["encryptedData"] = json!("-");
    removed["metadata"]["encryptedData"] = json!("-");
    let page_one = page(&mut server, 1, 0, json!([first, second]), true);
    let page_two = page(&mut server, 1, 10, json!([removed]), false);
    let duplicate = page(&mut server, 2, 0, json!([first]), false);
    let listed = home.json(&["photos", "file", "list"]);
    assert_eq!(listed.as_array().unwrap().len(), 1);
    let file = &listed[0];
    assert_eq!(file["id"], "10");
    assert_eq!(file["albumIds"], json!(["1", "2"]));
    assert_eq!(file["name"], "Edited 🌧.jpg");
    assert_eq!(file["createdAt"], "2026-09-01T00:00:00.000000Z");
    assert_eq!(file["caption"], "42");
    assert_eq!(
        file["location"],
        json!({"latitude": 12.5, "longitude": 0.0})
    );
    assert_eq!(file["visibility"], "archived");
    assert_eq!(file["dateTime"], "2026-09-01T05:30:00");
    assert_eq!(file["offsetTime"], "+05:30");
    assert_eq!(file["hash"], "original-hash");
    assert!(file.get("key").is_none());
    assert_eq!(
        home.json(&["photos", "file", "view", "Edited 🌧.jpg"]),
        *file
    );
    assert_eq!(home.json(&["photos", "file", "view", "10"]), *file);
    let scoped = home.json(&["photos", "file", "list", "--album", "First"]);
    assert_eq!(scoped[0]["albumIds"], json!(["1"]));
    assert!(failure(&home.run(&["photos", "file", "view", "11"])).contains("no file matches"));
    assert!(failure(&home.run(&["photos", "file", "view", "Edited"])).contains("no file matches"));
    let human = success(home.run(&["photos", "file", "view", "10"]));
    assert!(
        String::from_utf8(human.stdout)
            .unwrap()
            .contains("Edited 🌧.jpg")
    );
    albums.assert();
    page_one.assert();
    page_two.assert();
    duplicate.assert();
}

#[test]
fn downloads_publish_only_complete_authenticated_originals() {
    let mut server = mockito::Server::new();
    let home = TestHome::new();
    home.seed(&server.url());
    let output_dir = tempfile::tempdir().unwrap();
    let path = output_dir.path().join("original.jpg");
    let collection_key = Key::generate();
    server
        .mock("GET", "/collections/v2")
        .match_query(mockito::Matcher::Any)
        .with_body(json!({"collections": [collection(1, "First", &collection_key)]}).to_string())
        .create();
    let original = vec![37u8; stream::ENCRYPTION_CHUNK_SIZE + 321];
    let (file, encrypted) = remote_file(10, &collection_key, &original);
    page(&mut server, 1, 0, json!([file]), false);
    let signed = server
        .mock("GET", "/files/download/v3/10")
        .match_header("x-auth-token", "--8=")
        .with_body(json!({"url": format!("{}/original", server.url())}).to_string())
        .expect_at_least(1)
        .create();
    let args = [
        "photos",
        "file",
        "download",
        "10",
        "--output",
        path.to_str().unwrap(),
        "--json",
    ];
    let mut damaged = encrypted.clone();
    *damaged.last_mut().unwrap() ^= 1;
    let mut trailing = encrypted.clone();
    trailing.push(0);
    for bytes in [
        damaged,
        encrypted[..stream::DECRYPTION_CHUNK_SIZE].to_vec(),
        trailing,
    ] {
        let object = server.mock("GET", "/original").with_body(bytes).create();
        let output = home.run(&args);
        failure(&output);
        assert!(output.stdout.is_empty());
        assert!(!path.exists());
        assert_eq!(fs::read_dir(output_dir.path()).unwrap().count(), 0);
        object.assert();
        object.remove();
    }
    let object = server
        .mock("GET", "/original")
        .match_header("x-auth-token", mockito::Matcher::Missing)
        .match_header("x-client-package", mockito::Matcher::Missing)
        .with_body(encrypted)
        .expect_at_least(1)
        .create();
    let result: Value = serde_json::from_slice(&success(home.run(&args)).stdout).unwrap();
    assert_eq!(
        result,
        json!({"id": "10", "output": path, "bytes": original.len()})
    );
    assert_eq!(fs::read(&path).unwrap(), original);
    fs::write(&path, b"existing user file").unwrap();
    failure(&home.run(&args));
    assert_eq!(fs::read(&path).unwrap(), b"existing user file");
    assert_eq!(fs::read_dir(output_dir.path()).unwrap().count(), 1);
    signed.assert();
    object.assert();
}

fn collection(id: i64, name: &str, key: &Key) -> Value {
    let wrapped = secretbox::encrypt(key.as_bytes(), &Key::from_bytes([0; 32]));
    json!({
        "id": id, "owner": {"id": 9007199254740993i64}, "name": name, "type": "album",
        "updationTime": 20, "encryptedKey": b64::encode(&wrapped.encrypted_data),
        "keyDecryptionNonce": b64::encode(wrapped.nonce.as_bytes()),
    })
}

fn remote_file(id: i64, collection_key: &Key, original: &[u8]) -> (Value, Vec<u8>) {
    let key = Key::generate();
    let wrapped = secretbox::encrypt(key.as_bytes(), collection_key);
    let metadata = blob::encrypt_json(
        &json!({
            "title": "Original.jpg", "fileType": 0,
            "creationTime": 1_700_000_000_000_000i64,
            "modificationTime": 1_700_000_001_000_000i64,
            "latitude": 1.0, "longitude": 2.0, "hash": "original-hash"
        }),
        &key,
    )
    .unwrap();
    let public = blob::encrypt_json(
        &json!({
            "editedName": "Edited 🌧.jpg", "editedTime": 1_788_220_800_000_000i64,
            "caption": 42, "lat": 12.5, "long": 0.0,
            "dateTime": "2026-09-01T05:30:00", "offsetTime": "+05:30",
        }),
        &key,
    )
    .unwrap();
    let private = blob::encrypt_json(&json!({"visibility": 1}), &key).unwrap();
    let mut encrypted = Vec::new();
    let header =
        stream::encrypt_file(&mut std::io::Cursor::new(original), &mut encrypted, &key).unwrap();
    (
        json!({
            "id": id, "ownerID": 9007199254740993i64, "collectionID": 1, "updationTime": 10,
            "encryptedKey": b64::encode(&wrapped.encrypted_data),
            "keyDecryptionNonce": b64::encode(wrapped.nonce.as_bytes()),
            "file": {"decryptionHeader": b64::encode(header.as_bytes())},
            "metadata": {"encryptedData": b64::encode(&metadata.encrypted_data),
                "decryptionHeader": b64::encode(metadata.decryption_header.as_bytes())},
            "pubMagicMetadata": {"data": b64::encode(&public.encrypted_data),
                "header": b64::encode(public.decryption_header.as_bytes())},
            "magicMetadata": {"data": b64::encode(&private.encrypted_data),
                "header": b64::encode(private.decryption_header.as_bytes())},
            "isDeleted": false
        }),
        encrypted,
    )
}

fn page(
    server: &mut mockito::ServerGuard,
    collection: i64,
    since: i64,
    diff: Value,
    more: bool,
) -> mockito::Mock {
    server
        .mock("GET", "/collections/v2/diff")
        .match_query(mockito::Matcher::AllOf(vec![
            mockito::Matcher::UrlEncoded("collectionID".into(), collection.to_string()),
            mockito::Matcher::UrlEncoded("sinceTime".into(), since.to_string()),
        ]))
        .with_body(json!({"diff": diff, "hasMore": more}).to_string())
        .expect_at_least(1)
        .create()
}
