package repo

import (
	"context"
	"strings"

	"github.com/ente-io/stacktrace"
)

const (
	readScopeNotifications = "notifications"
	readScopeMessageLikes  = "message_likes"
	readScopeMessageThread = "message_thread"
)

func (r *ReadMarkersRepository) UpsertNotificationsReadMarker(ctx context.Context, userID int64, viewerSpaceID string, readAt int64) error {
	return r.upsertReadMarker(ctx, userID, viewerSpaceID, "", readScopeNotifications, readAt)
}

func (r *ReadMarkersRepository) UpsertMessageLikesReadMarker(ctx context.Context, userID int64, viewerSpaceID string, readAt int64) error {
	return r.upsertReadMarker(ctx, userID, viewerSpaceID, "", readScopeMessageLikes, readAt)
}

func (r *ReadMarkersRepository) UpsertMessageThreadReadMarker(ctx context.Context, userID int64, viewerSpaceID string, friendSpaceID string, readAt int64) error {
	return r.upsertReadMarker(ctx, userID, viewerSpaceID, friendSpaceID, readScopeMessageThread, readAt)
}

func (r *ReadMarkersRepository) upsertReadMarker(ctx context.Context, userID int64, viewerSpaceID string, friendSpaceID string, scope string, readAt int64) error {
	viewerSpaceID = strings.TrimSpace(viewerSpaceID)
	friendSpaceID = strings.TrimSpace(friendSpaceID)
	scope = strings.TrimSpace(scope)
	if userID <= 0 || viewerSpaceID == "" || scope == "" || readAt <= 0 {
		return nil
	}
	if scope == readScopeMessageThread && friendSpaceID == "" {
		return nil
	}
	if scope != readScopeMessageThread {
		friendSpaceID = ""
	}
	if scope == readScopeMessageThread && friendSpaceID == viewerSpaceID {
		return nil
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_read_markers (user_id, viewer_space_id, scope, friend_space_id, read_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (viewer_space_id, scope, friend_space_id) DO UPDATE
		SET read_at = GREATEST(
			space_read_markers.read_at,
			EXCLUDED.read_at
		)
	`, userID, viewerSpaceID, scope, friendSpaceID, readAt)
	return stacktrace.Propagate(err, "")
}
