package repo

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/ente-io/stacktrace"
)

func (r *PostsRepository) CreatePost(ctx context.Context, ownerID int64, spaceID, encryptedPostKey string, captionCipher *string, keyVersion int, objects []SpacePostAssetRecord) (int64, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM spaces
		WHERE owner_id = $1 AND space_id = $2
		FOR UPDATE
	`, ownerID, spaceID).Scan(&currentVersion); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return 0, sql.ErrNoRows
	}
	caption := ""
	if captionCipher != nil {
		caption = *captionCipher
	}
	var postID int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO space_posts (space_id, owner_id, encrypted_post_key, caption_cipher, key_version)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING post_id
	`, spaceID, ownerID, encryptedPostKey, caption, keyVersion).Scan(&postID); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	for _, obj := range objects {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO space_post_assets (post_id, object_key, bucket_id, size, position, variant, blur_hash_cipher, width, height, media_type)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, postID, obj.ObjectKey, obj.BucketID, obj.Size, obj.Position, obj.Variant, obj.BlurHashCipher, obj.Width, obj.Height, obj.MediaType); err != nil {
			return 0, stacktrace.Propagate(err, "")
		}
		if err := ConsumeTempObjectTx(ctx, tx, ownerID, obj.ObjectKey, TempObjectPurposePost, &spaceID); err != nil {
			return 0, stacktrace.Propagate(err, "failed to consume staged space post upload")
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return postID, nil
}

func (r *PostsRepository) GetPost(ctx context.Context, postID int64, viewerID int64, viewerSpaceID string) (*SpacePostRecord, error) {
	return scanPostRecord(r.DB.QueryRowContext(ctx, `
		SELECT p.post_id, p.space_id, w.space_slug, p.owner_id,
		       w.owner_id, w.space_id, w.space_slug, owner_ka.public_key,
		       w.current_version, w.encrypted_profile, w.avatar_object_key,
		       w.avatar_size, w.updated_at,
		       (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = w.space_id) AS author_friends,
		       (SELECT COUNT(*) FROM space_posts ap WHERE ap.space_id = w.space_id AND ap.is_deleted = FALSE) AS author_posts,
		       p.encrypted_post_key, p.caption_cipher,
		       p.key_version, p.created_at,
		       (SELECT COUNT(*) FROM space_post_likes pl WHERE pl.post_id = p.post_id) AS likes,
		       EXISTS (SELECT 1 FROM space_post_likes pl WHERE pl.post_id = p.post_id AND pl.actor_space_id = $2) AS viewer_liked,
		       FALSE AS viewer_unread
			FROM space_posts p
			JOIN spaces w ON w.space_id = p.space_id
			JOIN key_attributes owner_ka ON owner_ka.user_id = w.owner_id
			WHERE p.post_id = $1 AND p.is_deleted = FALSE
		`, postID, viewerSpaceID))
}

