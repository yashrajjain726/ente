package controller

import (
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

const (
	spaceMessageKindRegular   = "regular"
	spaceMessageKindPostReply = "post_reply"
	spaceMessageKindPostLike  = "post_like"

	maxSpaceMessageCipherEncodedBytes = 8 * 1024
	maxSpaceMessageCipherDecodedBytes = 6 * 1024
	maxSpaceMessageKeyEncodedBytes    = 1024
	maxSpaceMessageKeyDecodedBytes    = 768
)

type MessagesController struct {
	MessagesRepo    *repo.MessagesRepository
	PostsRepo       *repo.PostsRepository
	SpacesRepo      *repo.SpacesRepository
	FriendsRepo     *repo.FriendsRepository
	ReadMarkersRepo *repo.ReadMarkersRepository
	EmailNotifier   SpaceEmailNotifier
	auth            authDeps
}

func (c *MessagesController) Create(ctx *gin.Context, targetSpaceID string, req models.CreateMessageRequest) (*models.MessageResponse, error) {
	userID, senderSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	messageCipher, senderEncryptedMessageKey, recipientEncryptedMessageKey, err := decodeCreateMessageRequest(req)
	if err != nil {
		return nil, err
	}
	recipientSpace, err := c.requireFriendMessageTarget(ctx, userID, senderSpace.SpaceID, targetSpaceID)
	if err != nil {
		return nil, err
	}
	replyMessageID, err := c.validateReplyMessage(ctx, userID, req.ReplyMessageID, senderSpace.SpaceID, recipientSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	message, err := c.MessagesRepo.CreateMessage(ctx, repo.CreateSpaceMessageRecord{
		MessageID:                    req.MessageID,
		Kind:                         spaceMessageKindRegular,
		SenderID:                     userID,
		SenderSpaceID:                senderSpace.SpaceID,
		RecipientID:                  recipientSpace.OwnerID,
		RecipientSpaceID:             recipientSpace.SpaceID,
		MessageCipher:                messageCipher,
		SenderEncryptedMessageKey:    senderEncryptedMessageKey,
		RecipientEncryptedMessageKey: recipientEncryptedMessageKey,
		ReplyMessageID:               replyMessageID,
	})
	if err != nil {
		return nil, err
	}
	return toMessageResponse(*message), nil
}

func (c *MessagesController) ReplyToPost(ctx *gin.Context, postID string, req models.CreateMessageRequest) (*models.MessageResponse, error) {
	userID, senderSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	messageCipher, senderEncryptedMessageKey, recipientEncryptedMessageKey, err := decodeCreateMessageRequest(req)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ReplyMessageID) != "" {
		return nil, ente.NewBadRequestWithMessage("replyMessageId is not supported for post replies")
	}
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	post, err := c.PostsRepo.GetPost(ctx, id, userID, senderSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx, post.SpaceID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx, &viewerAuth{UserID: userID, SpaceID: senderSpace.SpaceID}, space); err != nil {
		return nil, err
	}
	if space.OwnerID == userID {
		return nil, ente.NewBadRequestWithMessage("cannot reply to your own post")
	}
	recipientSpace, err := c.requireFriendMessageTarget(ctx, userID, senderSpace.SpaceID, space.SpaceID)
	if err != nil {
		return nil, err
	}
	message, err := c.MessagesRepo.CreateMessage(ctx, repo.CreateSpaceMessageRecord{
		MessageID:                    req.MessageID,
		Kind:                         spaceMessageKindPostReply,
		SenderID:                     userID,
		SenderSpaceID:                senderSpace.SpaceID,
		RecipientID:                  recipientSpace.OwnerID,
		RecipientSpaceID:             recipientSpace.SpaceID,
		MessageCipher:                messageCipher,
		SenderEncryptedMessageKey:    senderEncryptedMessageKey,
		RecipientEncryptedMessageKey: recipientEncryptedMessageKey,
		ReplyPostID:                  sql.NullInt64{Int64: id, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	if c.EmailNotifier != nil {
		go c.EmailNotifier.OnSpacePostReplied(senderSpace.SpaceSlug, recipientSpace.OwnerID)
	}
	return toMessageResponse(*message), nil
}

func (c *MessagesController) List(ctx *gin.Context, req models.ListMessagesRequest) (*models.MessageConversationPage, error) {
	_, viewerSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	conversations, nextCursor, err := c.MessagesRepo.ListConversations(ctx, viewerSpace.SpaceID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	items := make([]models.MessageConversationResponse, 0, len(conversations))
	for _, conversation := range conversations {
		items = append(items, models.MessageConversationResponse{
			Friend:             toActorResponse(conversation.Friend, true),
			LatestActivity:     toMessageConversationActivityResponse(conversation.LatestActivity),
			Unread:             conversation.Unread,
			UnreadCount:        conversation.UnreadCount,
			NotificationUnread: conversation.NotificationUnread,
		})
	}
	return &models.MessageConversationPage{Items: items, NextCursor: nextCursor}, nil
}

func (c *MessagesController) ListThread(ctx *gin.Context, targetSpaceID string, req models.ListMessageThreadRequest) (*models.MessagePage, error) {
	userID, viewerSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(targetSpaceID) == "" {
		return nil, ente.NewBadRequestWithMessage("spaceId is required")
	}
	targetSpace, err := c.SpacesRepo.GetSpaceByID(ctx, strings.TrimSpace(targetSpaceID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.requireActiveSpaceOwner(ctx, targetSpace); err != nil {
		return nil, err
	}
	messages, nextCursor, err := c.MessagesRepo.ListThread(ctx, userID, viewerSpace.SpaceID, strings.TrimSpace(targetSpaceID), req.Cursor, req.Limit)
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
	userID, actorSpace, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil, ente.NewBadRequestWithMessage("messageId is required")
	}
	message, err := c.MessagesRepo.GetMessage(ctx, messageID, userID, actorSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	if message.IsDeleted {
		return nil, ente.NewBadRequestWithMessage("cannot like a deleted message")
	}
	if message.Kind == spaceMessageKindPostLike {
		return nil, ente.NewBadRequestWithMessage("cannot like a post like")
	}
	if message.RecipientSpaceID != actorSpace.SpaceID {
		return nil, ente.NewBadRequestWithMessage("only the recipient can like a message")
	}
	otherSpaceID := message.SenderSpaceID
	if _, err := c.FriendsRepo.GetShareForFriendAndSpace(ctx, userID, actorSpace.SpaceID, otherSpaceID); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	if err := c.MessagesRepo.SetLike(ctx, messageID, actorSpace.SpaceID, req.Like); err != nil {
		return nil, err
	}
	return &models.LikeMessageResponse{Liked: req.Like}, nil
}

func (c *MessagesController) Delete(ctx *gin.Context, messageID string, req models.DeleteMessageRequest) error {
	userID, senderSpace, err := selectedSpace(ctx)
	if err != nil {
		return err
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return ente.NewBadRequestWithMessage("messageId is required")
	}
	message, err := c.MessagesRepo.GetMessage(ctx, messageID, userID, senderSpace.SpaceID)
	if err != nil {
		return err
	}
	if message.SenderID != userID || message.SenderSpaceID != senderSpace.SpaceID {
		return ente.ErrPermissionDenied
	}
	if message.Kind == spaceMessageKindPostLike {
		return ente.NewBadRequestWithMessage("cannot delete a post like")
	}
	if _, err := c.FriendsRepo.GetShareForFriendAndSpace(ctx, userID, senderSpace.SpaceID, message.RecipientSpaceID); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.ErrPermissionDenied
		}
		return err
	}
	if message.IsDeleted {
		return nil
	}
	return c.MessagesRepo.DeleteMessage(ctx, messageID, userID, senderSpace.SpaceID)
}

func (c *MessagesController) requireFriendMessageTarget(ctx *gin.Context, userID int64, senderSpaceID string, targetSpaceID string) (*repo.SpaceRecord, error) {
	senderSpaceID = strings.TrimSpace(senderSpaceID)
	if senderSpaceID == "" {
		return nil, ente.NewBadRequestWithMessage("spaceId is required")
	}
	targetSpaceID = strings.TrimSpace(targetSpaceID)
	if targetSpaceID == "" {
		return nil, ente.NewBadRequestWithMessage("spaceId is required")
	}
	recipientSpace, err := c.SpacesRepo.GetSpaceByID(ctx, targetSpaceID)
	if err != nil {
		return nil, err
	}
	if recipientSpace.OwnerID == userID {
		return nil, ente.NewBadRequestWithMessage("cannot message your own space")
	}
	if _, err := c.FriendsRepo.GetShareForFriendAndSpace(ctx, userID, senderSpaceID, recipientSpace.SpaceID); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrPermissionDenied
		}
		return nil, err
	}
	return recipientSpace, nil
}

func (c *MessagesController) validateReplyMessage(ctx *gin.Context, userID int64, replyMessageID, senderSpaceID, recipientSpaceID string) (sql.NullString, error) {
	replyMessageID = strings.TrimSpace(replyMessageID)
	if replyMessageID == "" {
		return sql.NullString{}, nil
	}
	parent, err := c.MessagesRepo.GetMessage(ctx, replyMessageID, userID, senderSpaceID)
	if err != nil {
		return sql.NullString{}, err
	}
	if parent.IsDeleted {
		return sql.NullString{}, ente.NewBadRequestWithMessage("cannot reply to a deleted message")
	}
	if !sameMessageThread(parent, senderSpaceID, recipientSpaceID) {
		return sql.NullString{}, ente.ErrPermissionDenied
	}
	return sql.NullString{String: replyMessageID, Valid: true}, nil
}

func sameMessageThread(message *repo.SpaceMessageRecord, firstSpaceID, secondSpaceID string) bool {
	return (message.SenderSpaceID == firstSpaceID && message.RecipientSpaceID == secondSpaceID) ||
		(message.SenderSpaceID == secondSpaceID && message.RecipientSpaceID == firstSpaceID)
}

func decodeCreateMessageRequest(req models.CreateMessageRequest) ([]byte, []byte, []byte, error) {
	if strings.TrimSpace(req.MessageCipher) == "" ||
		strings.TrimSpace(req.SenderEncryptedMessageKey) == "" ||
		strings.TrimSpace(req.RecipientEncryptedMessageKey) == "" {
		return nil, nil, nil, ente.NewBadRequestWithMessage("messageCipher and encrypted message keys are required")
	}
	messageCipher, err := decodeEncodedSpaceField("messageCipher", req.MessageCipher, maxSpaceMessageCipherEncodedBytes, maxSpaceMessageCipherDecodedBytes)
	if err != nil {
		return nil, nil, nil, err
	}
	senderEncryptedMessageKey, err := decodeEncodedSpaceField("senderEncryptedMessageKey", req.SenderEncryptedMessageKey, maxSpaceMessageKeyEncodedBytes, maxSpaceMessageKeyDecodedBytes)
	if err != nil {
		return nil, nil, nil, err
	}
	recipientEncryptedMessageKey, err := decodeEncodedSpaceField("recipientEncryptedMessageKey", req.RecipientEncryptedMessageKey, maxSpaceMessageKeyEncodedBytes, maxSpaceMessageKeyDecodedBytes)
	if err != nil {
		return nil, nil, nil, err
	}
	return messageCipher, senderEncryptedMessageKey, recipientEncryptedMessageKey, nil
}

func toMessageResponse(message repo.SpaceMessageRecord) *models.MessageResponse {
	resp := &models.MessageResponse{
		MessageID:           message.MessageID,
		Kind:                message.Kind,
		Sender:              toActorResponse(message.Sender, true),
		Recipient:           toActorResponse(message.Recipient, true),
		MessageCipher:       encodeSpaceField(message.MessageCipher),
		EncryptedMessageKey: encodeSpaceField(message.EncryptedMessageKey),
		Text:                message.Text,
		Liked:               message.Liked,
		ViewerLiked:         message.ViewerLiked,
		IsDeleted:           message.IsDeleted,
		CreatedAt:           formatMicros(message.CreatedAt),
		UpdatedAt:           formatMicros(message.UpdatedAt),
	}
	if message.Quote != nil {
		resp.Quote = &models.MessageQuoteResponse{
			PostID:           message.Quote.PostID,
			SpaceID:          message.Quote.SpaceID,
			EncryptedPostKey: encodeSpaceField(message.Quote.EncryptedPostKey),
			CaptionCipher:    encodeSpaceField(message.Quote.CaptionCipher),
			KeyVersion:       message.Quote.KeyVersion,
		}
		if message.Quote.ObjectKey.Valid {
			resp.Quote.ObjectKey = message.Quote.ObjectKey.String
		}
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

func toMessageConversationActivityResponse(activity repo.SpaceMessageConversationActivityRecord) models.MessageConversationActivityResponse {
	resp := models.MessageConversationActivityResponse{
		ID:        activity.ID,
		Type:      activity.Type,
		CreatedAt: formatMicros(activity.CreatedAt),
		Outgoing:  activity.Outgoing,
	}
	if activity.Message != nil {
		resp.Message = toMessageResponse(*activity.Message)
	}
	if activity.Post != nil {
		resp.Post = &models.MessageConversationPostResponse{
			PostID:    activity.Post.PostID,
			SpaceID:   activity.Post.SpaceID,
			SpaceSlug: activity.Post.SpaceSlug,
			IsDeleted: activity.Post.IsDeleted,
		}
		if activity.Post.ObjectKey.Valid {
			resp.Post.Objects = []models.PostObjectPayload{
				toPostObjectPayload(repo.SpacePostAssetRecord{
					PostID:         activity.Post.PostID,
					ObjectKey:      activity.Post.ObjectKey.String,
					Size:           activity.Post.ObjectSize,
					Position:       int(activity.Post.ObjectPosition.Int64),
					MetadataCipher: activity.Post.ObjectMetadataCipher,
				}),
			}
		}
	}
	return resp
}
