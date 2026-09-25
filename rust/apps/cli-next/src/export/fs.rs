use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::Path,
    time::{Duration, UNIX_EPOCH},
};

use anyhow::{Context, Result, ensure};
use ente_core::{
    b64,
    crypto::hash::{self, HashState},
};
use rusqlite::params;
use serde_json::Value;
use tokio::sync::watch;
use uuid::Uuid;

use super::{
    names,
    store::{JsonRecord, Operation, Properties, Store, Temporary},
};

pub struct HashWriter {
    pub file: File,
    digest: HashState,
    pub size: u64,
    cancel: watch::Receiver<bool>,
}

impl HashWriter {
    pub fn new(file: File, cancel: &watch::Receiver<bool>) -> Result<Self> {
        Ok(Self {
            file,
            digest: HashState::new(Some(64), None)?,
            size: 0,
            cancel: cancel.clone(),
        })
    }

    pub fn finish(self) -> Result<(File, u64, String)> {
        self.file.sync_all()?;
        Ok((self.file, self.size, b64::encode(&self.digest.finalize()?)))
    }
}

impl Write for HashWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if *self.cancel.borrow() {
            return Err(io::Error::other(super::Cancelled));
        }
        let written = self.file.write(bytes)?;
        self.digest
            .update(&bytes[..written])
            .map_err(io::Error::other)?;
        self.size += written as u64;
        Ok(written)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

pub fn hash_cancellable(path: &Path, cancel: &watch::Receiver<bool>) -> Result<(u64, String)> {
    let mut file = File::open(path)?;
    let mut digest = HashState::new(Some(64), None)?;
    let mut bytes = vec![0u8; 64 * 1024];
    let mut size = 0;
    loop {
        ensure!(!*cancel.borrow(), super::Cancelled);
        let read = file.read(&mut bytes)?;
        if read == 0 {
            break;
        }
        digest.update(&bytes[..read])?;
        size += read as u64;
    }
    Ok((size, b64::encode(&digest.finalize()?)))
}