func (r *PostsRepository) ListPostsBySpace(ctx context.Context, spaceID string, viewerID int64, viewerSpaceID string, cursor string, limit int) ([]SpacePostRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	args := []any{spaceID, viewerSpaceID}
	query := `
			SELECT p.post_id, p.space_id, w.space_slug, p.owner_id,
			       w.owner_id, w.space_id, w.space_slug, owner_ka.public_key,
			       w.current_version, w.encrypted_profile, w.avatar_object_key,
			       w.avatar_size, w.updated_at,
			       (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = w.space_id) AS author_friends,
			       (SELECT COUNT(*) FROM space_posts ap WHERE ap.space_id = w.space_id AND ap.is_deleted = FALSE) AS author_posts,
			       p.encrypted_post_key, p.caption_cipher,
			       p.key_version, p.created_at,
			       (SELECT COUNT(*) FROM space_post_likes pl WHERE pl.post_id = p.post_id) AS likes,
			       EXISTS (SELECT 1 FROM space_post_likes pl WHERE pl.post_id = p.post_id AND pl.actor_space_id = $2) AS viewer_liked,
			       FALSE AS viewer_unread
				FROM space_posts p
				JOIN spaces w ON w.space_id = p.space_id
				JOIN key_attributes owner_ka ON owner_ka.user_id = w.owner_id
				WHERE p.space_id = $1 AND p.is_deleted = FALSE`
	if cursorCreatedAt, cursorPostID, ok := parsePostCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorPostID)
		query += ` AND (p.created_at, p.post_id) < ($3, $4)`
	}
	args = append(args, limit+1)
	query += ` ORDER BY p.created_at DESC, p.post_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []SpacePostRecord
	for rows.Next() {
		rec, err := scanPostRecord(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, *rec)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatPostCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *PostsRepository) ListFeed(ctx context.Context, viewerID int64, viewerSpaceID string, cursor string, limit int, readCreatedAt int64, readPostID int64) ([]SpacePostRecord, string, error) {
	limit = optionalInt(limit, 25)
	if limit > 100 {
		limit = 100
	}
	args := []any{viewerID, viewerSpaceID, readCreatedAt, readPostID}
	query := `
			SELECT p.post_id, p.space_id, w.space_slug, p.owner_id,
			       w.owner_id, w.space_id, w.space_slug, owner_ka.public_key,
			       w.current_version, w.encrypted_profile, w.avatar_object_key,
			       w.avatar_size, w.updated_at,
			       (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = w.space_id) AS author_friends,
			       (SELECT COUNT(*) FROM space_posts ap WHERE ap.space_id = w.space_id AND ap.is_deleted = FALSE) AS author_posts,
			       p.encrypted_post_key, p.caption_cipher,
			       p.key_version, p.created_at,
			       (SELECT COUNT(*) FROM space_post_likes pl WHERE pl.post_id = p.post_id) AS likes,
			       CASE WHEN p.space_id = $2 THEN FALSE ELSE EXISTS (SELECT 1 FROM space_post_likes pl WHERE pl.post_id = p.post_id AND pl.actor_space_id = $2) END AS viewer_liked,
			       (p.space_id <> $2 AND (p.created_at, p.post_id) > ($3::bigint, $4::bigint)) AS viewer_unread
			FROM space_posts p
			JOIN spaces w ON w.space_id = p.space_id
			JOIN key_attributes owner_ka ON owner_ka.user_id = w.owner_id
			WHERE p.is_deleted = FALSE
			  AND (
			    p.space_id = $2 OR EXISTS (
			      SELECT 1 FROM space_friend_shares fs
			      WHERE fs.friend_id = $1 AND fs.friend_space_id = $2 AND fs.space_id = p.space_id
			    )
			  )`
	if cursorCreatedAt, cursorPostID, ok := parsePostCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorPostID)
		query += ` AND (p.created_at, p.post_id) < ($5, $6)`
	}
	args = append(args, limit+1)
	query += ` ORDER BY p.created_at DESC, p.post_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []SpacePostRecord
	for rows.Next() {
		rec, err := scanPostRecord(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, *rec)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatPostCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *PostsRepository) GetFeedPostMarker(ctx context.Context, viewerID int64, viewerSpaceID string, postID int64) (int64, int64, error) {
	var createdAt int64
	if err := r.DB.QueryRowContext(ctx, `
		SELECT p.created_at
		FROM space_posts p
		WHERE p.post_id = $3
		  AND p.is_deleted = FALSE
		  AND (
		    p.space_id = $2 OR EXISTS (
		      SELECT 1 FROM space_friend_shares fs
		      WHERE fs.friend_id = $1 AND fs.friend_space_id = $2 AND fs.space_id = p.space_id
		    )
		  )
	`, viewerID, viewerSpaceID, postID).Scan(&createdAt); err != nil {
		return 0, 0, stacktrace.Propagate(err, "")
	}
	return createdAt, postID, nil
}

