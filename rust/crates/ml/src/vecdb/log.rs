use std::fs::File;
use std::io::{BufReader, ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use super::arena::{MAX_KEY_BYTES, validate_key};
use super::crc::{Crc32, crc32};
use super::kernel::{LANE_WIDTH, splitmix64};
use super::{AttrValue, Attribute, VecDbError};

pub(crate) const HEADER_LEN: usize = 32;
const MAGIC: [u8; 4] = *b"EVDB";
const FORMAT_VERSION: u16 = 1;
const SCALAR_TAG_F32: u8 = 0;
const METRIC_TAG_INNER_PRODUCT: u8 = 0;
const RECORD_TYPE_ADD: u8 = 1;
const RECORD_TYPE_TOMBSTONE: u8 = 2;
const RECORD_PREFIX_LEN: usize = 3;
const RECORD_CRC_LEN: usize = 4;
const ENCODE_FLUSH_BYTES: usize = 64 * 1024;
const MAX_ATTR_COUNT: usize = 16;
const MAX_ATTR_NAME_BYTES: usize = 64;
const MAX_ATTR_STR_BYTES: usize = 1024;
const MAX_ATTRS_TOTAL_BYTES: usize = 4096;
const ATTR_TAG_STR: u8 = 0;
const ATTR_TAG_BOOL: u8 = 1;
const ATTR_TAG_I64: u8 = 2;
const ATTR_TAG_F64: u8 = 3;

static GENERATION_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy)]
pub(crate) enum LogEntry<'a> {
    Add {
        key: &'a str,
        vector: &'a [f32],
        attrs: &'a [Attribute],
    },
    Tombstone {
        key: &'a str,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum LogRecord {
    Add {
        key: String,
        vector: Vec<f32>,
        attrs: Vec<Attribute>,
    },
    Tombstone {
        key: String,
    },
}

#[derive(Debug)]
pub(crate) struct Log {
    file: File,
    path: PathBuf,
    dims: usize,
    generation: [u8; 16],
    end_offset: u64,
    encode_buffer: Vec<u8>,
}

impl Log {
    pub(crate) fn create(path: &Path, dims: usize) -> Result<Self, VecDbError> {
        validate_dims(dims)?;
        let file = File::options()
            .read(true)
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|source| VecDbError::io(path, source))?;
        Self::initialize(file, path, dims)
    }

    pub(crate) fn open(
        mut file: File,
        path: &Path,
        expected_dims: usize,
    ) -> Result<Self, VecDbError> {
        validate_dims(expected_dims)?;
        let file_len = file
            .metadata()
            .map_err(|source| VecDbError::io(path, source))?
            .len();
        if file_len < HEADER_LEN as u64 {
            log::warn!(
                "reinitializing {} whose {file_len}-byte header was never completed",
                path.display()
            );
            return Self::initialize(file, path, expected_dims);
        }
        file.seek(SeekFrom::Start(0))
            .map_err(|source| VecDbError::io(path, source))?;
        let mut header = [0u8; HEADER_LEN];
        file.read_exact(&mut header)
            .map_err(|source| VecDbError::io(path, source))?;
        let generation = decode_header(&header, expected_dims)?;
        Ok(Self {
            file,
            path: path.to_path_buf(),
            dims: expected_dims,
            generation,
            end_offset: file_len,
            encode_buffer: Vec::new(),
        })
    }

    fn initialize(mut file: File, path: &Path, dims: usize) -> Result<Self, VecDbError> {
        let generation = fresh_generation();
        file.seek(SeekFrom::Start(0))
            .map_err(|source| VecDbError::io(path, source))?;
        file.write_all(&encode_header(dims as u32, &generation))
            .map_err(|source| VecDbError::io(path, source))?;
        file.sync_all()
            .map_err(|source| VecDbError::io(path, source))?;
        sync_parent_dir(path)?;
        Ok(Self {
            file,
            path: path.to_path_buf(),
            dims,
            generation,
            end_offset: HEADER_LEN as u64,
            encode_buffer: Vec::new(),
        })
    }

    pub(crate) fn create_temp_sibling(
        path: &Path,
        dims: usize,
    ) -> Result<(Self, PathBuf), VecDbError> {
        remove_stale_temp_sibling(path)?;
        let temp_path = temp_sibling_path(path);
        let log = Self::create(&temp_path, dims)?;
        Ok((log, temp_path))
    }

    pub(crate) fn scan(&mut self) -> Result<LogScanner<'_>, VecDbError> {
        self.file
            .seek(SeekFrom::Start(HEADER_LEN as u64))
            .map_err(|source| VecDbError::io(&self.path, source))?;
        Ok(LogScanner {
            reader: BufReader::new(&mut self.file),
            path: &self.path,
            dims: self.dims,
            log_end: self.end_offset,
            offset: HEADER_LEN as u64,
            scratch: Vec::new(),
            done: false,
        })
    }

    pub(crate) fn append(&mut self, entries: &[LogEntry<'_>]) -> Result<(), VecDbError> {
        if entries.is_empty() {
            return Ok(());
        }
        for entry in entries {
            validate_entry(entry, self.dims)?;
        }
        match self.write_records(entries) {
            Ok(written) => {
                self.end_offset += written;
                Ok(())
            }
            Err(error) => {
                self.discard_unacked_tail();
                Err(error)
            }
        }
    }

    fn write_records(&mut self, entries: &[LogEntry<'_>]) -> Result<u64, VecDbError> {
        self.file
            .seek(SeekFrom::Start(self.end_offset))
            .map_err(|source| VecDbError::io(&self.path, source))?;
        self.encode_buffer.clear();
        let mut written = 0u64;
        for entry in entries {
            encode_record_into(&mut self.encode_buffer, entry);
            if self.encode_buffer.len() >= ENCODE_FLUSH_BYTES {
                written += self.drain_encode_buffer()?;
            }
        }
        written += self.drain_encode_buffer()?;
        self.file
            .sync_all()
            .map_err(|source| VecDbError::io(&self.path, source))?;
        Ok(written)
    }

    fn discard_unacked_tail(&mut self) {
        let _ = self.file.set_len(self.end_offset);
        let _ = self.file.sync_all();
    }

    fn drain_encode_buffer(&mut self) -> Result<u64, VecDbError> {
        if self.encode_buffer.is_empty() {
            return Ok(0);
        }
        self.file
            .write_all(&self.encode_buffer)
            .map_err(|source| VecDbError::io(&self.path, source))?;
        let written = self.encode_buffer.len() as u64;
        self.encode_buffer.clear();
        Ok(written)
    }

    pub(crate) fn truncate_to(&mut self, offset: u64) -> Result<(), VecDbError> {
        let target = offset.max(HEADER_LEN as u64);
        if target >= self.end_offset {
            return Ok(());
        }
        log::warn!(
            "truncating torn tail of {} from {} to {target} bytes",
            self.path.display(),
            self.end_offset
        );
        self.file
            .set_len(target)
            .map_err(|source| VecDbError::io(&self.path, source))?;
        self.end_offset = target;
        self.file
            .sync_all()
            .map_err(|source| VecDbError::io(&self.path, source))?;
        Ok(())
    }

    pub(crate) fn current_end_offset(&self) -> u64 {
        self.end_offset
    }

    pub(crate) fn generation(&self) -> [u8; 16] {
        self.generation
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn into_file(self) -> File {
        self.file
    }
}

pub(crate) struct LogScanner<'a> {
    reader: BufReader<&'a mut File>,
    path: &'a Path,
    dims: usize,
    log_end: u64,
    offset: u64,
    scratch: Vec<u8>,
    done: bool,
}

impl LogScanner<'_> {
    pub(crate) fn next_record(&mut self) -> Result<Option<(LogRecord, u64)>, VecDbError> {
        if self.done {
            return Ok(None);
        }
        let start = self.offset;
        let remaining = self.log_end - start;
        if remaining == 0 {
            self.done = true;
            return Ok(None);
        }
        if remaining < (RECORD_PREFIX_LEN + RECORD_CRC_LEN) as u64 {
            return Ok(self.stop());
        }
        let mut prefix = [0u8; RECORD_PREFIX_LEN];
        if !self.fill(&mut prefix)? {
            return Ok(self.stop());
        }
        let record_type = prefix[0];
        let key_len = u16::from_le_bytes([prefix[1], prefix[2]]) as usize;
        if key_len == 0 || key_len > MAX_KEY_BYTES {
            return Ok(self.stop());
        }
        let fixed_len = match record_type {
            RECORD_TYPE_ADD => key_len + self.dims * size_of::<f32>() + 1,
            RECORD_TYPE_TOMBSTONE => key_len,
            _ => return Ok(self.stop()),
        };
        let body_budget = remaining - (RECORD_PREFIX_LEN + RECORD_CRC_LEN) as u64;
        self.scratch.clear();
        if fixed_len as u64 > body_budget || !self.fill_scratch(fixed_len)? {
            return Ok(self.stop());
        }
        if record_type == RECORD_TYPE_ADD && !self.read_attr_bytes(body_budget)? {
            return Ok(self.stop());
        }
        let mut crc_bytes = [0u8; RECORD_CRC_LEN];
        if !self.fill(&mut crc_bytes)? {
            return Ok(self.stop());
        }
        let mut hasher = Crc32::new();
        hasher.update(&prefix);
        hasher.update(&self.scratch);
        if hasher.finalize() != u32::from_le_bytes(crc_bytes) {
            return Ok(self.stop());
        }
        let Some(record) = decode_body(record_type, key_len, self.dims, &self.scratch) else {
            return Ok(self.stop());
        };
        self.offset = start + (RECORD_PREFIX_LEN + self.scratch.len() + RECORD_CRC_LEN) as u64;
        Ok(Some((record, start)))
    }

    pub(crate) fn recoverable_end(&self) -> u64 {
        self.offset
    }

    fn stop(&mut self) -> Option<(LogRecord, u64)> {
        self.done = true;
        None
    }

    fn read_attr_bytes(&mut self, body_budget: u64) -> Result<bool, VecDbError> {
        let attr_count = *self.scratch.last().unwrap();
        if attr_count as usize > MAX_ATTR_COUNT {
            return Ok(false);
        }
        let attrs_start = self.scratch.len();
        for _ in 0..attr_count {
            if !self.extend_within(body_budget, 1)? {
                return Ok(false);
            }
            let name_len = *self.scratch.last().unwrap() as usize;
            if name_len == 0 || name_len > MAX_ATTR_NAME_BYTES {
                return Ok(false);
            }
            if !self.extend_within(body_budget, name_len + 1)? {
                return Ok(false);
            }
            let value_len = match *self.scratch.last().unwrap() {
                ATTR_TAG_STR => {
                    if !self.extend_within(body_budget, 2)? {
                        return Ok(false);
                    }
                    let len_start = self.scratch.len() - 2;
                    let str_len =
                        u16::from_le_bytes([self.scratch[len_start], self.scratch[len_start + 1]])
                            as usize;
                    if str_len > MAX_ATTR_STR_BYTES {
                        return Ok(false);
                    }
                    str_len
                }
                ATTR_TAG_BOOL => 1,
                ATTR_TAG_I64 | ATTR_TAG_F64 => 8,
                _ => return Ok(false),
            };
            if !self.extend_within(body_budget, value_len)? {
                return Ok(false);
            }
            if self.scratch.len() - attrs_start > MAX_ATTRS_TOTAL_BYTES {
                return Ok(false);
            }
        }
        Ok(true)
    }

    fn extend_within(&mut self, body_budget: u64, len: usize) -> Result<bool, VecDbError> {
        if (self.scratch.len() + len) as u64 > body_budget {
            return Ok(false);
        }
        self.fill_scratch(len)
    }

    fn fill_scratch(&mut self, len: usize) -> Result<bool, VecDbError> {
        let old_len = self.scratch.len();
        self.scratch.resize(old_len + len, 0);
        match self.reader.read_exact(&mut self.scratch[old_len..]) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == ErrorKind::UnexpectedEof => {
                self.scratch.truncate(old_len);
                Ok(false)
            }
            Err(source) => {
                self.done = true;
                Err(VecDbError::io(self.path, source))
            }
        }
    }

    fn fill(&mut self, buffer: &mut [u8]) -> Result<bool, VecDbError> {
        match self.reader.read_exact(buffer) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == ErrorKind::UnexpectedEof => Ok(false),
            Err(source) => {
                self.done = true;
                Err(VecDbError::io(self.path, source))
            }
        }
    }
}

