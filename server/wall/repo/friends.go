package repo

import (
	"context"
	"database/sql"
	"errors"

	"github.com/ente-io/stacktrace"
	"github.com/lib/pq"
)

var ErrAlreadyFriends = errors.New("wall users are already friends")

func (r *FriendsRepository) AddFriend(ctx context.Context, requesterID int64, requesterWallID string, targetWallID string, targetEncryptedWallKey string, targetKeyVersion int, requesterEncryptedWallKey string, requesterKeyVersion int) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var requesterOwnerID int64
	var requesterCurrentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, current_version
		FROM walls
		WHERE wall_id = $1
		FOR UPDATE
	`, requesterWallID).Scan(&requesterOwnerID, &requesterCurrentVersion); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if requesterOwnerID != requesterID || requesterCurrentVersion != requesterKeyVersion {
		return sql.ErrNoRows
	}

	var targetOwnerID int64
	var targetCurrentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, current_version
		FROM walls
		WHERE wall_id = $1
		FOR UPDATE
	`, targetWallID).Scan(&targetOwnerID, &targetCurrentVersion); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if targetOwnerID == requesterID {
		return ErrAlreadyFriends
	}
	if targetCurrentVersion != targetKeyVersion {
		return sql.ErrNoRows
	}

	var alreadyFriends bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM wall_friend_shares target_share
			JOIN wall_friend_shares requester_share
			  ON requester_share.wall_id = $1
			 AND requester_share.friend_id = $2
			WHERE target_share.wall_id = $3
			  AND target_share.friend_id = $4
		)
	`, requesterWallID, targetOwnerID, targetWallID, requesterID).Scan(&alreadyFriends); err != nil {
		return stacktrace.Propagate(err, "")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO wall_friend_shares (wall_id, friend_id, encrypted_wall_key, key_version)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (wall_id, friend_id) DO UPDATE
		SET encrypted_wall_key = EXCLUDED.encrypted_wall_key,
		    key_version = EXCLUDED.key_version
	`, targetWallID, requesterID, targetEncryptedWallKey, targetKeyVersion); err != nil {
		return stacktrace.Propagate(err, "")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO wall_friend_shares (wall_id, friend_id, encrypted_wall_key, key_version)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (wall_id, friend_id) DO UPDATE
		SET encrypted_wall_key = EXCLUDED.encrypted_wall_key,
		    key_version = EXCLUDED.key_version
	`, requesterWallID, targetOwnerID, requesterEncryptedWallKey, requesterKeyVersion); err != nil {
		return stacktrace.Propagate(err, "")
	}

	if !alreadyFriends {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO wall_friend_events (event_type, actor_id, actor_wall_id, target_id, target_wall_id)
			VALUES ('friend_add', $1, $2, $3, $4)
		`, requesterID, requesterWallID, targetOwnerID, targetWallID); err != nil {
			return stacktrace.Propagate(err, "")
		}
	}

	return stacktrace.Propagate(tx.Commit(), "")
}

func (r *FriendsRepository) UpsertShare(ctx context.Context, wallID string, friendID int64, encryptedWallKey string, keyVersion int) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO wall_friend_shares (wall_id, friend_id, encrypted_wall_key, key_version)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (wall_id, friend_id) DO UPDATE
		SET encrypted_wall_key = EXCLUDED.encrypted_wall_key,
		    key_version = EXCLUDED.key_version
	`, wallID, friendID, encryptedWallKey, keyVersion)
	return stacktrace.Propagate(err, "")
}

func (r *FriendsRepository) UpdateShare(ctx context.Context, wallID string, friendID int64, encryptedWallKey string, keyVersion int) error {
	return r.UpdateShares(ctx, wallID, []WallShareUpdateRecord{
		{FriendID: friendID, EncryptedWallKey: encryptedWallKey},
	}, keyVersion)
}

func (r *FriendsRepository) UpdateShares(ctx context.Context, wallID string, shares []WallShareUpdateRecord, keyVersion int) error {
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
			UPDATE wall_friend_shares
			SET encrypted_wall_key = $3,
			    key_version = $4
			WHERE wall_id = $1 AND friend_id = $2
		`, wallID, share.FriendID, share.EncryptedWallKey, keyVersion)
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

