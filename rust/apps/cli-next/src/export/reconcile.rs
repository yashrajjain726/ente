use std::{fs as disk, path::Path};

use anyhow::{Context, Result, ensure};
use ente_photos::export;
use rusqlite::{OptionalExtension, params};
use serde_json::Value;
use uuid::Uuid;

use super::{
    allocation, fatal, fs, names, report,
    store::{Album, Media, Operation, Placement, Properties, Store},
    transfer::{self, Prepared},
};
use crate::replica::AlbumRecord;

pub fn albums(root: &Path, store: &Store, user_id: i64) -> Result<()> {
    let mut after = 0;
    loop {
        let next:Option<(i64,String)>=store.db.connection().query_row("SELECT id,record FROM desired_albums WHERE selected=1 AND ready=1 AND failure IS NULL AND record IS NOT NULL AND id>?1 ORDER BY id LIMIT 1",[after],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let Some((id, record)) = next else { break };
        after = id;
        let result = (|| {
            let record: AlbumRecord = serde_json::from_str(&record)?;
            let source = record.album(user_id)?;
            for field in &source.warnings {
                eprintln!(
                    "album {id}: unfamiliar metadata field {field:?}; exporting supported fields"
                );
            }
            let existing = store.album(id, false)?;
            let key = existing
                .as_ref()
                .map(|a| a.key.clone())
                .unwrap_or_else(|| format!("active:{id}"));
            let path = if let Some(existing) = &existing
                && existing.name == source.name
            {
                existing.path.clone()
            } else {
                allocation::choose(store, "", &source.name, "album", None, &key)?.remove(0)
            };
            let album = Album {
                key,
                id,
                name: source.name.clone(),
                path: path.clone(),
                retained: false,
                metadata: export::album(&source),
                initialized: true,
            };
            if let Some(existing) = &existing
                && existing.path != path
            {
                rename_target(root, &existing.path, &path)?;
                let transaction = store.db.connection().unchecked_transaction()?;
                store.operation(&Operation::Move {
                    album: id,
                    file: None,
                    source: existing.path.clone(),
                    destination: path.clone(),
                })?;
                let mut query = store
                    .db
                    .connection()
                    .prepare("SELECT record FROM placements WHERE album=?1 AND retained=0")?;
                let mut rows = query.query([id])?;
                while let Some(row) = rows.next()? {
                    let mut placement: Placement = serde_json::from_str(&row.get::<_, String>(0)?)?;
                    placement.folder = path.clone();
                    store.save_placement(&placement)?;
                    event(store, &placement.id, "renamed")?;
                }
                store.db.connection().execute(
                    "UPDATE json_records SET path=?1||substr(path,?2) WHERE substr(path,1,?3)=?4",
                    params![
                        path,
                        existing.path.chars().count() as i64 + 1,
                        existing.path.chars().count() as i64 + 1,
                        format!("{}/", existing.path)
                    ],
                )?;
                relocate_work(store, &existing.path, &path)?;
                allocation::relocate(store, &existing.path, &path)?;
                store.save_album(&album)?;
                allocation::clear(store, &album.key)?;
                transaction.commit()?;
                fs::operations(root, store, id, None)?;
            } else {
                if existing.is_none() {
                    free_target(root, &path)?;
                }
                let transaction = store.db.connection().unchecked_transaction()?;
                store.save_album(&album)?;
                allocation::clear(store, &album.key)?;
                transaction.commit()?;
            }
            fs::directory(root, &path)?;
            fs::json(
                root,
                store,
                &format!("{path}/metadata.json"),
                &album.metadata,
                true,
                None,
            )?;
            Ok::<_, anyhow::Error>(())
        })();
        if let Err(error) = result {
            report(store, &format!("album:{id}"), &error)?;
            let mut query = store
                .db
                .connection()
                .prepare("SELECT file FROM desired_files WHERE album=?1")?;
            let mut rows = query.query([id])?;
            while let Some(row) = rows.next()? {
                report(
                    store,
                    &format!("file:{id}:{}", row.get::<_, i64>(0)?),
                    &error,
                )?;
            }
            store.db.connection().execute(
                "UPDATE desired_files SET failure=?1 WHERE album=?2",
                params![error.to_string(), id],
            )?;
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    Ok(())
}

pub fn file(
    root: &Path,
    store: &Store,
    prepared: &mut Prepared,
    cancel: &tokio::sync::watch::Receiver<bool>,
) -> Result<()> {
    let mut after = 0;
    loop {
        let next:Option<(i64,bool)>=store.db.connection().query_row("SELECT album,favorited FROM desired_files WHERE file=?1 AND album>?2 AND failure IS NULL AND attempted=0 ORDER BY album LIMIT 1",params![prepared.file.id,after],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let Some((album, favorited)) = next else {
            break;
        };
        after = album;
        store.db.connection().execute(
            "UPDATE desired_files SET attempted=1 WHERE album=?1 AND file=?2",
            params![album, prepared.file.id],
        )?;
        let result = placement(root, store, prepared, album, favorited, cancel);
        if let Err(error) = result {
            report(store, &format!("file:{album}:{}", prepared.file.id), &error)?;
            transfer::discard_incomplete(root, store, prepared.file.id)?;
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn placement(
    root: &Path,
    store: &Store,
    prepared: &mut Prepared,
    album_id: i64,
    favorited: bool,
    cancel: &tokio::sync::watch::Receiver<bool>,
) -> Result<()> {
    let album = store
        .album(album_id, false)?
        .context("missing album association")?;
    let file = &prepared.file;
    for field in &file.warnings {
        eprintln!(
            "file {}: unfamiliar metadata field {field:?}; exporting supported fields",
            file.id
        );
    }
    let existing = store.placement(album_id, file.id)?;
    let old_complete = existing.as_ref().is_some_and(|p| p.complete);
    let owner = format!("file:{album_id}:{}", file.id);
    let extensions = if file.kind == ente_photos::files::Kind::LivePhoto {
        if prepared.components.len() == 2 {
            Some((
                prepared.components[0].extension.as_str(),
                prepared.components[1].extension.as_str(),
            ))
        } else {
            let media = &existing
                .as_ref()
                .context("missing Live Photo original")?
                .media;
            Some((
                names::split(&media[0].component.path, false).1,
                names::split(&media[1].component.path, false).1,
            ))
        }
    } else {
        None
    };
    let allocated = if let Some(existing) = &existing
        && existing.name == file.name
        && existing.media.len() == if extensions.is_some() { 2 } else { 1 }
        && (prepared.components.is_empty()
            || extensions.is_none()
            || existing
                .media
                .iter()
                .zip(&prepared.components)
                .all(|(old, new)| {
                    names::split(&old.component.path, false).1 == names::portable(&new.extension)
                })) {
        existing
            .media
            .iter()
            .map(|m| m.component.path.clone())
            .collect()
    } else {
        allocation::choose(
            store,
            &album.path,
            &file.name,
            file.kind.name(),
            extensions,
            &owner,
        )?
    };
    let mut placement = Placement {
        id: existing
            .as_ref()
            .map(|p| p.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        album: album_id,
        folder: album.path.clone(),
        file: file.id,
        retained: false,
        name: file.name.clone(),
        original: prepared.signature.clone(),
        media: Vec::new(),
        metadata: Vec::new(),
        complete: false,
        retaining: false,
    };
    for (index, path) in allocated.iter().enumerate() {
        let mut component = if let Some(component) = prepared.components.get(index) {
            export::Component {
                role: component.role.clone(),
                path: path.clone(),
                size: component.size,
                hash: component.hash.clone(),
            }
        } else {
            existing
                .as_ref()
                .and_then(|p| p.media.get(index))
                .context("missing completed original")?
                .component
                .clone()
        };
        component.path = path.clone();
        let previous = existing
            .as_ref()
            .and_then(|p| p.media.iter().find(|m| m.component.role == component.role));
        placement.media.push(Media {
            component,
            properties: previous.and_then(|m| m.properties.clone()),
            intended_time: previous.and_then(|m| m.intended_time),
        });
    }
    let intended_components: Vec<_> = placement
        .media
        .iter()
        .map(|m| m.component.clone())
        .collect();
    placement.metadata = intended_components
        .iter()
        .enumerate()
        .map(|(index, _)| export::file(file, &intended_components, index, favorited))
        .collect::<std::result::Result<_, _>>()?;
    let renamed = existing.as_ref().is_some_and(|p| {
        p.media
            .iter()
            .map(|m| &m.component.path)
            .ne(placement.media.iter().map(|m| &m.component.path))
    });
    if renamed {
        let previous = existing.as_ref().context("missing rename association")?;
        for (old, new) in previous.media.iter().zip(&placement.media) {
            if old.component.path != new.component.path {
                rename_target(
                    root,
                    &format!("{}/{}", album.path, old.component.path),
                    &format!("{}/{}", album.path, new.component.path),
                )?;
                rename_target(
                    root,
                    &format!("{}/metadata/{}.json", album.path, old.component.path),
                    &format!("{}/metadata/{}.json", album.path, new.component.path),
                )?;
            }
        }
        let transaction = store.db.connection().unchecked_transaction()?;
        store.save_placement(&placement)?;
        allocation::clear(store, &owner)?;
        for (old, new) in previous.media.iter().zip(&placement.media) {
            if old.component.path != new.component.path {
                let source = format!("{}/{}", album.path, old.component.path);
                let destination = format!("{}/{}", album.path, new.component.path);
                store.operation(&Operation::Move {
                    album: album_id,
                    file: Some(file.id),
                    source: source.clone(),
                    destination: destination.clone(),
                })?;
                for component in &mut prepared.components {
                    if component.path == source {
                        component.path = destination.clone();
                    }
                }
            }
        }
        for (old, new) in previous.media.iter().zip(&placement.media) {
            if old.component.path != new.component.path {
                store.operation(&Operation::Move {
                    album: album_id,
                    file: Some(file.id),
                    source: format!("{}/metadata/{}.json", album.path, old.component.path),
                    destination: format!("{}/metadata/{}.json", album.path, new.component.path),
                })?;
                store.db.connection().execute(
                    "DELETE FROM json_records WHERE path=?1",
                    [format!(
                        "{}/metadata/{}.json",
                        album.path, old.component.path
                    )],
                )?;
            }
        }
        transaction.commit()?;
        fs::operations(root, store, album_id, Some(file.id))?;
    } else {
        if existing.is_none() {
            for media in &placement.media {
                free_target(root, &format!("{}/{}", album.path, media.component.path))?;
                free_target(
                    root,
                    &format!("{}/metadata/{}.json", album.path, media.component.path),
                )?;
            }
        }
        let transaction = store.db.connection().unchecked_transaction()?;
        store.save_placement(&placement)?;
        allocation::clear(store, &owner)?;
        transaction.commit()?;
    }
    for media in &placement.media {
        names::reserve(
            store,
            &placement.folder,
            &media.component.path,
            &owner,
            file.kind.name(),
        )?;
    }
    let mut wrote_media = false;
    for media in &mut placement.media {
        let relative = format!("{}/{}", album.path, media.component.path);
        let path = names::check(root, &relative)?;
        let properties = if path.try_exists()? {
            Some(Properties::read(&path)?)
        } else {
            None
        };
        let valid = if let Some(properties) = &properties {
            if media.properties.as_ref() == Some(properties)
                && existing.as_ref().is_some_and(|old| {
                    old.media.iter().any(|m| {
                        m.component.role == media.component.role
                            && m.component.hash == media.component.hash
                    })
                })
            {
                true
            } else {
                let (size, hash) = fs::hash_cancellable(&path, cancel)?;
                size == media.component.size && hash == media.component.hash
            }
        } else {
            false
        };
        if !valid {
            let source = prepared
                .components
                .iter_mut()
                .find(|c| c.role == media.component.role)
                .context("no verified original is available")?;
            if source.temporary {
                let temporary: super::store::Temporary = store
                    .json(
                        "SELECT record FROM temporaries WHERE path=?1",
                        [&source.path],
                    )?
                    .context("missing transfer ownership")?;
                fs::publish(
                    root,
                    store,
                    temporary,
                    &relative,
                    source.size,
                    source.hash.clone(),
                )?;
                source.path = relative.clone();
                source.temporary = false;
            } else {
                transfer::materialize(
                    root,
                    store,
                    source,
                    (&album.path, &media.component.path),
                    file.id,
                    &prepared.signature,
                    cancel,
                )?;
            }
            wrote_media = true;
        }
        let observed = Properties::read(&path)?;
        let intended = file.modified_at_micros.unwrap_or(file.created_at_micros);
        media.properties = Some(
            if media.intended_time == Some(intended) && media.properties.as_ref() == Some(&observed)
            {
                observed
            } else {
                fs::set_time(&path, intended)?
            },
        );
        media.intended_time = Some(intended);
    }
    store.save_placement(&placement)?;
    let mut metadata_changed = false;
    for (media, record) in placement.media.iter().zip(&placement.metadata) {
        metadata_changed |= fs::json(
            root,
            store,
            &format!("{}/metadata/{}.json", album.path, media.component.path),
            record,
            true,
            Some(file.id),
        )?;
    }
    placement.complete = true;
    store.save_placement(&placement)?;
    store.db.connection().execute(
        "UPDATE desired_files SET completed=1 WHERE album=?1 AND file=?2",
        params![album_id, file.id],
    )?;
    if wrote_media || !old_complete {
        event(store, &placement.id, "exported")?;
    }
    if existing.is_some() && metadata_changed {
        event(store, &placement.id, "metadata_updated")?;
    }
    if renamed {
        event(store, &placement.id, "renamed")?;
    }
    Ok(())
}

pub fn retain_removed(root: &Path, store: &Store) -> Result<()> {
    let mut after = String::new();
    loop {
        let next:Option<Placement>=store.json("SELECT p.record FROM placements p JOIN desired_albums a ON a.id=p.album WHERE p.retained=0 AND a.selected=1 AND a.ready=1 AND a.failure IS NULL AND p.id>?1 AND NOT EXISTS(SELECT 1 FROM desired_files d WHERE d.album=p.album AND d.file=p.file) ORDER BY p.id LIMIT 1",[&after])?;
        let Some(placement) = next else { break };
        after = placement.id.clone();
        let result = retain(root, store, &placement);
        if let Err(error) = result {
            report(
                store,
                &format!("file:{}:{}", placement.album, placement.file),
                &error,
            )?;
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    let mut after = String::new();
    loop {
        let next:Option<Placement>=store.json("SELECT p.record FROM placements p JOIN desired_albums a ON a.id=p.album WHERE p.retained=1 AND json_extract(p.record,'$.retaining')=1 AND a.selected=1 AND a.ready=1 AND a.failure IS NULL AND NOT EXISTS(SELECT 1 FROM operations o WHERE o.album=p.album AND o.file=p.file) AND p.id>?1 ORDER BY p.id LIMIT 1",[&after])?;
        let Some(mut placement) = next else { break };
        after = placement.id.clone();
        let result = (|| {
            for (component, record) in placement.media.iter().zip(&placement.metadata) {
                fs::json(
                    root,
                    store,
                    &format!(
                        "{}/metadata/{}.json",
                        placement.folder, component.component.path
                    ),
                    record,
                    true,
                    Some(placement.file),
                )?;
            }
            placement.retaining = false;
            placement.complete = true;
            store.save_placement(&placement)?;
            event(store, &placement.id, "retained")?;
            Ok::<_, anyhow::Error>(())
        })();
        if let Err(error) = result {
            report(
                store,
                &format!("file:{}:{}", placement.album, placement.file),
                &error,
            )?;
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    let mut after = 0;
    loop {
        let id:Option<i64>=store.db.connection().query_row("SELECT id FROM desired_albums WHERE selected=1 AND ready=1 AND failure IS NULL AND record IS NULL AND id>?1 ORDER BY id LIMIT 1",[after],|r|r.get(0)).optional()?;
        let Some(id) = id else { break };
        after = id;
        let result = (|| {
            let Some(album) = store.album(id, false)? else {
                return Ok(());
            };
            retained_album(root, store, &album)?;
            store.operation(&Operation::Remove {
                album: id,
                path: format!("{}/metadata.json", album.path),
            })?;
            fs::operations(root, store, id, None)?;
            for relative in [format!("{}/metadata", album.path), album.path] {
                let path = names::check(root, &relative)?;
                if path.is_dir() && disk::read_dir(&path)?.next().is_none() {
                    disk::remove_dir(path)?;
                }
            }
            Ok::<_, anyhow::Error>(())
        })();
        if let Err(error) = result {
            report(store, &format!("album:{id}"), &error)?;
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn retain(root: &Path, store: &Store, active: &Placement) -> Result<()> {
    let album = store
        .album(active.album, false)?
        .context("missing removed album")?;
    let retained_album = retained_album(root, store, &album)?;
    let missing_folder = !names::check(root, &retained_album.path)?.try_exists()?;
    fs::directory(root, &retained_album.path)?;
    if missing_folder {
        fs::json(
            root,
            store,
            &format!("{}/metadata.json", retained_album.path),
            &retained_album.metadata,
            true,
            None,
        )?;
    }
    let mut retained = active.clone();
    retained.id = format!("retain:{}", active.id);
    retained.retained = true;
    retained.folder = retained_album.path;
    retained.complete = false;
    retained.retaining = true;
    let extensions = if active.media.len() == 2 {
        Some((
            names::split(&active.media[0].component.path, false).1,
            names::split(&active.media[1].component.path, false).1,
        ))
    } else {
        None
    };
    let names = allocation::choose(
        store,
        &retained.folder,
        &active.name,
        active.kind()?,
        extensions,
        &retained.id,
    )?;
    for (media, name) in retained.media.iter_mut().zip(names) {
        media.component.path = name;
        media.properties = None;
    }
    let components: Vec<_> = retained.media.iter().map(|m| m.component.clone()).collect();
    for (index, record) in retained.metadata.iter_mut().enumerate() {
        if record.is_null() {
            continue;
        }
        record["title"] = json_string(&components[index].path);
        record["ente"]["components"] = serde_json::to_value(&components)?;
    }
    for media in &retained.media {
        free_target(
            root,
            &format!("{}/{}", retained.folder, media.component.path),
        )?;
        free_target(
            root,
            &format!("{}/metadata/{}.json", retained.folder, media.component.path),
        )?;
    }
    let transaction = store.db.connection().unchecked_transaction()?;
    store.save_placement(&retained)?;
    allocation::clear(store, &retained.id)?;
    allocation::clear(store, &format!("file:{}:{}", active.album, active.file))?;
    store
        .db
        .connection()
        .execute("DELETE FROM placements WHERE id=?1", [&active.id])?;
    for (old, new) in active.media.iter().zip(&retained.media) {
        store.operation(&Operation::Move {
            album: active.album,
            file: Some(active.file),
            source: format!("{}/{}", active.folder, old.component.path),
            destination: format!("{}/{}", retained.folder, new.component.path),
        })?;
    }
    for (old, new) in active.media.iter().zip(&retained.media) {
        store.operation(&Operation::Move {
            album: active.album,
            file: Some(active.file),
            source: format!("{}/metadata/{}.json", active.folder, old.component.path),
            destination: format!("{}/metadata/{}.json", retained.folder, new.component.path),
        })?;
        store.db.connection().execute(
            "DELETE FROM json_records WHERE path=?1",
            [format!(
                "{}/metadata/{}.json",
                active.folder, old.component.path
            )],
        )?;
    }
    transaction.commit()?;
    fs::operations(root, store, active.album, Some(active.file))?;
    Ok(())
}

fn retained_album(root: &Path, store: &Store, active: &Album) -> Result<Album> {
    if let Some(mut album) = store.album(active.id, true)? {
        if !album.initialized {
            initialize_retained(root, store, &mut album)?;
        }
        return Ok(album);
    }
    let key = format!("retained:{}", active.id);
    let path = format!(
        "Trash/{}",
        allocation::choose(store, "Trash", &active.name, "album", None, &key)?.remove(0)
    );
    free_target(root, &path)?;
    let mut album = Album {
        key,
        id: active.id,
        name: active.name.clone(),
        path,
        retained: true,
        metadata: active.metadata.clone(),
        initialized: false,
    };
    let transaction = store.db.connection().unchecked_transaction()?;
    store.save_album(&album)?;
    allocation::clear(store, &album.key)?;
    transaction.commit()?;
    initialize_retained(root, store, &mut album)?;
    Ok(album)
}

fn initialize_retained(root: &Path, store: &Store, album: &mut Album) -> Result<()> {
    fs::directory(root, &album.path)?;
    fs::json(
        root,
        store,
        &format!("{}/metadata.json", album.path),
        &album.metadata,
        true,
        None,
    )?;
    album.initialized = true;
    store.save_album(album)
}

fn relocate_work(store: &Store, old: &str, new: &str) -> Result<()> {
    let prefix = format!("{old}/");
    let relocate = |path: &mut String| {
        if let Some(tail) = path.strip_prefix(&prefix) {
            *path = format!("{new}/{tail}");
        }
    };
    let mut query = store
        .db
        .connection()
        .prepare("SELECT record FROM temporaries WHERE substr(path,1,?1)=?2")?;
    let mut rows = query.query(params![prefix.chars().count() as i64, prefix])?;
    while let Some(row) = rows.next()? {
        let mut temporary: super::store::Temporary =
            serde_json::from_str(&row.get::<_, String>(0)?)?;
        store
            .db
            .connection()
            .execute("DELETE FROM temporaries WHERE path=?1", [&temporary.path])?;
        relocate(&mut temporary.path);
        if let Some(destination) = &mut temporary.destination {
            relocate(destination);
        }
        store.temporary(&temporary)?;
    }
    let mut query = store
        .db
        .connection()
        .prepare("SELECT id,record FROM operations ORDER BY id")?;
    let mut rows = query.query([])?;
    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let mut operation: Operation = serde_json::from_str(&row.get::<_, String>(1)?)?;
        match &mut operation {
            Operation::Move {
                source,
                destination,
                ..
            } => {
                relocate(source);
                relocate(destination);
            }
            Operation::Remove { path, .. } => relocate(path),
        }
        store.db.connection().execute(
            "UPDATE operations SET record=?1 WHERE id=?2",
            params![serde_json::to_string(&operation)?, id],
        )?;
    }
    Ok(())
}

fn rename_target(root: &Path, source: &str, destination: &str) -> Result<()> {
    let source = names::check(root, source)?;
    let destination = names::check(root, destination)?;
    ensure!(
        !destination.try_exists()? || names::same_path(&source, &destination),
        super::Conflict(format!("occupied rename target {}", destination.display()))
    );
    Ok(())
}

fn free_target(root: &Path, relative: &str) -> Result<()> {
    let path = names::check(root, relative)?;
    ensure!(
        !path.try_exists()?,
        super::Conflict(format!("at {}: unrelated or occupied path", path.display()))
    );
    Ok(())
}

fn event(store: &Store, placement: &str, event: &str) -> Result<()> {
    ensure!(
        ["exported", "metadata_updated", "renamed", "retained"].contains(&event),
        "unknown export event"
    );
    store.db.connection().execute(&format!("INSERT INTO events(placement,{event}) VALUES(?1,1) ON CONFLICT(placement) DO UPDATE SET {event}=1"),[placement])?;
    Ok(())
}

fn json_string(value: &str) -> Value {
    Value::String(value.into())
}
