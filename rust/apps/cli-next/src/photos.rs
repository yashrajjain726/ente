use std::{collections::BTreeMap, path::Path};

use anyhow::{Context, Result, bail};
use ente_photos::{collections, files};
use serde_json::json;

use crate::{
    api,
    args::{AlbumCommand, FileCommand, Product},
    output::{self, AlbumView, FileView},
    vault::State,
};

pub async fn album(command: AlbumCommand, selected: Option<&str>, json_output: bool) -> Result<()> {
    let state = State::load()?;
    let account = &state.accounts[state.resolve(selected)?];
    let session = api::session(account, Product::Photos)?;
    let albums = collections::list(&session).await?;
    match command {
        AlbumCommand::List => {
            let albums = albums
                .into_iter()
                .map(AlbumView::try_from)
                .collect::<Result<Vec<_>>>()?;
            if json_output {
                output::json(&albums)
            } else {
                output::albums(&albums)
            }
        }
        AlbumCommand::View { album } => {
            let album = select(albums, &album, "album", |a| (a.id, &a.name))?;
            let album = AlbumView::try_from(album)?;
            if json_output {
                output::json(&album)
            } else {
                output::album(&album)
            }
        }
    }
}

pub async fn file(
    command: FileCommand,
    album: Option<&str>,
    selected: Option<&str>,
    json_output: bool,
) -> Result<()> {
    let state = State::load()?;
    let account = &state.accounts[state.resolve(selected)?];
    let session = api::session(account, Product::Photos)?;
    let mut albums = collections::list(&session).await?;
    if let Some(selector) = album {
        albums = vec![select(albums, selector, "album", |a| (a.id, &a.name))?];
    }
    let mut entries: BTreeMap<i64, Entry> = BTreeMap::new();
    for album in albums {
        for file in files::list(&session, &album).await? {
            match entries.entry(file.id) {
                std::collections::btree_map::Entry::Vacant(entry) => {
                    entry.insert(Entry {
                        file,
                        album_ids: vec![album.id],
                    });
                }
                std::collections::btree_map::Entry::Occupied(mut entry) => {
                    let entry = entry.get_mut();
                    entry.album_ids.push(album.id);
                    if file.updated_at_micros > entry.file.updated_at_micros {
                        entry.file = file;
                    }
                }
            }
        }
    }
    let mut entries = entries.into_values().collect::<Vec<_>>();
    for entry in &mut entries {
        entry.album_ids.sort_unstable();
    }
    match command {
        FileCommand::List => {
            let views = entries
                .iter()
                .map(|entry| FileView::new(&entry.file, &entry.album_ids))
                .collect::<Result<Vec<_>>>()?;
            if json_output {
                output::json(&views)
            } else {
                output::files(&views)
            }
        }
        FileCommand::View { file } => {
            let entry = select(entries, &file, "file", |e| (e.file.id, &e.file.name))?;
            let view = FileView::new(&entry.file, &entry.album_ids)?;
            if json_output {
                output::json(&view)
            } else {
                output::file(&view)
            }
        }
        FileCommand::Download { file, output } => {
            let entry = select(entries, &file, "file", |e| (e.file.id, &e.file.name))?;
            let parent = output
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new("."));
            let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
            files::download(&session, &entry.file, temporary.as_file_mut()).await?;
            temporary.as_file().sync_all()?;
            let bytes = temporary.as_file().metadata()?.len();
            temporary
                .persist_noclobber(&output)
                .map_err(|error| error.error)
                .with_context(|| format!("cannot save download to {}", output.display()))?;
            output::action(
                json_output,
                &json!({ "id": entry.file.id.to_string(), "output": output, "bytes": bytes }),
                &format!("Downloaded {:?} to {}.", entry.file.name, output.display()),
            )
        }
    }
}

struct Entry {
    file: files::File,
    album_ids: Vec<i64>,
}

fn select<T>(
    items: Vec<T>,
    selector: &str,
    kind: &str,
    identity: impl Fn(&T) -> (i64, &str),
) -> Result<T> {
    let mut matches = items
        .into_iter()
        .filter(|item| {
            let (id, name) = identity(item);
            id.to_string() == selector || name == selector
        })
        .collect::<Vec<_>>();
    if matches.len() > 1 {
        let candidates = matches
            .iter()
            .map(|item| {
                let (id, name) = identity(item);
                format!("  {id}  {name:?}")
            })
            .collect::<Vec<_>>()
            .join("\n");
        bail!("{kind} {selector:?} is ambiguous:\n{candidates}");
    }
    matches
        .pop()
        .with_context(|| format!("no {kind} matches {selector:?}"))
}
