package repo

import (
	"context"
	"database/sql"
	"errors"

	"github.com/ente-io/stacktrace"
)

func (r *AssetsRepository) AssetBelongsToSpace(ctx context.Context, spaceID, objectKey string) (bool, error) {
	_, err := r.GetAssetBucketID(ctx, spaceID, objectKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, stacktrace.Propagate(err, "")
	}
	return true, nil
}

func (r *AssetsRepository) GetAssetBucketID(ctx context.Context, spaceID, objectKey string) (string, error) {
	var bucketID string
	err := r.DB.QueryRowContext(ctx, `
		SELECT bucket_id
		FROM (
		    SELECT avatar_bucket_id AS bucket_id
		    FROM spaces
		    WHERE space_id = $1 AND avatar_object_key = $2 AND avatar_bucket_id IS NOT NULL
		    UNION ALL
		    SELECT cover_bucket_id AS bucket_id
		    FROM spaces
		    WHERE space_id = $1 AND cover_object_key = $2 AND cover_bucket_id IS NOT NULL
		    UNION ALL
		    SELECT a.bucket_id
		    FROM space_post_assets a
		    JOIN space_posts p ON p.post_id = a.post_id
		    WHERE p.space_id = $1 AND a.object_key = $2 AND p.is_deleted = FALSE
		) assets
		LIMIT 1
	`, spaceID, objectKey).Scan(&bucketID)
	return bucketID, stacktrace.Propagate(err, "")
}

func (r *AssetsRepository) GetSpaceForObjectKey(ctx context.Context, objectKey string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT w.space_id, w.owner_id, w.space_slug, w.encrypted_space_key, w.encrypted_profile, w.current_version,
		       w.public_key, w.encrypted_secret_key, w.secret_key_decryption_nonce,
		       w.avatar_object_key, w.avatar_bucket_id, w.avatar_size, w.cover_object_key, w.cover_bucket_id, w.cover_size, w.created_at, w.updated_at
		FROM spaces w
		WHERE w.avatar_object_key = $1
		   OR w.cover_object_key = $1
		   OR EXISTS (
		       SELECT 1
		       FROM space_post_assets a
		       JOIN space_posts p ON p.post_id = a.post_id
		       WHERE a.object_key = $1 AND p.space_id = w.space_id AND p.is_deleted = FALSE
		   )
		LIMIT 1
	`, objectKey))
}
