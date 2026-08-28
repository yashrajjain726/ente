use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use ente_ml::vecdb::{Match, SearchParams, VecDb};

const SEED: u64 = 0xE47E_0000_0000_0001;
const LATENT_DIMS: usize = 24;
const QUERY_COUNT: usize = 100;
const SINGLE_ADD_COUNT: usize = 2000;
const BULK_BATCH_SIZE: usize = 1000;
const SEARCH_K: usize = 10;
const WARMUP_QUERIES: usize = 10;
const REMOVAL_PERCENT: usize = 15;
const DEFAULT_SCALES: &str = "10000,100000";
const DEFAULT_DIMS: usize = 512;

struct Config {
    scales: Vec<usize>,
    dims: usize,
    compare_usearch: bool,
}

struct BenchData {
    entries: Vec<(String, Vec<f32>)>,
    queries: Vec<Vec<f32>>,
    probe: Vec<f32>,
    allowed_indices: Vec<usize>,
}

struct VecdbReport {
    single_count: usize,
    single_total: Duration,
    bulk_count: usize,
    bulk_total: Duration,
    snapshot_write: Duration,
    approx_total: Duration,
    exact_total: Duration,
    recall: f64,
    threshold: f32,
    threshold_total: Duration,
    threshold_avg_hits: f64,
    filtered_total: Duration,
    open_with_snapshot: Duration,
    open_full_rebuild: Duration,
    removed: usize,
    remove_and_compact: Duration,
    compaction_fired: bool,
    log_bytes: u64,
    snapshot_bytes: u64,
    memory_bytes: usize,
}

fn main() {
    let config = parse_args();
    println!(
        "vecdb bench  dims={}  queries={}  seed={:#018x}",
        config.dims, QUERY_COUNT, SEED
    );
    println!(
        "scales: {}   usearch comparison: {}",
        config
            .scales
            .iter()
            .map(|scale| scale.to_string())
            .collect::<Vec<_>>()
            .join(", "),
        if config.compare_usearch {
            "enabled"
        } else {
            "disabled"
        }
    );
    let temp_root = tempfile::TempDir::new().expect("create bench temp dir");
    for &scale in &config.scales {
        run_scale(scale, config.dims, config.compare_usearch, temp_root.path());
    }
}

fn parse_args() -> Config {
    let mut scales = parse_scales(DEFAULT_SCALES);
    let mut dims = DEFAULT_DIMS;
    let mut compare_usearch = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--scales" => scales = parse_scales(&required_value(args.next())),
            "--dims" => {
                dims = required_value(args.next())
                    .parse()
                    .unwrap_or_else(|_| usage_exit())
            }
            "--compare-usearch" => compare_usearch = true,
            _ => usage_exit(),
        }
    }
    if dims == 0 || !dims.is_multiple_of(8) {
        eprintln!("--dims must be a nonzero multiple of 8");
        std::process::exit(2);
    }
    if compare_usearch && !cfg!(feature = "usearch") {
        eprintln!(
            "--compare-usearch requires a build with the usearch feature: cargo run -p ente-ml \
             --example vecdb_bench --release --features usearch -- --compare-usearch"
        );
        std::process::exit(2);
    }
    Config {
        scales,
        dims,
        compare_usearch,
    }
}

fn required_value(value: Option<String>) -> String {
    value.unwrap_or_else(|| usage_exit())
}

fn parse_scales(list: &str) -> Vec<usize> {
    let scales: Vec<usize> = list
        .split(',')
        .map(|part| match part.trim().parse() {
            Ok(scale) if scale > 0 => scale,
            _ => usage_exit(),
        })
        .collect();
    if scales.is_empty() {
        usage_exit();
    }
    scales
}

fn usage_exit() -> ! {
    eprintln!(
        "usage: cargo run -p ente-ml --example vecdb_bench --release [--features usearch] -- \
         [--scales 10000,100000] [--dims 512] [--compare-usearch]"
    );
    std::process::exit(2);
}

