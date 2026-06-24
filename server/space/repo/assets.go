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
	if keySpaceID, assetType, objectID, ok := ParseProfileAssetObjectKey(objectKey); ok {
		if keySpaceID != spaceID {
			return "", sql.ErrNoRows
		}
		return r.GetProfileAssetBucketID(ctx, spaceID, assetType, objectID)
	}
	var bucketID string
	err := r.DB.QueryRowContext(ctx, `
		SELECT a.bucket_id
		FROM space_post_assets a
		JOIN space_posts p ON p.post_id = a.post_id
		WHERE p.space_id = $1 AND a.object_key = $2 AND p.is_deleted = FALSE
		LIMIT 1
	`, spaceID, objectKey).Scan(&bucketID)
	return bucketID, stacktrace.Propagate(err, "")
}

func (r *AssetsRepository) GetProfileAssetBucketID(ctx context.Context, spaceID, assetType, objectID string) (string, error) {
	var bucketID string
	err := r.DB.QueryRowContext(ctx, `
		SELECT bucket_id
		FROM space_profile_assets
		WHERE space_id = $1 AND asset_type = $2 AND object_id = $3
	`, spaceID, assetType, objectID).Scan(&bucketID)
	return bucketID, stacktrace.Propagate(err, "")
}

func (r *AssetsRepository) GetSpaceForObjectKey(ctx context.Context, objectKey string) (*SpaceRecord, error) {
	if spaceID, assetType, objectID, ok := ParseProfileAssetObjectKey(objectKey); ok {
		return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
			SELECT `+spaceRecordSelectColumns+`
			FROM spaces s
			JOIN space_profile_assets a ON a.space_id = s.space_id
			`+spaceRecordProfileAssetJoins+`
			WHERE a.space_id = $1 AND a.asset_type = $2 AND a.object_id = $3
			LIMIT 1
		`, spaceID, assetType, objectID))
	}
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE EXISTS (
		       SELECT 1
		       FROM space_post_assets a
		       JOIN space_posts p ON p.post_id = a.post_id
		       WHERE a.object_key = $1 AND p.space_id = s.space_id AND p.is_deleted = FALSE
		   )
		LIMIT 1
	`, objectKey))
}
