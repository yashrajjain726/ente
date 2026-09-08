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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::ml_db::tests::{cases, check_seeded, ids, preview, seeded, status};

    #[test]
    fn seeded_file_id_sets() {
        check_seeded(&cases![
            "fd data": ids([1, 2, 3]) => |db| db.get_file_ids_with_fd_data(None),
            "fd mldata": ids([2]) => |db| db.get_file_ids_with_fd_data(Some("mldata")),
        ]);
    }

    #[test]
    fn seeded_video_previews() {
        check_seeded(&cases![
            "video previews": HashMap::from([(1, preview("obj1", 10)), (3, preview("obj3", 30))]) =>
                |db| db.get_file_ids_vid_preview(),
        ]);
    }

    #[test]
    fn filedata_upsert() {
        let (_directory, db) = seeded();
        db.put_fd_status(&[]).unwrap();
        db.put_fd_status(&[status(1, "vid_preview", Some("obj1b"))])
            .unwrap();
        assert_eq!(
            db.get_file_ids_vid_preview().unwrap(),
            HashMap::from([(1, preview("obj1b", 10)), (3, preview("obj3", 30))])
        );
        assert_eq!(db.get_file_ids_with_fd_data(None).unwrap(), ids([1, 2, 3]));
    }
}
