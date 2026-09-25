use std::{
    fs::File,
    io::{Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context as _, Result, bail, ensure};
use ente_core::{Session, b64, crypto::hash};
use ente_photos::{
    export::Role,
    files::{self, Kind},
};
use rusqlite::OptionalExtension;
use tokio::sync::watch;

use super::{
    fs::{self, HashWriter},
    names,
    store::{Placement, Properties, Store},
};
use crate::{replica::FileRecord, vault::DbKey};

pub struct Component {
    pub role: Role,
    pub extension: String,
    pub path: String,
    pub size: u64,
    pub hash: String,
    pub temporary: bool,
}

pub struct Prepared {
    pub file: files::File,
    pub signature: String,
    pub components: Vec<Component>,
}

pub enum Preparation {
    Ready(Box<Prepared>),
    AwaitingCapacity,
}

pub struct Context {
    pub root: PathBuf,
    pub db_path: PathBuf,
    pub db_key: DbKey,
    pub session: Session,
}

pub async fn prepare(
    context: Arc<Context>,
    id: i64,
    mut cancel: watch::Receiver<bool>,
    capacity: bool,
) -> Result<Preparation> {
    let store = Store::open(&context.db_path, &context.db_key, &context.root, false)?;
    let record:FileRecord=store.json("SELECT record FROM desired_files WHERE file=?1 AND failure IS NULL ORDER BY version DESC,album LIMIT 1",[id])?.context("file has no usable source metadata")?;
    let file = record.file(context.session.user_id)?;
    let signature = signature(&file)?;
    let mut needs_bytes = false;
    {
        let mut after = 0;
        loop {
            let album:Option<i64>=store.db.connection().query_row("SELECT album FROM desired_files WHERE file=?1 AND album>?2 AND failure IS NULL ORDER BY album LIMIT 1",rusqlite::params![id,after],|r|r.get(0)).optional()?;
            let Some(album) = album else { break };
            after = album;
            let existing = store.placement(album, id)?;
            if let Some(mut placement) = existing {
                match valid_placement(&context.root, &placement, &file, &signature, &cancel) {
                    Ok(true) => {
                        for media in &mut placement.media {
                            let observed = Properties::read(&names::check(
                                &context.root,
                                &format!("{}/{}", placement.folder, media.component.path),
                            )?)?;
                            if media.properties.as_ref() != Some(&observed) {
                                media.intended_time = None;
                            }
                            media.properties = Some(observed);
                        }
                        store.save_placement(&placement)?;
                    }
                    Ok(false) => needs_bytes = true,
                    Err(error) => {
                        super::report(&store, &format!("file:{album}:{id}"), &error)?;
                        store.db.connection().execute(
                            "UPDATE desired_files SET failure=?1 WHERE album=?2 AND file=?3",
                            rusqlite::params![error.to_string(), album, id],
                        )?;
                        if super::fatal(&error) {
                            return Err(error);
                        }
                    }
                }
            } else {
                needs_bytes = true;
            }
        }
    }
    if !needs_bytes {
        return Ok(Preparation::Ready(Box::new(Prepared {
            file,
            signature,
            components: Vec::new(),
        })));
    }
    if !capacity {
        return Ok(Preparation::AwaitingCapacity);
    }
    let roles = if file.kind == Kind::LivePhoto {
        vec![Role::Image, Role::Video]
    } else {
        vec![Role::Original]
    };
    let mut reusable = Vec::new();
    {
        let mut after = String::new();
        loop {
            let temporary:Option<super::store::Temporary>=store.json("SELECT record FROM temporaries WHERE json_extract(record,'$.file')=?1 AND json_extract(record,'$.destination') IS NULL AND path>?2 ORDER BY path LIMIT 1",rusqlite::params![id,after])?;
            let Some(temporary) = temporary else { break };
            after = temporary.path.clone();
            if temporary.original.as_deref() != Some(&signature) {
                fs::discard(&context.root, &store, &temporary.path)?;
                continue;
            }
            if let (Some(role), Some(size), Some(hash), Some(extension)) = (
                temporary.role,
                temporary.size,
                temporary.hash,
                temporary.extension,
            ) {
                let path = names::check(&context.root, &temporary.path)?;
                if fs::hash_cancellable(&path, &cancel).is_ok_and(|(actual_size, actual_hash)| {
                    actual_size == size && actual_hash == hash
                }) {
                    reusable.push(Component {
                        role,
                        extension,
                        path: temporary.path,
                        size,
                        hash,
                        temporary: true,
                    });
                }
            }
        }
    }
    for retained in [false, true] {
        let mut before = i64::MAX;
        loop {
            if roles
                .iter()
                .all(|role| reusable.iter().any(|c| c.role == *role))
            {
                break;
            }
            if *cancel.borrow() {
                bail!(super::Cancelled)
            }
            let next:Option<(i64,String)>=store.db.connection().query_row("SELECT rowid,record FROM placements WHERE file=?1 AND retained=?2 AND rowid<?3 ORDER BY rowid DESC LIMIT 1",rusqlite::params![id,retained,before],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
            let Some((rowid, record)) = next else { break };
            before = rowid;
            let candidate: Placement = serde_json::from_str(&record)?;
            for media in &candidate.media {
                if reusable.iter().any(|c| c.role == media.component.role) {
                    continue;
                }
                if expected_hash(&file, &media.component.role)
                    .is_some_and(|hash| hash != media.component.hash)
                {
                    continue;
                }
                if expected_hash(&file, &media.component.role).is_none()
                    && !candidate.original.is_empty()
                    && candidate.original != signature
                {
                    continue;
                }
                let relative = format!("{}/{}", candidate.folder, media.component.path);
                let valid = (|| {
                    let path = names::check(&context.root, &relative)?;
                    Properties::read(&path)?;
                    let (size, hash) = fs::hash_cancellable(&path, &cancel)?;
                    Ok::<_, anyhow::Error>(
                        size == media.component.size && hash == media.component.hash,
                    )
                })()
                .unwrap_or(false);
                if valid {
                    reusable.push(Component {
                        role: media.component.role.clone(),
                        extension: names::split(&media.component.path, false).1.into(),
                        path: relative,
                        size: media.component.size,
                        hash: media.component.hash.clone(),
                        temporary: false,
                    });
                }
            }
        }
    }
    if roles
        .iter()
        .all(|role| reusable.iter().any(|c| c.role == *role))
    {
        let mut components = Vec::with_capacity(roles.len());
        for role in roles {
            let index = reusable
                .iter()
                .position(|c| c.role == role)
                .context("missing verified component")?;
            components.push(reusable.remove(index));
        }
        return Ok(Preparation::Ready(Box::new(Prepared {
            file,
            signature,
            components,
        })));
    }
    let (folder, temporary, output) = loop {
        let album:Option<i64>=store.db.connection().query_row("SELECT album FROM desired_files WHERE file=?1 AND failure IS NULL ORDER BY album LIMIT 1",[id],|r|r.get(0)).optional()?;
        let Some(album) = album else {
            return Ok(Preparation::Ready(Box::new(Prepared {
                file,
                signature,
                components: Vec::new(),
            })));
        };
        let folder = store
            .album(album, false)?
            .context("missing destination album")?
            .path;
        match fs::temporary(&context.root, &store, &folder, Some(id)) {
            Ok((temporary, output)) => break (folder, temporary, output),
            Err(error) => {
                super::report(&store, &format!("file:{album}:{id}"), &error)?;
                store.db.connection().execute(
                    "UPDATE desired_files SET failure=?1 WHERE album=?2 AND file=?3",
                    rusqlite::params![error.to_string(), album, id],
                )?;
                if super::fatal(&error) {
                    return Err(error);
                }
            }
        }
    };
    drop(output);
    let path = names::check(&context.root, &temporary.path)?;
    let write_cancel = cancel.clone();
    let download = files::download(&context.session, &file, || {
        let mut output = File::options().read(true).write(true).open(&path)?;
        output.set_len(0)?;
        output.seek(SeekFrom::Start(0))?;
        HashWriter::new(output, &write_cancel).map_err(std::io::Error::other)
    });
    let writer = tokio::select! {
        result=download=>result?,
        _=cancel.changed()=>bail!(super::Cancelled),
    };
    let (archive, size, hash) = writer.finish()?;
    let components = if file.kind == Kind::LivePhoto {
        let mut temporary_files = Vec::new();
        let extracted = ente_photos::live_photo::extract(archive, |role, extension| {
            if *cancel.borrow() {
                return Err(std::io::Error::other(super::Cancelled));
            }
            let (temporary, file) = fs::temporary(&context.root, &store, &folder, Some(id))
                .map_err(std::io::Error::other)?;
            temporary_files.push((role, extension.to_owned(), temporary));
            HashWriter::new(file, &cancel).map_err(std::io::Error::other)
        })?;
        let mut components = Vec::with_capacity(2);
        for ((role, extension, writer), (_, _, temporary)) in
            extracted.into_iter().zip(temporary_files)
        {
            let (_, size, hash) = writer.finish()?;
            if let Some(expected) = expected_hash(&file, &role) {
                ensure!(
                    hash == expected,
                    "original component hash does not match source for file {}",
                    file.id
                );
            }
            stage(
                &store, &temporary, &signature, &role, &extension, size, &hash,
            )?;
            components.push(Component {
                role,
                extension,
                path: temporary.path,
                size,
                hash,
                temporary: true,
            });
        }
        fs::discard(&context.root, &store, &temporary.path)?;
        components
    } else {
        drop(archive);
        if let Some(expected) = expected_hash(&file, &Role::Original) {
            ensure!(
                hash == expected,
                "original hash does not match source for file {}",
                file.id
            );
        }
        stage(
            &store,
            &temporary,
            &signature,
            &Role::Original,
            names::split(&file.name, false).1,
            size,
            &hash,
        )?;
        vec![Component {
            role: Role::Original,
            extension: names::split(&file.name, false).1.into(),
            path: temporary.path,
            size,
            hash,
            temporary: true,
        }]
    };
    Ok(Preparation::Ready(Box::new(Prepared {
        file,
        signature,
        components,
    })))
}

pub fn signature(file: &files::File) -> Result<String> {
    let mut bytes = file.header.as_bytes().to_vec();
    bytes.extend_from_slice(file.hash.as_deref().unwrap_or_default().as_bytes());
    Ok(b64::encode(&hash::hash(
        &bytes,
        Some(32),
        Some(file.key.as_bytes()),
    )?))
}

pub fn expected_hash<'a>(file: &'a files::File, role: &Role) -> Option<&'a str> {
    let hash = file.hash.as_deref()?;
    match role {
        Role::Original => Some(hash),
        Role::Image => hash.split_once(':').map(|pair| pair.0),
        Role::Video => hash.split_once(':').map(|pair| pair.1),
    }
}