fn run_scale(scale: usize, dims: usize, compare_usearch: bool, temp_root: &Path) {
    let clusters = (scale / 150).max(1) as u64;
    println!();
    println!("=== scale {scale}  dims {dims}  clusters {clusters} ===");
    eprintln!("[scale {scale}] generating data");
    let data = generate_data(scale, dims, clusters);
    let dir = temp_root.join(format!("scale-{scale}-{dims}"));
    std::fs::create_dir_all(&dir).expect("create bench dir");
    let vecdb = run_vecdb(&data, dims, &dir, scale);
    print_vecdb_report(&vecdb);
    if compare_usearch {
        run_comparison(&data, dims, &dir, scale, &vecdb);
    }
    let _ = std::fs::remove_dir_all(&dir);
}

fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

fn normalized(mut values: Vec<f32>) -> Vec<f32> {
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    for value in &mut values {
        *value /= norm;
    }
    values
}

fn seeded_unit_vector(seed: u64, dims: usize) -> Vec<f32> {
    let mut state = seed;
    normalized(
        (0..dims)
            .map(|_| {
                let unit = (splitmix64(&mut state) >> 40) as f32 / (1u64 << 24) as f32;
                unit * 2.0 - 1.0
            })
            .collect(),
    )
}

fn clustered_unit_vector(center_seed: u64, noise_seed: u64, dims: usize) -> Vec<f32> {
    let center = seeded_unit_vector(center_seed, dims);
    let noise = seeded_unit_vector(noise_seed, dims);
    let mut spread_state = noise_seed ^ 0xD1B5_4A32_D192_ED03;
    let spread = 0.6 + (splitmix64(&mut spread_state) >> 40) as f32 / (1u64 << 24) as f32;
    normalized(
        center
            .iter()
            .zip(&noise)
            .map(|(center, noise)| center + spread * noise)
            .collect(),
    )
}

fn projected_unit_vector(projection: &[Vec<f32>], latent: &[f32]) -> Vec<f32> {
    let dims = projection[0].len();
    let mut values = vec![0.0f32; dims];
    for (weight, basis) in latent.iter().zip(projection) {
        for (value, basis_value) in values.iter_mut().zip(basis) {
            *value += weight * basis_value;
        }
    }
    normalized(values)
}

fn generate_data(scale: usize, dims: usize, clusters: u64) -> BenchData {
    let projection: Vec<Vec<f32>> = (0..LATENT_DIMS as u64)
        .map(|axis| seeded_unit_vector(SEED + 0x0300_0000 + axis, dims))
        .collect();
    let member = |cluster: u64, noise_seed: u64| {
        projected_unit_vector(
            &projection,
            &clustered_unit_vector(SEED + cluster, noise_seed, LATENT_DIMS),
        )
    };
    let entries = (0..scale as u64)
        .map(|index| {
            (
                format!("vec-{index}"),
                member(index % clusters, SEED + 0x0100_0000 + index),
            )
        })
        .collect();
    let queries = (0..QUERY_COUNT as u64)
        .map(|index| member(index % clusters, SEED + 0x0200_0000 + index))
        .collect();
    let probe = member(0, SEED + 0x0400_0000);
    let mut filter_state = SEED + 0x0500_0000;
    let allowed_indices = (0..scale)
        .filter(|_| splitmix64(&mut filter_state).is_multiple_of(10))
        .collect();
    BenchData {
        entries,
        queries,
        probe,
        allowed_indices,
    }
}

struct IngestTimings {
    single_count: usize,
    single_total: Duration,
    bulk_count: usize,
    bulk_total: Duration,
    snapshot_write: Duration,
}

struct SearchTimings {
    approx_total: Duration,
    exact_total: Duration,
    recall: f64,
    threshold: f32,
    threshold_total: Duration,
    threshold_avg_hits: f64,
    filtered_total: Duration,
}

struct ReopenTimings {
    open_with_snapshot: Duration,
    open_full_rebuild: Duration,
}

struct CompactionTimings {
    removed: usize,
    remove_and_compact: Duration,
    compaction_fired: bool,
}

