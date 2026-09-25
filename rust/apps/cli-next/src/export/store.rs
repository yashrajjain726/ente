use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, ensure};
use ente_core::crypto::hash;
use ente_photos::export::Component;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

use crate::{
    db, home,
    replica::{AlbumRecord, FileRecord},
    vault::DbKey,
};

pub struct Store {
    pub db: crate::core_db::Db,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Album {
    pub key: String,
    pub id: i64,
    pub name: String,
    pub path: String,
    pub retained: bool,
    pub metadata: Value,
    pub initialized: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Media {
    #[serde(flatten)]
    pub component: Component,
    pub properties: Option<Properties>,
    pub intended_time: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Placement {
    pub id: String,
    pub album: i64,
    pub folder: String,
    pub file: i64,
    pub retained: bool,
    pub name: String,
    pub original: String,
    pub media: Vec<Media>,
    pub metadata: Vec<Value>,
    pub complete: bool,
    pub retaining: bool,
}

impl Placement {
    pub fn kind(&self) -> Result<&str> {
        self.metadata
            .first()
            .and_then(|record| record["ente"]["type"].as_str())
            .context("missing placement media type")
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Properties {
    pub size: u64,
    pub modified: i128,
}

impl Properties {
    pub fn read(path: &Path) -> Result<Self> {
        let metadata = std::fs::symlink_metadata(path)?;
        ensure!(
            metadata.is_file() && !metadata.is_symlink(),
            super::Conflict(format!("at {}: expected a regular file", path.display()))
        );
        Ok(Self {
            size: metadata.len(),
            modified: system_time(metadata.modified()?),
        })
    }
}

pub fn system_time(time: SystemTime) -> i128 {
    match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_nanos() as i128,
        Err(error) => -(error.duration().as_nanos() as i128),
    }
}

#[derive(Serialize, Deserialize)]
pub struct JsonRecord {
    pub hash: String,
    pub properties: Properties,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Temporary {
    pub album: i64,
    pub path: String,
    pub file: Option<i64>,
    pub original: Option<String>,
    pub role: Option<ente_photos::export::Role>,
    pub extension: Option<String>,
    pub destination: Option<String>,
    pub hash: Option<String>,
    pub size: Option<u64>,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum Operation {
    Move {
        album: i64,
        file: Option<i64>,
        source: String,
        destination: String,
    },
    Remove {
        album: i64,
        path: String,
    },
}

impl Store {
    pub fn path(account_home: &Path, destination: &Path) -> Result<PathBuf> {
        let bytes = destination.as_os_str().as_encoded_bytes();
        let name: String = hash::hash(bytes, Some(32), None)?
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        Ok(account_home.join("exports").join(format!("{name}.db")))
    }

    pub fn open(path: &Path, key: &DbKey, destination: &Path, create: bool) -> Result<Self> {
        if create {
            home::create(path.parent().context("export DB has no parent")?)?;
        }
        let mut db = crate::core_db::Db::new(db::connect(path, key, create)?);
        if create {
            db.migrate(&[SCHEMA])?;
        }
        let connection = db.connection();
        let existing: Option<Vec<u8>> = connection
            .query_row("SELECT destination FROM export WHERE id=1", [], |r| {
                r.get(0)
            })
            .optional()?;
        if let Some(existing) = existing {
            ensure!(
                existing == destination.as_os_str().as_encoded_bytes(),
                "destination association does not match; use --adopt"
            );
        } else {
            connection.execute(
                "INSERT INTO export(id,destination) VALUES(1,?1)",
                [destination.as_os_str().as_encoded_bytes()],
            )?;
        }
        Ok(Self { db })
    }

    pub fn album(&self, id: i64, retained: bool) -> Result<Option<Album>> {
        self.json(
            "SELECT record FROM albums WHERE id=?1 AND retained=?2 ORDER BY rowid LIMIT 1",
            params![id, retained],
        )
    }

    pub fn save_album(&self, album: &Album) -> Result<()> {
        self.db.connection().execute("INSERT INTO albums VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(key) DO UPDATE SET name=excluded.name,path=excluded.path,record=excluded.record",params![album.key,album.id,album.retained,album.name,album.path,serde_json::to_string(album)?])?;
        Ok(())
    }

    pub fn placement(&self, album: i64, file: i64) -> Result<Option<Placement>> {
        self.json(
            "SELECT record FROM placements WHERE album=?1 AND file=?2 AND retained=0",
            params![album, file],
        )
    }

    pub fn save_placement(&self, placement: &Placement) -> Result<()> {
        self.db.connection().execute("INSERT INTO placements VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET album=excluded.album,file=excluded.file,retained=excluded.retained,record=excluded.record",params![placement.id,placement.album,placement.file,placement.retained,serde_json::to_string(placement)?])?;
        Ok(())
    }

    pub fn json<T: DeserializeOwned>(
        &self,
        sql: &str,
        parameters: impl rusqlite::Params,
    ) -> Result<Option<T>> {
        let text: Option<String> = self
            .db
            .connection()
            .query_row(sql, parameters, |r| r.get(0))
            .optional()?;
        text.map(|text| serde_json::from_str(&text).map_err(Into::into))
            .transpose()
    }

    pub fn temporary(&self, temporary: &Temporary) -> Result<()> {
        self.db.connection().execute("INSERT INTO temporaries VALUES(?1,?2) ON CONFLICT(path) DO UPDATE SET record=excluded.record",params![temporary.path,serde_json::to_string(temporary)?])?;
        Ok(())
    }

    pub fn operation(&self, operation: &Operation) -> Result<i64> {
        let (album, file) = match operation {
            Operation::Move { album, file, .. } => (*album, *file),
            Operation::Remove { album, .. } => (*album, None),
        };
        self.db.connection().execute(
            "INSERT INTO operations(album,file,record) VALUES(?1,?2,?3)",
            params![album, file, serde_json::to_string(operation)?],
        )?;
        Ok(self.db.connection().last_insert_rowid())
    }

    pub fn reset_desired(&self) -> Result<()> {
        self.db.connection().execute_batch("DELETE FROM desired_albums; DELETE FROM desired_files; DELETE FROM names; DELETE FROM outcomes; DELETE FROM events;")?;
        Ok(())
    }

    pub fn desired_album(&self, record: &AlbumRecord, user_id: i64) -> Result<()> {
        let name = record.album(user_id).ok().map(|a| a.name);
        self.db.connection().execute("INSERT INTO desired_albums(id,name,record) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,record=excluded.record",params![record.remote.id,name,serde_json::to_string(record)?])?;
        Ok(())
    }

    pub fn desired_file(
        &self,
        album: i64,
        record: &FileRecord,
        user_id: i64,
        favorited: Option<bool>,
    ) -> Result<()> {
        let result = record.file(user_id);
        let failure = result.as_ref().err().map(ToString::to_string);
        self.db.connection().execute("INSERT INTO desired_files(album,file,version,record,favorited,failure) VALUES(?1,?2,?3,?4,?5,?6)",params![album,record.remote.id,record.remote.updation_time,serde_json::to_string(record)?,favorited,failure])?;
        Ok(())
    }
}

const SCHEMA: &str = "
CREATE TABLE export (id INTEGER PRIMARY KEY CHECK(id=1), destination BLOB NOT NULL, bound INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE albums (key TEXT PRIMARY KEY, id INTEGER NOT NULL, retained INTEGER NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, record TEXT NOT NULL);
            CREATE UNIQUE INDEX active_album ON albums(id) WHERE retained=0;
            CREATE TABLE placements (id TEXT PRIMARY KEY, album INTEGER NOT NULL, file INTEGER NOT NULL, retained INTEGER NOT NULL, record TEXT NOT NULL);
            CREATE UNIQUE INDEX active_placement ON placements(album,file) WHERE retained=0;
            CREATE INDEX reusable_media ON placements(file,retained);
            CREATE TABLE json_records (path TEXT PRIMARY KEY, record TEXT NOT NULL);
            CREATE TABLE temporaries (path TEXT PRIMARY KEY, record TEXT NOT NULL);
            CREATE INDEX temporary_file ON temporaries(json_extract(record,'$.file'));
            CREATE TABLE operations (id INTEGER PRIMARY KEY, album INTEGER NOT NULL, file INTEGER, record TEXT NOT NULL);
            CREATE TABLE desired_albums (id INTEGER PRIMARY KEY, name TEXT, record TEXT, selected INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0, failure TEXT);
            CREATE TABLE desired_files (album INTEGER NOT NULL, file INTEGER NOT NULL, version INTEGER NOT NULL, record TEXT NOT NULL, favorited INTEGER, completed INTEGER NOT NULL DEFAULT 0, failure TEXT, running INTEGER NOT NULL DEFAULT 0, attempted INTEGER NOT NULL DEFAULT 0, deferred INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(album,file));
            CREATE INDEX desired_file_id ON desired_files(file,album);
            CREATE INDEX eligible_files ON desired_files(deferred,file) WHERE failure IS NULL AND attempted=0 AND running=0;
            CREATE TABLE outcomes (unit TEXT PRIMARY KEY, conflict INTEGER NOT NULL);
            CREATE TABLE events (placement TEXT PRIMARY KEY, exported INTEGER NOT NULL DEFAULT 0, metadata_updated INTEGER NOT NULL DEFAULT 0, renamed INTEGER NOT NULL DEFAULT 0, retained INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE allocations (owner TEXT PRIMARY KEY, record TEXT NOT NULL);
            CREATE TABLE names (parent TEXT NOT NULL, folded TEXT NOT NULL, owner TEXT NOT NULL, stem TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(parent,folded));
            CREATE INDEX named_stems ON names(parent,stem);
";
