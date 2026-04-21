package repo

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/ente-io/stacktrace"
)

func (r *FollowRepository) CreateRequest(ctx context.Context, requesterID int64, targetWallID string) (*WallFollowRequestRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		UPDATE wall_follow_requests
		SET status = 'pending'
		WHERE requester_id = $1 AND target_wall_id = $2 AND status IN ('cancelled', 'rejected', 'unfollowed')
	`, requesterID, targetWallID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO wall_follow_requests (requester_id, target_wall_id, status)
		VALUES ($1, $2, 'pending')
		ON CONFLICT DO NOTHING
	`, requesterID, targetWallID)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "conflict") {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanFollowRequest(tx.QueryRowContext(ctx, `
		SELECT r.request_id, r.requester_id, r.target_wall_id, r.status, r.created_at, r.updated_at,
		       requester_wall.wall_slug,
		       ka.public_key,
		       target_wall.wall_slug
		FROM wall_follow_requests r
		JOIN walls requester_wall ON requester_wall.owner_id = r.requester_id
		JOIN key_attributes ka ON ka.user_id = r.requester_id
		JOIN walls target_wall ON target_wall.wall_id = r.target_wall_id
		WHERE r.requester_id = $1 AND r.target_wall_id = $2
		ORDER BY r.request_id DESC
		LIMIT 1
	`, requesterID, targetWallID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *FollowRepository) GetRequest(ctx context.Context, requestID int64) (*WallFollowRequestRecord, error) {
	return scanFollowRequest(r.DB.QueryRowContext(ctx, `
		SELECT r.request_id, r.requester_id, r.target_wall_id, r.status, r.created_at, r.updated_at,
		       requester_wall.wall_slug,
		       ka.public_key,
		       target_wall.wall_slug
		FROM wall_follow_requests r
		JOIN walls requester_wall ON requester_wall.owner_id = r.requester_id
		JOIN key_attributes ka ON ka.user_id = r.requester_id
		JOIN walls target_wall ON target_wall.wall_id = r.target_wall_id
		WHERE r.request_id = $1
	`, requestID))
}

func (r *FollowRepository) UpdateRequestStatus(ctx context.Context, requestID int64, status string) error {
	_, err := r.DB.ExecContext(ctx, `UPDATE wall_follow_requests SET status = $1 WHERE request_id = $2`, status, requestID)
	return stacktrace.Propagate(err, "")
}

func (r *FollowRepository) ListIncomingRequests(ctx context.Context, ownerID int64) ([]WallFollowRequestRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT r.request_id, r.requester_id, r.target_wall_id, r.status, r.created_at, r.updated_at,
		       requester_wall.wall_slug,
		       ka.public_key,
		       target_wall.wall_slug
		FROM wall_follow_requests r
		JOIN walls target_wall ON target_wall.wall_id = r.target_wall_id
		JOIN walls requester_wall ON requester_wall.owner_id = r.requester_id
		JOIN key_attributes ka ON ka.user_id = r.requester_id
		WHERE target_wall.owner_id = $1 AND r.status = 'pending'
		ORDER BY r.created_at ASC
	`, ownerID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallFollowRequestRecord
	for rows.Next() {
		rec, err := scanFollowRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FollowRepository) ListOutgoingRequests(ctx context.Context, requesterID int64) ([]WallFollowRequestRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT r.request_id, r.requester_id, r.target_wall_id, r.status, r.created_at, r.updated_at,
		       requester_wall.wall_slug,
		       ka.public_key,
		       target_wall.wall_slug
		FROM wall_follow_requests r
		JOIN walls target_wall ON target_wall.wall_id = r.target_wall_id
		JOIN walls requester_wall ON requester_wall.owner_id = r.requester_id
		JOIN key_attributes ka ON ka.user_id = r.requester_id
		WHERE r.requester_id = $1 AND r.status = 'pending'
		ORDER BY r.created_at ASC
	`, requesterID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallFollowRequestRecord
	for rows.Next() {
		rec, err := scanFollowRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FollowRepository) UpsertShare(ctx context.Context, wallID string, followerID int64, encryptedWallKey string, keyVersion int) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO wall_follow_shares (wall_id, follower_id, encrypted_wall_key, key_version)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (wall_id, follower_id) DO UPDATE
		SET encrypted_wall_key = EXCLUDED.encrypted_wall_key,
		    key_version = EXCLUDED.key_version
	`, wallID, followerID, encryptedWallKey, keyVersion)
	return stacktrace.Propagate(err, "")
}

func (r *FollowRepository) UpdateShare(ctx context.Context, wallID string, followerID int64, encryptedWallKey string, keyVersion int) error {
	return r.UpdateShares(ctx, wallID, []WallShareUpdateRecord{
		{FollowerID: followerID, EncryptedWallKey: encryptedWallKey},
	}, keyVersion)
}

func (r *FollowRepository) UpdateShares(ctx context.Context, wallID string, shares []WallShareUpdateRecord, keyVersion int) error {
	if len(shares) == 0 {
		return nil
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM walls
		WHERE wall_id = $1
		FOR UPDATE
	`, wallID).Scan(&currentVersion); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return sql.ErrNoRows
	}

	for _, share := range shares {
		res, err := tx.ExecContext(ctx, `
		UPDATE wall_follow_shares
		SET encrypted_wall_key = $3,
		    key_version = $4
		WHERE wall_id = $1 AND follower_id = $2
	`, wallID, share.FollowerID, share.EncryptedWallKey, keyVersion)
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
	}
	return stacktrace.Propagate(tx.Commit(), "")
}

