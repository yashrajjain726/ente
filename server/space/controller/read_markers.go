package controller

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type ReadMarkersController struct {
	ReadMarkersRepo *repo.ReadMarkersRepository
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
	notificationsUnread, err := c.MessagesRepo.HasUnreadNotifications(ctx.Request.Context(), viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	messagesUnread, err := c.MessagesRepo.HasUnreadMessages(ctx.Request.Context(), viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	messageLikesUnread, err := c.MessagesRepo.HasUnreadMessageLikes(ctx.Request.Context(), viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceUnreadStatusResponse{
		NotificationsUnread: notificationsUnread,
		MessagesUnread:      messagesUnread,
		MessageLikesUnread:  messageLikesUnread,
	}, nil
}

func (c *ReadMarkersController) MarkNotificationsRead(ctx *gin.Context, req models.MarkNotificationsReadRequest) (*models.SpaceUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	readAt, hasReadAt, err := parseNotificationReadAt(req.ReadAt)
	if err != nil {
		return nil, err
	}
	if !hasReadAt {
		readAt, err = c.MessagesRepo.GetLatestNotificationActivityAt(ctx.Request.Context(), viewerSpace.SpaceID)
		if err != nil {
			if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
				return c.GetUnreadStatus(ctx)
			}
			return nil, err
		}
	}
	if err := c.ReadMarkersRepo.UpsertNotificationsReadMarker(ctx.Request.Context(), userID, viewerSpace.SpaceID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}

func parseNotificationReadAt(value string) (int64, bool, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false, nil
	}
	readAt, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return 0, true, ente.NewBadRequestWithMessage("invalid readAt")
	}
	return readAt.UnixMicro(), true, nil
}

func (c *ReadMarkersController) MarkMessageLikesRead(ctx *gin.Context) (*models.SpaceUnreadStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	readAt, err := c.MessagesRepo.GetLatestMessageLikeActivityAt(ctx.Request.Context(), viewerSpace.SpaceID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return c.GetUnreadStatus(ctx)
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertMessageLikesReadMarker(ctx.Request.Context(), userID, viewerSpace.SpaceID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}

func (c *ReadMarkersController) MarkMessageThreadRead(ctx *gin.Context, req models.MarkMessageThreadReadRequest) (*models.SpaceUnreadStatusResponse, error) {
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
	readAt, err := c.MessagesRepo.GetLatestMessageThreadActivityAt(ctx.Request.Context(), userID, viewerSpace.SpaceID, req.FriendSpaceID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertMessageThreadReadMarker(ctx.Request.Context(), userID, viewerSpace.SpaceID, req.FriendSpaceID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}
