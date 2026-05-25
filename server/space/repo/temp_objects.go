package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/ente-io/stacktrace"
)

const (
	TempObjectPurposePost   = "post"
	TempObjectPurposeAvatar = "avatar"
	TempObjectPurposeCover  = "cover"
)

func (r *AssetsRepository) AddTempObject(ctx context.Context, rec SpaceTempObjectRecord) error {
	cleanupAfter := rec.CleanupAfter
	if cleanupAfter == 0 {
		cleanupAfter = rec.ExpiresAt
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_temp_objects (object_key, owner_id, space_id, purpose, bucket_id, expected_size, expires_at, cleanup_after)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, rec.ObjectKey, rec.OwnerID, rec.SpaceID, rec.Purpose, rec.BucketID, rec.ExpectedSize, rec.ExpiresAt, cleanupAfter)
	return stacktrace.Propagate(err, "")
}

func QueueObjectCleanupTx(ctx context.Context, tx *sql.Tx, rec SpaceTempObjectRecord) error {
	expectedSize := rec.ExpectedSize
	if expectedSize <= 0 {
		expectedSize = 1
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO space_temp_objects (object_key, owner_id, space_id, purpose, bucket_id, expected_size, expires_at, cleanup_after)
		VALUES ($1, $2, $3, $4, $5, $6, now_utc_micro_seconds(), now_utc_micro_seconds())
		ON CONFLICT (object_key) DO UPDATE
		SET owner_id = EXCLUDED.owner_id,
		    space_id = EXCLUDED.space_id,
		    purpose = EXCLUDED.purpose,
		    bucket_id = EXCLUDED.bucket_id,
		    expected_size = EXCLUDED.expected_size,
		    expires_at = EXCLUDED.expires_at,
		    cleanup_after = EXCLUDED.cleanup_after
	`, rec.ObjectKey, rec.OwnerID, rec.SpaceID, rec.Purpose, rec.BucketID, expectedSize)
	return stacktrace.Propagate(err, "")
}

func (r *AssetsRepository) GetTempObject(ctx context.Context, ownerID int64, objectKey, purpose string, spaceID *string) (*SpaceTempObjectRecord, error) {
	args := []any{objectKey, ownerID, purpose}
	query := `
		SELECT object_key, owner_id, space_id, purpose, bucket_id, expected_size, expires_at, cleanup_after, created_at
		FROM space_temp_objects
		WHERE object_key = $1 AND owner_id = $2 AND purpose = $3 AND expires_at > now_utc_micro_seconds()`
	if spaceID != nil {
		args = append(args, *spaceID)
		query += fmt.Sprintf(" AND space_id = $%d", len(args))
	}
	return scanSpaceTempObject(r.DB.QueryRowContext(ctx, query, args...))
}

func ConsumeTempObjectTx(ctx context.Context, tx *sql.Tx, ownerID int64, objectKey, purpose string, spaceID *string) error {
	args := []any{objectKey, ownerID, purpose}
	query := `DELETE FROM space_temp_objects WHERE object_key = $1 AND owner_id = $2 AND purpose = $3`
	if spaceID != nil {
		args = append(args, *spaceID)
		query += fmt.Sprintf(" AND space_id = $%d", len(args))
	}
	res, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if rows != 1 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *AssetsRepository) GetAndLockExpiredTempObjects(ctx context.Context, nowMicros int64, limit int) (*sql.Tx, []SpaceTempObjectRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, stacktrace.Propagate(err, "")
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT object_key, owner_id, space_id, purpose, bucket_id, expected_size, expires_at, cleanup_after, created_at
		FROM space_temp_objects
		WHERE cleanup_after <= $1
		ORDER BY cleanup_after ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	`, nowMicros, limit)
	if err != nil {
		_ = tx.Rollback()
		return nil, nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()

	tempObjects := make([]SpaceTempObjectRecord, 0)
	for rows.Next() {
		rec, err := scanSpaceTempObject(rows)
		if err != nil {
			_ = tx.Rollback()
			return nil, nil, err
		}
		tempObjects = append(tempObjects, *rec)
	}
	if err := rows.Err(); err != nil {
		_ = tx.Rollback()
		return nil, nil, stacktrace.Propagate(err, "")
	}
	return tx, tempObjects, nil
}

func RemoveTempObjectTx(ctx context.Context, tx *sql.Tx, objectKey string) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM space_temp_objects WHERE object_key = $1`, objectKey)
	return stacktrace.Propagate(err, "")
}

func (r *AssetsRepository) RemoveTempObject(ctx context.Context, objectKey string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM space_temp_objects WHERE object_key = $1`, objectKey)
	return stacktrace.Propagate(err, "")
}

func SetTempObjectCleanupAfterTx(ctx context.Context, tx *sql.Tx, objectKey string, cleanupAfter int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE space_temp_objects SET cleanup_after = $1 WHERE object_key = $2`, cleanupAfter, objectKey)
	return stacktrace.Propagate(err, "")
}

func IsObjectReferencedTx(ctx context.Context, tx *sql.Tx, objectKey string) (bool, error) {
	var exists bool
	err := tx.QueryRowContext(ctx, `
		SELECT (
			EXISTS (SELECT 1 FROM spaces WHERE avatar_object_key = $1) OR
			EXISTS (SELECT 1 FROM spaces WHERE cover_object_key = $1) OR
			EXISTS (
				SELECT 1
				FROM space_post_assets a
				JOIN space_posts p ON p.post_id = a.post_id
				WHERE a.object_key = $1 AND p.is_deleted = FALSE
			)
		)
	`, objectKey).Scan(&exists)
	return exists, stacktrace.Propagate(err, "")
}

func scanSpaceTempObject(scanner interface{ Scan(dest ...any) error }) (*SpaceTempObjectRecord, error) {
	var rec SpaceTempObjectRecord
	err := scanner.Scan(
		&rec.ObjectKey,
		&rec.OwnerID,
		&rec.SpaceID,
		&rec.Purpose,
		&rec.BucketID,
		&rec.ExpectedSize,
		&rec.ExpiresAt,
		&rec.CleanupAfter,
		&rec.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
