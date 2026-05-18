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
			Friend:      toActorResponse(conversation.Friend, true),
			LastMessage: *toMessageResponse(conversation.LastMessage),
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
		IsDeleted:           message.IsDeleted,
		CreatedAt:           formatMicros(message.CreatedAt),
		UpdatedAt:           formatMicros(message.UpdatedAt),
	}
	if message.ReplyPostID.Valid {
		replyPostID := message.ReplyPostID.Int64
		resp.ReplyPostID = &replyPostID
	}
	return resp
}
