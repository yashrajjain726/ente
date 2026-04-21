package repo

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/ente-io/stacktrace"
)

func (r *PostsRepository) CreatePost(ctx context.Context, ownerID int64, wallID, encryptedPostKey string, captionCipher *string, keyVersion int, objects []WallPostAssetRecord) (int64, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM walls
		WHERE owner_id = $1 AND wall_id = $2
		FOR UPDATE
	`, ownerID, wallID).Scan(&currentVersion); err != nil {
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
		INSERT INTO wall_posts (wall_id, owner_id, encrypted_post_key, caption_cipher, key_version)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING post_id
	`, wallID, ownerID, encryptedPostKey, caption, keyVersion).Scan(&postID); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	for _, obj := range objects {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO wall_post_assets (post_id, object_key, bucket_id, size, position, variant, blur_hash_cipher)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, postID, obj.ObjectKey, obj.BucketID, obj.Size, obj.Position, obj.Variant, obj.BlurHashCipher); err != nil {
			return 0, stacktrace.Propagate(err, "")
		}
		if err := ConsumeTempObjectTx(ctx, tx, ownerID, obj.ObjectKey, TempObjectPurposePost, nil); err != nil {
			return 0, stacktrace.Propagate(err, "failed to consume staged wall post upload")
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return postID, nil
}

func (r *PostsRepository) GetPost(ctx context.Context, postID int64, viewerID int64) (*WallPostRecord, error) {
	return scanPostRecord(r.DB.QueryRowContext(ctx, `
		SELECT p.post_id, p.wall_id, w.wall_slug, p.owner_id, owner_wall.wall_slug, p.encrypted_post_key, p.caption_cipher,
		       p.key_version, p.created_at,
		       (SELECT COUNT(*) FROM wall_post_likes pl WHERE pl.post_id = p.post_id) AS likes,
		       EXISTS (SELECT 1 FROM wall_post_likes pl WHERE pl.post_id = p.post_id AND pl.user_id = $2) AS viewer_liked,
		       (SELECT COUNT(*) FROM wall_post_comments pc WHERE pc.post_id = p.post_id AND pc.is_deleted = FALSE) AS comments
		FROM wall_posts p
		JOIN walls w ON w.wall_id = p.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = p.owner_id
		WHERE p.post_id = $1 AND p.is_deleted = FALSE
	`, postID, viewerID))
}

