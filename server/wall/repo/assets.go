package repo

import (
	"context"
	"database/sql"
	"errors"

	"github.com/ente-io/stacktrace"
)

func (r *AssetsRepository) AssetBelongsToWall(ctx context.Context, wallID, objectKey string) (bool, error) {
	_, err := r.GetAssetBucketID(ctx, wallID, objectKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, stacktrace.Propagate(err, "")
	}
	return true, nil
}

func (r *AssetsRepository) GetAssetBucketID(ctx context.Context, wallID, objectKey string) (string, error) {
	var bucketID string
	err := r.DB.QueryRowContext(ctx, `
		SELECT bucket_id
		FROM (
		    SELECT avatar_bucket_id AS bucket_id
		    FROM walls
		    WHERE wall_id = $1 AND avatar_object_key = $2 AND avatar_bucket_id IS NOT NULL
		    UNION ALL
		    SELECT a.bucket_id
		    FROM wall_post_assets a
		    JOIN wall_posts p ON p.post_id = a.post_id
		    WHERE p.wall_id = $1 AND a.object_key = $2 AND p.is_deleted = FALSE
		) assets
		LIMIT 1
	`, wallID, objectKey).Scan(&bucketID)
	return bucketID, stacktrace.Propagate(err, "")
}

func (r *AssetsRepository) GetWallForObjectKey(ctx context.Context, objectKey string) (*WallRecord, error) {
	return scanWallRecord(r.DB.QueryRowContext(ctx, `
		SELECT w.wall_id, w.owner_id, w.wall_slug, w.encrypted_wall_key, w.encrypted_profile, w.current_version,
		       w.avatar_object_key, w.avatar_bucket_id, w.avatar_size, w.created_at, w.updated_at
		FROM walls w
		WHERE w.avatar_object_key = $1
		   OR EXISTS (
		       SELECT 1
		       FROM wall_post_assets a
		       JOIN wall_posts p ON p.post_id = a.post_id
		       WHERE a.object_key = $1 AND p.wall_id = w.wall_id AND p.is_deleted = FALSE
		   )
		LIMIT 1
	`, objectKey))
}