func (r *FriendsRepository) DeleteFriendship(ctx context.Context, userID int64, targetWallID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var targetOwnerID int64
	var actorWallID string
	if err := tx.QueryRowContext(ctx, `
		SELECT target_wall.owner_id, actor_wall.wall_id
		FROM walls target_wall
		JOIN walls actor_wall ON actor_wall.owner_id = $2
		WHERE target_wall.wall_id = $1
	`, targetWallID, userID).Scan(&targetOwnerID, &actorWallID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if targetOwnerID == userID {
		return nil
	}

	res, err := tx.ExecContext(ctx, `
		DELETE FROM wall_friend_shares
		WHERE (wall_id = $1 AND friend_id = $2)
		   OR (
		       friend_id = $3
		       AND wall_id IN (SELECT wall_id FROM walls WHERE owner_id = $2)
		   )
	`, targetWallID, userID, targetOwnerID)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if affected > 0 {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO wall_friend_events (event_type, actor_id, actor_wall_id, target_id, target_wall_id)
			VALUES ('friend_remove', $1, $2, $3, $4)
		`, userID, actorWallID, targetOwnerID, targetWallID); err != nil {
			return stacktrace.Propagate(err, "")
		}
	}

	return stacktrace.Propagate(tx.Commit(), "")
}

func (r *FriendsRepository) DeleteShareByWallAndFriend(ctx context.Context, wallID string, friendID int64) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM wall_friend_shares WHERE wall_id = $1 AND friend_id = $2`, wallID, friendID)
	return stacktrace.Propagate(err, "")
}

func (r *FriendsRepository) GetShareForFriendAndWall(ctx context.Context, friendID int64, wallID string) (*WallShareRecord, error) {
	return scanShareRecord(r.DB.QueryRowContext(ctx, `
		SELECT s.wall_id, s.friend_id, w.owner_id, owner_wall.wall_slug, s.encrypted_wall_key, s.key_version, s.created_at, ka.public_key
		FROM wall_friend_shares s
		JOIN walls w ON w.wall_id = s.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = w.owner_id
		JOIN key_attributes ka ON ka.user_id = w.owner_id
		WHERE s.friend_id = $1 AND s.wall_id = $2
	`, friendID, wallID))
}

func (r *FriendsRepository) ListSharesForFriend(ctx context.Context, friendID int64) ([]WallShareRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT s.wall_id, s.friend_id, w.owner_id, owner_wall.wall_slug, s.encrypted_wall_key, s.key_version, s.created_at, ka.public_key
		FROM wall_friend_shares s
		JOIN walls w ON w.wall_id = s.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = w.owner_id
		JOIN key_attributes ka ON ka.user_id = w.owner_id
		WHERE s.friend_id = $1
		ORDER BY s.created_at ASC
	`, friendID)
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

func (r *FriendsRepository) ListFriendsForWall(ctx context.Context, wallID string) ([]WallFriendRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT friend_wall.owner_id,
		       friend_wall.wall_id,
		       friend_wall.wall_slug,
		       friend_ka.public_key,
		       friend_wall.current_version,
		       friend_wall.encrypted_profile,
		       friend_wall.avatar_object_key,
		       friend_wall.avatar_size,
		       friend_wall.updated_at,
		       (SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = friend_wall.wall_id) AS friends,
		       (SELECT COUNT(*) FROM wall_posts p WHERE p.wall_id = friend_wall.wall_id AND p.is_deleted = FALSE) AS posts,
		       s.key_version,
		       s.created_at
		FROM wall_friend_shares s
		JOIN walls friend_wall ON friend_wall.owner_id = s.friend_id
		JOIN key_attributes friend_ka ON friend_ka.user_id = s.friend_id
		WHERE s.wall_id = $1
		ORDER BY lower(friend_wall.wall_slug) ASC
	`, wallID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []WallFriendRecord
	for rows.Next() {
		var rec WallFriendRecord
		dest := wallActorScanDest(&rec.Friend)
		dest = append(dest, &rec.ShareKeyVersion, &rec.CreatedAt)
		if err := rows.Scan(dest...); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		out = append(out, rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FriendsRepository) CountFriendsForWall(ctx context.Context, wallID string) (int64, error) {
	var count int64
	if err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM wall_friend_shares
		WHERE wall_id = $1
	`, wallID).Scan(&count); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return count, nil
}

func (r *FriendsRepository) ListAccessibleWallIDs(ctx context.Context, viewerID int64, wallIDs []string) (map[string]bool, error) {
	out := make(map[string]bool, len(wallIDs))
	if viewerID <= 0 || len(wallIDs) == 0 {
		return out, nil
	}
	rows, err := r.DB.QueryContext(ctx, `
		SELECT wall_id
		FROM walls
		WHERE owner_id = $1 AND wall_id = ANY($2)
		UNION
		SELECT wall_id
		FROM wall_friend_shares
		WHERE friend_id = $1 AND wall_id = ANY($2)
	`, viewerID, pq.Array(wallIDs))
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	for rows.Next() {
		var wallID string
		if err := rows.Scan(&wallID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		out[wallID] = true
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FriendsRepository) GetRelationship(ctx context.Context, viewerID, targetOwnerID int64, targetWallID string) (string, error) {
	if viewerID == targetOwnerID {
		return "self", nil
	}
	var count int64
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM wall_friend_shares WHERE friend_id = $1 AND wall_id = $2`, viewerID, targetWallID).Scan(&count); err != nil {
		return "", stacktrace.Propagate(err, "")
	}
	if count > 0 {
		return "friend", nil
	}
	return "", nil
}

func scanShareRecord(scanner interface{ Scan(dest ...any) error }) (*WallShareRecord, error) {
	var rec WallShareRecord
	if err := scanner.Scan(&rec.WallID, &rec.FriendID, &rec.OwnerID, &rec.WallSlug, &rec.EncryptedWallKey, &rec.KeyVersion, &rec.CreatedAt, &rec.PublicKey); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
