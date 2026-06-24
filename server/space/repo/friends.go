package repo

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/stacktrace"
	"github.com/lib/pq"
)

var (
	ErrAlreadyFriends = errors.New("space users are already friends")
	ErrSelfFriendship = errors.New("space users cannot friend themselves")
)

func (r *FriendsRepository) AddFriend(ctx context.Context, requesterID int64, requesterSpaceID string, targetSpaceID string, targetFriendSealedSpaceKey []byte, targetKeyVersion int, requesterFriendSealedSpaceKey []byte, requesterKeyVersion int) error {
	_, err := r.AddFriendWithCreated(ctx, requesterID, requesterSpaceID, targetSpaceID, targetFriendSealedSpaceKey, targetKeyVersion, requesterFriendSealedSpaceKey, requesterKeyVersion)
	return err
}

func (r *FriendsRepository) AddFriendWithCreated(ctx context.Context, requesterID int64, requesterSpaceID string, targetSpaceID string, targetFriendSealedSpaceKey []byte, targetKeyVersion int, requesterFriendSealedSpaceKey []byte, requesterKeyVersion int) (bool, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var requesterOwnerID int64
	var requesterCurrentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, current_version
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, requesterSpaceID).Scan(&requesterOwnerID, &requesterCurrentVersion); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	if requesterOwnerID != requesterID || requesterCurrentVersion != requesterKeyVersion {
		return false, sql.ErrNoRows
	}

	var targetOwnerID int64
	var targetCurrentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, current_version
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, targetSpaceID).Scan(&targetOwnerID, &targetCurrentVersion); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	if targetOwnerID == requesterID {
		return false, ErrSelfFriendship
	}
	if targetCurrentVersion != targetKeyVersion {
		return false, sql.ErrNoRows
	}

	var alreadyFriends bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM space_friend_shares target_share
			JOIN space_friend_shares requester_share
			  ON requester_share.space_id = $1
			 AND requester_share.friend_id = $2
			 AND requester_share.friend_space_id = $3
			WHERE target_share.space_id = $3
			  AND target_share.friend_id = $4
			  AND target_share.friend_space_id = $1
		)
	`, requesterSpaceID, targetOwnerID, targetSpaceID, requesterID).Scan(&alreadyFriends); err != nil {
		return false, stacktrace.Propagate(err, "")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_friend_shares (space_id, friend_id, friend_space_id, friend_sealed_space_key, key_version)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (space_id, friend_space_id) DO UPDATE
		SET friend_sealed_space_key = EXCLUDED.friend_sealed_space_key,
		    key_version = EXCLUDED.key_version
	`, targetSpaceID, requesterID, requesterSpaceID, targetFriendSealedSpaceKey, targetKeyVersion); err != nil {
		return false, stacktrace.Propagate(err, "")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_friend_shares (space_id, friend_id, friend_space_id, friend_sealed_space_key, key_version)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (space_id, friend_space_id) DO UPDATE
		SET friend_sealed_space_key = EXCLUDED.friend_sealed_space_key,
		    key_version = EXCLUDED.key_version
	`, requesterSpaceID, targetOwnerID, targetSpaceID, requesterFriendSealedSpaceKey, requesterKeyVersion); err != nil {
		return false, stacktrace.Propagate(err, "")
	}

	if !alreadyFriends {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO space_friend_events (event_type, actor_id, actor_space_id, target_id, target_space_id)
			VALUES ('friend_add', $1, $2, $3, $4)
		`, requesterID, requesterSpaceID, targetOwnerID, targetSpaceID); err != nil {
			return false, stacktrace.Propagate(err, "")
		}
	}

	if err := tx.Commit(); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return !alreadyFriends, nil
}