pub fn directory(root: &Path, relative: &str) -> Result<()> {
    let path = names::check(root, relative)?;
    match fs::symlink_metadata(&path) {
        Ok(meta) => ensure!(
            meta.is_dir(),
            super::Conflict(format!("expected directory at {}", path.display()))
        ),
        Err(error) if error.kind() == io::ErrorKind::NotFound => fs::create_dir_all(&path)?,
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn temporary(
    root: &Path,
    store: &Store,
    directory: &str,
    file_id: Option<i64>,
) -> Result<(Temporary, File)> {
    self::directory(root, directory)?;
    let path = format!("{directory}/.ente-{}.part", Uuid::new_v4().simple());
    let album:i64=store.db.connection().query_row("SELECT id FROM albums WHERE ?1=path OR substr(?1,1,length(path)+1)=path||'/' ORDER BY length(path) DESC LIMIT 1",[directory],|r|r.get(0))?;
    let temporary = Temporary {
        album,
        path,
        file: file_id,
        original: None,
        role: None,
        extension: None,
        destination: None,
        hash: None,
        size: None,
    };
    store.temporary(&temporary)?;
    let file = OpenOptions::new()
        .write(true)
        .read(true)
        .create_new(true)
        .open(names::check(root, &temporary.path)?);
    match file {
        Ok(file) => Ok((temporary, file)),
        Err(error) => {
            store
                .db
                .connection()
                .execute("DELETE FROM temporaries WHERE path=?1", [&temporary.path])?;
            Err(error.into())
        }
    }
}

pub fn publish(
    root: &Path,
    store: &Store,
    mut temporary: Temporary,
    destination: &str,
    size: u64,
    hash: String,
) -> Result<()> {
    temporary.destination = Some(destination.into());
    temporary.size = Some(size);
    temporary.hash = Some(hash);
    store.temporary(&temporary)?;
    finish_publication(root, store, &temporary, None)
}

fn finish_publication(
    root: &Path,
    store: &Store,
    temporary: &Temporary,
    verify: Option<&watch::Receiver<bool>>,
) -> Result<()> {
    let source = names::check(root, &temporary.path)?;
    let destination = names::check(
        root,
        temporary
            .destination
            .as_deref()
            .context("publication has no destination")?,
    )?;
    match fs::symlink_metadata(&source) {
        Ok(metadata) => {
            ensure!(
                metadata.is_file(),
                super::Conflict(format!("at {}: expected temporary file", source.display()))
            );
            if let Some(cancel) = verify {
                let (size, hash) = hash_cancellable(&source, cancel)?;
                if Some(size) != temporary.size || Some(&hash) != temporary.hash.as_ref() {
                    return discard(root, store, &temporary.path);
                }
            }
            if let Ok(meta) = fs::symlink_metadata(&destination) {
                ensure!(
                    meta.is_file(),
                    super::Conflict(format!(
                        "at {}: expected a regular file",
                        destination.display()
                    ))
                );
            }
            fs::rename(&source, &destination)?;
            sync_parent(&destination)?;
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            if destination.try_exists()? {
                Properties::read(&destination)?;
            }
        }
        Err(error) => return Err(error.into()),
    }
    store
        .db
        .connection()
        .execute("DELETE FROM temporaries WHERE path=?1", [&temporary.path])?;
    Ok(())
}

pub fn json(
    root: &Path,
    store: &Store,
    path: &str,
    value: &Value,
    associated: bool,
    file_id: Option<i64>,
) -> Result<bool> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    let hash = b64::encode(&hash::hash(&bytes, Some(64), None)?);
    let destination = names::check(root, path)?;
    let recorded: Option<JsonRecord> =
        store.json("SELECT record FROM json_records WHERE path=?1", [path])?;
    let properties = match fs::symlink_metadata(&destination) {
        Ok(_) => Some(Properties::read(&destination)?),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    ensure!(
        associated || properties.is_none(),
        super::Conflict(format!("at {}: unrelated JSON", destination.display()))
    );
    if let (Some(recorded), Some(properties)) = (&recorded, &properties)
        && recorded.hash == hash
        && recorded.properties == *properties
    {
        return Ok(false);
    }
    let parent = path
        .rsplit_once('/')
        .context("JSON has no album directory")?
        .0;
    let (temporary, mut file) = self::temporary(root, store, parent, file_id)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    publish(
        root,
        store,
        temporary,
        path,
        bytes.len() as u64,
        hash.clone(),
    )?;
    let record = JsonRecord {
        hash,
        properties: Properties::read(&destination)?,
    };
    store.db.connection().execute("INSERT INTO json_records VALUES(?1,?2) ON CONFLICT(path) DO UPDATE SET record=excluded.record",params![path,serde_json::to_string(&record)?])?;
    Ok(true)
}

pub fn set_time(path: &Path, micros: i64) -> Result<Properties> {
    let duration = Duration::from_micros(micros.unsigned_abs());
    let time = if micros >= 0 {
        UNIX_EPOCH.checked_add(duration)
    } else {
        UNIX_EPOCH.checked_sub(duration)
    }
    .context("media timestamp is outside filesystem range")?;
    File::options().write(true).open(path)?.set_modified(time)?;
    Properties::read(path)
}

pub fn operations(root: &Path, store: &Store, album: i64, file: Option<i64>) -> Result<()> {
    loop {
        let operation:Option<(i64,String)>=store.db.connection().query_row("SELECT id,record FROM operations WHERE album=?1 AND file IS ?2 ORDER BY id LIMIT 1",params![album,file],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let Some((id, json)) = operation else { break };
        match serde_json::from_str::<Operation>(&json)? {
            Operation::Move {
                source,
                destination,
                ..
            } => {
                let source = names::check(root, &source)?;
                let destination = names::check(root, &destination)?;
                if source.try_exists()? {
                    ensure!(
                        !destination.try_exists()? || names::same_path(&source, &destination),
                        super::Conflict(format!(
                            "at {}: occupied rename target",
                            destination.display()
                        ))
                    );
                    if let Some(parent) = destination.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    fs::rename(&source, &destination)?;
                    sync_parent(&destination)?;
                }
            }
            Operation::Remove { path, .. } => {
                let path = names::check(root, &path)?;
                match fs::remove_file(&path) {
                    Ok(()) => {}
                    Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                    Err(e) => return Err(e.into()),
                }
            }
        }
        store
            .db
            .connection()
            .execute("DELETE FROM operations WHERE id=?1", [id])?;
    }
    Ok(())
}

pub fn recover(root: &Path, store: &Store, cancel: &watch::Receiver<bool>) -> Result<()> {
    let mut query=store.db.connection().prepare("SELECT DISTINCT o.album,o.file FROM operations o JOIN desired_albums a ON a.id=o.album WHERE a.selected=1 AND a.ready=1 AND a.failure IS NULL AND NOT EXISTS(SELECT 1 FROM desired_files f WHERE f.album=o.album AND f.file=o.file AND f.failure IS NOT NULL) ORDER BY o.album,o.file")?;
    let mut rows = query.query([])?;
    while let Some(row) = rows.next()? {
        ensure!(!*cancel.borrow(), super::Cancelled);
        let album = row.get(0)?;
        let file = row.get(1)?;
        if let Err(error) = operations(root, store, album, file) {
            block(store, album, file, error)?;
        }
    }
    let mut after = String::new();
    loop {
        ensure!(!*cancel.borrow(), super::Cancelled);
        let temporary:Option<Temporary>=store.json("SELECT record FROM temporaries WHERE path>?1 AND (json_extract(record,'$.destination') IS NOT NULL OR json_extract(record,'$.hash') IS NULL) AND json_extract(record,'$.album') IN (SELECT id FROM desired_albums WHERE selected=1 AND ready=1 AND failure IS NULL) AND NOT EXISTS(SELECT 1 FROM desired_files f WHERE f.album=json_extract(temporaries.record,'$.album') AND f.file=json_extract(temporaries.record,'$.file') AND f.failure IS NOT NULL) ORDER BY path LIMIT 1",[&after])?;
        let Some(temporary) = temporary else { break };
        after = temporary.path.clone();
        let result = if temporary.destination.is_some() {
            finish_publication(root, store, &temporary, Some(cancel))
        } else {
            discard(root, store, &temporary.path)
        };
        if let Err(error) = result {
            block(store, temporary.album, temporary.file, error)?;
        }
    }
    Ok(())
}

fn block(store: &Store, album: i64, file: Option<i64>, error: anyhow::Error) -> Result<()> {
    let unit = if let Some(file) = file {
        format!("file:{album}:{file}")
    } else {
        format!("album:{album}")
    };
    super::report(store, &unit, &error)?;
    if file.is_none() {
        store.db.connection().execute(
            "UPDATE desired_albums SET failure=?1 WHERE id=?2",
            params![error.to_string(), album],
        )?;
    }
    store.db.connection().execute(
        "UPDATE desired_files SET failure=?1 WHERE album=?2 AND (?3 IS NULL OR file=?3)",
        params![error.to_string(), album, file],
    )?;
    if super::fatal(&error) {
        return Err(error);
    }
    Ok(())
}

pub fn discard(root: &Path, store: &Store, path: &str) -> Result<()> {
    let absolute = names::check(root, path)?;
    match fs::remove_file(absolute) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    store
        .db
        .connection()
        .execute("DELETE FROM temporaries WHERE path=?1", [path])?;
    Ok(())
}

pub fn sync_parent(path: &Path) -> Result<()> {
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        File::open(parent)?.sync_all()?;
    }
    Ok(())
}

use rusqlite::OptionalExtension;
