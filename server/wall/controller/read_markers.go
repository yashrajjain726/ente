package controller

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type ReadMarkersController struct {
	ReadMarkersRepo *repo.ReadMarkersRepository
	PostsRepo       *repo.PostsRepository
	MessagesRepo    *repo.MessagesRepository
	auth            authDeps
}

func (c *ReadMarkersController) GetUnreadStatus(ctx *gin.Context) (*models.WallUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	marker, err := c.ReadMarkersRepo.Get(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	feedUnread, err := c.PostsRepo.HasUnreadFeed(ctx.Request.Context(), userID, marker.FeedReadCreatedAt, marker.FeedReadPostID)
	if err != nil {
		return nil, err
	}
	notificationsUnread, err := c.MessagesRepo.HasUnreadNotifications(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	return &models.WallUnreadStatusResponse{
		FeedUnread:          feedUnread,
		NotificationsUnread: notificationsUnread,
	}, nil
}

func (c *ReadMarkersController) MarkFeedRead(ctx *gin.Context, req models.MarkFeedReadRequest) (*models.WallUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if req.PostID <= 0 {
		return nil, ente.NewBadRequestWithMessage("postId is required")
	}
	createdAt, postID, err := c.PostsRepo.GetFeedPostMarker(ctx.Request.Context(), userID, req.PostID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertFeedReadMarker(ctx.Request.Context(), userID, createdAt, postID); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}

func (c *ReadMarkersController) MarkNotificationsRead(ctx *gin.Context, req models.MarkNotificationsReadRequest) (*models.WallUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.FriendWallID) == "" {
		return nil, ente.NewBadRequestWithMessage("friendWallId is required")
	}
	readAt, err := c.MessagesRepo.GetLatestConversationActivityAt(ctx.Request.Context(), userID, req.FriendWallID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertNotificationReadMarker(ctx.Request.Context(), userID, req.FriendWallID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}