fn run_vecdb(data: &BenchData, dims: usize, dir: &Path, scale: usize) -> VecdbReport {
    let path = dir.join("bench.vecdb");
    let mut db = VecDb::open(&path, dims).expect("open vecdb");
    let ingest = ingest_phase(&mut db, data, scale);
    let searches = search_phase(&db, data, scale);
    let stats = db.stats();
    let snapshot_file = PathBuf::from(format!("{}.graph", path.display()));
    let snapshot_bytes = std::fs::metadata(&snapshot_file)
        .map(|meta| meta.len())
        .unwrap_or(0);
    drop(db);
    let (reopens, mut db) = reopen_phase(&path, dims, &snapshot_file, scale);
    let compaction = compaction_phase(&mut db, data, scale);
    db.delete().expect("vecdb delete");
    VecdbReport {
        single_count: ingest.single_count,
        single_total: ingest.single_total,
        bulk_count: ingest.bulk_count,
        bulk_total: ingest.bulk_total,
        snapshot_write: ingest.snapshot_write,
        approx_total: searches.approx_total,
        exact_total: searches.exact_total,
        recall: searches.recall,
        threshold: searches.threshold,
        threshold_total: searches.threshold_total,
        threshold_avg_hits: searches.threshold_avg_hits,
        filtered_total: searches.filtered_total,
        open_with_snapshot: reopens.open_with_snapshot,
        open_full_rebuild: reopens.open_full_rebuild,
        removed: compaction.removed,
        remove_and_compact: compaction.remove_and_compact,
        compaction_fired: compaction.compaction_fired,
        log_bytes: stats.log_bytes,
        snapshot_bytes,
        memory_bytes: stats.approximate_memory_bytes,
    }
}

fn ingest_phase(db: &mut VecDb, data: &BenchData, scale: usize) -> IngestTimings {
    let single_count = SINGLE_ADD_COUNT.min(data.entries.len());
    eprintln!("[scale {scale}] vecdb single adds");
    let started = Instant::now();
    for (key, vector) in &data.entries[..single_count] {
        db.add(key, vector).expect("vecdb add");
    }
    let single_total = started.elapsed();
    let rest = &data.entries[single_count..];
    eprintln!("[scale {scale}] vecdb bulk adds");
    let started = Instant::now();
    for batch in rest.chunks(BULK_BATCH_SIZE) {
        db.bulk_add(batch).expect("vecdb bulk add");
    }
    let bulk_total = started.elapsed();
    db.add("bench-probe", &data.probe).expect("vecdb probe add");
    let started = Instant::now();
    db.flush().expect("vecdb flush");
    IngestTimings {
        single_count,
        single_total,
        bulk_count: rest.len(),
        bulk_total,
        snapshot_write: started.elapsed(),
    }
}

fn search_phase(db: &VecDb, data: &BenchData, scale: usize) -> SearchTimings {
    eprintln!("[scale {scale}] vecdb searches");
    let approx_params = limit_params(SEARCH_K, false);
    let exact_params = limit_params(SEARCH_K, true);
    warm(db, &data.queries, &approx_params);
    let (approx_total, approx_results) = timed_searches(db, &data.queries, &approx_params);
    warm(db, &data.queries, &exact_params);
    let (exact_total, exact_results) = timed_searches(db, &data.queries, &exact_params);
    let recall = recall_at_k(&exact_results, &approx_results, SEARCH_K);
    let threshold = one_percent_threshold(db, data);
    let threshold_params = SearchParams {
        limit: None,
        max_distance: Some(threshold),
        exact: false,
        allowed_keys: None,
    };
    warm(db, &data.queries, &threshold_params);
    let (threshold_total, threshold_results) = timed_searches(db, &data.queries, &threshold_params);
    let threshold_avg_hits = threshold_results
        .iter()
        .map(|found| found.len())
        .sum::<usize>() as f64
        / threshold_results.len().max(1) as f64;
    let filtered_params = SearchParams {
        limit: Some(SEARCH_K),
        max_distance: None,
        exact: false,
        allowed_keys: Some(
            data.allowed_indices
                .iter()
                .map(|index| format!("vec-{index}"))
                .collect(),
        ),
    };
    warm(db, &data.queries, &filtered_params);
    let (filtered_total, _) = timed_searches(db, &data.queries, &filtered_params);
    SearchTimings {
        approx_total,
        exact_total,
        recall,
        threshold,
        threshold_total,
        threshold_avg_hits,
        filtered_total,
    }
}

