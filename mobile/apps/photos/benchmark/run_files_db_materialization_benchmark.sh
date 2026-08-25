#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 || -z "$1" || "$1" == "/" ]]; then
  printf 'Usage: %s <persistent-result-directory>\n' "$0" >&2
  exit 64
fi

result_dir="$1"
mkdir -p "$result_dir"
result_dir="$(cd "$result_dir" && pwd -P)"
if [[ "$result_dir" == "/" ]]; then
  printf 'Refusing to use the filesystem root as the result directory\n' >&2
  exit 64
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
photos_dir="$(cd "$script_dir/.." && pwd -P)"
database_path="$result_dir/files-db-100000.sqlite"
raw_log="$result_dir/raw-runs.log"
measurements="$result_dir/measurements.jsonl"
report="$result_dir/benchmark-report.md"
benchmark_test="test/benchmark/files_db_materialization_benchmark_test.dart"

for output in "$database_path" "$raw_log" "$measurements" "$report"; do
  if [[ -e "$output" ]]; then
    printf 'Refusing to overwrite existing benchmark output: %s\n' "$output" >&2
    exit 1
  fi
done

cleanup_fixture() {
  if [[ "${FILESDB_BENCHMARK_KEEP_FIXTURE:-0}" == "1" ]]; then
    return
  fi
  for generated_database_file in \
    "$database_path" \
    "$database_path-shm" \
    "$database_path-wal"; do
    if [[ -e "$generated_database_file" ]]; then
      find "$generated_database_file" -delete
    fi
  done
}

trap cleanup_fixture EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$photos_dir"
touch "$raw_log" "$measurements"

run_worker() {
  local variant="$1"
  local run_kind="$2"
  local page_size="$3"
  local family="$4"
  FILESDB_BENCHMARK_MODE=run \
  FILESDB_BENCHMARK_DB="$database_path" \
  FILESDB_BENCHMARK_VARIANT="$variant" \
  FILESDB_BENCHMARK_RUN_KIND="$run_kind" \
  FILESDB_BENCHMARK_PAGE_SIZE="$page_size" \
  FILESDB_BENCHMARK_FAMILY="$family" \
    flutter test --no-pub "$benchmark_test" 2>&1 \
      | tee -a "$raw_log" \
      | tr '\r' '\n' \
      | sed -n 's/^.*FILESDB_BENCHMARK_JSON //p' >> "$measurements"
}

FILESDB_BENCHMARK_MODE=build \
FILESDB_BENCHMARK_DB="$database_path" \
  flutter test --no-pub "$benchmark_test" 2>&1 \
    | tee -a "$raw_log" \
    | tr '\r' '\n' \
    | sed -n 's/^.*FILESDB_BENCHMARK_JSON //p' >> "$measurements"

for family in \
  search_all_files \
  gallery_pending_or_uploaded \
  gallery_local_and_uploaded; do
  run_worker legacy warmup 2000 "$family"
  for run in 1 2 3 4 5; do
    run_worker legacy measured 2000 "$family"
  done
  for page_size in 500 1000 2000 5000; do
    run_worker paged warmup "$page_size" "$family"
    for run in 1 2 3 4 5; do
      run_worker paged measured "$page_size" "$family"
    done
  done
done

dart benchmark/summarize_files_db_materialization_benchmark.dart \
  "$measurements" > "$report"

printf 'Benchmark report: %s\n' "$report"
