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
	auth            authDeps
}

func (c *ReadMarkersController) GetUnreadStatus(ctx *gin.Context) (*models.SpaceUnreadStatusResponse, error) {
	viewerSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	notificationsUnread, err := c.ReadMarkersRepo.HasUnreadNotifications(ctx, viewerSpace.SpaceID)
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
	viewerSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	readAt, err := c.ReadMarkersRepo.GetLatestConversationActivityAt(ctx, viewerSpace.SpaceID, req.FriendSpaceID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.ReadMarkersRepo.UpsertNotificationReadMarker(ctx, viewerSpace.SpaceID, req.FriendSpaceID, readAt); err != nil {
		return nil, err
	}
	return c.GetUnreadStatus(ctx)
}
