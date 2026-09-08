# Initialize existing users' file counts

This operator-run command fills both NULL file-count columns in existing `usage`
rows. It does not run on server startup, change API reads, repair source data,
or modify storage usage. New accounts already start with initialized counters.

Run only after **all count-aware writers are deployed and old processes have
stopped**, including the stale-membership invalidation path. Use the primary DB.

Build from `server/`:

```sh
go build -o init-file-counts ./tools/init-file-counts
```

Set the usual `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and TLS/authentication
settings used by `psql`. Do not put passwords on the command line. The command
does not read Museum's configuration or run schema migrations.

For the first cohort, run one instance:

```sh
./init-file-counts -before-user-id 200
```

Both ID bounds are exclusive. Only paired-NULL rows qualify. The command uses
one database connection, processes one user at a time, allows 10 seconds per
attempt, and pauses one second between users. Override `-timeout` or `-pause`
when needed. `-after-user-id` selects a later range; rerunning a range skips
already initialized users. Stop with Ctrl-C/SIGTERM if DB load or query latency
rises. A small ID range does not imply small libraries.

Each attempt reads the version, distinct active owned-file counts, and
eligibility in one SQL snapshot. It then publishes both counters only if they
are still NULL and the version is unchanged. Counting takes no file or membership
row locks; only publication briefly locks that user's usage row. Count-changing
writers that commit before publication cause this attempt to be skipped; writers
that follow it maintain the initialized counts. Publication does not change the
source version.

Unsafe histories stay NULL and are logged with a reason:

- An owned file has no active owned membership and no unrestored Trash row.
  Trash was added later: older cleanup used missing collection references to
  delete objects directly, so missing references do not establish Trash state.
- An unrestored Trash row conflicts with active owned membership or file ownership.
- An owned file has active cross-app or unsupported-app memberships.
- An active Locker membership's actual file ownership disagrees with the legacy
  `f_owner_id` predicate. NULL denormalized owners on old Photos rows are allowed.

Timeouts and version conflicts are also skipped for a later pass. Other database
errors stop the command. Missing usage rows are never created. Do not reset a
source version or write zero counts to get a user past a failed check.

API reads remain source-based. Before expanding the cohort or switching reads,
check the existing `museum_file_count_comparisons_total` match/mismatch metric
and `file count mismatch` logs during real source reads and file activity.
No observations is not a successful validation. The trusted-client same-app
assumption still applies; this command does not add guards to AddFiles/MoveFiles.
