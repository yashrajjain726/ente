package controller

import (
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

const (
	wallMessageKindRegular   = "regular"
	wallMessageKindPostReply = "post_reply"
)

type MessagesController struct {
	MessagesRepo *repo.MessagesRepository
	PostsRepo    *repo.PostsRepository
	WallsRepo    *repo.WallsRepository
	FriendsRepo  *repo.FriendsRepository
	auth         authDeps
}

func (c *MessagesController) Create(ctx *gin.Context, targetWallID string, req models.CreateMessageRequest) (*models.MessageResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := validateCreateMessageRequest(req); err != nil {
		return nil, err
	}
	senderWall, recipientWall, err := c.requireFriendMessageTarget(ctx, userID, targetWallID)
	if err != nil {
		return nil, err
	}
	replyMessageID, err := c.validateReplyMessage(ctx, userID, req.ReplyMessageID, senderWall.WallID, recipientWall.WallID)
	if err != nil {
		return nil, err
	}
	message, err := c.MessagesRepo.CreateMessage(ctx.Request.Context(), repo.CreateWallMessageRecord{
		MessageID:                    req.MessageID,
		Kind:                         wallMessageKindRegular,
		SenderID:                     userID,
		SenderWallID:                 senderWall.WallID,
		RecipientID:                  recipientWall.OwnerID,
		RecipientWallID:              recipientWall.WallID,
		MessageCipher:                req.MessageCipher,
		SenderEncryptedMessageKey:    req.SenderEncryptedMessageKey,
		RecipientEncryptedMessageKey: req.RecipientEncryptedMessageKey,
		ReplyMessageID:               replyMessageID,
	})
	if err != nil {
		return nil, err
	}
	return toMessageResponse(*message), nil
}

func (c *MessagesController) ReplyToPost(ctx *gin.Context, postID string, req models.CreateMessageRequest) (*models.MessageResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := validateCreateMessageRequest(req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ReplyMessageID) != "" {
		return nil, ente.NewBadRequestWithMessage("replyMessageId is not supported for post replies")
	}
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, userID)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), post.WallID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), &viewerAuth{UserID: userID}, wall); err != nil {
		return nil, err
	}
	if wall.OwnerID == userID {
		return nil, ente.NewBadRequestWithMessage("cannot reply to your own post")
	}
	senderWall, recipientWall, err := c.requireFriendMessageTarget(ctx, userID, wall.WallID)
	if err != nil {
		return nil, err
	}
	message, err := c.MessagesRepo.CreateMessage(ctx.Request.Context(), repo.CreateWallMessageRecord{
		MessageID:                    req.MessageID,
		Kind:                         wallMessageKindPostReply,
		SenderID:                     userID,
		SenderWallID:                 senderWall.WallID,
		RecipientID:                  recipientWall.OwnerID,
		RecipientWallID:              recipientWall.WallID,
		MessageCipher:                req.MessageCipher,
		SenderEncryptedMessageKey:    req.SenderEncryptedMessageKey,
		RecipientEncryptedMessageKey: req.RecipientEncryptedMessageKey,
		ReplyPostID:                  sql.NullInt64{Int64: id, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	return toMessageResponse(*message), nil
}

func (c *MessagesController) List(ctx *gin.Context, req models.ListMessagesRequest) (*models.MessageConversationPage, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	conversations, nextCursor, err := c.MessagesRepo.ListConversations(ctx.Request.Context(), userID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	items := make([]models.MessageConversationResponse, 0, len(conversations))
	for _, conversation := range conversations {
		items = append(items, models.MessageConversationResponse{
			Friend:         toActorResponse(conversation.Friend, true),
			LatestActivity: toMessageConversationActivityResponse(conversation.LatestActivity),
		})
	}
	return &models.MessageConversationPage{Items: items, NextCursor: nextCursor}, nil
}

func (c *MessagesController) ListThread(ctx *gin.Context, targetWallID string, req models.ListMessageThreadRequest) (*models.MessagePage, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(targetWallID) == "" {
		return nil, ente.NewBadRequestWithMessage("wallId is required")
	}
	if _, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), strings.TrimSpace(targetWallID)); err != nil {
		return nil, err
	}
	messages, nextCursor, err := c.MessagesRepo.ListThread(ctx.Request.Context(), userID, strings.TrimSpace(targetWallID), req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	items := make([]models.MessageResponse, 0, len(messages))
	for _, message := range messages {
		items = append(items, *toMessageResponse(message))
	}
	return &models.MessagePage{Items: items, NextCursor: nextCursor}, nil
}

func (c *MessagesController) ToggleLike(ctx *gin.Context, messageID string, req models.LikeMessageRequest) (*models.LikeMessageResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil, ente.NewBadRequestWithMessage("messageId is required")
	}
	message, err := c.MessagesRepo.GetMessage(ctx.Request.Context(), messageID, userID)
	if err != nil {
		return nil, err
	}
	if message.IsDeleted {
		return nil, ente.NewBadRequestWithMessage("cannot like a deleted message")
	}
	if err := c.MessagesRepo.SetLike(ctx.Request.Context(), messageID, userID, req.Like); err != nil {
		return nil, err
	}
	return &models.LikeMessageResponse{Liked: req.Like}, nil
}

func (c *MessagesController) Delete(ctx *gin.Context, messageID string) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return ente.NewBadRequestWithMessage("messageId is required")
	}
	message, err := c.MessagesRepo.GetMessage(ctx.Request.Context(), messageID, userID)
	if err != nil {
		return err
	}
	if message.SenderID != userID {
		return ente.ErrPermissionDenied
	}
	if message.IsDeleted {
		return nil
	}
	return c.MessagesRepo.DeleteMessage(ctx.Request.Context(), messageID, userID)
}

