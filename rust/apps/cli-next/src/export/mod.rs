mod adopt;
mod fs;
mod names;
mod reconcile;
mod store;
mod transfer;

use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use ente_photos::export::Root;
use rusqlite::{OptionalExtension, params};
use serde_json::json;

use tokio::sync::watch;

use crate::{
    api,
    args::{ExportArgs, Options, Product},
    db, home, output,
    replica::{AlbumRecord, FileRecord, Replica, canonical_id},
    vault::State,
};
use store::Store;

#[derive(Debug, thiserror::Error)]
#[error("conflict: {0}")]
pub struct Conflict(String);

#[derive(Debug, thiserror::Error)]
#[error("export cancelled")]
pub struct Cancelled;

pub async fn run(args: ExportArgs, selected: Option<&str>, options: &Options) -> Result<()> {
    ensure!(
        !options.offline,
        "export requires network access; remove --offline"
    );
    let selected = selected.map(str::to_owned);
    let as_json = options.json;
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        runtime.block_on(run_locked(args, selected.as_deref(), as_json))
    })
    .await?
}

async fn run_locked(args: ExportArgs, selected: Option<&str>, as_json: bool) -> Result<()> {
    let destination = destination(&args.destination)?;
    let mut state = State::load()?;
    let index = state.resolve(selected)?;
    let account = state.accounts.swap_remove(index);
    let session = api::session(&account, Product::Photos)?;
    let expected_root = Root::new(&session.master_key)?;
    let mut root_lock = open_root(&destination, &expected_root)?;
    ensure!(
        !args.adopt || root_lock.is_some(),
        "there is no export to adopt"
    );
    let account_home = home::lock_account(account.storage_id, true)?;
    let account = State::load()?
        .accounts
        .into_iter()
        .find(|a| a.storage_id == account.storage_id)
        .context("account was removed while waiting for access")?;
    let session = api::session(&account, Product::Photos)?;
    ensure!(
        Root::new(&session.master_key)?.source_verifier == expected_root.source_verifier,
        "account keys changed while waiting for access"
    );
    home::create(&account_home.path)?;
    let db_path = Store::path(&account_home.path, &destination)?;
    let existed = db_path.try_exists()?;
    ensure!(
        root_lock.is_none() || existed || args.adopt,
        "this export is not associated with this CLI home; use --adopt"
    );
    let store = Store::open(&db_path, &account.db_key, &destination, true)?;
    let bound: bool =
        store
            .db
            .connection()
            .query_row("SELECT bound FROM export WHERE id=1", [], |r| r.get(0))?;
    ensure!(
        root_lock.is_none() || bound || args.adopt,
        "this export requires --adopt"
    );
    store.reset_desired()?;
    if root_lock.is_some() && !bound {
        adopt::scan(&destination, &store)?;
    }
    let mut source_db = db::open(&account_home.path, &account.db_key, true)?;
    let mut replica = Replica::new(&mut source_db, session.user_id);
    eprintln!("Refreshing album metadata.");
    replica.sync_collections(&session).await?;
    let mut after = 0;
    loop {
        let next: Option<(i64, String, Option<String>)> = replica.db.read(|db| {
            Ok(db
                .query_row(
                    "SELECT id,record,name FROM photos_collections WHERE id>?1 ORDER BY id LIMIT 1",
                    [after],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?)
        })?;
        let Some((id, record, name)) = next else {
            break;
        };
        after = id;
        let record: AlbumRecord = serde_json::from_str(&record)?;
        store.desired_album(&record, session.user_id)?;
        if record.album(session.user_id).is_err() {
            store.db.connection().execute(
                "UPDATE desired_albums SET name=?1 WHERE id=?2",
                params![name, id],
            )?;
        }
    }
    store
        .db
        .connection()
        .execute(
            "INSERT OR IGNORE INTO desired_albums(id,name) SELECT s.id,json_extract(s.record,'$.name') FROM album_sources s WHERE EXISTS(SELECT 1 FROM albums a WHERE a.id=s.id)",
            [],
        )?;
    store
        .db
        .connection()
        .execute(
            "INSERT OR IGNORE INTO desired_albums(id,name) SELECT id,name FROM albums ORDER BY retained",
            [],
        )?;
    store
        .db
        .connection()
        .execute(
            "INSERT OR IGNORE INTO desired_albums(id,name) SELECT album,name FROM pending WHERE file IS NULL AND retained=0",
            [],
        )?;
    select(&store, &args)?;
    if root_lock.is_none() {
        root_lock = Some(initialize(&destination, &expected_root)?);
    }
    store
        .db
        .connection()
        .execute("UPDATE export SET bound=1 WHERE id=1 AND bound=0", [])?;
    let (cancel_send, mut cancel) = watch::channel(false);
    let signal_send = cancel_send.clone();
    let signal = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            signal_send.send_replace(true);
        }
    });
    let refresh_cancel = cancel.clone();
    let refreshed = tokio::select! {
        result=refresh(&store,&mut replica,&session,&refresh_cancel)=>result,
        _=cancel.changed()=>Err(Cancelled.into()),
    };
    drop(replica);
    drop(source_db);
    drop(account_home);
    let shared = Mutex::new(store);
    let run = reconcile::Run {
        root: &destination,
        store: &shared,
        cancel: &cancel,
    };
    let result = (|| {
        refreshed?;
        run.recover()?;
        run.albums()?;
        transfers(
            &destination,
            &shared,
            &session,
            &cancel_send,
            &cancel,
            args.jobs.get(),
        )?;
        run.check_cancel()?;
        run.retain_removed()
    })();
    signal.abort();
    if let Err(error) = result {
        run.report("run", &error)?;
    }
    if let Err(error) = run.cleanup(None) {
        run.report("run", &error)?;
    }
    let store = shared
        .into_inner()
        .map_err(|_| anyhow::anyhow!("export database mutex poisoned"))?;
    let complete = summary(&store, &destination, as_json)?;
    drop(root_lock);
    ensure!(complete, "export is incomplete");
    Ok(())
}