fn reopen_phase(
    path: &Path,
    dims: usize,
    snapshot_file: &Path,
    scale: usize,
) -> (ReopenTimings, VecDb) {
    eprintln!("[scale {scale}] vecdb cold open with snapshot");
    let started = Instant::now();
    let reopened = VecDb::open(path, dims).expect("vecdb reopen with snapshot");
    let open_with_snapshot = started.elapsed();
    drop(reopened);
    std::fs::remove_file(snapshot_file).expect("remove snapshot");
    eprintln!("[scale {scale}] vecdb cold open without snapshot (full rebuild)");
    let started = Instant::now();
    let db = VecDb::open(path, dims).expect("vecdb reopen without snapshot");
    let open_full_rebuild = started.elapsed();
    (
        ReopenTimings {
            open_with_snapshot,
            open_full_rebuild,
        },
        db,
    )
}

fn compaction_phase(db: &mut VecDb, data: &BenchData, scale: usize) -> CompactionTimings {
    eprintln!("[scale {scale}] vecdb remove {REMOVAL_PERCENT}% + compact");
    let removed = data.entries.len() * REMOVAL_PERCENT / 100;
    let removals: Vec<String> = (0..removed).map(|index| format!("vec-{index}")).collect();
    let log_before = db.stats().log_bytes;
    let started = Instant::now();
    db.bulk_remove(&removals).expect("vecdb bulk remove");
    let remove_and_compact = started.elapsed();
    let stats_after = db.stats();
    CompactionTimings {
        removed,
        remove_and_compact,
        compaction_fired: stats_after.log_bytes < log_before && stats_after.dead_count == 0,
    }
}

fn limit_params(limit: usize, exact: bool) -> SearchParams {
    SearchParams {
        limit: Some(limit),
        max_distance: None,
        exact,
        allowed_keys: None,
    }
}

fn warm(db: &VecDb, queries: &[Vec<f32>], params: &SearchParams) {
    for query in queries.iter().take(WARMUP_QUERIES) {
        db.search(query, params).expect("warmup search");
    }
}

fn timed_searches(
    db: &VecDb,
    queries: &[Vec<f32>],
    params: &SearchParams,
) -> (Duration, Vec<Vec<Match>>) {
    let started = Instant::now();
    let results = queries
        .iter()
        .map(|query| db.search(query, params).expect("search"))
        .collect();
    (started.elapsed(), results)
}

fn recall_at_k(truth: &[Vec<Match>], found: &[Vec<Match>], k: usize) -> f64 {
    let mut hits = 0usize;
    let mut total = 0usize;
    for (expected, actual) in truth.iter().zip(found) {
        let wanted: HashSet<&str> = expected
            .iter()
            .take(k)
            .map(|entry| entry.key.as_str())
            .collect();
        total += wanted.len();
        hits += actual
            .iter()
            .take(k)
            .filter(|entry| wanted.contains(entry.key.as_str()))
            .count();
    }
    if total == 0 {
        return 1.0;
    }
    hits as f64 / total as f64
}

fn one_percent_threshold(db: &VecDb, data: &BenchData) -> f32 {
    let tail_rank = (data.entries.len() / 100).max(1);
    let params = limit_params(tail_rank, true);
    let mut sum = 0.0f64;
    let mut counted = 0usize;
    for query in &data.queries {
        let found = db.search(query, &params).expect("threshold probe search");
        if let Some(last) = found.last() {
            sum += f64::from(last.distance);
            counted += 1;
        }
    }
    (sum / counted.max(1) as f64) as f32
}

