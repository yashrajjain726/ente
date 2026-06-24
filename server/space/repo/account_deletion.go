package repo

import (
	"context"
	"database/sql"

	"github.com/ente-io/stacktrace"
	"github.com/lib/pq"
)

func (m *Module) ResetUserAccess(ctx context.Context, userID int64) error {
	tx, err := m.Spaces.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	spaceIDs, err := getOwnedSpaceIDsTx(ctx, tx, userID)
	if err != nil {
		return err
	}
	if err := resetSpaceAccessTx(ctx, tx, userID, spaceIDs); err != nil {
		return err
	}
	return stacktrace.Propagate(tx.Commit(), "")
}

func (m *Module) DeleteUserData(ctx context.Context, userID int64) error {
	tx, err := m.Spaces.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	spaceIDs, err := getOwnedSpaceIDsTx(ctx, tx, userID)
	if err != nil {
		return err
	}
	if err := queueOwnedSpaceObjectsTx(ctx, tx, userID, spaceIDs); err != nil {
		return err
	}
	if err := deleteSpaceRowsTx(ctx, tx, userID, spaceIDs); err != nil {
		return err
	}
	return stacktrace.Propagate(tx.Commit(), "")
}

func getOwnedSpaceIDsTx(ctx context.Context, tx *sql.Tx, userID int64) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT space_id
		FROM spaces
		WHERE owner_id = $1
		ORDER BY created_at ASC
		FOR UPDATE
	`, userID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()

	var spaceIDs []string
	for rows.Next() {
		var spaceID string
		if err := rows.Scan(&spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		spaceIDs = append(spaceIDs, spaceID)
	}
	return spaceIDs, stacktrace.Propagate(rows.Err(), "")
}

func resetSpaceAccessTx(ctx context.Context, tx *sql.Tx, userID int64, spaceIDs []string) error {
	spaceIDArray := pq.Array(spaceIDs)
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_browser_sessions WHERE user_id = $1`, userID); err != nil {
		return stacktrace.Propagate(err, "failed to delete space browser sessions")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_link_sessions WHERE owner_id = $1 OR space_id = ANY($2)`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space link sessions")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE space_links SET active = FALSE WHERE space_id = ANY($1) AND active = TRUE`, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to disable space links")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_friend_shares WHERE friend_id = $1 OR space_id = ANY($2) OR friend_space_id = ANY($2)`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space friend shares")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_friend_requests WHERE requester_id = $1 OR target_id = $1 OR requester_space_id = ANY($2) OR target_space_id = ANY($2)`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space friend requests")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_friend_events WHERE actor_id = $1 OR target_id = $1 OR actor_space_id = ANY($2) OR target_space_id = ANY($2)`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space friend events")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_notification_read_markers WHERE user_id = $1 OR viewer_space_id = ANY($2) OR friend_space_id = ANY($2)`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space notification read markers")
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM space_post_likes
		WHERE user_id = $1
		   OR actor_space_id = ANY($2)
		   OR post_id IN (
		       SELECT post_id
		       FROM space_posts
		       WHERE owner_id = $1 OR space_id = ANY($2)
		   )
	`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space post likes")
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM space_message_likes
		WHERE user_id = $1
		   OR actor_space_id = ANY($2)
		   OR message_id IN (
		       SELECT message_id
		       FROM space_messages
		       WHERE sender_id = $1
		          OR recipient_id = $1
		          OR sender_space_id = ANY($2)
		          OR recipient_space_id = ANY($2)
		   )
	`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space message likes")
	}
	return nil
}

func queueOwnedSpaceObjectsTx(ctx context.Context, tx *sql.Tx, userID int64, spaceIDs []string) error {
	if _, err := tx.ExecContext(ctx, `
		UPDATE space_temp_objects
		SET space_id = NULL,
		    expires_at = now_utc_micro_seconds(),
		    cleanup_after = now_utc_micro_seconds()
		WHERE owner_id = $1
	`, userID); err != nil {
		return stacktrace.Propagate(err, "failed to queue staged space uploads for cleanup")
	}

	if err := queueProfileObjectsTx(ctx, tx, userID); err != nil {
		return err
	}
	return queuePostObjectsTx(ctx, tx, userID, spaceIDs)
}