func (r *FriendsRepository) CreateFriendRequest(ctx context.Context, requesterID int64, requesterSpaceID string, targetSpaceID string, requesterFriendSealedSpaceKey []byte, requesterKeyVersion int) (*SpaceFriendRequestRecord, bool, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var requesterOwnerID int64
	var requesterCurrentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, current_version
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, requesterSpaceID).Scan(&requesterOwnerID, &requesterCurrentVersion); err != nil {
		return nil, false, stacktrace.Propagate(err, "")
	}
	if requesterOwnerID != requesterID || requesterCurrentVersion != requesterKeyVersion {
		return nil, false, sql.ErrNoRows
	}

	var targetOwnerID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT target_space.owner_id
		FROM spaces target_space
		JOIN users target_owner ON target_owner.user_id = target_space.owner_id AND target_owner.encrypted_email IS NOT NULL
		WHERE target_space.space_id = $1
		FOR UPDATE OF target_space
	`, targetSpaceID).Scan(&targetOwnerID); err != nil {
		return nil, false, stacktrace.Propagate(err, "")
	}
	if targetOwnerID == requesterID {
		return nil, false, ErrSelfFriendship
	}

	var alreadyFriends bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM space_friend_shares target_share
			JOIN space_friend_shares requester_share
			  ON requester_share.space_id = $1
			 AND requester_share.friend_id = $2
			 AND requester_share.friend_space_id = $3
			WHERE target_share.space_id = $3
			  AND target_share.friend_id = $4
			  AND target_share.friend_space_id = $1
		)
	`, requesterSpaceID, targetOwnerID, targetSpaceID, requesterID).Scan(&alreadyFriends); err != nil {
		return nil, false, stacktrace.Propagate(err, "")
	}
	if alreadyFriends {
		return nil, false, ErrAlreadyFriends
	}

	var rec SpaceFriendRequestRecord
	err = tx.QueryRowContext(ctx, `
		SELECT request_id, created_at
		FROM space_friend_requests
		WHERE requester_space_id = $1
		  AND target_space_id = $2
		  AND is_deleted = FALSE
		  AND resolved_at IS NULL
		FOR UPDATE
	`, requesterSpaceID, targetSpaceID).Scan(&rec.RequestID, &rec.CreatedAt)
	switch {
	case err == nil:
		if _, err := tx.ExecContext(ctx, `
			UPDATE space_friend_requests
			SET requester_friend_sealed_space_key = $2,
			    requester_key_version = $3
			WHERE request_id = $1
		`, rec.RequestID, requesterFriendSealedSpaceKey, requesterKeyVersion); err != nil {
			return nil, false, stacktrace.Propagate(err, "")
		}
		rec.RequesterID = requesterID
		rec.RequesterSpaceID = requesterSpaceID
		rec.TargetID = targetOwnerID
		rec.TargetSpaceID = targetSpaceID
		rec.RequesterFriendSealedSpaceKey = requesterFriendSealedSpaceKey
		rec.RequesterKeyVersion = requesterKeyVersion
		return &rec, false, stacktrace.Propagate(tx.Commit(), "")
	case !errors.Is(err, sql.ErrNoRows):
		return nil, false, stacktrace.Propagate(err, "")
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO space_friend_requests (
			requester_id,
			requester_space_id,
			target_id,
			target_space_id,
			requester_friend_sealed_space_key,
			requester_key_version
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING request_id, created_at
	`, requesterID, requesterSpaceID, targetOwnerID, targetSpaceID, requesterFriendSealedSpaceKey, requesterKeyVersion).Scan(&rec.RequestID, &rec.CreatedAt); err != nil {
		return nil, false, stacktrace.Propagate(err, "")
	}
	rec.RequesterID = requesterID
	rec.RequesterSpaceID = requesterSpaceID
	rec.TargetID = targetOwnerID
	rec.TargetSpaceID = targetSpaceID
	rec.RequesterFriendSealedSpaceKey = requesterFriendSealedSpaceKey
	rec.RequesterKeyVersion = requesterKeyVersion
	return &rec, true, stacktrace.Propagate(tx.Commit(), "")
}

func (r *FriendsRepository) ListFriendRequestsForSpace(ctx context.Context, targetID int64, targetSpaceID string) ([]SpaceFriendRequestRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT fr.request_id,
		       fr.requester_id,
		       fr.requester_space_id,
		       fr.target_id,
		       fr.target_space_id,
		       fr.requester_friend_sealed_space_key,
		       fr.requester_key_version,
		       fr.created_at,
		       requester_space.owner_id,
		       requester_space.space_id,
		       requester_space.space_slug,
		       requester_space.public_key,
		       requester_space.current_version,
		       '\x'::bytea AS encrypted_profile,
		       NULL::TEXT AS avatar_object_id,
		       NULL::BIGINT AS avatar_size,
		       requester_space.updated_at,
		       NULL::BIGINT AS friends,
		       NULL::BIGINT AS posts
		FROM space_friend_requests fr
		JOIN spaces requester_space ON requester_space.space_id = fr.requester_space_id
		JOIN users requester_owner ON requester_owner.user_id = requester_space.owner_id AND requester_owner.encrypted_email IS NOT NULL
		WHERE fr.target_id = $1
		  AND fr.target_space_id = $2
		  AND fr.is_deleted = FALSE
		  AND fr.resolved_at IS NULL
		ORDER BY fr.created_at DESC, fr.request_id DESC
	`, targetID, targetSpaceID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()

	var out []SpaceFriendRequestRecord
	for rows.Next() {
		var rec SpaceFriendRequestRecord
		dest := []any{
			&rec.RequestID,
			&rec.RequesterID,
			&rec.RequesterSpaceID,
			&rec.TargetID,
			&rec.TargetSpaceID,
			&rec.RequesterFriendSealedSpaceKey,
			&rec.RequesterKeyVersion,
			&rec.CreatedAt,
		}
		dest = append(dest, spaceActorScanDest(&rec.Requester)...)
		if err := rows.Scan(dest...); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		out = append(out, rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FriendsRepository) ConfirmFriendRequest(ctx context.Context, targetID int64, targetSpaceID string, requestID int64, targetFriendSealedSpaceKey []byte, targetKeyVersion int) (int64, bool, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var requesterID int64
	var requesterSpaceID string
	var requesterFriendSealedSpaceKey []byte
	var requesterKeyVersion int
	var requesterCurrentVersion int
	var targetOwnerID int64
	var targetCurrentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT fr.requester_id,
		       fr.requester_space_id,
		       fr.requester_friend_sealed_space_key,
		       fr.requester_key_version,
		       requester_space.current_version,
		       target_space.owner_id,
		       target_space.current_version
		FROM space_friend_requests fr
		JOIN spaces requester_space ON requester_space.space_id = fr.requester_space_id
		JOIN users requester_owner ON requester_owner.user_id = requester_space.owner_id AND requester_owner.encrypted_email IS NOT NULL
		JOIN spaces target_space ON target_space.space_id = fr.target_space_id
		WHERE fr.request_id = $1
		  AND fr.target_id = $2
		  AND fr.target_space_id = $3
		  AND fr.is_deleted = FALSE
		  AND fr.resolved_at IS NULL
		FOR UPDATE OF fr, requester_space, target_space
	`, requestID, targetID, targetSpaceID).Scan(
		&requesterID,
		&requesterSpaceID,
		&requesterFriendSealedSpaceKey,
		&requesterKeyVersion,
		&requesterCurrentVersion,
		&targetOwnerID,
		&targetCurrentVersion,
	); err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}
	if targetOwnerID != targetID || targetCurrentVersion != targetKeyVersion || requesterCurrentVersion != requesterKeyVersion {
		return 0, false, sql.ErrNoRows
	}

	var alreadyFriends bool
	if err := tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM space_friend_shares target_share
			JOIN space_friend_shares requester_share
			  ON requester_share.space_id = $1
			 AND requester_share.friend_id = $2
			 AND requester_share.friend_space_id = $3
			WHERE target_share.space_id = $3
			  AND target_share.friend_id = $4
			  AND target_share.friend_space_id = $1
		)
	`, requesterSpaceID, targetID, targetSpaceID, requesterID).Scan(&alreadyFriends); err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_friend_shares (space_id, friend_id, friend_space_id, friend_sealed_space_key, key_version)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (space_id, friend_space_id) DO UPDATE
		SET friend_sealed_space_key = EXCLUDED.friend_sealed_space_key,
		    key_version = EXCLUDED.key_version
	`, targetSpaceID, requesterID, requesterSpaceID, targetFriendSealedSpaceKey, targetKeyVersion); err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_friend_shares (space_id, friend_id, friend_space_id, friend_sealed_space_key, key_version)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (space_id, friend_space_id) DO UPDATE
		SET friend_sealed_space_key = EXCLUDED.friend_sealed_space_key,
		    key_version = EXCLUDED.key_version
	`, requesterSpaceID, targetID, targetSpaceID, requesterFriendSealedSpaceKey, requesterKeyVersion); err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}

	if !alreadyFriends {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO space_friend_events (event_type, actor_id, actor_space_id, target_id, target_space_id)
			VALUES ('friend_add', $1, $2, $3, $4)
		`, targetID, targetSpaceID, requesterID, requesterSpaceID); err != nil {
			return 0, false, stacktrace.Propagate(err, "")
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE space_friend_requests
		SET is_deleted = TRUE,
		    resolved_at = now_utc_micro_seconds()
		WHERE request_id = $1
		   OR (
			   requester_space_id = $2
			   AND target_space_id = $3
			   AND is_deleted = FALSE
			   AND resolved_at IS NULL
		   )
	`, requestID, targetSpaceID, requesterSpaceID); err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}

	if err := tx.Commit(); err != nil {
		return 0, false, stacktrace.Propagate(err, "")
	}
	return requesterID, !alreadyFriends, nil
}

