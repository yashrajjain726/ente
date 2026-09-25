use std::{fs, path::Path};

use anyhow::{Context, Result, ensure};
use ente_photos::export::{Component, Role};
use serde_json::Value;
use uuid::Uuid;

use super::{
    names,
    store::{Album, JsonRecord, Media, Placement, Properties, Store},
};

pub fn scan(root: &Path, store: &Store) -> Result<()> {
    let transaction = store.db.connection().unchecked_transaction()?;
    store.db.connection().execute_batch(
        "DELETE FROM placements; DELETE FROM albums; DELETE FROM json_records; DELETE FROM names; DELETE FROM allocations;",
    )?;
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("export contains a non-UTF-8 directory name"))?;
        if name == "Trash" {
            ensure!(
                entry.file_type()?.is_dir(),
                super::Conflict("at Trash: expected a directory".into())
            );
            for entry in fs::read_dir(entry.path())? {
                let entry = entry?;
                if entry.file_type()?.is_dir() {
                    let name = entry
                        .file_name()
                        .into_string()
                        .map_err(|_| anyhow::anyhow!("retained album name is not UTF-8"))?;
                    album(root, store, &format!("Trash/{name}"), true)?;
                }
            }
        } else if entry.file_type()?.is_dir() {
            album(root, store, &name, false)?;
        }
    }
    let mut query = store
        .db
        .connection()
        .prepare("SELECT record FROM placements WHERE json_extract(record,'$.complete')=0")?;
    let mut rows = query.query([])?;
    while let Some(row) = rows.next()? {
        let mut placement: Placement = serde_json::from_str(&row.get::<_, String>(0)?)?;
        let template = placement
            .metadata
            .iter()
            .find(|record| !record.is_null())
            .context("placement has no metadata")?
            .clone();
        for (media, record) in placement.media.iter().zip(&mut placement.metadata) {
            if record.is_null() {
                *record = template.clone();
                record["title"] = Value::String(media.component.path.clone());
                record["ente"]["component"] = serde_json::to_value(&media.component.role)?;
            }
        }
        store.save_placement(&placement)?;
    }
    drop(rows);
    drop(query);
    transaction.commit()?;
    Ok(())
}