func queueProfileObjectsTx(ctx context.Context, tx *sql.Tx, userID int64) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT avatar_object_key, avatar_bucket_id, COALESCE(NULLIF(avatar_size, 0), 1), $2
		FROM spaces
		WHERE owner_id = $1 AND avatar_object_key IS NOT NULL AND avatar_bucket_id IS NOT NULL
		UNION ALL
		SELECT cover_object_key, cover_bucket_id, COALESCE(NULLIF(cover_size, 0), 1), $3
		FROM spaces
		WHERE owner_id = $1 AND cover_object_key IS NOT NULL AND cover_bucket_id IS NOT NULL
	`, userID, TempObjectPurposeAvatar, TempObjectPurposeCover)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}

	records := make([]SpaceTempObjectRecord, 0)
	for rows.Next() {
		var rec SpaceTempObjectRecord
		if err := rows.Scan(&rec.ObjectKey, &rec.BucketID, &rec.ExpectedSize, &rec.Purpose); err != nil {
			_ = rows.Close()
			return stacktrace.Propagate(err, "")
		}
		rec.OwnerID = userID
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return stacktrace.Propagate(err, "")
	}
	if err := rows.Close(); err != nil {
		return stacktrace.Propagate(err, "")
	}
	for _, rec := range records {
		if err := QueueObjectCleanupTx(ctx, tx, rec); err != nil {
			return err
		}
	}
	return nil
}

func queuePostObjectsTx(ctx context.Context, tx *sql.Tx, userID int64, spaceIDs []string) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT a.object_key, a.bucket_id, COALESCE(NULLIF(a.size, 0), 1)
		FROM space_post_assets a
		JOIN space_posts p ON p.post_id = a.post_id
		WHERE p.owner_id = $1 OR p.space_id = ANY($2)
	`, userID, pq.Array(spaceIDs))
	if err != nil {
		return stacktrace.Propagate(err, "")
	}

	records := make([]SpaceTempObjectRecord, 0)
	for rows.Next() {
		rec := SpaceTempObjectRecord{
			OwnerID: userID,
			Purpose: TempObjectPurposePost,
		}
		if err := rows.Scan(&rec.ObjectKey, &rec.BucketID, &rec.ExpectedSize); err != nil {
			_ = rows.Close()
			return stacktrace.Propagate(err, "")
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return stacktrace.Propagate(err, "")
	}
	if err := rows.Close(); err != nil {
		return stacktrace.Propagate(err, "")
	}
	for _, rec := range records {
		if err := QueueObjectCleanupTx(ctx, tx, rec); err != nil {
			return err
		}
	}
	return nil
}

func deleteSpaceRowsTx(ctx context.Context, tx *sql.Tx, userID int64, spaceIDs []string) error {
	if err := resetSpaceAccessTx(ctx, tx, userID, spaceIDs); err != nil {
		return err
	}
	spaceIDArray := pq.Array(spaceIDs)
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_entity_keys WHERE user_id = $1`, userID); err != nil {
		return stacktrace.Propagate(err, "failed to delete space entity keys")
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM space_messages
		WHERE sender_id = $1
		   OR recipient_id = $1
		   OR sender_space_id = ANY($2)
		   OR recipient_space_id = ANY($2)
	`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space messages")
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM space_post_assets
		WHERE post_id IN (
			SELECT post_id
			FROM space_posts
			WHERE owner_id = $1 OR space_id = ANY($2)
		)
	`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space post assets")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_posts WHERE owner_id = $1 OR space_id = ANY($2)`, userID, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space posts")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_key_versions WHERE space_id = ANY($1)`, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space key versions")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_links WHERE space_id = ANY($1)`, spaceIDArray); err != nil {
		return stacktrace.Propagate(err, "failed to delete space links")
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM spaces WHERE owner_id = $1`, userID); err != nil {
		return stacktrace.Propagate(err, "failed to delete spaces")
	}
	return nil
}