fn print_vecdb_report(report: &VecdbReport) {
    println!("  vecdb");
    row(
        "add single (append+fsync per op)",
        format!("{} ops", report.single_count),
        report.single_total,
        per_op_text(report.single_total, report.single_count, "op"),
    );
    row(
        "bulk add (1000/batch, fsync+auto snapshots)",
        format!("{} vecs", report.bulk_count),
        report.bulk_total,
        per_op_text(report.bulk_total, report.bulk_count, "vec"),
    );
    row(
        "snapshot write (flush at full scale)",
        "-".to_string(),
        report.snapshot_write,
        String::new(),
    );
    row(
        "search approx k=10",
        format!("{QUERY_COUNT} queries"),
        report.approx_total,
        per_op_text(report.approx_total, QUERY_COUNT, "query"),
    );
    row(
        "search exact k=10",
        format!("{QUERY_COUNT} queries"),
        report.exact_total,
        per_op_text(report.exact_total, QUERY_COUNT, "query"),
    );
    println!(
        "    {:<44} {:.4}",
        "recall@10 (approx vs exact)", report.recall
    );
    row(
        &format!("search approx threshold d<={:.4} (~1%)", report.threshold),
        format!("{QUERY_COUNT} queries"),
        report.threshold_total,
        per_op_text(report.threshold_total, QUERY_COUNT, "query"),
    );
    println!(
        "    {:<44} {:.1}",
        "avg hits per threshold query", report.threshold_avg_hits
    );
    row(
        "search approx k=10 filtered (10% allowed)",
        format!("{QUERY_COUNT} queries"),
        report.filtered_total,
        per_op_text(report.filtered_total, QUERY_COUNT, "query"),
    );
    row(
        "open cold (valid snapshot)",
        "-".to_string(),
        report.open_with_snapshot,
        String::new(),
    );
    row(
        "open cold (no snapshot: replay+rebuild+snap)",
        "-".to_string(),
        report.open_full_rebuild,
        String::new(),
    );
    row(
        &format!("remove {REMOVAL_PERCENT}% + auto compact"),
        format!("{} keys", report.removed),
        report.remove_and_compact,
        String::new(),
    );
    println!(
        "    {:<44} {}",
        "compaction fired",
        if report.compaction_fired { "yes" } else { "NO" }
    );
    println!(
        "    {:<44} log {}  snapshot {}  approx mem {}",
        "sizes at full scale",
        fmt_bytes(report.log_bytes),
        fmt_bytes(report.snapshot_bytes),
        fmt_bytes(report.memory_bytes as u64)
    );
}

fn row(label: &str, quantity: String, total: Duration, per: String) {
    println!(
        "    {label:<44} {quantity:>14}  total {:>10}  {per}",
        fmt_duration(total)
    );
}

fn per_op(total: Duration, count: usize) -> Duration {
    if count == 0 {
        return Duration::ZERO;
    }
    Duration::from_nanos((total.as_nanos() / count as u128) as u64)
}

fn per_op_text(total: Duration, count: usize, unit: &str) -> String {
    if count == 0 {
        return "-".to_string();
    }
    format!("{}/{unit}", fmt_duration(per_op(total, count)))
}

fn fmt_duration(duration: Duration) -> String {
    let nanos = duration.as_nanos() as f64;
    if nanos < 1_000.0 {
        format!("{nanos:.0} ns")
    } else if nanos < 1_000_000.0 {
        format!("{:.1} us", nanos / 1_000.0)
    } else if nanos < 1_000_000_000.0 {
        format!("{:.2} ms", nanos / 1_000_000.0)
    } else {
        format!("{:.2} s", nanos / 1_000_000_000.0)
    }
}

fn fmt_bytes(bytes: u64) -> String {
    let value = bytes as f64;
    if value < 1024.0 {
        format!("{bytes} B")
    } else if value < 1024.0 * 1024.0 {
        format!("{:.1} KB", value / 1024.0)
    } else {
        format!("{:.2} MB", value / (1024.0 * 1024.0))
    }
}

#[cfg(not(feature = "usearch"))]
fn run_comparison(
    _data: &BenchData,
    _dims: usize,
    _dir: &Path,
    _scale: usize,
    _vecdb: &VecdbReport,
) {
}

#[cfg(feature = "usearch")]
fn run_comparison(data: &BenchData, dims: usize, dir: &Path, scale: usize, vecdb: &VecdbReport) {
    let usearch = usearch_bench::run(data, dims, dir, scale, vecdb.threshold);
    usearch_bench::print_report(&usearch);
    usearch_bench::print_side_by_side(vecdb, &usearch, scale);
}