func (r *FollowRepository) ApproveRequest(ctx context.Context, requestID int64, wallID string, encryptedWallKey string, keyVersion int) (*WallFollowRequestRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM walls
		WHERE wall_id = $1
		FOR UPDATE
	`, wallID).Scan(&currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}

	rec, err := scanFollowRequest(tx.QueryRowContext(ctx, `
			SELECT r.request_id, r.requester_id, r.target_wall_id, r.status, r.created_at, r.updated_at,
		       requester_wall.wall_slug,
		       ka.public_key,
		       target_wall.wall_slug
		FROM wall_follow_requests r
		JOIN walls requester_wall ON requester_wall.owner_id = r.requester_id
		JOIN key_attributes ka ON ka.user_id = r.requester_id
		JOIN walls target_wall ON target_wall.wall_id = r.target_wall_id
		WHERE r.request_id = $1 AND r.target_wall_id = $2 AND r.status = 'pending'
		FOR UPDATE OF r
	`, requestID, wallID))
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO wall_follow_shares (wall_id, follower_id, encrypted_wall_key, key_version)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (wall_id, follower_id) DO UPDATE
		SET encrypted_wall_key = EXCLUDED.encrypted_wall_key,
		    key_version = EXCLUDED.key_version
	`, wallID, rec.RequesterID, encryptedWallKey, keyVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}

	res, err := tx.ExecContext(ctx, `
		UPDATE wall_follow_requests
		SET status = 'approved'
		WHERE request_id = $1 AND status = 'pending'
	`, requestID)
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

	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec.Status = "approved"
	return rec, nil
}