func (r *FriendsRepository) DeleteFriendRequest(ctx context.Context, targetID int64, requestID int64) error {
	res, err := r.DB.ExecContext(ctx, `
		UPDATE space_friend_requests
		SET is_deleted = TRUE
		WHERE request_id = $1
		  AND target_id = $2
		  AND is_deleted = FALSE
		  AND resolved_at IS NULL
	`, requestID, targetID)
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

func (r *FriendsRepository) UpsertShare(ctx context.Context, spaceID string, friendID int64, friendSpaceID string, friendSealedSpaceKey []byte, keyVersion int) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_friend_shares (space_id, friend_id, friend_space_id, friend_sealed_space_key, key_version)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (space_id, friend_space_id) DO UPDATE
		SET friend_sealed_space_key = EXCLUDED.friend_sealed_space_key,
		    key_version = EXCLUDED.key_version
	`, spaceID, friendID, friendSpaceID, friendSealedSpaceKey, keyVersion)
	return stacktrace.Propagate(err, "")
}

func (r *FriendsRepository) UpdateShare(ctx context.Context, spaceID string, _ int64, friendSpaceID string, friendSealedSpaceKey []byte, keyVersion int) error {
	return r.UpdateShares(ctx, spaceID, []SpaceShareUpdateRecord{
		{FriendSpaceID: friendSpaceID, FriendSealedSpaceKey: friendSealedSpaceKey},
	}, keyVersion)
}

func (r *FriendsRepository) UpdateShares(ctx context.Context, spaceID string, shares []SpaceShareUpdateRecord, keyVersion int) error {
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
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, spaceID).Scan(&currentVersion); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return sql.ErrNoRows
	}

	for _, share := range shares {
		friendSpaceID := strings.TrimSpace(share.FriendSpaceID)
		if friendSpaceID == "" {
			return sql.ErrNoRows
		}
		res, err := tx.ExecContext(ctx, `
			UPDATE space_friend_shares
			SET friend_sealed_space_key = $3,
			    key_version = $4
			WHERE space_id = $1 AND friend_space_id = $2
		`, spaceID, friendSpaceID, share.FriendSealedSpaceKey, keyVersion)
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

func (r *FriendsRepository) DeleteFriendship(ctx context.Context, userID int64, actorSpaceID string, targetSpaceID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var targetOwnerID int64
	if err := tx.QueryRowContext(ctx, `
		SELECT target_space.owner_id
		FROM spaces target_space
		JOIN spaces actor_space ON actor_space.space_id = $2 AND actor_space.owner_id = $3
		WHERE target_space.space_id = $1
	`, targetSpaceID, actorSpaceID, userID).Scan(&targetOwnerID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if targetOwnerID == userID {
		return nil
	}

	res, err := tx.ExecContext(ctx, `
		DELETE FROM space_friend_shares
		WHERE (space_id = $1 AND friend_space_id = $2 AND friend_id = $3)
		   OR (space_id = $2 AND friend_space_id = $1 AND friend_id = $4)
	`, targetSpaceID, actorSpaceID, userID, targetOwnerID)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if affected > 0 {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO space_friend_events (event_type, actor_id, actor_space_id, target_id, target_space_id)
			VALUES ('friend_remove', $1, $2, $3, $4)
		`, userID, actorSpaceID, targetOwnerID, targetSpaceID); err != nil {
			return stacktrace.Propagate(err, "")
		}
	}

	return stacktrace.Propagate(tx.Commit(), "")
}