#[cfg(feature = "usearch")]
mod usearch_bench {
    use std::collections::HashSet;
    use std::path::Path;
    use std::time::{Duration, Instant};

    use ente_ml::vector_db::VectorDB;
    use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

    use super::{
        BenchData, QUERY_COUNT, SEARCH_K, SINGLE_ADD_COUNT, VecdbReport, WARMUP_QUERIES, fmt_bytes,
        fmt_duration, per_op_text, row,
    };

    const THRESHOLD_STEP_COUNTS: [usize; 5] = [200, 500, 2000, 5000, 10000];

    pub struct UsearchReport {
        legacy: Option<(Duration, usize)>,
        pure_add_total: Duration,
        pure_add_count: usize,
        save: Duration,
        approx_total: Duration,
        exact_total: Duration,
        recall: f64,
        threshold: f32,
        threshold_total: Duration,
        threshold_avg_hits: f64,
        filtered_total: Duration,
        file_bytes: u64,
        memory_bytes: u64,
    }

    pub fn run(
        data: &BenchData,
        dims: usize,
        dir: &Path,
        scale: usize,
        threshold: f32,
    ) -> UsearchReport {
        let options = IndexOptions {
            dimensions: dims,
            metric: MetricKind::IP,
            quantization: ScalarKind::F32,
            ..IndexOptions::default()
        };
        let index = Index::new(&options).expect("create usearch index");
        index
            .reserve(data.entries.len() + 1)
            .expect("usearch reserve");
        eprintln!("[scale {scale}] usearch pure adds");
        let started = Instant::now();
        for (slot, (_, vector)) in data.entries.iter().enumerate() {
            index.add(slot as u64, vector).expect("usearch add");
        }
        let pure_add_total = started.elapsed();
        index
            .add(data.entries.len() as u64, &data.probe)
            .expect("usearch probe add");
        let save_path = dir.join("bench.usearch");
        let save_str = save_path.to_str().expect("usearch save path").to_string();
        let started = Instant::now();
        index.save(&save_str).expect("usearch save");
        let save = started.elapsed();
        let file_bytes = std::fs::metadata(&save_path)
            .map(|meta| meta.len())
            .unwrap_or(0);
        let memory_bytes = index.memory_usage() as u64;

        eprintln!("[scale {scale}] usearch searches");
        for query in data.queries.iter().take(WARMUP_QUERIES) {
            index.search(query, SEARCH_K).expect("usearch warmup");
        }
        let started = Instant::now();
        let approx: Vec<Vec<u64>> = data
            .queries
            .iter()
            .map(|query| index.search(query, SEARCH_K).expect("usearch search").keys)
            .collect();
        let approx_total = started.elapsed();
        for query in data.queries.iter().take(WARMUP_QUERIES) {
            index
                .exact_search(query, SEARCH_K)
                .expect("usearch exact warmup");
        }
        let started = Instant::now();
        let exact: Vec<Vec<u64>> = data
            .queries
            .iter()
            .map(|query| {
                index
                    .exact_search(query, SEARCH_K)
                    .expect("usearch exact search")
                    .keys
            })
            .collect();
        let exact_total = started.elapsed();
        let recall = key_recall(&exact, &approx);

        for query in data.queries.iter().take(WARMUP_QUERIES) {
            threshold_search(&index, query, threshold);
        }
        let started = Instant::now();
        let threshold_hits: Vec<usize> = data
            .queries
            .iter()
            .map(|query| threshold_search(&index, query, threshold).len())
            .collect();
        let threshold_total = started.elapsed();
        let threshold_avg_hits =
            threshold_hits.iter().sum::<usize>() as f64 / threshold_hits.len().max(1) as f64;

        for query in data.queries.iter().take(WARMUP_QUERIES) {
            filtered_search(&index, query, &data.allowed_indices);
        }
        let started = Instant::now();
        for query in &data.queries {
            filtered_search(&index, query, &data.allowed_indices);
        }
        let filtered_total = started.elapsed();

        let legacy = if scale <= 10_000 {
            eprintln!("[scale {scale}] usearch legacy save-per-add");
            let legacy_path = dir.join("legacy.usearch");
            let mut wrapper =
                VectorDB::new(legacy_path.to_str().expect("legacy usearch path"), dims)
                    .expect("legacy usearch wrapper");
            let count = SINGLE_ADD_COUNT.min(data.entries.len());
            let started = Instant::now();
            for (slot, (_, vector)) in data.entries.iter().take(count).enumerate() {
                wrapper
                    .add_vector(slot as u64, vector)
                    .expect("legacy usearch add");
            }
            Some((started.elapsed(), count))
        } else {
            None
        };

        UsearchReport {
            legacy,
            pure_add_total,
            pure_add_count: data.entries.len(),
            save,
            approx_total,
            exact_total,
            recall,
            threshold,
            threshold_total,
            threshold_avg_hits,
            filtered_total,
            file_bytes,
            memory_bytes,
        }
    }

