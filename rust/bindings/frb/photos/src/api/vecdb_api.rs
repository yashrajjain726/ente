use std::path::Path;

use ente_ml::vecdb;
use flutter_rust_bridge::frb;

#[derive(Clone, Debug)]
pub enum RustVecDbError {
    Io { message: String },
    Corrupt { message: String },
    Locked { message: String },
    ReadOnly { message: String },
    Closed { message: String },
    InvalidKey { message: String },
    InvalidVector { message: String },
    DimensionMismatch { message: String },
    InvalidDimensions { message: String },
    UnboundedSearch { message: String },
    LengthMismatch { message: String },
}

impl From<vecdb::VecDbError> for RustVecDbError {
    fn from(value: vecdb::VecDbError) -> Self {
        let message = value.to_string();
        match value {
            vecdb::VecDbError::Io { .. } => Self::Io { message },
            vecdb::VecDbError::Corrupt(_) => Self::Corrupt { message },
            vecdb::VecDbError::Locked(_) => Self::Locked { message },
            vecdb::VecDbError::ReadOnly => Self::ReadOnly { message },
            vecdb::VecDbError::Closed => Self::Closed { message },
            vecdb::VecDbError::InvalidKey(_) => Self::InvalidKey { message },
            vecdb::VecDbError::InvalidVector(_) => Self::InvalidVector { message },
            vecdb::VecDbError::DimensionMismatch { .. } => Self::DimensionMismatch { message },
            vecdb::VecDbError::InvalidDimensions(_) => Self::InvalidDimensions { message },
            vecdb::VecDbError::UnboundedSearch => Self::UnboundedSearch { message },
        }
    }
}

#[derive(Clone, Debug)]
pub struct VecDbMatch {
    pub key: String,
    pub distance: f32,
}

#[derive(Clone, Debug)]
pub struct VecDbKeyMatches {
    pub key: String,
    pub matches: Vec<VecDbMatch>,
}

#[derive(Clone, Debug)]
pub struct VecDbStats {
    pub live_count: usize,
    pub dead_count: usize,
    pub dims: usize,
    pub log_bytes: u64,
    pub records_since_snapshot: usize,
    pub approximate_memory_bytes: usize,
}

fn to_api_match(entry: vecdb::Match) -> VecDbMatch {
    VecDbMatch {
        key: entry.key,
        distance: entry.distance,
    }
}

#[frb(opaque)]
pub struct VecDb {
    inner: vecdb::VecDb,
}

impl VecDb {
    #[frb(sync)]
    pub fn new(file_path: String, dimensions: usize) -> Result<Self, RustVecDbError> {
        Ok(Self {
            inner: vecdb::VecDb::open(Path::new(&file_path), dimensions)?,
        })
    }

    pub fn open_read_only(file_path: String, dimensions: usize) -> Result<Self, RustVecDbError> {
        Ok(Self {
            inner: vecdb::VecDb::open_read_only(Path::new(&file_path), dimensions)?,
        })
    }

    pub fn search(
        &self,
        query: Vec<f32>,
        limit: Option<usize>,
        max_distance: Option<f32>,
        exact: bool,
        allowed_keys: Option<Vec<String>>,
    ) -> Result<Vec<VecDbMatch>, RustVecDbError> {
        let params = vecdb::SearchParams {
            limit,
            max_distance,
            exact,
            allowed_keys,
        };
        self.run_search(&query, &params)
    }

    fn run_search(
        &self,
        query: &[f32],
        params: &vecdb::SearchParams,
    ) -> Result<Vec<VecDbMatch>, RustVecDbError> {
        let matches = self.inner.search(query, params)?;
        Ok(matches.into_iter().map(to_api_match).collect())
    }

    pub fn add_vector(&self, key: String, vector: Vec<f32>) -> Result<(), RustVecDbError> {
        Ok(self.inner.add(&key, &vector)?)
    }