func (r *FriendsRepository) DeleteShareBySpaceAndFriend(ctx context.Context, spaceID string, friendID int64, friendSpaceID string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM space_friend_shares WHERE space_id = $1 AND friend_id = $2 AND friend_space_id = $3`, spaceID, friendID, friendSpaceID)
	return stacktrace.Propagate(err, "")
}

func (r *FriendsRepository) GetShareForFriendAndSpace(ctx context.Context, friendID int64, friendSpaceID string, spaceID string) (*SpaceShareRecord, error) {
	return scanShareRecord(r.DB.QueryRowContext(ctx, `
		SELECT s.space_id, s.friend_id, w.owner_id, w.space_slug, s.friend_sealed_space_key, s.key_version, s.created_at, w.public_key
		FROM space_friend_shares s
		JOIN spaces w ON w.space_id = s.space_id
		JOIN users u ON u.user_id = w.owner_id AND u.encrypted_email IS NOT NULL
		WHERE s.friend_id = $1 AND s.friend_space_id = $2 AND s.space_id = $3
	`, friendID, friendSpaceID, spaceID))
}

func (r *FriendsRepository) ListSharesForFriend(ctx context.Context, friendID int64) ([]SpaceShareRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT s.space_id, s.friend_id, w.owner_id, w.space_slug, s.friend_sealed_space_key, s.key_version, s.created_at, w.public_key
		FROM space_friend_shares s
		JOIN spaces w ON w.space_id = s.space_id
		JOIN users u ON u.user_id = w.owner_id AND u.encrypted_email IS NOT NULL
		WHERE s.friend_id = $1
		ORDER BY s.created_at ASC
	`, friendID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []SpaceShareRecord
	for rows.Next() {
		rec, err := scanShareRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FriendsRepository) ListFriendsForSpace(ctx context.Context, spaceID string) ([]SpaceFriendRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT friend_space.owner_id,
		       friend_space.space_id,
		       friend_space.space_slug,
		       friend_space.public_key,
		       friend_space.current_version,
		       friend_space.encrypted_profile,
		       friend_avatar.object_id,
		       friend_avatar.size,
		       friend_space.updated_at,
		       (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = friend_space.space_id) AS friends,
		       (SELECT COUNT(*) FROM space_posts p WHERE p.space_id = friend_space.space_id AND p.is_deleted = FALSE) AS posts,
		       s.key_version,
		       s.created_at
		FROM space_friend_shares s
		JOIN spaces friend_space ON friend_space.space_id = s.friend_space_id
		LEFT JOIN space_profile_assets friend_avatar ON friend_avatar.space_id = friend_space.space_id AND friend_avatar.asset_type = 'avatar'
		JOIN users friend_owner ON friend_owner.user_id = friend_space.owner_id AND friend_owner.encrypted_email IS NOT NULL
		WHERE s.space_id = $1
		ORDER BY lower(friend_space.space_slug) ASC
	`, spaceID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var out []SpaceFriendRecord
	for rows.Next() {
		var rec SpaceFriendRecord
		dest := spaceActorScanDest(&rec.Friend)
		dest = append(dest, &rec.ShareKeyVersion, &rec.CreatedAt)
		if err := rows.Scan(dest...); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		out = append(out, rec)
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FriendsRepository) CountFriendsForSpace(ctx context.Context, spaceID string) (int64, error) {
	var count int64
	if err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM space_friend_shares
		WHERE space_id = $1
	`, spaceID).Scan(&count); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return count, nil
}

