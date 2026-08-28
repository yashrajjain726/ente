use std::io::Write;

use anyhow::{Context, Result};
use chrono::{DateTime, SecondsFormat};
use ente_photos::collections::{Collection, Visibility};
use serde::Serialize;
use uuid::Uuid;

use crate::{args::Product, vault::Account};

#[derive(Serialize)]
pub struct AccountView<'a> {
    id: String,
    name: &'a str,
    email: &'a str,
    host: &'a str,
    products: Vec<Product>,
    selected: bool,
}

impl<'a> AccountView<'a> {
    pub fn new(account: &'a Account, selected: Option<Uuid>) -> Self {
        Self {
            id: account.user_id.to_string(),
            name: &account.name,
            email: &account.email,
            host: &account.origin,
            products: account.sessions.keys().copied().collect(),
            selected: selected == Some(account.storage_id),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumView {
    id: String,
    name: String,
    #[serde(rename = "type")]
    kind: String,
    visibility: &'static str,
    owner_id: String,
    updated_at: String,
}

impl TryFrom<Collection> for AlbumView {
    type Error = anyhow::Error;

    fn try_from(album: Collection) -> Result<Self> {
        let updated_at = DateTime::from_timestamp_micros(album.updated_at_micros)
            .context("album timestamp is outside the supported range")?
            .to_rfc3339_opts(SecondsFormat::Micros, true);
        Ok(Self {
            id: album.id.to_string(),
            name: album.name,
            kind: album.kind,
            visibility: match album.visibility {
                Visibility::Visible => "visible",
                Visibility::Archived => "archived",
                Visibility::Hidden => "hidden",
            },
            owner_id: album.owner_id.to_string(),
            updated_at,
        })
    }
}

pub fn json(value: &impl Serialize) -> Result<()> {
    let mut stdout = std::io::stdout().lock();
    serde_json::to_writer(&mut stdout, value)?;
    writeln!(stdout)?;
    Ok(())
}

pub fn action(as_json: bool, value: &impl Serialize, message: &str) -> Result<()> {
    if as_json {
        json(value)
    } else {
        writeln!(std::io::stdout(), "{message}").map_err(Into::into)
    }
}

pub fn accounts(accounts: &[AccountView<'_>]) -> Result<()> {
    let mut stdout = std::io::stdout().lock();
    writeln!(stdout, "SELECTED\tNAME\tEMAIL\tHOST\tPRODUCTS\tID")?;
    for account in accounts {
        let products = account
            .products
            .iter()
            .map(|p| p.name())
            .collect::<Vec<_>>()
            .join(",");
        writeln!(
            stdout,
            "{}\t{}\t{}\t{}\t{}\t{}",
            if account.selected { "*" } else { "" },
            escape_controls(account.name),
            escape_controls(account.email),
            escape_controls(account.host),
            products,
            account.id
        )?;
    }
    Ok(())
}

pub fn albums(albums: &[AlbumView]) -> Result<()> {
    let mut stdout = std::io::stdout().lock();
    writeln!(stdout, "ID\tNAME\tTYPE\tVISIBILITY\tOWNER\tUPDATED")?;
    for album in albums {
        writeln!(
            stdout,
            "{}\t{}\t{}\t{}\t{}\t{}",
            album.id,
            escape_controls(&album.name),
            escape_controls(&album.kind),
            album.visibility,
            album.owner_id,
            album.updated_at
        )?;
    }
    Ok(())
}

fn escape_controls(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for c in value.chars() {
        if c.is_control() {
            escaped.extend(c.escape_debug());
        } else {
            escaped.push(c);
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::escape_controls;

    #[test]
    fn human_output_preserves_printable_names() {
        assert_eq!(
            escape_controls("Bob's \"album\"\t\n"),
            "Bob's \"album\"\\t\\n"
        );
    }
}