func (r *PostsRepository) ListPostsByWall(ctx context.Context, wallID string, viewerID int64, cursor string, limit int) ([]WallPostRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	args := []any{wallID, viewerID}
	query := `
		SELECT p.post_id, p.wall_id, w.wall_slug, p.owner_id, owner_wall.wall_slug, p.encrypted_post_key, p.caption_cipher,
		       p.key_version, p.created_at,
		       (SELECT COUNT(*) FROM wall_post_likes pl WHERE pl.post_id = p.post_id) AS likes,
		       EXISTS (SELECT 1 FROM wall_post_likes pl WHERE pl.post_id = p.post_id AND pl.user_id = $2) AS viewer_liked,
		       (SELECT COUNT(*) FROM wall_post_comments pc WHERE pc.post_id = p.post_id AND pc.is_deleted = FALSE) AS comments
			FROM wall_posts p
			JOIN walls w ON w.wall_id = p.wall_id
			JOIN walls owner_wall ON owner_wall.owner_id = p.owner_id
			WHERE p.wall_id = $1 AND p.is_deleted = FALSE`
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
	var out []WallPostRecord
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

func (r *PostsRepository) ListFeed(ctx context.Context, viewerID int64, cursor string, limit int) ([]WallPostRecord, string, error) {
	limit = optionalInt(limit, 25)
	if limit > 100 {
		limit = 100
	}
	args := []any{viewerID}
	query := `
		SELECT p.post_id, p.wall_id, w.wall_slug, p.owner_id, owner_wall.wall_slug, p.encrypted_post_key, p.caption_cipher,
		       p.key_version, p.created_at,
		       (SELECT COUNT(*) FROM wall_post_likes pl WHERE pl.post_id = p.post_id) AS likes,
		       EXISTS (SELECT 1 FROM wall_post_likes pl WHERE pl.post_id = p.post_id AND pl.user_id = $1) AS viewer_liked,
		       (SELECT COUNT(*) FROM wall_post_comments pc WHERE pc.post_id = p.post_id AND pc.is_deleted = FALSE) AS comments
		FROM wall_posts p
		JOIN walls w ON w.wall_id = p.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = p.owner_id
		WHERE p.is_deleted = FALSE
		  AND (
		    p.owner_id = $1 OR
		    EXISTS (
		      SELECT 1 FROM wall_follow_shares fs
		      WHERE fs.follower_id = $1 AND fs.wall_id = p.wall_id
		    )
			  )`
	if cursorCreatedAt, cursorPostID, ok := parsePostCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorPostID)
		query += ` AND (p.created_at, p.post_id) < ($2, $3)`
	}
	args = append(args, limit+1)
	query += ` ORDER BY p.created_at DESC, p.post_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallPostRecord
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

func (r *PostsRepository) ListAssetsByPostIDs(ctx context.Context, postIDs []int64) (map[int64][]WallPostAssetRecord, error) {
	if len(postIDs) == 0 {
		return map[int64][]WallPostAssetRecord{}, nil
	}
	query, args := inClause("SELECT asset_id, post_id, object_key, bucket_id, size, position, variant, blur_hash_cipher, created_at FROM wall_post_assets WHERE post_id IN (%s) ORDER BY position ASC, asset_id ASC", postIDs, 0)
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	result := make(map[int64][]WallPostAssetRecord, len(postIDs))
	for rows.Next() {
		var rec WallPostAssetRecord
		if err := rows.Scan(&rec.AssetID, &rec.PostID, &rec.ObjectKey, &rec.BucketID, &rec.Size, &rec.Position, &rec.Variant, &rec.BlurHashCipher, &rec.CreatedAt); err != nil {
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
	res, err := tx.ExecContext(ctx, `UPDATE wall_posts SET is_deleted = TRUE WHERE post_id = $1 AND owner_id = $2`, postID, ownerID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if affected == 0 {
		return nil, sql.ErrNoRows
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT a.object_key, a.bucket_id, COALESCE(a.size, 1), p.wall_id
		FROM wall_post_assets a
		JOIN wall_posts p ON p.post_id = a.post_id
		WHERE a.post_id = $1
	`, postID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	type cleanupObject struct {
		key string
		rec WallTempObjectRecord
	}
	var cleanupObjects []cleanupObject
	for rows.Next() {
		var key string
		var rec WallTempObjectRecord
		if err := rows.Scan(&key, &rec.BucketID, &rec.ExpectedSize, &rec.WallID.String); err != nil {
			rows.Close()
			return nil, stacktrace.Propagate(err, "")
		}
		rec.ObjectKey = key
		rec.OwnerID = ownerID
		rec.WallID.Valid = rec.WallID.String != ""
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
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return keys, nil
}

