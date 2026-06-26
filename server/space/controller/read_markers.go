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
	MessagesRepo    *repo.MessagesRepository
	auth            authDeps
}

func (c *ReadMarkersController) GetUnreadStatus(ctx *gin.Context, req models.SpaceUnreadStatusRequest) (*models.SpaceUnreadStatusResponse, error) {
	_, viewerSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	notificationsUnread, err := c.MessagesRepo.HasUnreadNotifications(ctx, viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceUnreadStatusResponse{
		NotificationsUnread: notificationsUnread,
	}, nil
}

func (c *ReadMarkersController) MarkNotificationsRead(ctx *gin.Context, req models.MarkNotificationsReadRequest) (*models.SpaceUnreadStatusResponse, error) {
	if strings.TrimSpace(req.FriendSpaceID) == "" {
		return nil, ente.NewBadRequestWithMessage("friendSpaceId is required")
	}
	userID, viewerSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	readAt, err := c.MessagesRepo.GetLatestConversationActivityAt(ctx, userID, viewerSpace.SpaceID, req.FriendSpaceID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertNotificationReadMarker(ctx, viewerSpace.SpaceID, req.FriendSpaceID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx, models.SpaceUnreadStatusRequest{})
}