fn destination(path: &Path) -> Result<PathBuf> {
    let absolute = if path.is_absolute() {
        path.to_owned()
    } else {
        std::env::current_dir()?.join(path)
    };
    let mut base = absolute.as_path();
    let mut tail = Vec::new();
    while !base.try_exists()? {
        tail.push(
            base.file_name()
                .context("destination has no directory name")?
                .to_owned(),
        );
        base = base
            .parent()
            .context("destination has no existing parent")?;
    }
    if tail.is_empty() {
        ensure!(
            !std::fs::symlink_metadata(base)?.is_symlink(),
            "export destination is a symlink"
        );
    }
    let mut resolved = std::fs::canonicalize(base)?;
    for part in tail.into_iter().rev() {
        resolved.push(part);
    }
    Ok(resolved)
}

fn open_root(destination: &Path, expected: &Root) -> Result<Option<File>> {
    if !destination.try_exists()? {
        return Ok(None);
    }
    ensure!(
        destination.is_dir(),
        "export destination is not a directory"
    );
    let path = names::check(destination, "export.json")?;
    if !path.try_exists()? {
        ensure!(
            std::fs::read_dir(destination)?.next().is_none(),
            "nonempty destination has no recognized export.json"
        );
        return Ok(None);
    }
    let file = OpenOptions::new().read(true).write(true).open(&path)?;
    file.try_lock()
        .context("another writer is maintaining this export")?;
    let record: Root = serde_json::from_reader(&file).context("invalid export.json")?;
    ensure!(
        record.format == expected.format && record.version == expected.version,
        "unsupported export format"
    );
    ensure!(
        record.source_verifier == expected.source_verifier,
        "this export belongs to another source account"
    );
    Ok(Some(file))
}

fn initialize(destination: &Path, root: &Root) -> Result<File> {
    fs::create_directory(destination)?;
    let path = names::check(destination, "export.json")?;
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&path)
        .context("destination was initialized by another writer; retry")?;
    file.lock().context("cannot lock the new export")?;
    ensure!(
        std::fs::read_dir(destination)?
            .all(|entry| entry.is_ok_and(|entry| entry.file_name() == "export.json")),
        "destination became nonempty during initialization"
    );
    serde_json::to_writer_pretty(&mut file, root)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    fs::sync_parent(&path)?;
    Ok(file)
}