    fn threshold_search(index: &Index, query: &[f32], max_distance: f32) -> Vec<u64> {
        let index_size = index.size();
        if index_size == 0 {
            return Vec::new();
        }
        let mut previous_count = 0usize;
        for step_count in THRESHOLD_STEP_COUNTS {
            let count = step_count.min(index_size);
            if count <= previous_count {
                continue;
            }
            previous_count = count;
            let matches = index
                .search(query, count)
                .expect("usearch threshold search");
            let should_expand = count < index_size
                && matches
                    .distances
                    .last()
                    .is_some_and(|distance| *distance <= max_distance);
            if should_expand {
                continue;
            }
            return keys_within(matches.keys, &matches.distances, max_distance);
        }
        let matches = index
            .search(query, index_size)
            .expect("usearch threshold search");
        keys_within(matches.keys, &matches.distances, max_distance)
    }

    fn keys_within(mut keys: Vec<u64>, distances: &[f32], max_distance: f32) -> Vec<u64> {
        let keep = distances.partition_point(|distance| *distance <= max_distance);
        keys.truncate(keep);
        keys
    }

    fn filtered_search(index: &Index, query: &[f32], allowed_indices: &[usize]) -> Vec<u64> {
        let allowed: HashSet<u64> = allowed_indices.iter().map(|index| *index as u64).collect();
        index
            .filtered_search(query, SEARCH_K, |key| allowed.contains(&key))
            .expect("usearch filtered search")
            .keys
    }

    fn key_recall(truth: &[Vec<u64>], found: &[Vec<u64>]) -> f64 {
        let mut hits = 0usize;
        let mut total = 0usize;
        for (expected, actual) in truth.iter().zip(found) {
            let wanted: HashSet<u64> = expected.iter().copied().collect();
            total += wanted.len();
            hits += actual.iter().filter(|key| wanted.contains(key)).count();
        }
        if total == 0 {
            return 1.0;
        }
        hits as f64 / total as f64
    }

    pub fn print_report(report: &UsearchReport) {
        println!("  usearch");
        match report.legacy {
            Some((total, count)) => row(
                "legacy add (save per add)",
                format!("{count} ops"),
                total,
                per_op_text(total, count, "op"),
            ),
            None => println!(
                "    {:<44} skipped at this scale (would take hours)",
                "legacy add (save per add)"
            ),
        }
        row(
            "pure add (in-memory, no save)",
            format!("{} vecs", report.pure_add_count),
            report.pure_add_total,
            per_op_text(report.pure_add_total, report.pure_add_count, "vec"),
        );
        row(
            "one save at full scale",
            "-".to_string(),
            report.save,
            String::new(),
        );
        row(
            "search approx k=10",
            format!("{QUERY_COUNT} queries"),
            report.approx_total,
            per_op_text(report.approx_total, QUERY_COUNT, "query"),
        );
        row(
            "search exact k=10",
            format!("{QUERY_COUNT} queries"),
            report.exact_total,
            per_op_text(report.exact_total, QUERY_COUNT, "query"),
        );
        println!(
            "    {:<44} {:.4}",
            "recall@10 (approx vs exact)", report.recall
        );
        row(
            &format!(
                "search approx threshold d<={:.4} (stepped)",
                report.threshold
            ),
            format!("{QUERY_COUNT} queries"),
            report.threshold_total,
            per_op_text(report.threshold_total, QUERY_COUNT, "query"),
        );
        println!(
            "    {:<44} {:.1}",
            "avg hits per threshold query", report.threshold_avg_hits
        );
        row(
            "search approx k=10 filtered (10% allowed)",
            format!("{QUERY_COUNT} queries"),
            report.filtered_total,
            per_op_text(report.filtered_total, QUERY_COUNT, "query"),
        );
        println!(
            "    {:<44} file {}  reported mem {}",
            "sizes at full scale",
            fmt_bytes(report.file_bytes),
            fmt_bytes(report.memory_bytes)
        );
    }