fn decode_body(record_type: u8, key_len: usize, dims: usize, body: &[u8]) -> Option<LogRecord> {
    let (key_bytes, rest) = body.split_at(key_len);
    let key = std::str::from_utf8(key_bytes).ok()?.to_string();
    if record_type == RECORD_TYPE_TOMBSTONE {
        return Some(LogRecord::Tombstone { key });
    }
    let (payload, attr_bytes) = rest.split_at(dims * size_of::<f32>());
    let vector = payload
        .as_chunks::<4>()
        .0
        .iter()
        .map(|bytes| f32::from_le_bytes(*bytes))
        .collect();
    let attrs = decode_attrs(attr_bytes)?;
    Some(LogRecord::Add { key, vector, attrs })
}

fn decode_attrs(bytes: &[u8]) -> Option<Vec<Attribute>> {
    let (&count, mut rest) = bytes.split_first()?;
    let mut attrs = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let (&name_len, after) = rest.split_first()?;
        let (name_bytes, after) = after.split_at_checked(name_len as usize)?;
        let name = std::str::from_utf8(name_bytes).ok()?.to_string();
        let (&tag, after) = after.split_first()?;
        let (value, after) = match tag {
            ATTR_TAG_STR => {
                let (len_bytes, after) = after.split_at_checked(2)?;
                let str_len = u16::from_le_bytes([len_bytes[0], len_bytes[1]]) as usize;
                let (value_bytes, after) = after.split_at_checked(str_len)?;
                let value = std::str::from_utf8(value_bytes).ok()?.to_string();
                (AttrValue::Str(value), after)
            }
            ATTR_TAG_BOOL => {
                let (&value, after) = after.split_first()?;
                if value > 1 {
                    return None;
                }
                (AttrValue::Bool(value == 1), after)
            }
            ATTR_TAG_I64 => {
                let (value_bytes, after) = after.split_at_checked(8)?;
                (
                    AttrValue::I64(i64::from_le_bytes(value_bytes.try_into().ok()?)),
                    after,
                )
            }
            ATTR_TAG_F64 => {
                let (value_bytes, after) = after.split_at_checked(8)?;
                (
                    AttrValue::F64(f64::from_le_bytes(value_bytes.try_into().ok()?)),
                    after,
                )
            }
            _ => return None,
        };
        attrs.push(Attribute { name, value });
        rest = after;
    }
    rest.is_empty().then_some(attrs)
}

fn encode_header(dims: u32, generation: &[u8; 16]) -> [u8; HEADER_LEN] {
    let mut bytes = [0u8; HEADER_LEN];
    bytes[0..4].copy_from_slice(&MAGIC);
    bytes[4..6].copy_from_slice(&FORMAT_VERSION.to_le_bytes());
    bytes[6] = SCALAR_TAG_F32;
    bytes[7] = METRIC_TAG_INNER_PRODUCT;
    bytes[8..12].copy_from_slice(&dims.to_le_bytes());
    bytes[12..28].copy_from_slice(generation);
    let crc = crc32(&bytes[0..28]);
    bytes[28..32].copy_from_slice(&crc.to_le_bytes());
    bytes
}

