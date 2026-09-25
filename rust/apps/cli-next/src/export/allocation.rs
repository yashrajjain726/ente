use anyhow::{Result, ensure};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::{
    names,
    store::{Album, Placement, Store},
};

#[derive(Serialize, Deserialize)]
struct Allocation {
    parent: String,
    name: String,
    kind: String,
    extensions: Option<(String, String)>,
    paths: Vec<String>,
}

pub fn seed(store: &Store) -> Result<()> {
    let transaction = store.db.connection().unchecked_transaction()?;
    names::reserve(store, "", "export.json", "root", "album")?;
    names::reserve(store, "", "Trash", "root", "album")?;
    let mut after = String::new();
    loop {
        let album: Option<Album> = store.json(
            "SELECT record FROM albums WHERE key>?1 ORDER BY key LIMIT 1",
            [&after],
        )?;
        let Some(album) = album else { break };
        after = album.key.clone();
        let (parent, name) = album.path.rsplit_once('/').unwrap_or(("", &album.path));
        ensure!(
            names::reserve(store, parent, name, &album.key, "album")?,
            super::Conflict(format!("overlapping album paths at {}", album.path))
        );
    }
    after.clear();
    loop {
        let placement: Option<Placement> = store.json(
            "SELECT record FROM placements WHERE id>?1 ORDER BY id LIMIT 1",
            [&after],
        )?;
        let Some(placement) = placement else { break };
        after = placement.id.clone();
        let owner = if placement.retained {
            placement.id.clone()
        } else {
            format!("file:{}:{}", placement.album, placement.file)
        };
        for media in &placement.media {
            ensure!(
                names::reserve(
                    store,
                    &placement.folder,
                    &media.component.path,
                    &owner,
                    placement.kind()?
                )?,
                super::Conflict(format!("overlapping media in {}", placement.folder))
            );
        }
    }
    store.db.connection().execute("DELETE FROM allocations WHERE EXISTS(SELECT 1 FROM desired_albums a WHERE a.selected=1 AND a.ready=1 AND a.failure IS NULL AND allocations.owner GLOB 'file:'||a.id||':*' AND NOT EXISTS(SELECT 1 FROM desired_files f WHERE allocations.owner='file:'||f.album||':'||f.file))", [])?;
    store.db.connection().execute("DELETE FROM allocations WHERE owner IN (SELECT coalesce(b.key,'active:'||a.id) FROM desired_albums a LEFT JOIN albums b ON b.id=a.id AND b.retained=0 WHERE a.selected=1 AND a.ready=1 AND a.failure IS NULL AND a.record IS NULL)", [])?;
    after.clear();
    loop {
        let next: Option<(String, String)> = store
            .db
            .connection()
            .query_row(
                "SELECT owner,record FROM allocations WHERE owner>?1 ORDER BY owner LIMIT 1",
                [&after],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((owner, record)) = next else { break };
        after = owner.clone();
        let allocation: Allocation = serde_json::from_str(&record)?;
        for path in &allocation.paths {
            ensure!(
                names::reserve(store, &allocation.parent, path, &owner, &allocation.kind)?,
                super::Conflict(format!(
                    "overlapping pending names in {}",
                    allocation.parent
                ))
            );
        }
    }
    transaction.commit()?;
    Ok(())
}

pub fn choose(
    store: &Store,
    parent: &str,
    name: &str,
    kind: &str,
    extensions: Option<(&str, &str)>,
    owner: &str,
) -> Result<Vec<String>> {
    let previous: Option<Allocation> =
        store.json("SELECT record FROM allocations WHERE owner=?1", [owner])?;
    let extensions =
        extensions.map(|(image, video)| (names::portable(image), names::portable(video)));
    if let Some(previous) = previous
        && previous.parent == parent
        && previous.name == name
        && previous.kind == kind
        && previous.extensions == extensions
    {
        return Ok(previous.paths);
    }
    let transaction = rusqlite::Transaction::new_unchecked(
        store.db.connection(),
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let paths = names::allocate(
        store,
        parent,
        name,
        kind,
        extensions
            .as_ref()
            .map(|(image, video)| (image.as_str(), video.as_str())),
        owner,
    )?;
    let allocation = Allocation {
        parent: parent.into(),
        name: name.into(),
        kind: kind.into(),
        extensions,
        paths: paths.clone(),
    };
    store.db.connection().execute("INSERT INTO allocations VALUES(?1,?2) ON CONFLICT(owner) DO UPDATE SET record=excluded.record", params![owner,serde_json::to_string(&allocation)?])?;
    transaction.commit()?;
    Ok(paths)
}

pub fn clear(store: &Store, owner: &str) -> Result<()> {
    store
        .db
        .connection()
        .execute("DELETE FROM allocations WHERE owner=?1", [owner])?;
    Ok(())
}

pub fn relocate(store: &Store, old: &str, new: &str) -> Result<()> {
    store.db.connection().execute(
        "UPDATE names SET parent=?1 WHERE parent=?2",
        params![new, old],
    )?;
    store.db.connection().execute("UPDATE allocations SET record=json_set(record,'$.parent',?1) WHERE json_extract(record,'$.parent')=?2", params![new,old])?;
    Ok(())
}

use rusqlite::OptionalExtension;
