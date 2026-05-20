package repo

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/stacktrace"
)

func (r *ReadMarkersRepository) Get(ctx context.Context, userID int64) (*SpaceReadMarkerRecord, error) {
	rec, err := scanReadMarkerRecord(r.DB.QueryRowContext(ctx, `
		SELECT user_id, feed_read_created_at, feed_read_post_id, created_at, updated_at
		FROM space_read_markers
		WHERE user_id = $1
	`, userID))
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return &SpaceReadMarkerRecord{UserID: userID}, nil
		}
		return nil, err
	}
	return rec, nil
}

func (r *ReadMarkersRepository) UpsertFeedReadMarker(ctx context.Context, userID, createdAt, postID int64) error {
	if userID <= 0 || createdAt <= 0 || postID <= 0 {
		return nil
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_read_markers (user_id, feed_read_created_at, feed_read_post_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE
		SET feed_read_created_at = CASE
				WHEN (EXCLUDED.feed_read_created_at, EXCLUDED.feed_read_post_id) >
				     (space_read_markers.feed_read_created_at, space_read_markers.feed_read_post_id)
				THEN EXCLUDED.feed_read_created_at
				ELSE space_read_markers.feed_read_created_at
			END,
			feed_read_post_id = CASE
				WHEN (EXCLUDED.feed_read_created_at, EXCLUDED.feed_read_post_id) >
				     (space_read_markers.feed_read_created_at, space_read_markers.feed_read_post_id)
				THEN EXCLUDED.feed_read_post_id
				ELSE space_read_markers.feed_read_post_id
			END
	`, userID, createdAt, postID)
	return stacktrace.Propagate(err, "")
}

func (r *ReadMarkersRepository) UpsertNotificationReadMarker(ctx context.Context, userID int64, friendSpaceID string, readAt int64) error {
	friendSpaceID = strings.TrimSpace(friendSpaceID)
	if userID <= 0 || friendSpaceID == "" || readAt <= 0 {
		return nil
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_notification_read_markers (user_id, friend_space_id, read_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, friend_space_id) DO UPDATE
		SET read_at = GREATEST(
			space_notification_read_markers.read_at,
			EXCLUDED.read_at
		)
	`, userID, friendSpaceID, readAt)
	return stacktrace.Propagate(err, "")
}

func scanReadMarkerRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceReadMarkerRecord, error) {
	var rec SpaceReadMarkerRecord
	if err := scanner.Scan(
		&rec.UserID,
		&rec.FeedReadCreatedAt,
		&rec.FeedReadPostID,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