fn decode_header(bytes: &[u8; HEADER_LEN], expected_dims: usize) -> Result<[u8; 16], VecDbError> {
    if bytes[0..4] != MAGIC {
        return Err(VecDbError::Corrupt(format!(
            "bad log magic {:02x?}",
            &bytes[0..4]
        )));
    }
    let stored_crc = u32::from_le_bytes([bytes[28], bytes[29], bytes[30], bytes[31]]);
    let computed_crc = crc32(&bytes[0..28]);
    if stored_crc != computed_crc {
        return Err(VecDbError::Corrupt(format!(
            "log header crc mismatch: stored {stored_crc:08x}, computed {computed_crc:08x}"
        )));
    }
    let version = u16::from_le_bytes([bytes[4], bytes[5]]);
    if version != FORMAT_VERSION {
        return Err(VecDbError::Corrupt(format!(
            "unsupported log format version {version}"
        )));
    }
    if bytes[6] != SCALAR_TAG_F32 {
        return Err(VecDbError::Corrupt(format!(
            "unknown scalar tag {}",
            bytes[6]
        )));
    }
    if bytes[7] != METRIC_TAG_INNER_PRODUCT {
        return Err(VecDbError::Corrupt(format!(
            "unknown metric tag {}",
            bytes[7]
        )));
    }
    let dims = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as usize;
    if dims != expected_dims {
        return Err(VecDbError::DimensionMismatch {
            expected: expected_dims,
            actual: dims,
        });
    }
    let mut generation = [0u8; 16];
    generation.copy_from_slice(&bytes[12..28]);
    Ok(generation)
}

fn validate_dims(dims: usize) -> Result<(), VecDbError> {
    if dims == 0 || !dims.is_multiple_of(LANE_WIDTH) || u32::try_from(dims).is_err() {
        return Err(VecDbError::InvalidDimensions(dims));
    }
    Ok(())
}

fn validate_entry(entry: &LogEntry<'_>, dims: usize) -> Result<(), VecDbError> {
    match entry {
        LogEntry::Add { key, vector, attrs } => {
            validate_key(key)?;
            if vector.len() != dims {
                return Err(VecDbError::DimensionMismatch {
                    expected: dims,
                    actual: vector.len(),
                });
            }
            validate_attrs(attrs)
        }
        LogEntry::Tombstone { key } => validate_key(key),
    }
}

fn validate_attrs(attrs: &[Attribute]) -> Result<(), VecDbError> {
    if attrs.len() > MAX_ATTR_COUNT {
        return Err(VecDbError::InvalidAttributes(format!(
            "{} attributes, limit is {MAX_ATTR_COUNT}",
            attrs.len()
        )));
    }
    let mut total = 0usize;
    for (index, attr) in attrs.iter().enumerate() {
        if attr.name.is_empty() {
            return Err(VecDbError::InvalidAttributes(format!(
                "attribute {index} has an empty name"
            )));
        }
        if attr.name.len() > MAX_ATTR_NAME_BYTES {
            return Err(VecDbError::InvalidAttributes(format!(
                "attribute name {:?} is {} bytes, limit is {MAX_ATTR_NAME_BYTES}",
                attr.name,
                attr.name.len()
            )));
        }
        if let AttrValue::Str(value) = &attr.value
            && value.len() > MAX_ATTR_STR_BYTES
        {
            return Err(VecDbError::InvalidAttributes(format!(
                "value of attribute {:?} is {} bytes, limit is {MAX_ATTR_STR_BYTES}",
                attr.name,
                value.len()
            )));
        }
        if attrs[..index].iter().any(|prior| prior.name == attr.name) {
            return Err(VecDbError::InvalidAttributes(format!(
                "duplicate attribute name {:?}",
                attr.name
            )));
        }
        total += encoded_attr_len(attr);
    }
    if total > MAX_ATTRS_TOTAL_BYTES {
        return Err(VecDbError::InvalidAttributes(format!(
            "attributes encode to {total} bytes, limit is {MAX_ATTRS_TOTAL_BYTES}"
        )));
    }
    Ok(())
}

fn encoded_attr_len(attr: &Attribute) -> usize {
    2 + attr.name.len()
        + match &attr.value {
            AttrValue::Str(value) => 2 + value.len(),
            AttrValue::Bool(_) => 1,
            AttrValue::I64(_) | AttrValue::F64(_) => 8,
        }
}

fn encode_record_into(buffer: &mut Vec<u8>, entry: &LogEntry<'_>) {
    let start = buffer.len();
    match entry {
        LogEntry::Add { key, vector, attrs } => {
            buffer.push(RECORD_TYPE_ADD);
            buffer.extend_from_slice(&(key.len() as u16).to_le_bytes());
            buffer.extend_from_slice(key.as_bytes());
            for value in *vector {
                buffer.extend_from_slice(&value.to_le_bytes());
            }
            buffer.push(attrs.len() as u8);
            for attr in *attrs {
                encode_attr_into(buffer, attr);
            }
        }
        LogEntry::Tombstone { key } => {
            buffer.push(RECORD_TYPE_TOMBSTONE);
            buffer.extend_from_slice(&(key.len() as u16).to_le_bytes());
            buffer.extend_from_slice(key.as_bytes());
        }
    }
    let crc = crc32(&buffer[start..]);
    buffer.extend_from_slice(&crc.to_le_bytes());
}

fn encode_attr_into(buffer: &mut Vec<u8>, attr: &Attribute) {
    buffer.push(attr.name.len() as u8);
    buffer.extend_from_slice(attr.name.as_bytes());
    match &attr.value {
        AttrValue::Str(value) => {
            buffer.push(ATTR_TAG_STR);
            buffer.extend_from_slice(&(value.len() as u16).to_le_bytes());
            buffer.extend_from_slice(value.as_bytes());
        }
        AttrValue::Bool(value) => {
            buffer.push(ATTR_TAG_BOOL);
            buffer.push(u8::from(*value));
        }
        AttrValue::I64(value) => {
            buffer.push(ATTR_TAG_I64);
            buffer.extend_from_slice(&value.to_le_bytes());
        }
        AttrValue::F64(value) => {
            buffer.push(ATTR_TAG_F64);
            buffer.extend_from_slice(&value.to_le_bytes());
        }
    }
}

fn fresh_generation() -> [u8; 16] {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos() as u64);
    let pid = u64::from(std::process::id());
    let counter = GENERATION_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut state = nanos ^ pid.rotate_left(32) ^ counter.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let mut generation = [0u8; 16];
    generation[0..8].copy_from_slice(&splitmix64(&mut state).to_le_bytes());
    generation[8..16].copy_from_slice(&splitmix64(&mut state).to_le_bytes());
    generation
}

pub(crate) fn remove_stale_temp_sibling(path: &Path) -> Result<(), VecDbError> {
    remove_if_present(&temp_sibling_path(path))
}

pub(crate) fn remove_if_present(path: &Path) -> Result<(), VecDbError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(source) => Err(VecDbError::io(path, source)),
    }
}

pub(crate) fn rename_with_windows_fallback(from: &Path, to: &Path) -> Result<(), VecDbError> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        #[cfg(windows)]
        Err(_) => {
            let _ = std::fs::remove_file(to);
            std::fs::rename(from, to).map_err(|source| VecDbError::io(from, source))
        }
        #[cfg(not(windows))]
        Err(source) => Err(VecDbError::io(from, source)),
    }
}

fn temp_sibling_path(path: &Path) -> PathBuf {
    let mut temp = path.as_os_str().to_os_string();
    temp.push(".tmp");
    PathBuf::from(temp)
}

#[cfg(unix)]
pub(crate) fn sync_parent_dir(path: &Path) -> Result<(), VecDbError> {
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    File::open(parent)
        .and_then(|dir| dir.sync_all())
        .map_err(|source| VecDbError::io(parent, source))
}

