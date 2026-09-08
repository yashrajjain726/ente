use std::collections::{HashMap, HashSet};

use crate::db::optional_parameter;

use super::MlDb;
use super::error::Result;
use super::types::{FdStatus, PreviewInfo};

impl MlDb {
    pub fn put_fd_status(&self, fd_status_list: &[FdStatus]) -> Result<()> {
        if fd_status_list.is_empty() {
            return Ok(());
        }
        self.db.write_batch(
            "INSERT OR REPLACE INTO filedata (file_id, user_id, type, size, obj_id, obj_nonce, updated_at ) values(?, ?, ?, ?, ?, ?, ?)",
            fd_status_list.iter().map(|status| {
                (
                    status.file_id,
                    status.user_id,
                    &status.data_type,
                    status.size,
                    &status.object_id,
                    &status.object_nonce,
                    status.updated_at,
                )
            }),
        ).map_err(Into::into)
    }

    pub fn get_file_ids_vid_preview(&self) -> Result<HashMap<i64, PreviewInfo>> {
        self.db
            .read_all(
                "SELECT file_id, obj_id, size FROM filedata WHERE type='vid_preview'",
                (),
                |row| {
                    Ok((
                        row.get(0)?,
                        PreviewInfo {
                            object_id: row.get(1)?,
                            object_size: row.get(2)?,
                        },
                    ))
                },
            )
            .map_err(Into::into)
    }

    pub fn get_file_ids_with_fd_data(&self, data_type: Option<&str>) -> Result<HashSet<i64>> {
        let sql = match data_type {
            None => "SELECT file_id FROM filedata",
            Some(_) => "SELECT file_id FROM filedata WHERE type = ?",
        };
        self.db
            .read_column(sql, optional_parameter(&data_type).as_slice())
            .map_err(Into::into)
    }
}