func (r *FriendsRepository) ListAccessibleSpaceIDs(ctx context.Context, viewerID int64, viewerSpaceID string, spaceIDs []string) (map[string]bool, error) {
	out := make(map[string]bool, len(spaceIDs))
	if viewerID <= 0 || strings.TrimSpace(viewerSpaceID) == "" || len(spaceIDs) == 0 {
		return out, nil
	}
	rows, err := r.DB.QueryContext(ctx, `
		SELECT space_id
		FROM spaces
		WHERE owner_id = $1 AND space_id = ANY($2)
		UNION
		SELECT w.space_id
		FROM space_friend_shares s
		JOIN spaces w ON w.space_id = s.space_id
		JOIN users u ON u.user_id = w.owner_id AND u.encrypted_email IS NOT NULL
		WHERE s.friend_id = $1 AND s.friend_space_id = $3 AND s.space_id = ANY($2)
	`, viewerID, pq.Array(spaceIDs), viewerSpaceID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	for rows.Next() {
		var spaceID string
		if err := rows.Scan(&spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		out[spaceID] = true
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func (r *FriendsRepository) GetRelationship(ctx context.Context, viewerID int64, viewerSpaceID string, targetOwnerID int64, targetSpaceID string) (string, error) {
	if viewerID == targetOwnerID {
		return "self", nil
	}
	var count int64
	if err := r.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM space_friend_shares WHERE friend_id = $1 AND friend_space_id = $2 AND space_id = $3`, viewerID, viewerSpaceID, targetSpaceID).Scan(&count); err != nil {
		return "", stacktrace.Propagate(err, "")
	}
	if count > 0 {
		return "friend", nil
	}
	return "", nil
}

func scanShareRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceShareRecord, error) {
	var rec SpaceShareRecord
	if err := scanner.Scan(&rec.SpaceID, &rec.FriendID, &rec.OwnerID, &rec.SpaceSlug, &rec.FriendSealedSpaceKey, &rec.KeyVersion, &rec.CreatedAt, &rec.PublicKey); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