    pub fn bulk_add_vectors(
        &self,
        keys: Vec<String>,
        vectors: Vec<Vec<f32>>,
    ) -> Result<(), RustVecDbError> {
        if keys.len() != vectors.len() {
            return Err(RustVecDbError::LengthMismatch {
                message: format!(
                    "keys length {} does not match vectors length {}",
                    keys.len(),
                    vectors.len()
                ),
            });
        }
        let entries: Vec<(String, Vec<f32>)> = keys.into_iter().zip(vectors).collect();
        Ok(self.inner.bulk_add(&entries)?)
    }

    pub fn search_vectors(
        &self,
        query: Vec<f32>,
        count: usize,
        exact: bool,
    ) -> Result<Vec<VecDbMatch>, RustVecDbError> {
        self.search(query, Some(count), None, exact, None)
    }

    pub fn bulk_search_vectors(
        &self,
        queries: Vec<Vec<f32>>,
        count: usize,
        exact: bool,
    ) -> Result<Vec<Vec<VecDbMatch>>, RustVecDbError> {
        let params = vecdb::SearchParams {
            limit: Some(count),
            max_distance: None,
            exact,
            allowed_keys: None,
        };
        queries
            .iter()
            .map(|query| self.run_search(query, &params))
            .collect()
    }

    pub fn search_vectors_within_distance(
        &self,
        query: Vec<f32>,
        max_distance: f32,
        exact: bool,
    ) -> Result<Vec<VecDbMatch>, RustVecDbError> {
        self.search(query, None, Some(max_distance), exact, None)
    }

    pub fn approx_search_vectors_within_similarity(
        &self,
        query: Vec<f32>,
        minimum_similarity: f32,
    ) -> Result<Vec<VecDbMatch>, RustVecDbError> {
        self.search(query, None, Some(1.0 - minimum_similarity), false, None)
    }

    pub fn approx_filtered_search_vectors_within_distance(
        &self,
        query: Vec<f32>,
        allowed_keys: Vec<String>,
        count: usize,
        max_distance: f32,
    ) -> Result<Vec<VecDbMatch>, RustVecDbError> {
        self.search(
            query,
            Some(count),
            Some(max_distance),
            false,
            Some(allowed_keys),
        )
    }

    pub fn bulk_approx_filtered_search_vectors_within_distance(
        &self,
        queries: Vec<Vec<f32>>,
        allowed_keys: Vec<String>,
        count: usize,
        max_distance: f32,
    ) -> Result<Vec<Vec<VecDbMatch>>, RustVecDbError> {
        let params = vecdb::SearchParams {
            limit: Some(count),
            max_distance: Some(max_distance),
            exact: false,
            allowed_keys: Some(allowed_keys),
        };
        queries
            .iter()
            .map(|query| self.run_search(query, &params))
            .collect()
    }

    pub fn bulk_search_keys(
        &self,
        potential_keys: Vec<String>,
        count: usize,
        exact: bool,
    ) -> Result<Vec<VecDbKeyMatches>, RustVecDbError> {
        let params = vecdb::SearchParams {
            limit: Some(count),
            max_distance: None,
            exact,
            allowed_keys: None,
        };
        let mut results = Vec::new();
        for key in potential_keys {
            let Some(vector) = self.inner.get(&key) else {
                continue;
            };
            let matches = self.run_search(&vector, &params)?;
            results.push(VecDbKeyMatches { key, matches });
        }
        Ok(results)
    }

    pub fn contains_vector(&self, key: String) -> bool {
        self.inner.contains(&key)
    }

    pub fn get_vector(&self, key: String) -> Option<Vec<f32>> {
        self.inner.get(&key)
    }

    pub fn bulk_get_vectors(&self, keys: Vec<String>) -> Vec<Option<Vec<f32>>> {
        keys.iter().map(|key| self.inner.get(key)).collect()
    }

    pub fn remove_vector(&self, key: String) -> Result<usize, RustVecDbError> {
        Ok(usize::from(self.inner.remove(&key)?))
    }

    pub fn bulk_remove_vectors(&self, keys: Vec<String>) -> Result<usize, RustVecDbError> {
        Ok(self.inner.bulk_remove(&keys)?)
    }

    pub fn flush(&self) -> Result<(), RustVecDbError> {
        Ok(self.inner.flush()?)
    }

    pub fn reset_index(&self) -> Result<(), RustVecDbError> {
        Ok(self.inner.reset()?)
    }

