package repo

import (
	"context"
	"strings"

	"github.com/ente-io/stacktrace"
)

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
