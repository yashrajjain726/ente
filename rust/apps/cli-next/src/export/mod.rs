mod adopt;
mod allocation;
mod fs;
mod names;
mod reconcile;
mod store;
mod transfer;

use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
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
    vault::{DbKey, State},
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
    store.db.connection().execute("INSERT OR IGNORE INTO desired_albums(id,name) SELECT id,name FROM albums ORDER BY retained",[])?;
    store.db.connection().execute("INSERT OR IGNORE INTO desired_albums(id,name) SELECT CAST(substr(owner,8) AS INTEGER),json_extract(record,'$.name') FROM allocations WHERE owner GLOB 'active:*'",[])?;
    select(&store, &args)?;
    if root_lock.is_none() {
        root_lock = Some(initialize(&destination, &expected_root)?);
    }
    store
        .db
        .connection()
        .execute("UPDATE export SET bound=1 WHERE id=1", [])?;
    let (cancel_send, mut cancel) = watch::channel(false);
    let signal = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            cancel_send.send_replace(true);
        }
    });
    let refresh_cancel = cancel.clone();
    let refreshed = tokio::select! {
        result=refresh(&store,&mut replica,&session,args.retry_failed,&refresh_cancel)=>result,
        _=cancel.changed()=>Err(Cancelled.into()),
    };
    drop(replica);
    drop(source_db);
    drop(account_home);
    let context = Arc::new(transfer::Context {
        root: destination.clone(),
        db_path,
        db_key: DbKey(account.db_key.0),
        session,
    });
    let result = async {
        refreshed?;
        fs::recover(&destination, &store, &cancel)?;
        allocation::seed(&store)?;
        reconcile::albums(&destination, &store, context.session.user_id)?;
        transfers(context.clone(), &store, cancel.clone()).await?;
        if *cancel.borrow() {
            bail!(Cancelled)
        }
        reconcile::retain_removed(&destination, &store)?;
        Ok::<(), anyhow::Error>(())
    }
    .await;
    signal.abort();
    if let Err(error) = result {
        report(&store, "run", &error)?;
    }
    cleanup(&destination, &store)?;
    let complete = summary(&store, &destination, options.json)?;
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
    std::fs::create_dir_all(destination)?;
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
    retry: bool,
    cancel: &watch::Receiver<bool>,
) -> Result<()> {
    let need_favorites: bool = store.db.connection().query_row(
        "SELECT EXISTS(SELECT 1 FROM desired_albums WHERE selected=1 AND record IS NOT NULL)",
        [],
        |r| r.get(0),
    )?;
    let mut favorites_known = true;
    let mut after = 0;
    loop {
        let next:Option<(i64,String,bool)>=store.db.connection().query_row("SELECT id,record,selected FROM desired_albums WHERE id>?1 AND record IS NOT NULL ORDER BY id LIMIT 1",[after],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?;
        let Some((id, record, selected)) = next else {
            break;
        };
        after = id;
        let record: AlbumRecord = serde_json::from_str(&record)?;
        if !need_favorites
            || record.remote.kind != "favorites"
            || record.remote.owner.id != session.user_id
        {
            continue;
        }
        if *cancel.borrow() {
            bail!(Cancelled)
        }
        replica.retry_album(session, id, retry)?;
        let result = async {
            let record = replica
                .album_record(id)?
                .context("missing favorites source")?;
            let album = record.album(session.user_id)?;
            replica.sync_album_files(session, &album, retry).await?;
            store.desired_album(&record, session.user_id)?;
            Ok::<_, anyhow::Error>(())
        }
        .await;
        if let Err(error) = result {
            favorites_known = false;
            if selected {
                report(store, &format!("album:{id}"), &error)?;
            }
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    let selected: i64 = store.db.connection().query_row(
        "SELECT count(*) FROM desired_albums WHERE selected=1",
        [],
        |r| r.get(0),
    )?;
    eprintln!("Refreshing files in {selected} selected albums.");
    let mut progress = Instant::now();
    let mut refreshed = 0;
    after = 0;
    loop {
        let next:Option<(i64,Option<String>)>=store.db.connection().query_row("SELECT id,record FROM desired_albums WHERE selected=1 AND id>?1 ORDER BY id LIMIT 1",[after],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let Some((id, record)) = next else { break };
        after = id;
        if *cancel.borrow() {
            bail!(Cancelled)
        }
        let Some(_) = record else {
            store
                .db
                .connection()
                .execute("UPDATE desired_albums SET ready=1 WHERE id=?1", [id])?;
            continue;
        };
        let result=async {
            replica.retry_album(session,id,retry)?;
            let record=replica.album_record(id)?.context("missing album source")?;
            let album=record.album(session.user_id)?;
            replica.sync_album_files(session,&album,retry).await?;
            store.desired_album(&record,session.user_id)?;
            let mut after_file=0;
            loop {
                let records:Vec<FileRecord>=replica.db.read(|db| {
                    let mut query=db.prepare("SELECT record FROM photos_files WHERE collection_id=?1 AND id>?2 ORDER BY id LIMIT 128")?;
                    Ok(query.query_map(params![id,after_file],|r|crate::replica::read_json(r,0))?.collect::<rusqlite::Result<_>>()?)
                })?;
                if records.is_empty() {break;}
                let transaction=store.db.connection().unchecked_transaction()?;
                for record in records {
                    after_file=record.remote.id;
                    let favorited=if favorites_known {Some(replica.db.read(|db|Ok(db.query_row("SELECT EXISTS(SELECT 1 FROM photos_files f JOIN photos_collections c ON c.id=f.collection_id WHERE f.id=?1 AND json_extract(c.record,'$.remote.type')='favorites' AND json_extract(c.record,'$.remote.owner.id')=?2)",params![record.remote.id,session.user_id],|r|r.get::<_,bool>(0))?))?)} else {None};
                    store.desired_file(id,&record,session.user_id,favorited)?;
                    if !favorites_known {store.db.connection().execute("UPDATE desired_files SET failure='favorite state is incomplete' WHERE album=?1 AND file=?2",params![id,record.remote.id])?;}
                }
                transaction.commit()?;
            }
            store.db.connection().execute("UPDATE desired_albums SET ready=1 WHERE id=?1",[id])?;
            Ok::<_,anyhow::Error>(())
        }.await;
        if let Err(error) = result {
            store.db.connection().execute(
                "UPDATE desired_albums SET failure=?1 WHERE id=?2",
                params![error.to_string(), id],
            )?;
            report(store, &format!("album:{id}"), &error)?;
            if fatal(&error) {
                return Err(error);
            }
        }
        refreshed += 1;
        if progress.elapsed().as_secs() >= 2 {
            eprintln!("Refreshed {refreshed}/{selected} albums.");
            progress = Instant::now();
        }
    }
    let mut query = store
        .db
        .connection()
        .prepare("SELECT album,file,failure FROM desired_files WHERE failure IS NOT NULL")?;
    let mut rows = query.query([])?;
    while let Some(row) = rows.next()? {
        report(
            store,
            &format!("file:{}:{}", row.get::<_, i64>(0)?, row.get::<_, i64>(1)?),
            &anyhow::anyhow!(row.get::<_, String>(2)?),
        )?;
    }
    Ok(())
}

async fn transfers(
    context: Arc<transfer::Context>,
    store: &Store,
    cancel: watch::Receiver<bool>,
) -> Result<()> {
    let expected: i64 =
        store
            .db
            .connection()
            .query_row("SELECT count(*) FROM desired_files", [], |r| r.get(0))?;
    eprintln!("Maintaining {expected} selected copies.");
    let mut work = tokio::task::JoinSet::new();
    let result=async {
        let ceiling=(256*1024*1024/ente_core::crypto::stream::DECRYPTION_CHUNK_SIZE).max(1);
        let mut admission=std::thread::available_parallelism().map(usize::from).unwrap_or(1).min(ceiling);
        let mut measured=Instant::now();let mut completed_bytes=0u64;let mut previous_rate=0.0;
        loop {
            while work.len()<admission && !*cancel.borrow() {
                let staged:i64=store.db.connection().query_row("SELECT count(DISTINCT json_extract(t.record,'$.file')) FROM temporaries t WHERE NOT EXISTS(SELECT 1 FROM desired_files f WHERE f.file=json_extract(t.record,'$.file') AND f.running=1)",[],|r|r.get(0))?;
                let available=staged as usize+work.len()<ceiling;
                let staged:Option<i64>=store.db.connection().query_row("SELECT json_extract(t.record,'$.file') FROM temporaries t WHERE EXISTS(SELECT 1 FROM desired_files f WHERE f.file=json_extract(t.record,'$.file') AND f.failure IS NULL AND f.attempted=0 AND f.running=0) ORDER BY json_extract(t.record,'$.file') LIMIT 1",[],|r|r.get(0)).optional()?;
                let next=if let Some(id)=staged {Some((id,true))} else {
                    store.db.connection().query_row("SELECT file FROM desired_files WHERE failure IS NULL AND attempted=0 AND running=0 AND deferred<=?1 ORDER BY deferred,file LIMIT 1",[available],|r|Ok((r.get(0)?,false))).optional()?
                };
                let Some((id,staged))=next else {break};
                store.db.connection().execute("UPDATE desired_files SET running=1 WHERE file=?1",[id])?;
                let context=context.clone();let cancel=cancel.clone();
                work.spawn(async move {(id,transfer::prepare(context,id,cancel,available || staged).await)});
            }
            let Some(result)=work.join_next().await else {break};
            let (id,result)=result?;
            store.db.connection().execute("UPDATE desired_files SET running=0 WHERE file=?1",[id])?;
            transfer::discard_incomplete(&context.root,store,id)?;
            let result=match result {
                Ok(transfer::Preparation::Ready(mut prepared))=>{
                    completed_bytes+=prepared.components.iter().filter(|c|c.temporary).map(|c|c.size).sum::<u64>();
                    if !*cancel.borrow() {reconcile::file(&context.root,store,&mut prepared,&cancel)?;}
                    transfer::finish_source(&context.root,store,&prepared.components)
                },
                Ok(transfer::Preparation::AwaitingCapacity)=>{
                    store.db.connection().execute("UPDATE desired_files SET deferred=1 WHERE file=?1",[id])?;
                    Ok(())
                },
                Err(error)=>Err(error),
            };
            if let Err(error)=result {
                let mut query=store.db.connection().prepare("SELECT album FROM desired_files WHERE file=?1 AND attempted=0 AND failure IS NULL")?;
                let albums:Vec<i64>=query.query_map([id],|r|r.get(0))?.collect::<rusqlite::Result<_>>()?;drop(query);
                for album in albums {report(store,&format!("file:{album}:{id}"),&error)?;}
                store.db.connection().execute("UPDATE desired_files SET failure=?1 WHERE file=?2 AND attempted=0",params![error.to_string(),id])?;
                if fatal(&error) {return Err(error)}
            }
            if measured.elapsed().as_secs_f64()>=2.0 {
                let completed:i64=store.db.connection().query_row("SELECT count(*) FROM desired_files WHERE completed=1",[],|r|r.get(0))?;
                eprintln!("Exporting: {completed}/{expected} copies complete.");
                let rate=completed_bytes as f64/measured.elapsed().as_secs_f64();
                if completed_bytes>0 && (previous_rate==0.0 || rate>previous_rate*1.1) {admission=(admission*2).min(ceiling);}
                previous_rate=rate;measured=Instant::now();completed_bytes=0;
            }
        }
        let mut query=store.db.connection().prepare("SELECT album,file FROM desired_files WHERE deferred=1 AND attempted=0 AND failure IS NULL")?;
        let mut rows=query.query([])?;
        while let Some(row)=rows.next()? {
            let album:i64=row.get(0)?;let file:i64=row.get(1)?;
            report(store,&format!("file:{album}:{file}"),&anyhow::anyhow!("completed transfers have filled export staging; resolve the reported destination failures and retry"))?;
        }
        Ok(())
    }.await;
    work.abort_all();
    while work.join_next().await.is_some() {}
    result
}

pub fn report(store: &Store, unit: &str, error: &anyhow::Error) -> Result<()> {
    let conflict = error.downcast_ref::<Conflict>().is_some();
    store.db.connection().execute("INSERT INTO outcomes VALUES(?1,?2) ON CONFLICT(unit) DO UPDATE SET conflict=max(conflict,excluded.conflict)",params![unit,conflict])?;
    eprintln!("{unit}: {error:#}");
    Ok(())
}

pub fn fatal(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause.downcast_ref::<rusqlite::Error>().is_some()
            || cause.downcast_ref::<Cancelled>().is_some()
            || cause
                .downcast_ref::<std::io::Error>()
                .is_some_and(|e| matches!(e.kind(), std::io::ErrorKind::StorageFull))
            || cause
                .downcast_ref::<ente_core::http::Error>()
                .is_some_and(|e| e.status_code() == Some(401))
    })
}

fn cleanup(root: &Path, store: &Store) -> Result<()> {
    let mut after = String::new();
    loop {
        let temporary:Option<store::Temporary>=store.json("SELECT record FROM temporaries WHERE path>?1 AND json_extract(record,'$.destination') IS NULL AND (json_extract(record,'$.hash') IS NULL OR (EXISTS(SELECT 1 FROM desired_files WHERE file=json_extract(temporaries.record,'$.file')) AND NOT EXISTS(SELECT 1 FROM desired_files WHERE file=json_extract(temporaries.record,'$.file') AND completed=0))) AND json_extract(record,'$.album') IN (SELECT id FROM desired_albums WHERE selected=1) ORDER BY path LIMIT 1",[&after])?;
        let Some(temporary) = temporary else { break };
        after = temporary.path.clone();
        if let Err(error) = fs::discard(root, store, &temporary.path) {
            let unit = if let Some(file) = temporary.file {
                format!("file:{}:{file}", temporary.album)
            } else {
                format!("album:{}", temporary.album)
            };
            report(store, &unit, &error)?;
            if fatal(&error) {
                return Err(error);
            }
        }
    }
    Ok(())
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
    let (exported,metadata_updated,renamed,retained):(i64,i64,i64,i64)=store.db.connection().query_row("SELECT coalesce(sum(exported),0),coalesce(sum(metadata_updated),0),coalesce(sum(renamed),0),coalesce(sum(retained),0) FROM events",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
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