    pub fn print_side_by_side(vecdb: &VecdbReport, usearch: &UsearchReport, scale: usize) {
        println!("  side by side (scale {scale})");
        pair("metric", "vecdb".to_string(), "usearch".to_string());
        pair(
            "durable add per op",
            per_op_text(vecdb.single_total, vecdb.single_count, "op"),
            usearch
                .legacy
                .map(|(total, count)| per_op_text(total, count, "op"))
                .unwrap_or_else(|| "- (skipped)".to_string()),
        );
        pair(
            "bulk/pure add per vec",
            per_op_text(vecdb.bulk_total, vecdb.bulk_count, "vec"),
            per_op_text(usearch.pure_add_total, usearch.pure_add_count, "vec"),
        );
        pair(
            "full build wall time",
            fmt_duration(vecdb.single_total + vecdb.bulk_total),
            fmt_duration(usearch.pure_add_total),
        );
        pair(
            "approx search per query",
            per_op_text(vecdb.approx_total, QUERY_COUNT, "query"),
            per_op_text(usearch.approx_total, QUERY_COUNT, "query"),
        );
        pair(
            "recall@10 vs own exact",
            format!("{:.4}", vecdb.recall),
            format!("{:.4}", usearch.recall),
        );
        pair(
            "exact search per query",
            per_op_text(vecdb.exact_total, QUERY_COUNT, "query"),
            per_op_text(usearch.exact_total, QUERY_COUNT, "query"),
        );
        pair(
            "threshold search per query",
            per_op_text(vecdb.threshold_total, QUERY_COUNT, "query"),
            per_op_text(usearch.threshold_total, QUERY_COUNT, "query"),
        );
        pair(
            "threshold avg hits",
            format!("{:.1}", vecdb.threshold_avg_hits),
            format!("{:.1}", usearch.threshold_avg_hits),
        );
        pair(
            "filtered search per query",
            per_op_text(vecdb.filtered_total, QUERY_COUNT, "query"),
            per_op_text(usearch.filtered_total, QUERY_COUNT, "query"),
        );
        pair(
            "full save / snapshot",
            fmt_duration(vecdb.snapshot_write),
            fmt_duration(usearch.save),
        );
        pair(
            "on-disk bytes",
            fmt_bytes(vecdb.log_bytes + vecdb.snapshot_bytes),
            fmt_bytes(usearch.file_bytes),
        );
        pair(
            "approx memory",
            fmt_bytes(vecdb.memory_bytes as u64),
            fmt_bytes(usearch.memory_bytes),
        );
        println!(
            "    note: vecdb adds are durable (fsync per op/batch, periodic snapshots); usearch \
             pure adds are in-memory only"
        );
        println!(
            "    note: usearch legacy save-per-add rewrites the whole index file per add, \
             without fsync"
        );
        println!(
            "    note: vecdb on-disk = log + graph snapshot; usearch on-disk = single index file"
        );
        println!(
            "    note: threshold uses vecdb's ~1% distance on both engines (usearch via legacy \
             stepped expansion); filtered restricts to the same seeded 10% key subset, k=10"
        );
    }

    fn pair(label: &str, vecdb_value: String, usearch_value: String) {
        println!("    {label:<28} {vecdb_value:>18} {usearch_value:>18}");
    }
}