fn album(root: &Path, store: &Store, folder: &str, retained: bool) -> Result<()> {
    let path = names::check(root, &format!("{folder}/metadata.json"))?;
    if !path.try_exists()? {
        return Ok(());
    }
    let record = read_record(root, store, &format!("{folder}/metadata.json"))?;
    let Some(identity) = record.get("ente") else {
        return Ok(());
    };
    let id = parse_id(identity, "albumID")?;
    let name = record["title"]
        .as_str()
        .context("album record has no title")?
        .to_owned();
    ensure!(
        [
            "album",
            "folder",
            "favorites",
            "uncategorized",
            "defaultHidden",
            "quicklink"
        ]
        .contains(&identity["type"].as_str().unwrap_or_default()),
        "unsupported album type in {folder}"
    );
    ensure!(
        ["visible", "archived", "hidden"]
            .contains(&identity["visibility"].as_str().unwrap_or_default()),
        "unsupported album visibility in {folder}"
    );
    ensure!(
        retained || store.album(id, false)?.is_none(),
        super::Conflict(format!("active album ID {id}"))
    );
    let album = Album {
        key: Uuid::new_v4().to_string(),
        id,
        name,
        path: folder.into(),
        retained,
        metadata: record,
        initialized: true,
    };
    let (parent, name) = folder.rsplit_once('/').unwrap_or(("", folder));
    ensure!(
        retained || !names::reserved(name, true),
        "reserved active album path {folder}"
    );
    ensure!(
        names::reserve(store, parent, name, &album.key, "album")?,
        super::Conflict(format!("overlapping album paths at {folder}"))
    );
    store.save_album(&album)?;
    let metadata = names::check(root, &format!("{folder}/metadata"))?;
    if !metadata.try_exists()? {
        return Ok(());
    }
    ensure!(
        metadata.is_dir(),
        super::Conflict(format!(
            "at {}: expected metadata directory",
            metadata.display()
        ))
    );
    for entry in fs::read_dir(metadata)? {
        let entry = entry?;
        if entry.path().extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("sidecar name is not UTF-8"))?;
        let path = names::check(root, &format!("{folder}/metadata/{name}"))?;
        ensure!(
            entry.file_type()?.is_file(),
            super::Conflict(format!("at {}: expected a sidecar", path.display()))
        );
        let record = read_record(root, store, &format!("{folder}/metadata/{name}"))?;
        let Some(identity) = record.get("ente") else {
            continue;
        };
        let file = parse_id(identity, "fileID")?;
        let display_name = identity["name"]
            .as_str()
            .context("file record has no name")?;
        chrono::DateTime::parse_from_rfc3339(
            identity["creationTime"]
                .as_str()
                .context("file record has no creationTime")?,
        )?;
        let kind = identity["type"]
            .as_str()
            .context("file record has no type")?;
        ensure!(
            ["image", "video", "livePhoto", "unknown"].contains(&kind),
            "unsupported file type for {file}"
        );
        let mut components: Vec<Component> =
            serde_json::from_value(identity["components"].clone())?;
        ensure!(
            if kind == "livePhoto" {
                components.len() == 2
                    && components.iter().any(|c| c.role == Role::Image)
                    && components.iter().any(|c| c.role == Role::Video)
            } else {
                components.len() == 1 && components[0].role == Role::Original
            },
            "invalid components for file {file}"
        );
        components.sort_by_key(|component| match component.role {
            Role::Original => 0,
            Role::Image => 1,
            Role::Video => 2,
        });
        for component in &components {
            names::relative(&component.path)?;
            ensure!(
                !component.path.contains('/') && !names::reserved(&component.path, false),
                "invalid component path for file {file}"
            );
            ensure!(
                ente_core::b64::decode(&component.hash)?.len() == 64,
                "invalid component hash for file {file}"
            );
        }
        ensure!(
            components.len() == 1
                || names::folded(&components[0].path) != names::folded(&components[1].path),
            "overlapping Live Photo components for file {file}"
        );
        let own: Role = serde_json::from_value(identity["component"].clone())?;
        let index = components
            .iter()
            .position(|c| c.role == own)
            .context("undeclared sidecar component")?;
        ensure!(
            record["title"].as_str() == Some(components[index].path.as_str())
                && name == format!("{}.json", components[index].path),
            "contradictory sidecar location for file {file}"
        );
        let existing = if retained {
            let mut query = store.db.connection().prepare(
                "SELECT record FROM placements WHERE album=?1 AND file=?2 AND retained=1",
            )?;
            let mut found = None;
            let mut rows = query.query(rusqlite::params![id, file])?;
            while let Some(row) = rows.next()? {
                let candidate: Placement = serde_json::from_str(&row.get::<_, String>(0)?)?;
                if candidate.folder == folder
                    && candidate
                        .media
                        .iter()
                        .map(|m| &m.component)
                        .eq(components.iter())
                {
                    found = Some(candidate);
                    break;
                }
            }
            found
        } else {
            store.placement(id, file)?
        };
        let mut placement = existing.unwrap_or_else(|| Placement {
            id: Uuid::new_v4().to_string(),
            album: id,
            folder: folder.into(),
            file,
            retained,
            name: display_name.into(),
            original: String::new(),
            media: components
                .iter()
                .cloned()
                .map(|component| Media {
                    component,
                    properties: None,
                    intended_time: None,
                })
                .collect(),
            metadata: vec![Value::Null; components.len()],
            complete: false,
            retaining: false,
        });
        let owner = if retained {
            placement.id.clone()
        } else {
            format!("file:{id}:{file}")
        };
        for component in &components {
            ensure!(
                names::reserve(store, folder, &component.path, &owner, kind)?,
                super::Conflict(format!("overlapping media paths in {folder}"))
            );
        }
        ensure!(
            placement.folder == folder
                && placement
                    .media
                    .iter()
                    .map(|m| &m.component)
                    .eq(components.iter()),
            super::Conflict(format!("active placement for file {file} in album {id}"))
        );
        ensure!(
            placement.metadata[index].is_null(),
            "duplicate component identity for file {file}"
        );
        if let Some(other) = placement.metadata.iter().find(|value| !value.is_null()) {
            let mut a = other.clone();
            let mut b = record.clone();
            a.as_object_mut()
                .context("invalid sidecar")?
                .remove("title");
            b.as_object_mut()
                .context("invalid sidecar")?
                .remove("title");
            a["ente"]
                .as_object_mut()
                .context("invalid Ente record")?
                .remove("component");
            b["ente"]
                .as_object_mut()
                .context("invalid Ente record")?
                .remove("component");
            a["ente"]["components"] = serde_json::to_value(&components)?;
            b["ente"]["components"] = a["ente"]["components"].clone();
            ensure!(a == b, "contradictory Live Photo metadata for file {file}");
        }
        placement.metadata[index] = record;
        placement.complete = placement.metadata.iter().all(|record| !record.is_null());
        store.save_placement(&placement)?;
    }
    Ok(())
}

fn read_record(root: &Path, store: &Store, relative: &str) -> Result<Value> {
    let path = names::check(root, relative)?;
    let bytes = fs::read(&path)?;
    let record: Value = serde_json::from_slice(&bytes)?;
    if record.get("ente").is_some() {
        let cached = JsonRecord {
            hash: ente_core::b64::encode(&ente_core::crypto::hash::hash(&bytes, Some(64), None)?),
            properties: Properties::read(&path)?,
        };
        store.db.connection().execute(
            "INSERT INTO json_records VALUES(?1,?2)",
            rusqlite::params![relative, serde_json::to_string(&cached)?],
        )?;
    }
    Ok(record)
}

fn parse_id(value: &Value, field: &str) -> Result<i64> {
    let text = value[field]
        .as_str()
        .with_context(|| format!("missing {field}"))?;
    let id: i64 = text.parse().with_context(|| format!("invalid {field}"))?;
    ensure!(id > 0 && id.to_string() == text, "invalid {field}");
    Ok(id)
}
