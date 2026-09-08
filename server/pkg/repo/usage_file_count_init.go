package repo

import (
	"context"
	"errors"
	"fmt"
)

var ErrFileCountIneligible = errors.New("file counts are ineligible")

// InitializeFileCounts publishes both counters without holding a usage-row lock
// while counting. All count-changing writers must be deployed before calling it.
func (repo *UsageRepository) InitializeFileCounts(ctx context.Context, userID int64) (bool, error) {
	counts, err := repo.readInitialFileCounts(ctx, userID)
	if err != nil {
		return false, err
	}
	if !counts.legacy {
		return false, nil
	}
	if counts.ineligible != "" {
		return false, fmt.Errorf("%w: %s", ErrFileCountIneligible, counts.ineligible)
	}
	return repo.publishInitialFileCounts(ctx, userID, counts)
}

type initialFileCounts struct {
	photos, locker, version int64
	legacy                  bool
	ineligible              string
}

func (repo *UsageRepository) readInitialFileCounts(ctx context.Context, userID int64) (initialFileCounts, error) {
	var counts initialFileCounts
	// One statement gives the source version, counts and checks the same snapshot.
	// The per-file aggregate keeps membership lookups bounded to this owner's files.
	err := repo.DB.QueryRowContext(ctx, `WITH source AS (
		SELECT
			COUNT(*) FILTER (WHERE memberships.photos) AS photos,
			COUNT(*) FILTER (WHERE memberships.locker) AS locker,
			BOOL_OR(memberships.app_count > 1 OR memberships.unsupported_app) AS ambiguous_app,
			BOOL_OR(memberships.photos IS NOT TRUE AND memberships.locker IS NOT TRUE
				AND t.file_id IS NULL) AS orphan,
			BOOL_OR(t.file_id IS NOT NULL
				AND (memberships.photos OR memberships.locker OR t.user_id <> $1)) AS inconsistent_trash
		FROM files AS f
		CROSS JOIN LATERAL (
			SELECT
				BOOL_OR(c.owner_id = $1 AND c.app = 'photos') AS photos,
				BOOL_OR(c.owner_id = $1 AND c.app = 'locker') AS locker,
				COUNT(DISTINCT c.app) AS app_count,
				BOOL_OR(c.app NOT IN ('photos', 'locker')) AS unsupported_app
			FROM collection_files AS cf
			JOIN collections AS c ON c.collection_id = cf.collection_id
			WHERE cf.file_id = f.file_id AND cf.is_deleted = FALSE
		) AS memberships
		LEFT JOIN trash AS t ON t.file_id = f.file_id AND t.is_restored = FALSE
		WHERE f.owner_id = $1
	)
	SELECT u.file_count_source_version,
		u.photos_file_count IS NULL AND u.locker_file_count IS NULL,
		source.photos, source.locker,
		CASE
			WHEN source.ambiguous_app THEN 'cross-app or unsupported app memberships'
			WHEN source.orphan THEN 'untrashed file without an owned membership'
			WHEN source.inconsistent_trash THEN 'active membership or wrong owner in Trash'
			WHEN EXISTS (
				SELECT 1
				FROM collections AS c
				JOIN collection_files AS cf ON cf.collection_id = c.collection_id
				JOIN files AS f ON f.file_id = cf.file_id
				WHERE c.owner_id = $1 AND c.app = 'locker' AND cf.is_deleted = FALSE
					AND (cf.f_owner_id IS NOT DISTINCT FROM $1) <> (f.owner_id = $1)
			) THEN 'Locker ownership predicates disagree'
			ELSE ''
		END
	FROM usage AS u CROSS JOIN source
	WHERE u.user_id = $1`, userID).Scan(
		&counts.version, &counts.legacy, &counts.photos, &counts.locker, &counts.ineligible)
	return counts, err
}

func (repo *UsageRepository) publishInitialFileCounts(ctx context.Context, userID int64, counts initialFileCounts) (bool, error) {
	result, err := repo.DB.ExecContext(ctx, `UPDATE usage
		SET photos_file_count = $2, locker_file_count = $3
		WHERE user_id = $1 AND file_count_source_version = $4
			AND photos_file_count IS NULL AND locker_file_count IS NULL`,
		userID, counts.photos, counts.locker, counts.version)
	if err != nil {
		return false, err
	}
	updated, err := result.RowsAffected()
	return updated == 1, err
}
