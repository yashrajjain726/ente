package controller

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type ReadMarkersController struct {
	ReadMarkersRepo *repo.ReadMarkersRepository
	PostsRepo       *repo.PostsRepository
	MessagesRepo    *repo.MessagesRepository
	auth            authDeps
}

func (c *ReadMarkersController) GetUnreadStatus(ctx *gin.Context) (*models.SpaceUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	marker, err := c.ReadMarkersRepo.Get(ctx.Request.Context(), userID, viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	feedUnread, err := c.PostsRepo.HasUnreadFeed(ctx.Request.Context(), userID, viewerSpace.SpaceID, marker.FeedReadCreatedAt, marker.FeedReadPostID)
	if err != nil {
		return nil, err
	}
	notificationsUnread, err := c.MessagesRepo.HasUnreadNotifications(ctx.Request.Context(), userID, viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceUnreadStatusResponse{
		FeedUnread:          feedUnread,
		NotificationsUnread: notificationsUnread,
	}, nil
}

func (c *ReadMarkersController) MarkFeedRead(ctx *gin.Context, req models.MarkFeedReadRequest) (*models.SpaceUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if req.PostID <= 0 {
		return nil, ente.NewBadRequestWithMessage("postId is required")
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	createdAt, postID, err := c.PostsRepo.GetFeedPostMarker(ctx.Request.Context(), userID, viewerSpace.SpaceID, req.PostID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertFeedReadMarker(ctx.Request.Context(), userID, viewerSpace.SpaceID, createdAt, postID); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}

func (c *ReadMarkersController) MarkNotificationsRead(ctx *gin.Context, req models.MarkNotificationsReadRequest) (*models.SpaceUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.FriendSpaceID) == "" {
		return nil, ente.NewBadRequestWithMessage("friendSpaceId is required")
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	readAt, err := c.MessagesRepo.GetLatestConversationActivityAt(ctx.Request.Context(), userID, viewerSpace.SpaceID, req.FriendSpaceID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertNotificationReadMarker(ctx.Request.Context(), userID, viewerSpace.SpaceID, req.FriendSpaceID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}