pub fn valid_placement(
    root: &Path,
    placement: &Placement,
    file: &files::File,
    signature: &str,
    cancel: &watch::Receiver<bool>,
) -> Result<bool> {
    if placement.media.len() != if file.kind == Kind::LivePhoto { 2 } else { 1 } {
        return Ok(false);
    }
    for media in &placement.media {
        if expected_hash(file, &media.component.role)
            .is_some_and(|hash| hash != media.component.hash)
        {
            return Ok(false);
        }
        if expected_hash(file, &media.component.role).is_none()
            && !placement.original.is_empty()
            && placement.original != signature
        {
            return Ok(false);
        }
        let path = names::check(
            root,
            &format!("{}/{}", placement.folder, media.component.path),
        )?;
        if !path.try_exists()? {
            return Ok(false);
        }
        let properties = Properties::read(&path)?;
        if media.properties.as_ref() != Some(&properties) {
            let (size, hash) = fs::hash_cancellable(&path, cancel)?;
            if size != media.component.size || hash != media.component.hash {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

pub fn materialize(
    root: &Path,
    store: &Store,
    source: &mut Component,
    (folder, name): (&str, &str),
    file_id: i64,
    signature: &str,
    cancel: &watch::Receiver<bool>,
) -> Result<()> {
    let destination = format!("{folder}/{name}");
    let (mut temporary, output) = fs::temporary(root, store, folder, Some(file_id))?;
    let mut writer = HashWriter::new(output, cancel)?;
    std::io::copy(
        &mut File::open(names::check(root, &source.path)?)?,
        &mut writer,
    )?;
    let (_, size, hash) = writer.finish()?;
    ensure!(
        size == source.size && hash == source.hash,
        "local original changed while copying"
    );
    temporary.original = Some(signature.into());
    temporary.role = Some(source.role.clone());
    temporary.extension = Some(source.extension.clone());
    temporary.size = Some(size);
    temporary.hash = Some(hash.clone());
    store.temporary(&temporary)?;
    source.path = temporary.path.clone();
    source.temporary = true;
    fs::publish(root, store, temporary, &destination, size, hash)?;
    source.path = destination;
    source.temporary = false;
    Ok(())
}

pub fn discard_incomplete(root: &Path, store: &Store, file: i64) -> Result<()> {
    let mut after = String::new();
    loop {
        let next: Option<(String, i64)> = store.db.connection().query_row("SELECT path,json_extract(record,'$.album') FROM temporaries WHERE json_extract(record,'$.file')=?1 AND json_extract(record,'$.hash') IS NULL AND path>?2 ORDER BY path LIMIT 1", rusqlite::params![file, after], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
        let Some((path, album)) = next else { break };
        after = path.clone();
        if let Err(error) = fs::discard(root, store, &path) {
            super::report(store, &format!("file:{album}:{file}"), &error)?;
            store.db.connection().execute(
                "UPDATE desired_files SET failure=?1 WHERE album=?2 AND file=?3",
                rusqlite::params![error.to_string(), album, file],
            )?;
            if super::fatal(&error) {
                return Err(error);
            }
        }
    }
    Ok(())
}

pub fn finish_source(root: &Path, store: &Store, components: &[Component]) -> Result<()> {
    for component in components {
        if component.temporary {
            let needed:bool=store.db.connection().query_row("SELECT EXISTS(SELECT 1 FROM desired_files WHERE file=(SELECT json_extract(record,'$.file') FROM temporaries WHERE path=?1) AND completed=0)",[&component.path],|r|r.get(0))?;
            if !needed {
                fs::discard(root, store, &component.path)?;
            }
        }
    }
    Ok(())
}

fn stage(
    store: &Store,
    temporary: &super::store::Temporary,
    signature: &str,
    role: &Role,
    extension: &str,
    size: u64,
    hash: &str,
) -> Result<()> {
    let mut temporary = temporary.clone();
    temporary.original = Some(signature.into());
    temporary.role = Some(role.clone());
    temporary.extension = Some(extension.into());
    temporary.size = Some(size);
    temporary.hash = Some(hash.into());
    store.temporary(&temporary)
}
