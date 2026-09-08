# Initialize existing users' file counts

`POST /admin/user/init-file-counts` initializes one user's paired-NULL counters.
It uses the existing admin authentication and the server's primary database.
Nothing runs automatically on deployment; client count reads remain source-based.

`GET /admin/user?id=...` (or `?email=...`) also returns top-level
`photosFileCount` and `lockerFileCount` from `usage`. Both are `-1` until the pair
is initialized, including when the usage row is missing; an initialized empty
library returns `0`. These are individual-user counts, not family totals, and
reading them does not trigger initialization. Existing response fields are unchanged.

Call only after **all count-aware writers are deployed and old processes have
stopped**, including the stale-membership invalidation path. For the first cohort,
submit users with `user_id < 200` one at a time, pausing between requests. The API
accepts an explicit user ID, not a range, so cohort selection and pacing stay with
the caller. A small ID range does not imply small libraries.

Request body:

```json
{"userID": 1}
```

- HTTP 200 with `{"initialized": true}`: both counters were published.
- HTTP 200 with `{"initialized": false}`: already initialized or the source version
  changed; retry later if the counters are still NULL.
- HTTP 200 with `initialized: false` and `reason`: inconsistent history; leave the
  counters NULL and investigate. Repeating the request does not repair the data.
- HTTP 504: the database work exceeded its 10-second budget. Stop or defer large
  accounts if DB load or latency rises. Rerunning a request is safe, including
  when a response is lost after publication.
- Other errors use the normal API error handling. A missing usage row returns
  HTTP 404 and is never created by this endpoint.

Search server logs for `file count initialization`; each attempt records the
admin, target user, result, and any error. There is no new metric or per-user
metric label.

Each attempt reads the version, distinct active owned-file counts, and
eligibility in one SQL snapshot. It then publishes both counters only if they
are still NULL and the version is unchanged. Counting takes no file or membership
row locks; only publication briefly locks that user's usage row. Count-changing
writers that commit before publication cause this attempt to be skipped; writers
that follow it maintain the initialized counts. Storage and source version are
unchanged by publication.

Unsafe histories stay NULL:

- An owned file has no active owned membership and no unrestored Trash row.
  Trash was added later: older cleanup used missing collection references to
  delete objects directly, so missing references do not establish Trash state.
- An unrestored Trash row conflicts with active owned membership or file ownership.
- An owned file has active cross-app or unsupported-app memberships.
- An active Locker membership's actual file ownership disagrees with the legacy
  `f_owner_id` predicate. NULL denormalized owners on old Photos rows are allowed.

Do not reset source versions or write zero counts to bypass a failed check.
Before expanding the cohort or switching reads, check the existing
`museum_file_count_comparisons_total` match/mismatch metric and `file count mismatch`
logs during real source reads and file activity. No observations is not successful
validation. The trusted-client same-app assumption still applies; this endpoint
does not add guards to AddFiles/MoveFiles.
