use std::fs::File;
use std::path::Path;

use super::VecDbError;

pub(crate) fn lock_exclusive(file: &File, path: &Path) -> Result<(), VecDbError> {
    if try_lock(file) {
        return Ok(());
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(WOULD_BLOCK_CODE) {
        return Err(VecDbError::Locked(path.to_path_buf()));
    }
    Err(VecDbError::Io {
        path: path.to_path_buf(),
        source: error,
    })
}

#[cfg(unix)]
const WOULD_BLOCK_CODE: i32 = libc::EWOULDBLOCK;

#[cfg(unix)]
fn try_lock(file: &File) -> bool {
    use std::os::fd::AsRawFd;

    unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) == 0 }
}

#[cfg(windows)]
const WOULD_BLOCK_CODE: i32 = windows_sys::Win32::Foundation::ERROR_LOCK_VIOLATION as i32;

#[cfg(windows)]
const LOCK_BYTE_OFFSET: u64 = u64::MAX - 1;

#[cfg(windows)]
fn try_lock(file: &File) -> bool {
    use std::os::windows::io::AsRawHandle;

    use windows_sys::Win32::Storage::FileSystem::{
        LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY, LockFileEx,
    };
    use windows_sys::Win32::System::IO::OVERLAPPED;

    let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
    overlapped.Anonymous.Anonymous.Offset = LOCK_BYTE_OFFSET as u32;
    overlapped.Anonymous.Anonymous.OffsetHigh = (LOCK_BYTE_OFFSET >> 32) as u32;
    unsafe {
        LockFileEx(
            file.as_raw_handle(),
            LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
            0,
            1,
            0,
            &mut overlapped,
        ) != 0
    }
}

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::path::Path;

    use tempfile::TempDir;

    use super::*;

    fn open_rw(path: &Path) -> File {
        File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)
            .unwrap()
    }

    #[test]
    fn locks_a_fresh_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let file = open_rw(&path);
        assert!(lock_exclusive(&file, &path).is_ok());
    }

    #[test]
    fn second_handle_on_the_same_path_conflicts() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let holder = open_rw(&path);
        lock_exclusive(&holder, &path).unwrap();
        let contender = open_rw(&path);
        let error = lock_exclusive(&contender, &path).unwrap_err();
        assert!(matches!(error, VecDbError::Locked(locked) if locked == path));
    }

    #[test]
    fn closing_the_holding_handle_releases_the_lock() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let holder = open_rw(&path);
        lock_exclusive(&holder, &path).unwrap();
        drop(holder);
        let successor = open_rw(&path);
        assert!(lock_exclusive(&successor, &path).is_ok());
    }

    #[test]
    fn held_lock_does_not_block_reads_or_copies_through_other_handles() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        std::fs::write(&path, b"payload").unwrap();
        let holder = open_rw(&path);
        lock_exclusive(&holder, &path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"payload");
        let copy_path = dir.path().join("copy");
        std::fs::copy(&path, &copy_path).unwrap();
        assert_eq!(std::fs::read(&copy_path).unwrap(), b"payload");
    }

    #[test]
    fn distinct_paths_do_not_conflict() {
        let dir = TempDir::new().unwrap();
        let first_path = dir.path().join("first");
        let second_path = dir.path().join("second");
        let first = open_rw(&first_path);
        let second = open_rw(&second_path);
        lock_exclusive(&first, &first_path).unwrap();
        assert!(lock_exclusive(&second, &second_path).is_ok());
    }
}