func (r *PostsRepository) SetLike(ctx context.Context, postID, userID int64, like bool) error {
	if like {
		_, err := r.DB.ExecContext(ctx, `INSERT INTO wall_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, postID, userID)
		return stacktrace.Propagate(err, "")
	}
	_, err := r.DB.ExecContext(ctx, `DELETE FROM wall_post_likes WHERE post_id = $1 AND user_id = $2`, postID, userID)
	return stacktrace.Propagate(err, "")
}

func (r *PostsRepository) UpdateCaption(ctx context.Context, postID, ownerID int64, captionCipher *string) error {
	caption := ""
	if captionCipher != nil {
		caption = *captionCipher
	}
	res, err := r.DB.ExecContext(ctx, `UPDATE wall_posts SET caption_cipher = $1 WHERE post_id = $2 AND owner_id = $3`, caption, postID, ownerID)
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

func (r *PostsRepository) CreateComment(ctx context.Context, postID, authorID int64, commentCipher string, parentCommentID *int64) (*WallCommentRecord, error) {
	var commentID int64
	if err := r.DB.QueryRowContext(ctx, `
		INSERT INTO wall_post_comments (post_id, author_id, comment_cipher, parent_comment_id)
		VALUES ($1, $2, $3, $4)
		RETURNING comment_id
	`, postID, authorID, commentCipher, parentCommentID).Scan(&commentID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return r.GetComment(ctx, commentID, authorID)
}

func (r *PostsRepository) GetComment(ctx context.Context, commentID, viewerID int64) (*WallCommentRecord, error) {
	return scanCommentRecord(r.DB.QueryRowContext(ctx, `
		SELECT c.comment_id, c.post_id, c.author_id, author_wall.wall_slug, c.comment_cipher, c.parent_comment_id, c.created_at,
		       (c.author_id = $2) AS viewer_can_delete
		FROM wall_post_comments c
		JOIN walls author_wall ON author_wall.owner_id = c.author_id
		WHERE c.comment_id = $1 AND c.is_deleted = FALSE
	`, commentID, viewerID))
}

func (r *PostsRepository) ListTopLevelComments(ctx context.Context, postID, viewerID int64, cursor string, limit int) ([]WallCommentRecord, string, error) {
	limit = optionalInt(limit, 20)
	if limit > 100 {
		limit = 100
	}
	args := []any{postID, viewerID}
	query := `
		SELECT c.comment_id, c.post_id, c.author_id, author_wall.wall_slug, c.comment_cipher, c.parent_comment_id, c.created_at,
		       (c.author_id = $2) AS viewer_can_delete
		FROM wall_post_comments c
		JOIN walls author_wall ON author_wall.owner_id = c.author_id
		WHERE c.post_id = $1 AND c.parent_comment_id IS NULL AND c.is_deleted = FALSE`
	if trimmed := strings.TrimSpace(cursor); trimmed != "" {
		if cursorID, err := strconv.ParseInt(trimmed, 10, 64); err == nil && cursorID > 0 {
			args = append(args, cursorID)
			query += ` AND c.comment_id < $3`
		}
	}
	args = append(args, limit+1)
	query += ` ORDER BY c.comment_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallCommentRecord
	for rows.Next() {
		rec, err := scanCommentRecord(rows)
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
		nextCursor = strconv.FormatInt(out[limit-1].CommentID, 10)
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *PostsRepository) ListReplies(ctx context.Context, postID, viewerID int64, parentIDs []int64) (map[int64][]WallCommentRecord, error) {
	if len(parentIDs) == 0 {
		return map[int64][]WallCommentRecord{}, nil
	}
	query, args := inClause(`
		SELECT c.comment_id, c.post_id, c.author_id, author_wall.wall_slug, c.comment_cipher, c.parent_comment_id, c.created_at,
		       (c.author_id = $1) AS viewer_can_delete
		FROM wall_post_comments c
		JOIN walls author_wall ON author_wall.owner_id = c.author_id
		WHERE c.post_id = $2 AND c.parent_comment_id IN (%s) AND c.is_deleted = FALSE
		ORDER BY c.comment_id ASC
	`, parentIDs, 2)
	args = append([]any{viewerID, postID}, args...)
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	result := make(map[int64][]WallCommentRecord)
	for rows.Next() {
		rec, err := scanCommentRecord(rows)
		if err != nil {
			return nil, err
		}
		if rec.ParentCommentID.Valid {
			result[rec.ParentCommentID.Int64] = append(result[rec.ParentCommentID.Int64], *rec)
		}
	}
	return result, stacktrace.Propagate(rows.Err(), "")
}

func (r *PostsRepository) DeleteComment(ctx context.Context, commentID, viewerID int64) error {
	res, err := r.DB.ExecContext(ctx, `UPDATE wall_post_comments SET is_deleted = TRUE WHERE comment_id = $1 AND author_id = $2`, commentID, viewerID)
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

func scanPostRecord(scanner interface{ Scan(dest ...any) error }) (*WallPostRecord, error) {
	var rec WallPostRecord
	if err := scanner.Scan(&rec.PostID, &rec.WallID, &rec.WallSlug, &rec.OwnerID, &rec.Author, &rec.EncryptedPostKey, &rec.CaptionCipher, &rec.KeyVersion, &rec.CreatedAt, &rec.Likes, &rec.ViewerLiked, &rec.Comments); err != nil {
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

func formatPostCursor(post WallPostRecord) string {
	return strconv.FormatInt(post.CreatedAt, 10) + ":" + strconv.FormatInt(post.PostID, 10)
}

func scanCommentRecord(scanner interface{ Scan(dest ...any) error }) (*WallCommentRecord, error) {
	var rec WallCommentRecord
	if err := scanner.Scan(&rec.CommentID, &rec.PostID, &rec.AuthorID, &rec.Author, &rec.CommentCipher, &rec.ParentCommentID, &rec.CreatedAt, &rec.ViewerCanDelete); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
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