func (r *FollowRepository) DeleteShareByWallAndFollower(ctx context.Context, wallID string, followerID int64) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM wall_follow_shares WHERE wall_id = $1 AND follower_id = $2`, wallID, followerID)
	return stacktrace.Propagate(err, "")
}

func (r *FollowRepository) GetShareForFollowerAndWall(ctx context.Context, followerID int64, wallID string) (*WallShareRecord, error) {
	return scanShareRecord(r.DB.QueryRowContext(ctx, `
		SELECT s.wall_id, s.follower_id, w.owner_id, owner_wall.wall_slug, s.encrypted_wall_key, s.key_version, s.created_at, ka.public_key
		FROM wall_follow_shares s
		JOIN walls w ON w.wall_id = s.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = w.owner_id
		JOIN key_attributes ka ON ka.user_id = w.owner_id
		WHERE s.follower_id = $1 AND s.wall_id = $2
	`, followerID, wallID))
}

func (r *FollowRepository) ListSharesForFollower(ctx context.Context, followerID int64) ([]WallShareRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT s.wall_id, s.follower_id, w.owner_id, owner_wall.wall_slug, s.encrypted_wall_key, s.key_version, s.created_at, ka.public_key
		FROM wall_follow_shares s
		JOIN walls w ON w.wall_id = s.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = w.owner_id
		JOIN key_attributes ka ON ka.user_id = w.owner_id
		WHERE s.follower_id = $1
		ORDER BY s.created_at ASC
	`, followerID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallShareRecord
	for rows.Next() {
		rec, err := scanShareRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FollowRepository) ListFollowersForWall(ctx context.Context, wallID string) ([]WallFollowerRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT s.follower_id, follower_wall.wall_slug, ka.public_key, s.key_version, s.created_at
		FROM wall_follow_shares s
		JOIN walls follower_wall ON follower_wall.owner_id = s.follower_id
		JOIN key_attributes ka ON ka.user_id = s.follower_id
		WHERE s.wall_id = $1
		ORDER BY lower(follower_wall.wall_slug) ASC
	`, wallID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallFollowerRecord
	for rows.Next() {
		var rec WallFollowerRecord
		if err := rows.Scan(&rec.FollowerID, &rec.Username, &rec.PublicKey, &rec.KeyVersion, &rec.CreatedAt); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		out = append(out, rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FollowRepository) GetRelationship(ctx context.Context, viewerID, targetOwnerID int64, targetWallID string) (string, error) {
	if viewerID == targetOwnerID {
		return "self", nil
	}
	var count int64
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM wall_follow_shares WHERE follower_id = $1 AND wall_id = $2`, viewerID, targetWallID).Scan(&count); err != nil {
		return "", stacktrace.Propagate(err, "")
	}
	if count > 0 {
		return "following", nil
	}
	if err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM wall_follow_requests WHERE requester_id = $1 AND target_wall_id = $2 AND status = 'pending'
	`, viewerID, targetWallID).Scan(&count); err != nil {
		return "", stacktrace.Propagate(err, "")
	}
	if count > 0 {
		return "pending", nil
	}
	return "", nil
}

func (r *FollowRepository) ListCommunity(ctx context.Context, viewerID int64, query, cursor string, limit int) ([]CommunityRecord, string, error) {
	limit = optionalInt(limit, 25)
	if limit > 100 {
		limit = 100
	}
	args := []any{viewerID}
	clauses := []string{"TRUE"}
	if trimmed := strings.ToLower(strings.TrimSpace(query)); trimmed != "" {
		args = append(args, "%"+trimmed+"%")
		clauses = append(clauses, fmtPlaceholder(len(args), "lower(w.wall_slug) LIKE %s"))
	}
	if trimmed := strings.ToLower(strings.TrimSpace(cursor)); trimmed != "" {
		args = append(args, trimmed)
		clauses = append(clauses, fmtPlaceholder(len(args), "lower(w.wall_slug) > %s"))
	}
	args = append(args, limit+1)
	rows, err := r.DB.QueryContext(ctx, `
		SELECT w.wall_slug, w.wall_id, w.wall_slug,
		       (SELECT COUNT(*) FROM wall_follow_shares fs WHERE fs.wall_id = w.wall_id) AS followers,
		       (SELECT COUNT(*) FROM wall_follow_shares fs WHERE fs.follower_id = w.owner_id) AS following,
		       (SELECT COUNT(*) FROM wall_posts p WHERE p.wall_id = w.wall_id AND p.is_deleted = FALSE) AS posts,
		       CASE
		           WHEN w.owner_id = $1 THEN 'self'
		           WHEN EXISTS (SELECT 1 FROM wall_follow_shares fs WHERE fs.follower_id = $1 AND fs.wall_id = w.wall_id) THEN 'following'
		           WHEN EXISTS (SELECT 1 FROM wall_follow_requests fr WHERE fr.requester_id = $1 AND fr.target_wall_id = w.wall_id AND fr.status = 'pending') THEN 'pending'
		           ELSE ''
		       END AS relationship,
		       '' AS bio
		FROM walls w
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY lower(w.wall_slug) ASC
		LIMIT $`+strconv.Itoa(len(args))+`
	`, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []CommunityRecord
	for rows.Next() {
		var rec CommunityRecord
		if err := rows.Scan(&rec.Username, &rec.WallID, &rec.WallSlug, &rec.Followers, &rec.Following, &rec.Posts, &rec.Relationship, &rec.Bio); err != nil {
			return nil, "", stacktrace.Propagate(err, "")
		}
		out = append(out, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	next := ""
	if len(out) > limit {
		next = out[limit-1].Username
		out = out[:limit]
	}
	return out, next, nil
}

func scanFollowRequest(scanner interface{ Scan(dest ...any) error }) (*WallFollowRequestRecord, error) {
	var rec WallFollowRequestRecord
	if err := scanner.Scan(&rec.RequestID, &rec.RequesterID, &rec.TargetWallID, &rec.Status, &rec.CreatedAt, &rec.UpdatedAt, &rec.RequesterSlug, &rec.RequesterKey, &rec.TargetSlug); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func scanShareRecord(scanner interface{ Scan(dest ...any) error }) (*WallShareRecord, error) {
	var rec WallShareRecord
	if err := scanner.Scan(&rec.WallID, &rec.FollowerID, &rec.FolloweeID, &rec.FolloweeSlug, &rec.EncryptedWallKey, &rec.KeyVersion, &rec.CreatedAt, &rec.PublicKey); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func fmtPlaceholder(index int, format string) string {
	return fmt.Sprintf(format, "$"+strconv.Itoa(index))
}