func (r *PostsRepository) HasUnreadFeed(ctx context.Context, viewerID int64, viewerSpaceID string, readCreatedAt, readPostID int64) (bool, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM space_posts p
			WHERE p.is_deleted = FALSE
			  AND p.space_id <> $2
			  AND (p.created_at, p.post_id) > ($3::bigint, $4::bigint)
			  AND EXISTS (
			    SELECT 1 FROM space_friend_shares fs
			    WHERE fs.friend_id = $1 AND fs.friend_space_id = $2 AND fs.space_id = p.space_id
			  )
			LIMIT 1
		)
	`, viewerID, viewerSpaceID, readCreatedAt, readPostID).Scan(&exists); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return exists, nil
}

func (r *PostsRepository) ListAssetsByPostIDs(ctx context.Context, postIDs []int64) (map[int64][]SpacePostAssetRecord, error) {
	if len(postIDs) == 0 {
		return map[int64][]SpacePostAssetRecord{}, nil
	}
	query, args := inClause("SELECT asset_id, post_id, object_key, bucket_id, size, position, variant, blur_hash_cipher, width, height, media_type, created_at FROM space_post_assets WHERE post_id IN (%s) ORDER BY position ASC, asset_id ASC", postIDs, 0)
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	result := make(map[int64][]SpacePostAssetRecord, len(postIDs))
	for rows.Next() {
		var rec SpacePostAssetRecord
		if err := rows.Scan(&rec.AssetID, &rec.PostID, &rec.ObjectKey, &rec.BucketID, &rec.Size, &rec.Position, &rec.Variant, &rec.BlurHashCipher, &rec.Width, &rec.Height, &rec.MediaType, &rec.CreatedAt); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		result[rec.PostID] = append(result[rec.PostID], rec)
	}
	return result, stacktrace.Propagate(rows.Err(), "")
}

func (r *PostsRepository) DeletePost(ctx context.Context, postID, ownerID int64) ([]string, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `UPDATE space_posts SET is_deleted = TRUE WHERE post_id = $1 AND owner_id = $2 AND is_deleted = FALSE`, postID, ownerID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if affected == 0 {
		var isDeleted bool
		if err := tx.QueryRowContext(ctx, `SELECT is_deleted FROM space_posts WHERE post_id = $1 AND owner_id = $2`, postID, ownerID).Scan(&isDeleted); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		if !isDeleted {
			return nil, sql.ErrNoRows
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM space_post_likes WHERE post_id = $1`, postID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		if err := tx.Commit(); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		return nil, nil
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT a.object_key, a.bucket_id, COALESCE(a.size, 1), p.space_id
		FROM space_post_assets a
		JOIN space_posts p ON p.post_id = a.post_id
		WHERE a.post_id = $1
	`, postID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	type cleanupObject struct {
		key string
		rec SpaceTempObjectRecord
	}
	var cleanupObjects []cleanupObject
	for rows.Next() {
		var key string
		var rec SpaceTempObjectRecord
		if err := rows.Scan(&key, &rec.BucketID, &rec.ExpectedSize, &rec.SpaceID.String); err != nil {
			rows.Close()
			return nil, stacktrace.Propagate(err, "")
		}
		rec.ObjectKey = key
		rec.OwnerID = ownerID
		rec.SpaceID.Valid = rec.SpaceID.String != ""
		rec.Purpose = TempObjectPurposePost
		cleanupObjects = append(cleanupObjects, cleanupObject{key: key, rec: rec})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, stacktrace.Propagate(err, "")
	}
	rows.Close()
	keys := make([]string, 0, len(cleanupObjects))
	for _, object := range cleanupObjects {
		if err := QueueObjectCleanupTx(ctx, tx, object.rec); err != nil {
			return nil, err
		}
		keys = append(keys, object.key)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_post_likes WHERE post_id = $1`, postID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return keys, nil
}

