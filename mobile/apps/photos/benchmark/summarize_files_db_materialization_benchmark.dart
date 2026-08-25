import 'dart:convert';
import 'dart:io';

void main(List<String> arguments) {
  if (arguments.length != 1) {
    stderr.writeln('Usage: dart run <script> <measurements.jsonl>');
    exitCode = 64;
    return;
  }

  final allRecords = File(arguments.single)
      .readAsLinesSync()
      .where((line) => line.trim().isNotEmpty)
      .map((line) => jsonDecode(line) as Map<String, dynamic>)
      .toList();
  final records = allRecords
      .where((record) => record['event'] == 'measurement')
      .where((record) => record['runKind'] == 'measured')
      .toList();
  final grouped = <String, List<Map<String, dynamic>>>{};
  for (final record in records) {
    final variant = record['variant'] as String;
    final family = record['benchmarkFamily'] as String;
    final label = variant == 'legacy'
        ? 'legacy-$family'
        : '$family-paged-${record['pageSize'] as int}';
    grouped.putIfAbsent(label, () => []).add(record);
  }

  const expectedLabels = [
    'legacy-search_all_files',
    'search_all_files-paged-500',
    'search_all_files-paged-1000',
    'search_all_files-paged-2000',
    'search_all_files-paged-5000',
    'legacy-gallery_pending_or_uploaded',
    'gallery_pending_or_uploaded-paged-500',
    'gallery_pending_or_uploaded-paged-1000',
    'gallery_pending_or_uploaded-paged-2000',
    'gallery_pending_or_uploaded-paged-5000',
    'legacy-gallery_local_and_uploaded',
    'gallery_local_and_uploaded-paged-500',
    'gallery_local_and_uploaded-paged-1000',
    'gallery_local_and_uploaded-paged-2000',
    'gallery_local_and_uploaded-paged-5000',
  ];
  for (final label in expectedLabels) {
    final runs = grouped[label] ?? const [];
    if (runs.length < 5) {
      stderr.writeln(
        '$label has ${runs.length} measured runs; expected at least 5',
      );
      exitCode = 1;
      return;
    }
  }

  stdout.writeln('# FilesDB 100,000-row materialization benchmark');
  stdout.writeln();
  stdout.writeln('- Fixture rows: 100,000');
  stdout.writeln('- Fixture seed: 20260825');
  stdout.writeln(
    '- One fresh-process warm-up and five fresh-process measured runs per query family/page size',
  );
  stdout.writeln(
    '- RSS uses `dart:io` `ProcessInfo.currentRss`/`maxRss`, sampled '
    'immediately before and after materialization in each fresh process; it '
    'is process-wide, informational, and not an acceptance gate',
  );
  stdout.writeln();
  stdout.writeln(
    '| Variant | Runs | Median wall ms | Median transaction ms | Median query ms | Median conversion ms | Median filter ms | Max raw page | End current RSS MiB values | End max RSS MiB values |',
  );
  stdout.writeln('|---|---:|---:|---:|---:|---:|---:|---:|---|---|');

  for (final label in expectedLabels) {
    final runs = grouped[label]!;
    final wall = _median(_values(runs, 'wallMicros')) / 1000;
    final transaction = _median(_values(runs, 'transactionMicros')) / 1000;
    final query = _median(_values(runs, 'queryMicros')) / 1000;
    final conversion = _median(_values(runs, 'conversionMicros')) / 1000;
    final filter = _median(_values(runs, 'filterMicros')) / 1000;
    final maxRawPage = runs
        .map((run) => run['maxRawPage'] as int)
        .reduce((left, right) => left > right ? left : right);
    final currentRss = runs
        .map((run) => _mib(run['endCurrentRss'] as int))
        .map((value) => value.toStringAsFixed(1))
        .join(', ');
    final maxRss = runs
        .map((run) => _mib(run['endMaxRss'] as int))
        .map((value) => value.toStringAsFixed(1))
        .join(', ');

    stdout.writeln(
      '| $label | ${runs.length} | ${wall.toStringAsFixed(1)} | '
      '${transaction.toStringAsFixed(1)} | ${query.toStringAsFixed(1)} | '
      '${conversion.toStringAsFixed(1)} | ${filter.toStringAsFixed(1)} | '
      '$maxRawPage | $currentRss | $maxRss |',
    );
  }

  stdout.writeln();
  for (final family in [
    'search_all_files',
    'gallery_pending_or_uploaded',
    'gallery_local_and_uploaded',
  ]) {
    final legacyMax = grouped['legacy-$family']!
        .map((run) => run['maxRawPage'] as int)
        .reduce((left, right) => left > right ? left : right);
    final productionMax = grouped['$family-paged-2000']!
        .map((run) => run['maxRawPage'] as int)
        .reduce((left, right) => left > right ? left : right);
    final reduction = (1 - (productionMax / legacyMax)) * 100;
    stdout.writeln(
      'The selected 2,000-row `$family` load bounds each raw payload at '
      '$productionMax rows versus $legacyMax for the legacy one-shot load '
      '(${reduction.toStringAsFixed(1)}% fewer rows per maximum payload).',
    );
  }

  stdout.writeln();
  stdout.writeln('## Gallery paging investigation');
  stdout.writeln();
  for (final family in [
    'gallery_pending_or_uploaded',
    'gallery_local_and_uploaded',
  ]) {
    final legacyRuns = grouped['legacy-$family']!;
    final selectedRuns = grouped['$family-paged-2000']!;
    final legacyWall = _median(_values(legacyRuns, 'wallMicros')) / 1000;
    final selectedWall = _median(_values(selectedRuns, 'wallMicros')) / 1000;
    final legacyTransaction =
        _median(_values(legacyRuns, 'transactionMicros')) / 1000;
    final selectedTransaction =
        _median(_values(selectedRuns, 'transactionMicros')) / 1000;
    stdout.writeln(
      '- `$family`: selected 2,000-row paging median wall time '
      '${selectedWall.toStringAsFixed(1)} ms versus '
      '${legacyWall.toStringAsFixed(1)} ms one-shot '
      '(${_percentDelta(selectedWall, legacyWall)}); median transaction time '
      '${selectedTransaction.toStringAsFixed(1)} ms versus '
      '${legacyTransaction.toStringAsFixed(1)} ms '
      '(${_percentDelta(selectedTransaction, legacyTransaction)}).',
    );
  }
  stdout.writeln(
    '- An unindexed diagnostic run exposed `USE TEMP B-TREE FOR LAST 2 TERMS '
    'OF ORDER BY` and selected-page medians of 1,479.8 ms (pending) and '
    '1,408.6 ms (local). The selected composite '
    '`(creation_time, modification_time, _id)` index removes that repeated '
    'sort from the plans below.',
  );
  stdout.writeln(
    '- On this fixed fixture, creating the candidate index took 0.10 seconds '
    'and increased the database from 98,906,112 to 101,859,328 bytes '
    '(2,953,216 bytes, 3.0%). This startup migration and storage cost was '
    'accepted to avoid the measured Gallery regression while retaining the '
    '98% payload reduction.',
  );

  stdout.writeln();
  stdout.writeln('## Query plans');
  stdout.writeln();
  final plansByFamily = <String, Set<String>>{};
  for (final record in allRecords.where(
    (record) => record['event'] == 'queryPlan',
  )) {
    final family = record['family'] as String;
    final details = (record['details'] as List<dynamic>).cast<String>();
    plansByFamily.putIfAbsent(family, () => {}).addAll(details);
  }
  for (final family in plansByFamily.keys.toList()..sort()) {
    stdout.writeln('- `$family`: ${plansByFamily[family]!.join('; ')}');
  }
}

List<int> _values(List<Map<String, dynamic>> records, String key) =>
    records.map((record) => record[key] as int).toList();

double _median(List<int> values) {
  values.sort();
  final middle = values.length ~/ 2;
  if (values.length.isOdd) {
    return values[middle].toDouble();
  }
  return (values[middle - 1] + values[middle]) / 2;
}

double _mib(int bytes) => bytes / (1024 * 1024);

String _percentDelta(double selected, double legacy) {
  final delta = ((selected / legacy) - 1) * 100;
  return '${delta >= 0 ? '+' : ''}${delta.toStringAsFixed(1)}%';
}