#[cfg(not(unix))]
pub(crate) fn sync_parent_dir(_path: &Path) -> Result<(), VecDbError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn seeded_vector(seed: u64, dims: usize) -> Vec<f32> {
        let mut state = seed;
        (0..dims)
            .map(|_| {
                let unit = (splitmix64(&mut state) >> 40) as f32 / (1u64 << 24) as f32;
                unit * 2.0 - 1.0
            })
            .collect()
    }

    fn reopen(path: &Path, dims: usize) -> Log {
        let file = File::options().read(true).write(true).open(path).unwrap();
        Log::open(file, path, dims).unwrap()
    }

    fn append_bounds(log: &mut Log, entries: &[LogEntry<'_>]) -> (u64, u64) {
        let start = log.current_end_offset();
        log.append(entries).unwrap();
        (start, log.current_end_offset())
    }

    fn append_raw_bytes(path: &Path, bytes: &[u8]) {
        let mut surgeon = File::options().append(true).open(path).unwrap();
        surgeon.write_all(bytes).unwrap();
        surgeon.sync_all().unwrap();
    }

    fn encoded_add(key: &str, vector: &[f32]) -> Vec<u8> {
        let mut bytes = Vec::new();
        encode_record_into(
            &mut bytes,
            &LogEntry::Add {
                key,
                vector,
                attrs: &[],
            },
        );
        bytes
    }

    fn scan_all(log: &mut Log) -> (Vec<(LogRecord, u64)>, u64) {
        let mut scanner = log.scan().unwrap();
        let mut records = Vec::new();
        while let Some(pair) = scanner.next_record().unwrap() {
            records.push(pair);
        }
        (records, scanner.recoverable_end())
    }

    fn expected_record(entry: &LogEntry<'_>) -> LogRecord {
        match entry {
            LogEntry::Add { key, vector, attrs } => LogRecord::Add {
                key: (*key).to_string(),
                vector: vector.to_vec(),
                attrs: attrs.to_vec(),
            },
            LogEntry::Tombstone { key } => LogRecord::Tombstone {
                key: (*key).to_string(),
            },
        }
    }

    fn raw_record(record_type: u8, key_len: u16, key: &[u8], payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![record_type];
        bytes.extend_from_slice(&key_len.to_le_bytes());
        bytes.extend_from_slice(key);
        bytes.extend_from_slice(payload);
        let crc = crc32(&bytes);
        bytes.extend_from_slice(&crc.to_le_bytes());
        bytes
    }

    fn write_log_file(path: &Path, dims: u32, record_bytes: &[u8]) {
        let mut bytes = encode_header(dims, &[9u8; 16]).to_vec();
        bytes.extend_from_slice(record_bytes);
        std::fs::write(path, bytes).unwrap();
    }

    fn refresh_crc(bytes: &mut [u8; HEADER_LEN]) {
        let crc = crc32(&bytes[0..28]);
        bytes[28..32].copy_from_slice(&crc.to_le_bytes());
    }

    fn open_with_header(
        mutate: impl FnOnce(&mut [u8; HEADER_LEN]),
        expected_dims: usize,
    ) -> Result<Log, VecDbError> {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut bytes = encode_header(8, &[7u8; 16]);
        mutate(&mut bytes);
        std::fs::write(&path, bytes).unwrap();
        let file = File::options().read(true).write(true).open(&path).unwrap();
        Log::open(file, &path, expected_dims)
    }

    #[test]
    fn header_round_trips_through_create_and_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let created = Log::create(&path, 512).unwrap();
        let generation = created.generation();
        assert_eq!(created.current_end_offset(), HEADER_LEN as u64);
        assert_eq!(created.path(), path.as_path());
        drop(created.into_file());
        let reopened = reopen(&path, 512);
        assert_eq!(reopened.generation(), generation);
        assert_eq!(reopened.current_end_offset(), HEADER_LEN as u64);
    }

    #[test]
    fn rejects_bad_magic() {
        let error = open_with_header(
            |bytes| {
                bytes[0] = b'X';
                refresh_crc(bytes);
            },
            8,
        )
        .unwrap_err();
        assert!(matches!(&error, VecDbError::Corrupt(message) if message.contains("magic")));
    }

    #[test]
    fn rejects_unsupported_version() {
        let error = open_with_header(
            |bytes| {
                bytes[4..6].copy_from_slice(&2u16.to_le_bytes());
                refresh_crc(bytes);
            },
            8,
        )
        .unwrap_err();
        assert!(matches!(&error, VecDbError::Corrupt(message) if message.contains("version")));
    }

    #[test]
    fn rejects_unknown_scalar_tag() {
        let error = open_with_header(
            |bytes| {
                bytes[6] = 1;
                refresh_crc(bytes);
            },
            8,
        )
        .unwrap_err();
        assert!(matches!(&error, VecDbError::Corrupt(message) if message.contains("scalar")));
    }

    #[test]
    fn rejects_unknown_metric_tag() {
        let error = open_with_header(
            |bytes| {
                bytes[7] = 3;
                refresh_crc(bytes);
            },
            8,
        )
        .unwrap_err();
        assert!(matches!(&error, VecDbError::Corrupt(message) if message.contains("metric")));
    }

    #[test]
    fn rejects_header_crc_mismatch() {
        let error = open_with_header(|bytes| bytes[20] ^= 0x40, 8).unwrap_err();
        assert!(matches!(&error, VecDbError::Corrupt(message) if message.contains("crc")));
    }

    #[test]
    fn rejects_dims_mismatch() {
        let error = open_with_header(|_| {}, 16).unwrap_err();
        assert!(matches!(
            error,
            VecDbError::DimensionMismatch {
                expected: 16,
                actual: 8
            }
        ));
    }

    #[test]
    fn writer_open_reinitializes_files_shorter_than_the_header() {
        for junk_len in [0usize, 10, 31] {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("log");
            std::fs::write(&path, vec![1u8; junk_len]).unwrap();
            let file = File::options().read(true).write(true).open(&path).unwrap();
            let mut log = Log::open(file, &path, 8).unwrap();
            assert_eq!(log.current_end_offset(), HEADER_LEN as u64);
            assert_eq!(std::fs::metadata(&path).unwrap().len(), HEADER_LEN as u64);
            let (records, _) = scan_all(&mut log);
            assert!(records.is_empty());
            let vector = seeded_vector(6, 8);
            let (start, end) = append_bounds(
                &mut log,
                &[LogEntry::Add {
                    key: "reborn",
                    vector: &vector,
                    attrs: &[],
                }],
            );
            assert_eq!(start, HEADER_LEN as u64);
            let generation = log.generation();
            drop(log);
            let reopened = reopen(&path, 8);
            assert_eq!(reopened.generation(), generation);
            assert_eq!(reopened.current_end_offset(), end);
        }
    }

    #[test]
    fn create_rejects_invalid_dimensions() {
        let dir = TempDir::new().unwrap();
        assert!(matches!(
            Log::create(&dir.path().join("a"), 0),
            Err(VecDbError::InvalidDimensions(0))
        ));
        assert!(matches!(
            Log::create(&dir.path().join("b"), 12),
            Err(VecDbError::InvalidDimensions(12))
        ));
    }

    #[test]
    fn open_rejects_invalid_dimensions() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        drop(Log::create(&path, 8).unwrap().into_file());
        let file = File::options().read(true).write(true).open(&path).unwrap();
        assert!(matches!(
            Log::open(file, &path, 12),
            Err(VecDbError::InvalidDimensions(12))
        ));
    }

    #[test]
    fn golden_bytes_pin_format_v1() {
        let generation: [u8; 16] = std::array::from_fn(|index| index as u8);
        let golden_header: [u8; 32] = [
            0x45, 0x56, 0x44, 0x42, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x01,
            0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
            0x56, 0x32, 0x6d, 0x51,
        ];
        let golden_add: [u8; 42] = [
            0x01, 0x02, 0x00, 0x6b, 0x31, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00,
            0x00, 0x80, 0xbf, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0xbf, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0xc7, 0x91, 0x1a, 0x8d,
        ];
        let golden_attr_add: [u8; 75] = [
            0x01, 0x02, 0x00, 0x6b, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00,
            0x00, 0x80, 0xbf, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0xbf, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0xc0, 0x3f, 0x04, 0x01, 0x6d, 0x00, 0x02,
            0x00, 0x76, 0x31, 0x01, 0x62, 0x01, 0x01, 0x01, 0x69, 0x02, 0xfe, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0x01, 0x66, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8,
            0x3f, 0x4a, 0x4a, 0x73, 0x96,
        ];
        let golden_tombstone: [u8; 9] = [0x02, 0x02, 0x00, 0x6b, 0x31, 0xa0, 0xde, 0x3c, 0xc1];
        let vector = [0.0f32, 1.0, -1.0, 0.5, -0.5, 2.0, -2.0, 1.5];
        let attrs = vec![
            Attribute {
                name: "m".to_string(),
                value: AttrValue::Str("v1".to_string()),
            },
            Attribute {
                name: "b".to_string(),
                value: AttrValue::Bool(true),
            },
            Attribute {
                name: "i".to_string(),
                value: AttrValue::I64(-2),
            },
            Attribute {
                name: "f".to_string(),
                value: AttrValue::F64(1.5),
            },
        ];
        assert_eq!(encode_header(8, &generation), golden_header);
        let mut encoded = Vec::new();
        encode_record_into(
            &mut encoded,
            &LogEntry::Add {
                key: "k1",
                vector: &vector,
                attrs: &[],
            },
        );
        assert_eq!(encoded, golden_add);
        encoded.clear();
        encode_record_into(
            &mut encoded,
            &LogEntry::Add {
                key: "k2",
                vector: &vector,
                attrs: &attrs,
            },
        );
        assert_eq!(encoded, golden_attr_add);
        encoded.clear();
        encode_record_into(&mut encoded, &LogEntry::Tombstone { key: "k1" });
        assert_eq!(encoded, golden_tombstone);
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut bytes = golden_header.to_vec();
        bytes.extend_from_slice(&golden_add);
        bytes.extend_from_slice(&golden_attr_add);
        bytes.extend_from_slice(&golden_tombstone);
        std::fs::write(&path, &bytes).unwrap();
        let mut log = reopen(&path, 8);
        assert_eq!(log.generation(), generation);
        let (records, recoverable_end) = scan_all(&mut log);
        assert_eq!(
            records,
            vec![
                (
                    LogRecord::Add {
                        key: "k1".to_string(),
                        vector: vector.to_vec(),
                        attrs: Vec::new()
                    },
                    32
                ),
                (
                    LogRecord::Add {
                        key: "k2".to_string(),
                        vector: vector.to_vec(),
                        attrs: attrs.clone()
                    },
                    74
                ),
                (
                    LogRecord::Tombstone {
                        key: "k1".to_string()
                    },
                    149
                )
            ]
        );
        assert_eq!(recoverable_end, 158);
    }

    #[test]
    fn add_and_tombstone_records_round_trip() {
        for dims in [8usize, 512] {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("log");
            let mut log = Log::create(&path, dims).unwrap();
            let vector = seeded_vector(1, dims);
            let entries = [
                LogEntry::Add {
                    key: "alpha",
                    vector: &vector,
                    attrs: &[],
                },
                LogEntry::Tombstone { key: "beta" },
            ];
            let (first, _) = append_bounds(&mut log, &entries[0..1]);
            let (second, end) = append_bounds(&mut log, &entries[1..2]);
            assert_eq!(first, HEADER_LEN as u64);
            let (records, recoverable_end) = scan_all(&mut log);
            assert_eq!(
                records,
                vec![
                    (expected_record(&entries[0]), first),
                    (expected_record(&entries[1]), second)
                ]
            );
            assert_eq!(recoverable_end, end);
        }
    }

    #[test]
    fn round_trips_boundary_and_multibyte_keys() {
        let long255 = "k".repeat(255);
        let long256 = "k".repeat(256);
        let multibyte256 = format!("{}🔑", "k".repeat(252));
        assert_eq!(multibyte256.len(), 256);
        let keys = [
            "a",
            long255.as_str(),
            long256.as_str(),
            multibyte256.as_str(),
            "ключ-🗝",
        ];
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(5, 8);
        for key in keys {
            log.append(&[LogEntry::Add {
                key,
                vector: &vector,
                attrs: &[],
            }])
            .unwrap();
            log.append(&[LogEntry::Tombstone { key }]).unwrap();
        }
        let (records, _) = scan_all(&mut log);
        assert_eq!(records.len(), 10);
        for (index, key) in keys.iter().enumerate() {
            assert_eq!(
                records[index * 2].0,
                LogRecord::Add {
                    key: (*key).to_string(),
                    vector: vector.clone(),
                    attrs: Vec::new()
                }
            );
            assert_eq!(
                records[index * 2 + 1].0,
                LogRecord::Tombstone {
                    key: (*key).to_string()
                }
            );
        }
    }

    #[test]
    fn decodes_non_finite_components_without_panicking() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = [
            f32::NAN,
            f32::INFINITY,
            f32::NEG_INFINITY,
            -0.0,
            f32::MIN_POSITIVE,
            f32::MAX,
            -f32::MAX,
            0.5,
        ];
        log.append(&[LogEntry::Add {
            key: "weird",
            vector: &vector,
            attrs: &[],
        }])
        .unwrap();
        let (records, _) = scan_all(&mut log);
        let LogRecord::Add {
            key,
            vector: decoded,
            ..
        } = &records[0].0
        else {
            panic!("expected an add record");
        };
        assert_eq!(key, "weird");
        let expected_bits: Vec<u32> = vector.iter().map(|value| value.to_bits()).collect();
        let decoded_bits: Vec<u32> = decoded.iter().map(|value| value.to_bits()).collect();
        assert_eq!(decoded_bits, expected_bits);
    }

    #[test]
    fn scanner_stops_at_last_complete_record_for_every_torn_length() {
        let dir = TempDir::new().unwrap();
        let build_path = dir.path().join("log");
        let mut log = Log::create(&build_path, 8).unwrap();
        let vectors: Vec<Vec<f32>> = (0..3).map(|seed| seeded_vector(seed, 8)).collect();
        let mut boundaries = Vec::new();
        for (index, vector) in vectors.iter().enumerate() {
            let key = format!("key-{index}");
            boundaries.push(append_bounds(
                &mut log,
                &[LogEntry::Add {
                    key: &key,
                    vector,
                    attrs: &[],
                }],
            ));
        }
        drop(log);
        let full_bytes = std::fs::read(&build_path).unwrap();
        let intact_end = boundaries[1].1;
        for cut in intact_end..boundaries[2].1 {
            let torn_path = dir.path().join(format!("torn-{cut}"));
            std::fs::write(&torn_path, &full_bytes[..cut as usize]).unwrap();
            let mut torn_log = reopen(&torn_path, 8);
            let (records, recoverable_end) = scan_all(&mut torn_log);
            assert_eq!(records.len(), 2);
            assert_eq!(records[0].1, boundaries[0].0);
            assert_eq!(records[1].1, boundaries[1].0);
            assert_eq!(recoverable_end, intact_end);
        }
    }

    #[test]
    fn truncate_to_repairs_torn_tail_for_clean_appends() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(1, 8);
        let (_, first_end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "kept",
                vector: &vector,
                attrs: &[],
            }],
        );
        let (_, torn_end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "torn",
                vector: &vector,
                attrs: &[],
            }],
        );
        drop(log);
        let cut = first_end + (torn_end - first_end) / 2;
        let file = File::options().read(true).write(true).open(&path).unwrap();
        file.set_len(cut).unwrap();
        drop(file);
        let mut log = reopen(&path, 8);
        assert_eq!(log.current_end_offset(), cut);
        let (records, recoverable_end) = scan_all(&mut log);
        assert_eq!(records.len(), 1);
        assert_eq!(recoverable_end, first_end);
        log.truncate_to(recoverable_end).unwrap();
        assert_eq!(log.current_end_offset(), first_end);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), first_end);
        let (start, end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "fresh",
                vector: &vector,
                attrs: &[],
            }],
        );
        assert_eq!(start, first_end);
        let (records, recoverable_end) = scan_all(&mut log);
        assert_eq!(records.len(), 2);
        assert_eq!(records[1].1, start);
        assert_eq!(recoverable_end, end);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), end);
    }

    #[test]
    fn discard_unacked_tail_drops_phantom_frames_before_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(1, 8);
        let (_, acked_end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "acked",
                vector: &vector,
                attrs: &[],
            }],
        );
        let phantom = encoded_add("phantom", &vector);
        append_raw_bytes(&path, &phantom);
        assert_eq!(
            std::fs::metadata(&path).unwrap().len(),
            acked_end + phantom.len() as u64
        );
        log.discard_unacked_tail();
        assert_eq!(std::fs::metadata(&path).unwrap().len(), acked_end);
        drop(log);
        let mut reopened = reopen(&path, 8);
        let (records, recoverable_end) = scan_all(&mut reopened);
        assert_eq!(records.len(), 1);
        assert!(matches!(&records[0].0, LogRecord::Add { key, .. } if key == "acked"));
        assert_eq!(recoverable_end, acked_end);
    }

    #[test]
    fn append_failure_rolls_back_without_disturbing_acked_records() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(2, 8);
        let (_, acked_end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "kept",
                vector: &vector,
                attrs: &[],
            }],
        );
        drop(log);
        let unwritable = File::open(&path).unwrap();
        let mut log = Log::open(unwritable, &path, 8).unwrap();
        assert!(matches!(
            log.append(&[LogEntry::Add {
                key: "lost",
                vector: &vector,
                attrs: &[]
            }]),
            Err(VecDbError::Io { .. })
        ));
        assert_eq!(log.current_end_offset(), acked_end);
        drop(log);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), acked_end);
        let mut reopened = reopen(&path, 8);
        let (records, _) = scan_all(&mut reopened);
        assert_eq!(records.len(), 1);
        assert!(matches!(&records[0].0, LogRecord::Add { key, .. } if key == "kept"));
    }

    #[test]
    fn append_after_phantom_frames_overwrites_at_the_acked_offset() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(3, 8);
        let (_, acked_end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "first",
                vector: &vector,
                attrs: &[],
            }],
        );
        append_raw_bytes(&path, &encoded_add("ghost", &vector));
        let replacement = seeded_vector(4, 8);
        let (start, end) = append_bounds(
            &mut log,
            &[LogEntry::Add {
                key: "third",
                vector: &replacement,
                attrs: &[],
            }],
        );
        assert_eq!(start, acked_end);
        let (records, recoverable_end) = scan_all(&mut log);
        assert_eq!(records.len(), 2);
        assert_eq!(records[1].1, acked_end);
        assert!(matches!(&records[1].0, LogRecord::Add { key, .. } if key == "third"));
        assert_eq!(recoverable_end, end);
        drop(log);
        let mut reopened = reopen(&path, 8);
        let (records, _) = scan_all(&mut reopened);
        assert_eq!(records.len(), 2);
        assert!(
            records
                .iter()
                .all(|(record, _)| !matches!(record, LogRecord::Add { key, .. } if key == "ghost"))
        );
    }

    #[test]
    fn scanner_stops_at_corrupted_middle_record() {
        let dir = TempDir::new().unwrap();
        let build_path = dir.path().join("log");
        let mut log = Log::create(&build_path, 8).unwrap();
        let vectors: Vec<Vec<f32>> = (0..3).map(|seed| seeded_vector(seed, 8)).collect();
        let mut boundaries = Vec::new();
        for (index, vector) in vectors.iter().enumerate() {
            let key = format!("key-{index}");
            boundaries.push(append_bounds(
                &mut log,
                &[LogEntry::Add {
                    key: &key,
                    vector,
                    attrs: &[],
                }],
            ));
        }
        drop(log);
        let bytes = std::fs::read(&build_path).unwrap();
        let middle_start = boundaries[1].0 as usize;
        let key_len = "key-1".len();
        let payload_len = 8 * size_of::<f32>();
        let corrupt_positions = [
            middle_start + RECORD_PREFIX_LEN,
            middle_start + RECORD_PREFIX_LEN + key_len,
            middle_start + RECORD_PREFIX_LEN + key_len + payload_len,
        ];
        for (index, position) in corrupt_positions.iter().enumerate() {
            let corrupt_path = dir.path().join(format!("corrupt-{index}"));
            let mut corrupted = bytes.clone();
            corrupted[*position] ^= 0x01;
            std::fs::write(&corrupt_path, &corrupted).unwrap();
            let mut corrupt_log = reopen(&corrupt_path, 8);
            let (records, recoverable_end) = scan_all(&mut corrupt_log);
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].1, boundaries[0].0);
            assert_eq!(recoverable_end, boundaries[1].0);
        }
    }

    #[test]
    fn scanner_stops_at_malformed_records() {
        let dims = 8usize;
        let vector = seeded_vector(3, dims);
        let mut good = Vec::new();
        encode_record_into(
            &mut good,
            &LogEntry::Add {
                key: "good",
                vector: &vector,
                attrs: &[],
            },
        );
        let payload: Vec<u8> = vector
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let malformed = [
            raw_record(3, 4, b"keyy", &[]),
            raw_record(RECORD_TYPE_TOMBSTONE, 0, &[], &[]),
            raw_record(RECORD_TYPE_ADD, 257, &[b'k'; 257], &payload),
            raw_record(RECORD_TYPE_TOMBSTONE, 2, &[0xFF, 0xFE], &[]),
            vec![RECORD_TYPE_ADD, 200, 0, b'a', b'b', b'c'],
        ];
        let dir = TempDir::new().unwrap();
        for (index, bad) in malformed.iter().enumerate() {
            let path = dir.path().join(format!("malformed-{index}"));
            let mut record_bytes = good.clone();
            record_bytes.extend_from_slice(bad);
            write_log_file(&path, dims as u32, &record_bytes);
            let mut log = reopen(&path, dims);
            let (records, recoverable_end) = scan_all(&mut log);
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].1, HEADER_LEN as u64);
            assert_eq!(recoverable_end, HEADER_LEN as u64 + good.len() as u64);
        }
    }

    #[test]
    fn append_offsets_match_scanner_offsets() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        log.append(&[]).unwrap();
        assert_eq!(log.current_end_offset(), HEADER_LEN as u64);
        let vector = seeded_vector(7, 8);
        let mut expected_offsets = Vec::new();
        let mut previous_end = HEADER_LEN as u64;
        for index in 0..5u32 {
            let key = format!("entry-{index}");
            let (start, end) = append_bounds(
                &mut log,
                &[LogEntry::Add {
                    key: &key,
                    vector: &vector,
                    attrs: &[],
                }],
            );
            assert_eq!(start, previous_end);
            expected_offsets.push(start);
            previous_end = end;
        }
        assert_eq!(log.current_end_offset(), previous_end);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), previous_end);
        let (records, recoverable_end) = scan_all(&mut log);
        let offsets: Vec<u64> = records.iter().map(|(_, offset)| *offset).collect();
        assert_eq!(offsets, expected_offsets);
        assert_eq!(recoverable_end, previous_end);
        drop(log);
        let reopened = reopen(&path, 8);
        assert_eq!(reopened.current_end_offset(), previous_end);
    }

    #[test]
    fn append_validates_keys_and_vector_dims() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(1, 8);
        let wrong_dims = seeded_vector(1, 16);
        assert!(matches!(
            log.append(&[LogEntry::Add {
                key: "",
                vector: &vector,
                attrs: &[]
            }]),
            Err(VecDbError::InvalidKey(_))
        ));
        assert!(matches!(
            log.append(&[LogEntry::Add {
                key: "ok",
                vector: &wrong_dims,
                attrs: &[]
            }]),
            Err(VecDbError::DimensionMismatch {
                expected: 8,
                actual: 16
            })
        ));
        assert!(
            log.append(&[
                LogEntry::Add {
                    key: "good",
                    vector: &vector,
                    attrs: &[]
                },
                LogEntry::Tombstone { key: "" }
            ])
            .is_err()
        );
        assert_eq!(log.current_end_offset(), HEADER_LEN as u64);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), HEADER_LEN as u64);
        let (records, _) = scan_all(&mut log);
        assert!(records.is_empty());
    }

    #[test]
    fn generation_is_distinct_across_creates() {
        let dir = TempDir::new().unwrap();
        let first = Log::create(&dir.path().join("first"), 8).unwrap();
        let second = Log::create(&dir.path().join("second"), 8).unwrap();
        assert_ne!(first.generation(), second.generation());
    }

    #[test]
    fn temp_sibling_gets_fresh_generation_and_replaces_stale_tmp() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let log = Log::create(&path, 8).unwrap();
        let stale_path = dir.path().join("log.tmp");
        std::fs::write(&stale_path, b"stale leftover").unwrap();
        let (temp_log, temp_path) = Log::create_temp_sibling(&path, 8).unwrap();
        assert_eq!(temp_path, stale_path);
        assert_ne!(temp_log.generation(), log.generation());
        assert_eq!(temp_log.current_end_offset(), HEADER_LEN as u64);
        assert_eq!(
            std::fs::metadata(&temp_path).unwrap().len(),
            HEADER_LEN as u64
        );
        let temp_generation = temp_log.generation();
        drop(temp_log);
        let reopened = reopen(&temp_path, 8);
        assert_eq!(reopened.generation(), temp_generation);
    }

    #[test]
    fn large_bulk_append_matches_sequential_framing() {
        let dims = 512usize;
        let dir = TempDir::new().unwrap();
        let bulk_path = dir.path().join("bulk");
        let sequential_path = dir.path().join("sequential");
        let vectors: Vec<Vec<f32>> = (0..40).map(|seed| seeded_vector(seed, dims)).collect();
        let keys: Vec<String> = (0..40)
            .map(|index| format!("bulk-key-{index:03}"))
            .collect();
        let entries: Vec<LogEntry<'_>> = keys
            .iter()
            .zip(&vectors)
            .map(|(key, vector)| LogEntry::Add {
                key,
                vector,
                attrs: &[],
            })
            .collect();
        let mut bulk_log = Log::create(&bulk_path, dims).unwrap();
        let mut sequential_log = Log::create(&sequential_path, dims).unwrap();
        let (_, bulk_end) = append_bounds(&mut bulk_log, &entries);
        let mut sequential_end = 0;
        for entry in &entries {
            sequential_end = append_bounds(&mut sequential_log, std::slice::from_ref(entry)).1;
        }
        assert_eq!(bulk_end, sequential_end);
        assert!(bulk_end - HEADER_LEN as u64 > ENCODE_FLUSH_BYTES as u64);
        assert!(bulk_log.encode_buffer.capacity() <= 2 * ENCODE_FLUSH_BYTES);
        assert_eq!(
            std::fs::read(&bulk_path).unwrap()[HEADER_LEN..],
            std::fs::read(&sequential_path).unwrap()[HEADER_LEN..]
        );
        assert_eq!(scan_all(&mut bulk_log), scan_all(&mut sequential_log));
    }

    #[test]
    fn bulk_append_framing_equals_sequential_appends() {
        let dir = TempDir::new().unwrap();
        let bulk_path = dir.path().join("bulk");
        let sequential_path = dir.path().join("sequential");
        let vectors: Vec<Vec<f32>> = (0..4).map(|seed| seeded_vector(seed, 8)).collect();
        let entries = vec![
            LogEntry::Add {
                key: "a",
                vector: &vectors[0],
                attrs: &[],
            },
            LogEntry::Tombstone { key: "b" },
            LogEntry::Add {
                key: "c",
                vector: &vectors[2],
                attrs: &[],
            },
            LogEntry::Add {
                key: "d",
                vector: &vectors[3],
                attrs: &[],
            },
        ];
        let mut bulk_log = Log::create(&bulk_path, 8).unwrap();
        let mut sequential_log = Log::create(&sequential_path, 8).unwrap();
        let (bulk_start, bulk_end) = append_bounds(&mut bulk_log, &entries);
        let mut sequential_end = 0;
        for entry in &entries {
            sequential_end = append_bounds(&mut sequential_log, std::slice::from_ref(entry)).1;
        }
        assert_eq!(bulk_start, HEADER_LEN as u64);
        assert_eq!(bulk_end, sequential_end);
        let bulk_bytes = std::fs::read(&bulk_path).unwrap();
        let sequential_bytes = std::fs::read(&sequential_path).unwrap();
        assert_eq!(bulk_bytes[HEADER_LEN..], sequential_bytes[HEADER_LEN..]);
        assert_eq!(scan_all(&mut bulk_log), scan_all(&mut sequential_log));
    }

    fn attr(name: &str, value: AttrValue) -> Attribute {
        Attribute {
            name: name.to_string(),
            value,
        }
    }

    fn scan_attrs_of_single_add(log: &mut Log) -> Vec<Attribute> {
        let (records, _) = scan_all(log);
        assert_eq!(records.len(), 1);
        let LogRecord::Add { attrs, .. } = records[0].0.clone() else {
            panic!("expected an add record");
        };
        attrs
    }

    #[test]
    fn attr_records_round_trip_every_type_in_caller_order() {
        let full_set = vec![
            attr("zulu", AttrValue::I64(i64::MIN)),
            attr("alpha", AttrValue::Str(String::new())),
            attr("mike", AttrValue::Bool(false)),
            attr("delta", AttrValue::F64(-0.0)),
        ];
        let singles: Vec<Vec<Attribute>> = vec![
            vec![attr("s", AttrValue::Str("héllo-🔑".to_string()))],
            vec![attr("b", AttrValue::Bool(true))],
            vec![attr("i", AttrValue::I64(-1))],
            vec![attr("f", AttrValue::F64(f64::MAX))],
            Vec::new(),
        ];
        let dir = TempDir::new().unwrap();
        let vector = seeded_vector(8, 8);
        for (index, attrs) in singles.iter().chain([&full_set]).enumerate() {
            let path = dir.path().join(format!("log-{index}"));
            let mut log = Log::create(&path, 8).unwrap();
            log.append(&[LogEntry::Add {
                key: "k",
                vector: &vector,
                attrs,
            }])
            .unwrap();
            assert_eq!(&scan_attrs_of_single_add(&mut log), attrs);
            drop(log);
            let mut reopened = reopen(&path, 8);
            assert_eq!(&scan_attrs_of_single_add(&mut reopened), attrs);
        }
    }

    #[test]
    fn attr_boundary_sizes_round_trip() {
        let cases = [
            vec![attr(&"n".repeat(64), AttrValue::Bool(true))],
            vec![attr("s", AttrValue::Str("v".repeat(1024)))],
            (0..16)
                .map(|index| attr(&format!("a{index:02}"), AttrValue::I64(index)))
                .collect::<Vec<_>>(),
            ["a", "b", "c", "d"]
                .iter()
                .map(|name| attr(name, AttrValue::Str("x".repeat(1019))))
                .collect::<Vec<_>>(),
        ];
        assert_eq!(
            cases[3].iter().map(encoded_attr_len).sum::<usize>(),
            MAX_ATTRS_TOTAL_BYTES
        );
        let dir = TempDir::new().unwrap();
        let vector = seeded_vector(9, 8);
        for (index, attrs) in cases.iter().enumerate() {
            let path = dir.path().join(format!("log-{index}"));
            let mut log = Log::create(&path, 8).unwrap();
            log.append(&[LogEntry::Add {
                key: "k",
                vector: &vector,
                attrs,
            }])
            .unwrap();
            assert_eq!(&scan_attrs_of_single_add(&mut log), attrs);
        }
    }

    #[test]
    fn append_rejects_attrs_beyond_the_caps() {
        let over_total: Vec<Attribute> = ["a", "b", "c"]
            .iter()
            .map(|name| attr(name, AttrValue::Str("x".repeat(1019))))
            .chain([attr("e", AttrValue::Str("x".repeat(1020)))])
            .collect();
        assert_eq!(
            over_total.iter().map(encoded_attr_len).sum::<usize>(),
            MAX_ATTRS_TOTAL_BYTES + 1
        );
        let invalid: Vec<Vec<Attribute>> = vec![
            (0..17)
                .map(|index| attr(&format!("a{index:02}"), AttrValue::Bool(true)))
                .collect(),
            vec![attr("", AttrValue::Bool(true))],
            vec![attr(&"n".repeat(65), AttrValue::Bool(true))],
            vec![attr("s", AttrValue::Str("v".repeat(1025)))],
            over_total,
            vec![
                attr("same", AttrValue::Bool(true)),
                attr("other", AttrValue::I64(1)),
                attr("same", AttrValue::Str("again".to_string())),
            ],
        ];
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log");
        let mut log = Log::create(&path, 8).unwrap();
        let vector = seeded_vector(10, 8);
        for attrs in &invalid {
            assert!(matches!(
                log.append(&[LogEntry::Add {
                    key: "k",
                    vector: &vector,
                    attrs,
                }]),
                Err(VecDbError::InvalidAttributes(_))
            ));
            assert!(matches!(
                log.append(&[
                    LogEntry::Add {
                        key: "good",
                        vector: &vector,
                        attrs: &[],
                    },
                    LogEntry::Add {
                        key: "bad",
                        vector: &vector,
                        attrs,
                    }
                ]),
                Err(VecDbError::InvalidAttributes(_))
            ));
        }
        assert_eq!(log.current_end_offset(), HEADER_LEN as u64);
        assert_eq!(std::fs::metadata(&path).unwrap().len(), HEADER_LEN as u64);
    }

    #[test]
    fn non_finite_f64_attrs_round_trip_bit_exactly() {
        let payloads = [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -0.0];
        let attrs: Vec<Attribute> = payloads
            .iter()
            .enumerate()
            .map(|(index, value)| attr(&format!("f{index}"), AttrValue::F64(*value)))
            .collect();
        let dir = TempDir::new().unwrap();
        let mut log = Log::create(&dir.path().join("log"), 8).unwrap();
        let vector = seeded_vector(11, 8);
        log.append(&[LogEntry::Add {
            key: "k",
            vector: &vector,
            attrs: &attrs,
        }])
        .unwrap();
        let decoded = scan_attrs_of_single_add(&mut log);
        assert_eq!(decoded.len(), payloads.len());
        for (entry, expected) in decoded.iter().zip(&payloads) {
            let AttrValue::F64(value) = entry.value else {
                panic!("expected an f64 attribute");
            };
            assert_eq!(value.to_bits(), expected.to_bits());
        }
    }

    #[test]
    fn scanner_stops_at_malformed_attr_records() {
        let dims = 8usize;
        let vector = seeded_vector(12, dims);
        let mut good = Vec::new();
        encode_record_into(
            &mut good,
            &LogEntry::Add {
                key: "good",
                vector: &vector,
                attrs: &[attr("kept", AttrValue::Bool(true))],
            },
        );
        let vector_bytes: Vec<u8> = vector
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let encoded_attr = |name: &[u8], tag: u8, value: &[u8]| {
            let mut bytes = vec![name.len() as u8];
            bytes.extend_from_slice(name);
            bytes.push(tag);
            bytes.extend_from_slice(value);
            bytes
        };
        let str_value = |len: usize| {
            let mut bytes = (len as u16).to_le_bytes().to_vec();
            bytes.extend_from_slice(&vec![b'v'; len]);
            bytes
        };
        let with_attrs = |attr_bytes: &[u8]| {
            let mut payload = vector_bytes.clone();
            payload.extend_from_slice(attr_bytes);
            raw_record(RECORD_TYPE_ADD, 2, b"k1", &payload)
        };
        let five_over_total: Vec<u8> = {
            let mut bytes = vec![5u8];
            for name in [b"a", b"b", b"c", b"d", b"e"] {
                bytes.extend_from_slice(&encoded_attr(name, ATTR_TAG_STR, &str_value(1019)));
            }
            bytes
        };
        let oversized_name: Vec<u8> = {
            let mut bytes = vec![1u8];
            bytes.extend_from_slice(&encoded_attr(&[b'n'; 65], ATTR_TAG_BOOL, &[1]));
            bytes
        };
        let malformed = [
            with_attrs(&[17]),
            with_attrs(&[1, 0, ATTR_TAG_BOOL, 1]),
            with_attrs(&oversized_name),
            with_attrs(&{
                let mut bytes = vec![1u8];
                bytes.extend_from_slice(&encoded_attr(b"t", 4, &[0; 8]));
                bytes
            }),
            with_attrs(&{
                let mut bytes = vec![1u8];
                bytes.extend_from_slice(&encoded_attr(b"s", ATTR_TAG_STR, &str_value(1025)));
                bytes
            }),
            with_attrs(&{
                let mut bytes = vec![1u8];
                bytes.extend_from_slice(&encoded_attr(b"b", ATTR_TAG_BOOL, &[2]));
                bytes
            }),
            with_attrs(&{
                let mut bytes = vec![1u8];
                bytes.extend_from_slice(&encoded_attr(&[0xFF, 0xFE], ATTR_TAG_BOOL, &[1]));
                bytes
            }),
            with_attrs(&five_over_total),
            with_attrs(&[2, 1, b'a', ATTR_TAG_BOOL, 1]),
            with_attrs(&[1]),
        ];
        let dir = TempDir::new().unwrap();
        for (index, bad) in malformed.iter().enumerate() {
            let path = dir.path().join(format!("malformed-{index}"));
            let mut record_bytes = good.clone();
            record_bytes.extend_from_slice(bad);
            write_log_file(&path, dims as u32, &record_bytes);
            let mut log = reopen(&path, dims);
            let (records, recoverable_end) = scan_all(&mut log);
            assert_eq!(records.len(), 1, "case {index}");
            assert_eq!(records[0].1, HEADER_LEN as u64, "case {index}");
            assert_eq!(
                recoverable_end,
                HEADER_LEN as u64 + good.len() as u64,
                "case {index}"
            );
        }
    }

    #[test]
    fn scanner_stops_when_attrs_are_cut_by_the_log_end() {
        let dims = 8usize;
        let vector = seeded_vector(13, dims);
        let mut good = Vec::new();
        encode_record_into(
            &mut good,
            &LogEntry::Add {
                key: "good",
                vector: &vector,
                attrs: &[],
            },
        );
        let mut torn = Vec::new();
        encode_record_into(
            &mut torn,
            &LogEntry::Add {
                key: "torn",
                vector: &vector,
                attrs: &[
                    attr("first", AttrValue::Str("value".to_string())),
                    attr("second", AttrValue::I64(7)),
                ],
            },
        );
        let attrs_start = 3 + 4 + dims * size_of::<f32>();
        let dir = TempDir::new().unwrap();
        for cut in attrs_start..torn.len() {
            let path = dir.path().join(format!("cut-{cut}"));
            let mut record_bytes = good.clone();
            record_bytes.extend_from_slice(&torn[..cut]);
            write_log_file(&path, dims as u32, &record_bytes);
            let mut log = reopen(&path, dims);
            let (records, recoverable_end) = scan_all(&mut log);
            assert_eq!(records.len(), 1, "cut {cut}");
            assert_eq!(recoverable_end, HEADER_LEN as u64 + good.len() as u64);
        }
    }
}