fn select(store: &Store, args: &ExportArgs) -> Result<()> {
    if args.album.is_empty() {
        store
            .db
            .connection()
            .execute("UPDATE desired_albums SET selected=1", [])?;
    }
    for (selectors, include) in [(&args.album, true), (&args.exclude_album, false)] {
        for selector in selectors {
            let mut query = store.db.connection().prepare(
                "SELECT id,name FROM desired_albums WHERE id=?1 OR name=?2 ORDER BY id LIMIT 11",
            )?;
            let candidates: Vec<(i64, Option<String>)> = query
                .query_map(params![canonical_id(selector), selector], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })?
                .collect::<rusqlite::Result<_>>()?;
            ensure!(!candidates.is_empty(), "no album matches {selector:?}");
            if candidates.len() != 1 {
                bail!(
                    "album {selector:?} is ambiguous: {}",
                    candidates
                        .iter()
                        .map(|(id, name)| format!(
                            "{id} {:?}",
                            name.as_deref().unwrap_or("unavailable")
                        ))
                        .collect::<Vec<_>>()
                        .join(", ")
                );
            }
            store.db.connection().execute(
                "UPDATE desired_albums SET selected=?1 WHERE id=?2",
                params![include, candidates[0].0],
            )?;
        }
    }
    Ok(())
}

