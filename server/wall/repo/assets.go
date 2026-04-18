package repo

import (
	"context"

	"github.com/ente-io/stacktrace"
)

func (r *AssetsRepository) AssetBelongsToWall(ctx context.Context, wallID, objectKey string) (bool, error) {
	var count int64
	err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM (
		    SELECT avatar_object_key AS object_key FROM walls WHERE wall_id = $1 AND avatar_object_key IS NOT NULL
		    UNION ALL
		    SELECT a.object_key
		    FROM wall_post_assets a
		    JOIN wall_posts p ON p.post_id = a.post_id
		    WHERE p.wall_id = $1
		) assets
		WHERE object_key = $2
	`, wallID, objectKey).Scan(&count)
	if err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return count > 0, nil
}

func (r *AssetsRepository) GetWallForObjectKey(ctx context.Context, objectKey string) (*WallRecord, error) {
	return scanWallRecord(r.DB.QueryRowContext(ctx, `
		SELECT w.wall_id, w.owner_id, w.wall_slug, w.encrypted_wall_key, w.encrypted_profile, w.current_version,
		       w.avatar_object_key, w.avatar_content_type, w.avatar_size, w.created_at, w.updated_at
		FROM walls w
		WHERE w.avatar_object_key = $1
		   OR EXISTS (
		       SELECT 1
		       FROM wall_post_assets a
		       JOIN wall_posts p ON p.post_id = a.post_id
		       WHERE a.object_key = $1 AND p.wall_id = w.wall_id
		   )
		LIMIT 1
	`, objectKey))
}