func (c *MessagesController) requireFriendMessageTarget(ctx *gin.Context, userID int64, targetWallID string) (*repo.WallRecord, *repo.WallRecord, error) {
	targetWallID = strings.TrimSpace(targetWallID)
	if targetWallID == "" {
		return nil, nil, ente.NewBadRequestWithMessage("wallId is required")
	}
	ownedWalls, err := c.WallsRepo.ListWallsByOwner(ctx.Request.Context(), userID)
	if err != nil {
		return nil, nil, err
	}
	if len(ownedWalls) == 0 {
		return nil, nil, ente.NewBadRequestWithMessage("sender wall is missing")
	}
	senderWall := ownedWalls[0]
	recipientWall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), targetWallID)
	if err != nil {
		return nil, nil, err
	}
	if recipientWall.OwnerID == userID {
		return nil, nil, ente.NewBadRequestWithMessage("cannot message your own wall")
	}
	if _, err := c.FriendsRepo.GetShareForFriendAndWall(ctx.Request.Context(), userID, recipientWall.WallID); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, nil, ente.ErrPermissionDenied
		}
		return nil, nil, err
	}
	return &senderWall, recipientWall, nil
}

func (c *MessagesController) validateReplyMessage(ctx *gin.Context, userID int64, replyMessageID, senderWallID, recipientWallID string) (sql.NullString, error) {
	replyMessageID = strings.TrimSpace(replyMessageID)
	if replyMessageID == "" {
		return sql.NullString{}, nil
	}
	parent, err := c.MessagesRepo.GetMessage(ctx.Request.Context(), replyMessageID, userID)
	if err != nil {
		return sql.NullString{}, err
	}
	if parent.IsDeleted {
		return sql.NullString{}, ente.NewBadRequestWithMessage("cannot reply to a deleted message")
	}
	if !sameMessageThread(parent, senderWallID, recipientWallID) {
		return sql.NullString{}, ente.ErrPermissionDenied
	}
	return sql.NullString{String: replyMessageID, Valid: true}, nil
}

func sameMessageThread(message *repo.WallMessageRecord, firstWallID, secondWallID string) bool {
	return (message.SenderWallID == firstWallID && message.RecipientWallID == secondWallID) ||
		(message.SenderWallID == secondWallID && message.RecipientWallID == firstWallID)
}

func validateCreateMessageRequest(req models.CreateMessageRequest) error {
	if strings.TrimSpace(req.MessageCipher) == "" ||
		strings.TrimSpace(req.SenderEncryptedMessageKey) == "" ||
		strings.TrimSpace(req.RecipientEncryptedMessageKey) == "" {
		return ente.NewBadRequestWithMessage("messageCipher and encrypted message keys are required")
	}
	return nil
}

func toMessageResponse(message repo.WallMessageRecord) *models.MessageResponse {
	resp := &models.MessageResponse{
		MessageID:           message.MessageID,
		Kind:                message.Kind,
		Sender:              toActorResponse(message.Sender, true),
		Recipient:           toActorResponse(message.Recipient, true),
		MessageCipher:       message.MessageCipher,
		EncryptedMessageKey: message.EncryptedMessageKey,
		Likes:               message.Likes,
		ViewerLiked:         message.ViewerLiked,
		IsDeleted:           message.IsDeleted,
		CreatedAt:           formatMicros(message.CreatedAt),
		UpdatedAt:           formatMicros(message.UpdatedAt),
	}
	if message.ReplyPostID.Valid {
		replyPostID := message.ReplyPostID.Int64
		resp.ReplyPostID = &replyPostID
	}
	if message.ReplyMessageID.Valid {
		replyMessageID := message.ReplyMessageID.String
		resp.ReplyMessageID = &replyMessageID
	}
	return resp
}

func toMessageConversationActivityResponse(activity repo.WallMessageConversationActivityRecord) models.MessageConversationActivityResponse {
	resp := models.MessageConversationActivityResponse{
		ID:        activity.ID,
		Type:      activity.Type,
		CreatedAt: formatMicros(activity.CreatedAt),
	}
	if activity.Message != nil {
		resp.Message = toMessageResponse(*activity.Message)
	}
	if activity.Post != nil {
		resp.Post = &models.MessageConversationPostResponse{
			PostID:      activity.Post.PostID,
			WallID:      activity.Post.WallID,
			WallSlug:    activity.Post.WallSlug,
			OwnerUserID: activity.Post.OwnerID,
		}
		if activity.Post.ObjectKey.Valid {
			resp.Post.Objects = []models.PostObjectPayload{
				toPostObjectPayload(repo.WallPostAssetRecord{
					PostID:         activity.Post.PostID,
					ObjectKey:      activity.Post.ObjectKey.String,
					Size:           activity.Post.ObjectSize,
					Position:       int(activity.Post.ObjectPosition.Int64),
					Variant:        activity.Post.ObjectVariant,
					BlurHashCipher: activity.Post.ObjectBlurHashCipher,
					Width:          activity.Post.ObjectWidth,
					Height:         activity.Post.ObjectHeight,
					MediaType:      activity.Post.ObjectMediaType,
				}),
			}
		}
	}
	return resp
}