async fn refresh(
    store: &Store,
    replica: &mut Replica<'_>,
    session: &ente_core::Session,
    cancel: &watch::Receiver<bool>,
) -> Result<()> {
    let need_favorites: bool = store.db.connection().query_row(
        "SELECT EXISTS(SELECT 1 FROM desired_albums WHERE selected=1 AND present=1)",
        [],
        |r| r.get(0),
    )?;
    let mut favorites_known = true;
    let mut after = 0;
    eprintln!("Refreshing selected albums and Favorites.");
    loop {
        ensure!(!*cancel.borrow(), Cancelled);
        let next: Option<(i64, bool, bool)> = store
            .db
            .connection()
            .query_row(
                "SELECT id,selected,favorites FROM desired_albums WHERE present=1 AND (selected=1 OR (favorites=1 AND ?1)) AND id>?2 ORDER BY id LIMIT 1",
                params![need_favorites, after],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let Some((id, selected, favorites)) = next else {
            break;
        };
        after = id;
        let result = async {
            replica.retry_album(session, id)?;
            let record = replica.album_record(id)?.context("missing album source")?;
            let album = record.album(session.user_id)?;
            replica.sync_album_files(session, &album).await?;
            store.desired_album(&record, session.user_id)?;
            if selected {
                store.snapshot_album(&album)?;
            }
            store
                .db
                .connection()
                .execute("UPDATE desired_albums SET ready=1 WHERE id=?1", [id])?;
            Ok::<_, anyhow::Error>(())
        }
        .await;
        if let Err(error) = result {
            if favorites {
                favorites_known = false;
            }
            store.db.connection().execute(
                "UPDATE desired_albums SET failure=?1 WHERE id=?2",
                params![error.to_string(), id],
            )?;
            if selected {
                record_outcome(store, &format!("album:{id}"), &error)?;
                eprintln!("album:{id}: {error:#}");
            }
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    store.db.connection().execute(
        "UPDATE desired_albums SET ready=1 WHERE selected=1 AND present=0",
        [],
    )?;
    if need_favorites && favorites_known {
        let mut after = 0;
        loop {
            let ids: Vec<i64> = replica.db.read(|db| {
                let mut query = db.prepare(
                    "SELECT DISTINCT f.id FROM photos_files f JOIN photos_collections c ON c.id=f.collection_id WHERE f.id>?1 AND json_extract(c.record,'$.remote.type')='favorites' AND json_extract(c.record,'$.remote.owner.id')=?2 ORDER BY f.id LIMIT 128",
                )?;
                Ok(query
                    .query_map(params![after, session.user_id], |r| r.get(0))?
                    .collect::<rusqlite::Result<_>>()?)
            })?;
            if ids.is_empty() {
                break;
            }
            let transaction = store.db.connection().unchecked_transaction()?;
            for id in ids {
                after = id;
                store
                    .db
                    .connection()
                    .execute("INSERT INTO favorites VALUES(?1)", [id])?;
            }
            transaction.commit()?;
        }
    }
    after = 0;
    loop {
        let id: Option<i64> = store
            .db
            .connection()
            .query_row(
                "SELECT id FROM desired_albums WHERE selected=1 AND ready=1 AND present=1 AND failure IS NULL AND id>?1 ORDER BY id LIMIT 1",
                [after],
                |r| r.get(0),
            )
            .optional()?;
        let Some(id) = id else { break };
        after = id;
        let mut after_file = 0;
        loop {
            ensure!(!*cancel.borrow(), Cancelled);
            let records: Vec<FileRecord> = replica.db.read(|db| {
                let mut query = db.prepare(
                    "SELECT record FROM photos_files WHERE collection_id=?1 AND id>?2 ORDER BY id LIMIT 128",
                )?;
                Ok(query
                    .query_map(params![id, after_file], |r| crate::replica::read_json(r, 0))?
                    .collect::<rusqlite::Result<_>>()?)
            })?;
            if records.is_empty() {
                break;
            }
            let transaction = store.db.connection().unchecked_transaction()?;
            for record in records {
                after_file = record.remote.id;
                let file = record.file(session.user_id);
                let failure = if !favorites_known {
                    Some("favorite state is incomplete".to_owned())
                } else {
                    file.as_ref().err().map(ToString::to_string)
                };
                store.db.connection().execute(
                    "INSERT INTO desired_files(album,file,favorited,failure) VALUES(?1,?2,?3,?4)",
                    params![
                        id,
                        record.remote.id,
                        if favorites_known { Some(false) } else { None },
                        failure
                    ],
                )?;
                if failure.is_none() {
                    let file = file?;
                    store.db.connection().execute(
                        "INSERT INTO chosen_files VALUES(?1,?2,?3) ON CONFLICT(file) DO UPDATE SET album=excluded.album,version=excluded.version WHERE excluded.version>chosen_files.version OR (excluded.version=chosen_files.version AND excluded.album<chosen_files.album)",
                        params![file.id, id, file.updated_at_micros],
                    )?;
                }
            }
            transaction.commit()?;
        }
    }
    store
        .db
        .connection()
        .execute(
            "UPDATE desired_files SET favorited=EXISTS(SELECT 1 FROM favorites WHERE favorites.file=desired_files.file) WHERE favorited IS NOT NULL",
            [],
        )?;
    let mut after_file = 0;
    loop {
        ensure!(!*cancel.borrow(), Cancelled);
        let mut query = store
            .db
            .connection()
            .prepare("SELECT album,file FROM chosen_files WHERE file>?1 ORDER BY file LIMIT 128")?;
        let chosen: Vec<(i64, i64)> = query
            .query_map([after_file], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        drop(query);
        if chosen.is_empty() {
            break;
        }
        let transaction = store.db.connection().unchecked_transaction()?;
        for (album, id) in chosen {
            after_file = id;
            let record = replica
                .file_record(album, id)?
                .context("missing chosen file source")?;
            store.snapshot_file(&record.file(session.user_id)?)?;
        }
        transaction.commit()?;
    }
    let transaction = store.db.connection().unchecked_transaction()?;
    store.db.connection().execute(
        "DELETE FROM sources WHERE file NOT IN (SELECT file FROM chosen_files)",
        [],
    )?;
    store
        .db
        .connection()
        .execute(
            "DELETE FROM album_sources WHERE id NOT IN (SELECT id FROM desired_albums WHERE selected=1 AND ready=1 AND present=1 AND failure IS NULL) AND NOT EXISTS(SELECT 1 FROM albums WHERE albums.id=album_sources.id) AND NOT EXISTS(SELECT 1 FROM pending WHERE album=album_sources.id)",
            [],
        )?;
    transaction.commit()?;
    let mut query = store
        .db
        .connection()
        .prepare("SELECT album,file,failure FROM desired_files WHERE failure IS NOT NULL")?;
    let mut rows = query.query([])?;
    while let Some(row) = rows.next()? {
        let unit = format!("file:{}:{}", row.get::<_, i64>(0)?, row.get::<_, i64>(1)?);
        let error = anyhow::anyhow!(row.get::<_, String>(2)?);
        record_outcome(store, &unit, &error)?;
        eprintln!("{unit}: {error:#}");
    }
    Ok(())
}

struct CancelWorkers<'a>(&'a watch::Sender<bool>);

impl Drop for CancelWorkers<'_> {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.0.send_replace(true);
        }
    }
}

