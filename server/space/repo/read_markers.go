package repo

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/stacktrace"
)

func (r *ReadMarkersRepository) Get(ctx context.Context, userID int64, viewerSpaceID string) (*SpaceReadMarkerRecord, error) {
	viewerSpaceID = strings.TrimSpace(viewerSpaceID)
	rec, err := scanReadMarkerRecord(r.DB.QueryRowContext(ctx, `
		SELECT user_id, viewer_space_id, feed_read_created_at, feed_read_post_id, created_at, updated_at
		FROM space_read_markers
		WHERE user_id = $1 AND viewer_space_id = $2
	`, userID, viewerSpaceID))
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return &SpaceReadMarkerRecord{UserID: userID, ViewerSpaceID: viewerSpaceID}, nil
		}
		return nil, err
	}
	return rec, nil
}

func (r *ReadMarkersRepository) UpsertFeedReadMarker(ctx context.Context, userID int64, viewerSpaceID string, createdAt, postID int64) error {
	viewerSpaceID = strings.TrimSpace(viewerSpaceID)
	if userID <= 0 || viewerSpaceID == "" || createdAt <= 0 || postID <= 0 {
		return nil
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_read_markers (user_id, viewer_space_id, feed_read_created_at, feed_read_post_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (viewer_space_id) DO UPDATE
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
	`, userID, viewerSpaceID, createdAt, postID)
	return stacktrace.Propagate(err, "")
}

func (r *ReadMarkersRepository) UpsertNotificationReadMarker(ctx context.Context, userID int64, viewerSpaceID string, friendSpaceID string, readAt int64) error {
	viewerSpaceID = strings.TrimSpace(viewerSpaceID)
	friendSpaceID = strings.TrimSpace(friendSpaceID)
	if userID <= 0 || viewerSpaceID == "" || friendSpaceID == "" || readAt <= 0 {
		return nil
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_notification_read_markers (user_id, viewer_space_id, friend_space_id, read_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (viewer_space_id, friend_space_id) DO UPDATE
		SET read_at = GREATEST(
			space_notification_read_markers.read_at,
			EXCLUDED.read_at
		)
	`, userID, viewerSpaceID, friendSpaceID, readAt)
	return stacktrace.Propagate(err, "")
}

func scanReadMarkerRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceReadMarkerRecord, error) {
	var rec SpaceReadMarkerRecord
	if err := scanner.Scan(
		&rec.UserID,
		&rec.ViewerSpaceID,
		&rec.FeedReadCreatedAt,
		&rec.FeedReadPostID,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