    pub fn delete_index(self) -> Result<(), RustVecDbError> {
        Ok(self.inner.delete()?)
    }

    pub fn get_index_stats(&self) -> VecDbStats {
        match self.inner.stats() {
            Ok(stats) => VecDbStats {
                live_count: stats.live_count,
                dead_count: stats.dead_count,
                dims: stats.dims,
                log_bytes: stats.log_bytes,
                records_since_snapshot: stats.records_since_snapshot,
                approximate_memory_bytes: stats.approximate_memory_bytes,
            },
            Err(_) => VecDbStats {
                live_count: 0,
                dead_count: 0,
                dims: 0,
                log_bytes: 0,
                records_since_snapshot: 0,
                approximate_memory_bytes: 0,
            },
        }
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::*;

    const DIMS: usize = 8;

    static TEST_DIR_COUNTER: AtomicU32 = AtomicU32::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn create() -> Self {
            let sequence = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "ente-photos-frb-vecdb-{}-{sequence}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn db_path(&self) -> String {
            self.0.join("db").to_str().unwrap().to_string()
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn basis(axis: usize) -> Vec<f32> {
        let mut vector = vec![0.0; DIMS];
        vector[axis] = 1.0;
        vector
    }

    fn key(name: &str) -> String {
        name.to_string()
    }

    #[test]
    fn add_search_stats_round_trip() {
        let dir = TestDir::create();
        let db = VecDb::new(dir.db_path(), DIMS).unwrap();
        db.add_vector(key("a"), basis(0)).unwrap();
        db.bulk_add_vectors(vec![key("b"), key("c")], vec![basis(1), basis(2)])
            .unwrap();
        assert!(db.contains_vector(key("a")));
        assert!(!db.contains_vector(key("missing")));
        assert_eq!(db.get_vector(key("b")).unwrap(), basis(1));
        assert!(db.get_vector(key("missing")).is_none());
        assert_eq!(
            db.bulk_get_vectors(vec![key("c"), key("missing")]),
            vec![Some(basis(2)), None]
        );
        let matches = db.search_vectors(basis(0), 2, true).unwrap();
        assert_eq!(matches[0].key, "a");
        assert!(matches[0].distance.abs() < 1.0e-6);
        let bulk = db
            .bulk_search_vectors(vec![basis(1), basis(2)], 1, false)
            .unwrap();
        assert_eq!(bulk.len(), 2);
        assert_eq!(bulk[0][0].key, "b");
        assert_eq!(bulk[1][0].key, "c");
        let filtered = db
            .approx_filtered_search_vectors_within_distance(
                basis(0),
                vec![key("b"), key("c")],
                3,
                2.0,
            )
            .unwrap();
        assert!(filtered.iter().all(|found| found.key != "a"));
        assert_eq!(filtered.len(), 2);
        let within = db
            .search_vectors_within_distance(basis(0), 0.5, true)
            .unwrap();
        assert_eq!(within.len(), 1);
        assert_eq!(within[0].key, "a");
        let stats = db.get_index_stats();
        assert_eq!(stats.live_count, 3);
        assert_eq!(stats.dead_count, 0);
        assert_eq!(stats.dims, DIMS);
        assert!(stats.log_bytes > 32);
        assert!(stats.approximate_memory_bytes > 0);
        assert_eq!(db.len(), 3);
        assert!(!db.is_empty());
        db.flush().unwrap();
        assert_eq!(db.get_index_stats().records_since_snapshot, 0);
        let read_only = VecDb::open_read_only(dir.db_path(), DIMS).unwrap();
        assert_eq!(read_only.len(), 3);
        assert!(matches!(
            read_only.add_vector(key("x"), basis(3)),
            Err(RustVecDbError::ReadOnly { .. })
        ));
        assert_eq!(db.remove_vector(key("a")).unwrap(), 1);
        assert_eq!(db.remove_vector(key("a")).unwrap(), 0);
        assert_eq!(
            db.bulk_remove_vectors(vec![key("b"), key("nope")]).unwrap(),
            1
        );
        assert_eq!(db.len(), 1);
        db.reset_index().unwrap();
        assert!(db.is_empty());
        db.add_vector(key("again"), basis(3)).unwrap();
        db.delete_index().unwrap();
        assert!(!PathBuf::from(dir.db_path()).exists());
    }

    #[test]
    fn bulk_add_rejects_length_mismatch() {
        let dir = TestDir::create();
        let db = VecDb::new(dir.db_path(), DIMS).unwrap();
        let error = db
            .bulk_add_vectors(vec![key("a")], vec![basis(0), basis(1)])
            .unwrap_err();
        assert!(matches!(error, RustVecDbError::LengthMismatch { .. }));
        assert!(db.is_empty());
    }

    #[test]
    fn similarity_threshold_conversion_edges() {
        let dir = TestDir::create();
        let db = VecDb::new(dir.db_path(), DIMS).unwrap();
        db.add_vector(key("a"), basis(0)).unwrap();
        db.add_vector(key("b"), basis(1)).unwrap();
        let close = db
            .approx_search_vectors_within_similarity(basis(0), 0.5)
            .unwrap();
        assert_eq!(close.len(), 1);
        assert_eq!(close[0].key, "a");
        let all = db
            .approx_search_vectors_within_similarity(basis(0), -1.0)
            .unwrap();
        assert_eq!(all.len(), 2);
        for degenerate in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 2.0] {
            assert!(
                db.approx_search_vectors_within_similarity(basis(0), degenerate)
                    .unwrap()
                    .is_empty()
            );
        }
    }

    #[test]
    fn bulk_filtered_search_stays_query_aligned() {
        let dir = TestDir::create();
        let db = VecDb::new(dir.db_path(), DIMS).unwrap();
        db.bulk_add_vectors(
            vec![key("a"), key("b"), key("c")],
            vec![basis(0), basis(1), basis(2)],
        )
        .unwrap();
        let queries = vec![basis(0), basis(1), basis(5)];
        let aligned = db
            .bulk_approx_filtered_search_vectors_within_distance(
                queries.clone(),
                vec![key("a"), key("b"), key("absent")],
                2,
                0.5,
            )
            .unwrap();
        assert_eq!(aligned.len(), 3);
        assert_eq!(aligned[0].len(), 1);
        assert_eq!(aligned[0][0].key, "a");
        assert_eq!(aligned[1].len(), 1);
        assert_eq!(aligned[1][0].key, "b");
        assert!(aligned[2].is_empty());
        let empty_allowed = db
            .bulk_approx_filtered_search_vectors_within_distance(
                queries.clone(),
                Vec::new(),
                2,
                0.5,
            )
            .unwrap();
        assert_eq!(empty_allowed.len(), 3);
        assert!(empty_allowed.iter().all(|matches| matches.is_empty()));
        for degenerate_distance in [f32::NAN, f32::INFINITY, -0.5] {
            let degenerate = db
                .bulk_approx_filtered_search_vectors_within_distance(
                    queries.clone(),
                    vec![key("a")],
                    2,
                    degenerate_distance,
                )
                .unwrap();
            assert_eq!(degenerate.len(), 3);
            assert!(degenerate.iter().all(|matches| matches.is_empty()));
        }
        let unfiltered = db.search(basis(0), Some(3), None, false, None).unwrap();
        assert_eq!(unfiltered.len(), 3);
        let filtered_empty = db
            .search(basis(0), Some(3), None, false, Some(Vec::new()))
            .unwrap();
        assert!(filtered_empty.is_empty());
    }

    #[test]
    fn bulk_search_keys_includes_self_match_and_skips_absent() {
        let dir = TestDir::create();
        let db = VecDb::new(dir.db_path(), DIMS).unwrap();
        db.bulk_add_vectors(vec![key("a"), key("b")], vec![basis(0), basis(1)])
            .unwrap();
        let results = db
            .bulk_search_keys(vec![key("missing"), key("b"), key("a")], 2, true)
            .unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].key, "b");
        assert_eq!(results[0].matches[0].key, "b");
        assert!(results[0].matches[0].distance.abs() < 1.0e-6);
        assert_eq!(results[0].matches.len(), 2);
        assert_eq!(results[1].key, "a");
        assert_eq!(results[1].matches[0].key, "a");
    }
}
