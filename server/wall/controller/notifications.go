package controller

import (
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
)

type NotificationsController struct {
	NotificationsRepo *repo.NotificationsRepository
	auth              authDeps
}

func (c *NotificationsController) List(ctx *gin.Context, req models.ListNotificationsRequest) (*models.NotificationPage, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	notifications, nextCursor, err := c.NotificationsRepo.List(ctx.Request.Context(), userID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	actors := make([]repo.WallActorRecord, 0, len(notifications)*3)
	for _, notification := range notifications {
		actors = append(actors, notification.Actor)
		if notification.PostID.Valid {
			actors = append(actors, notification.PostAuthor)
		}
		if notification.CommentID.Valid {
			actors = append(actors, notification.CommentAuthor)
		}
	}
	visible, err := actorVisibility(ctx.Request.Context(), c.auth, &viewerAuth{UserID: userID}, actors...)
	if err != nil {
		return nil, err
	}
	items := make([]models.NotificationResponse, 0, len(notifications))
	for _, notification := range notifications {
		items = append(items, toNotificationResponse(notification, visible))
	}
	return &models.NotificationPage{Items: items, NextCursor: nextCursor}, nil
}

func toNotificationResponse(notification repo.WallNotificationRecord, visible map[string]bool) models.NotificationResponse {
	resp := models.NotificationResponse{
		ID:        notification.ID,
		Type:      notification.Type,
		CreatedAt: formatMicros(notification.CreatedAt),
		Actor:     toActorResponse(notification.Actor, visibleActor(visible, notification.Actor)),
	}
	if notification.PostID.Valid {
		post := &models.NotificationPostResponse{
			PostID:      notification.PostID.Int64,
			WallID:      notification.PostWallID.String,
			WallSlug:    notification.PostWallSlug.String,
			OwnerUserID: notification.PostOwnerID.Int64,
			Author:      toActorResponse(notification.PostAuthor, visibleActor(visible, notification.PostAuthor)),
		}
		if notification.PostObjectKey.Valid {
			object := models.PostObjectPayload{
				ObjectKey: notification.PostObjectKey.String,
			}
			if notification.PostObjectSize.Valid {
				object.Size = notification.PostObjectSize.Int64
			}
			if notification.PostObjectPosition.Valid {
				object.Position = int(notification.PostObjectPosition.Int64)
			}
			if notification.PostObjectVariant.Valid {
				object.Variant = notification.PostObjectVariant.String
			}
			if notification.PostObjectBlurHashCipher.Valid {
				object.BlurHashCipher = notification.PostObjectBlurHashCipher.String
			}
			if notification.PostObjectWidth.Valid {
				object.Width = int(notification.PostObjectWidth.Int64)
			}
			if notification.PostObjectHeight.Valid {
				object.Height = int(notification.PostObjectHeight.Int64)
			}
			if notification.PostObjectMediaType.Valid {
				object.MediaType = notification.PostObjectMediaType.String
			}
			post.Objects = []models.PostObjectPayload{object}
		}
		resp.Post = post
	}
	if notification.CommentID.Valid {
		comment := &models.NotificationCommentResponse{
			CommentID: notification.CommentID.Int64,
			Author:    toActorResponse(notification.CommentAuthor, visibleActor(visible, notification.CommentAuthor)),
		}
		if notification.CommentCipher.Valid {
			comment.CommentCipher = notification.CommentCipher.String
		}
		if notification.CommentCreatedAt.Valid {
			comment.CreatedAt = formatMicros(notification.CommentCreatedAt.Int64)
		}
		if notification.ParentCommentID.Valid {
			parentID := notification.ParentCommentID.Int64
			comment.ParentCommentID = &parentID
		}
		resp.Comment = comment
	}
	return resp
}