func (r *PostsRepository) SetLike(ctx context.Context, postID, userID int64, actorSpaceID string, like bool) error {
	if like {
		_, err := r.DB.ExecContext(ctx, `INSERT INTO space_post_likes (post_id, user_id, actor_space_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, postID, userID, actorSpaceID)
		return stacktrace.Propagate(err, "")
	}
	_, err := r.DB.ExecContext(ctx, `DELETE FROM space_post_likes WHERE post_id = $1 AND actor_space_id = $2`, postID, actorSpaceID)
	return stacktrace.Propagate(err, "")
}

func (r *PostsRepository) ListPostLikers(ctx context.Context, postID int64, cursor string, limit int) ([]SpacePostLikerRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	args := []any{postID}
	query := `
		SELECT liker_space.owner_id, liker_space.space_id, liker_space.space_slug, liker_ka.public_key,
		       liker_space.current_version, liker_space.encrypted_profile, liker_space.avatar_object_key,
		       liker_space.avatar_size, liker_space.updated_at,
		       (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = liker_space.space_id) AS liker_friends,
		       (SELECT COUNT(*) FROM space_posts lp WHERE lp.space_id = liker_space.space_id AND lp.is_deleted = FALSE) AS liker_posts,
		       pl.created_at
		FROM space_post_likes pl
		JOIN spaces liker_space ON liker_space.space_id = pl.actor_space_id
		JOIN key_attributes liker_ka ON liker_ka.user_id = pl.user_id
		WHERE pl.post_id = $1`
	if cursorCreatedAt, cursorActorSpaceID, ok := parsePostLikerCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorActorSpaceID)
		query += ` AND (pl.created_at, pl.actor_space_id) < ($2, $3)`
	}
	args = append(args, limit+1)
	query += ` ORDER BY pl.created_at DESC, pl.actor_space_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]SpacePostLikerRecord, 0, limit+1)
	for rows.Next() {
		var rec SpacePostLikerRecord
		dest := spaceActorScanDest(&rec.Actor)
		dest = append(dest, &rec.CreatedAt)
		if err := rows.Scan(dest...); err != nil {
			return nil, "", stacktrace.Propagate(err, "")
		}
		out = append(out, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatPostLikerCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *PostsRepository) UpdateCaption(ctx context.Context, postID, ownerID int64, captionCipher *string) error {
	caption := ""
	if captionCipher != nil {
		caption = *captionCipher
	}
	res, err := r.DB.ExecContext(ctx, `UPDATE space_posts SET caption_cipher = $1 WHERE post_id = $2 AND owner_id = $3 AND is_deleted = FALSE`, caption, postID, ownerID)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func scanPostRecord(scanner interface{ Scan(dest ...any) error }) (*SpacePostRecord, error) {
	var rec SpacePostRecord
	dest := []any{&rec.PostID, &rec.SpaceID, &rec.SpaceSlug, &rec.OwnerID}
	dest = append(dest, spaceActorScanDest(&rec.Author)...)
	dest = append(dest, &rec.EncryptedPostKey, &rec.CaptionCipher, &rec.KeyVersion, &rec.CreatedAt, &rec.Likes, &rec.ViewerLiked, &rec.ViewerUnread)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func parsePostCursor(cursor string) (int64, int64, bool) {
	createdAtText, postIDText, ok := strings.Cut(strings.TrimSpace(cursor), ":")
	if !ok {
		return 0, 0, false
	}
	createdAt, err := strconv.ParseInt(createdAtText, 10, 64)
	if err != nil || createdAt <= 0 {
		return 0, 0, false
	}
	postID, err := strconv.ParseInt(postIDText, 10, 64)
	if err != nil || postID <= 0 {
		return 0, 0, false
	}
	return createdAt, postID, true
}

func formatPostCursor(post SpacePostRecord) string {
	return strconv.FormatInt(post.CreatedAt, 10) + ":" + strconv.FormatInt(post.PostID, 10)
}

func parsePostLikerCursor(cursor string) (int64, string, bool) {
	createdAtText, actorSpaceID, ok := strings.Cut(strings.TrimSpace(cursor), ":")
	if !ok {
		return 0, "", false
	}
	createdAt, err := strconv.ParseInt(createdAtText, 10, 64)
	if err != nil || createdAt <= 0 {
		return 0, "", false
	}
	actorSpaceID = strings.TrimSpace(actorSpaceID)
	if actorSpaceID == "" {
		return 0, "", false
	}
	return createdAt, actorSpaceID, true
}

func formatPostLikerCursor(liker SpacePostLikerRecord) string {
	return strconv.FormatInt(liker.CreatedAt, 10) + ":" + liker.Actor.SpaceID
}

func inClause(format string, ids []int64, offset int) (string, []any) {
	parts := make([]string, len(ids))
	args := make([]any, 0, len(ids))
	for i, id := range ids {
		parts[i] = "$" + strconv.Itoa(offset+i+1)
		args = append(args, id)
	}
	return strings.Replace(format, "%s", strings.Join(parts, ","), 1), args
}