fn transfers(
    root: &Path,
    store: &Mutex<Store>,
    session: &ente_core::Session,
    cancel_send: &watch::Sender<bool>,
    cancel: &watch::Receiver<bool>,
    jobs: usize,
) -> Result<()> {
    let (expected, files): (i64, i64) = store::lock(store)?.db.connection().query_row(
        "SELECT count(*),count(DISTINCT file) FROM desired_files WHERE failure IS NULL",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    eprintln!("Maintaining {expected} selected copies.");
    let runtime = tokio::runtime::Handle::current();
    let last_report = Mutex::new(None::<Instant>);
    std::thread::scope(|scope| {
        let mut workers = Vec::new();
        for _ in 0..jobs.min(files as usize) {
            let runtime = &runtime;
            let last_report = &last_report;
            workers.push(scope.spawn(move || {
                let _cancel_on_panic = CancelWorkers(cancel_send);
                let run = reconcile::Run { root, store, cancel };
                let result = (|| {
                    loop {
                        if *cancel.borrow() {
                            break;
                        }
                        let file = {
                            let store = store::lock(store)?;
                            let transaction = store.db.connection().unchecked_transaction()?;
                            let id: Option<i64> = store
                                .db
                                .connection()
                                .query_row(
                                    "SELECT file FROM desired_files WHERE failure IS NULL AND claimed=0 ORDER BY file LIMIT 1",
                                    [],
                                    |r| r.get(0),
                                )
                                .optional()?;
                            let Some(id) = id else {
                                break;
                            };
                            store
                                .db
                                .connection()
                                .execute(
                                    "UPDATE desired_files SET claimed=1 WHERE file=?1",
                                    [id],
                                )?;
                            let file: ente_photos::files::File = store
                                .json("SELECT record FROM sources WHERE file=?1", [id])?
                                .context("missing file source snapshot")?;
                            transaction.commit()?;
                            file
                        };
                        let id = file.id;
                        let result = runtime.block_on(run.file(session, file));
                        if result.as_ref().err().is_some_and(fatal) {
                            cancel_send.send_replace(true);
                        }
                        let reported = result.or_else(|error| run.block_file(id, error));
                        let cleaned = run.cleanup(Some(id));
                        reported?;
                        cleaned?;
                        let completed = {
                            let mut last = last_report.lock().map_err(|_| anyhow::anyhow!("progress mutex poisoned"))?;
                            if last.is_none_or(|time| time.elapsed() >= Duration::from_secs(2)) {
                                *last = Some(Instant::now());
                                Some(store::lock(store)?.db.connection().query_row(
                                    "SELECT count(*) FROM desired_files WHERE completed=1",
                                    [],
                                    |r| r.get::<_, i64>(0),
                                )?)
                            } else {
                                None
                            }
                        };
                        if let Some(completed) = completed {
                            eprintln!("Completed {completed}/{expected} selected copies.");
                        }
                    }
                    Ok(())
                })();
                if result.is_err() {
                    cancel_send.send_replace(true);
                }
                result
            }));
        }
        let mut result = Ok(());
        for worker in workers {
            let completed = worker
                .join()
                .unwrap_or_else(|_| Err(anyhow::anyhow!("export worker panicked")));
            if result.is_ok() {
                result = completed;
            }
        }
        result
    })
}

pub fn record_outcome(store: &Store, unit: &str, error: &anyhow::Error) -> Result<()> {
    let conflict = error.downcast_ref::<Conflict>().is_some();
    store
        .db
        .connection()
        .execute(
            "INSERT INTO outcomes VALUES(?1,?2) ON CONFLICT(unit) DO UPDATE SET conflict=max(conflict,excluded.conflict)",
            params![unit, conflict],
        )?;
    Ok(())
}

pub fn fatal(error: &anyhow::Error) -> bool {
    fatal_cause(error.as_ref())
}

fn fatal_cause(cause: &(dyn std::error::Error + 'static)) -> bool {
    if cause.is::<rusqlite::Error>()
        || cause.is::<Cancelled>()
        || matches!(
            cause.downcast_ref::<crate::core_db::Error>(),
            Some(crate::core_db::Error::Sqlite(_))
        )
        || cause
            .downcast_ref::<ente_core::http::Error>()
            .is_some_and(|error| error.status_code() == Some(401))
    {
        return true;
    }
    if let Some(error) = cause.downcast_ref::<std::io::Error>() {
        return error.kind() == std::io::ErrorKind::StorageFull
            || error.get_ref().is_some_and(|inner| fatal_cause(inner));
    }
    if let Some(error) = cause.downcast_ref::<ente_photos::files::Error>() {
        use ente_photos::files::Error;
        match error {
            Error::Http(error) => return fatal_cause(error),
            Error::Io(error) => return fatal_cause(error),
            Error::Collections(error) => return fatal_cause(error),
            _ => {}
        }
    }
    if let Some(ente_collections::Error::Http(error)) = cause.downcast_ref() {
        return fatal_cause(error);
    }
    if let Some(error) = cause.downcast_ref::<ente_photos::live_photo::Error>() {
        match error {
            ente_photos::live_photo::Error::Io(error) => return fatal_cause(error),
            ente_photos::live_photo::Error::Zip(error) => return fatal_cause(error),
            ente_photos::live_photo::Error::Components => {}
        }
    }
    cause.source().is_some_and(fatal_cause)
}

fn summary(store: &Store, destination: &Path, as_json: bool) -> Result<bool> {
    let unknown: bool = store.db.connection().query_row(
        "SELECT EXISTS(SELECT 1 FROM desired_albums WHERE selected=1 AND ready=0)",
        [],
        |r| r.get(0),
    )?;
    let (files, expected, completed): (i64, i64, i64) = store.db.connection().query_row(
        "SELECT count(DISTINCT file),count(*),coalesce(sum(completed),0) FROM desired_files",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let (failures, conflicts): (i64, i64) = store.db.connection().query_row(
        "SELECT count(*),coalesce(sum(conflict),0) FROM outcomes",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let (exported, metadata_updated, renamed, retained): (i64, i64, i64, i64) = store
        .db
        .connection()
        .query_row(
            "SELECT coalesce(sum(exported),0),coalesce(sum(metadata_updated),0),coalesce(sum(renamed),0),coalesce(sum(retained),0) FROM events",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;
    let complete = !unknown && failures == 0 && completed == expected;
    let result = json!({"destination":destination,"complete":complete,"files":if unknown {None}else{Some(files)},"copies":if unknown {None}else{Some(json!({"expected":expected,"completed":completed,"pending":expected-completed}))},"changes":{"exported":exported,"metadataUpdated":metadata_updated,"renamed":renamed,"retained":retained},"failures":failures,"conflicts":conflicts});
    output::action(
        as_json,
        &result,
        &format!(
            "{}: {completed}/{expected} copies complete, {exported} exported, {retained} retained, {failures} failures, {conflicts} conflicts.",
            destination.display()
        ),
    )?;
    Ok(complete)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transparent_errors_preserve_fatal_classification() {
        for status in [401, 404] {
            let error = ente_core::http::Error::Http {
                status,
                path: "/files".into(),
            };
            let error =
                ente_photos::files::Error::Collections(ente_collections::Error::Http(error));
            let error = anyhow::Error::new(error).context("download failed");
            assert_eq!(fatal(&error), status == 401);
            assert_eq!(
                format!("{error:#}"),
                format!("download failed: HTTP {status} at /files")
            );
        }
        let cancelled = ente_photos::live_photo::Error::Io(std::io::Error::other(Cancelled));
        assert!(fatal(&anyhow::Error::new(cancelled)));
        let full = ente_photos::live_photo::Error::Io(std::io::ErrorKind::StorageFull.into());
        assert!(fatal(&anyhow::Error::new(full)));
        let zip = ente_photos::live_photo::Error::Zip(zip::result::ZipError::Io(
            std::io::ErrorKind::StorageFull.into(),
        ));
        assert!(fatal(&anyhow::Error::new(zip)));
        let sqlite = crate::core_db::Error::Sqlite(rusqlite::Error::InvalidQuery);
        assert!(fatal(&anyhow::Error::new(sqlite)));
        let local = ente_photos::files::Error::Io(std::io::ErrorKind::PermissionDenied.into());
        assert!(!fatal(&anyhow::Error::new(local)));
    }
}
