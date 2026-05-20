package controller

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/internal/testutil"
	"github.com/ente-io/museum/space/models"
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupMessagesControllerTest(t *testing.T) (*MessagesController, *spacerepo.Module, context.Context) {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	gin.SetMode(gin.TestMode)
	repos := spacerepo.NewModule(db, nil)
	return NewModule(repos, nil).Messages, repos, context.Background()
}

func TestMessageReplyValidation(t *testing.T) {
	controller, repos, ctx := setupMessagesControllerTest(t)
	aliceID, aliceSpace := createMessageControllerUserAndSpace(t, repos, "alice-reply-validation", "alice-public")
	bobID, bobSpace := createMessageControllerUserAndSpace(t, repos, "bob-reply-validation", "bob-public")
	charlieID, charlieSpace := createMessageControllerUserAndSpace(t, repos, "charlie-reply-validation", "charlie-public")
	require.NoError(t, repos.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	require.NoError(t, repos.Friends.AddFriend(ctx, charlieID, charlieSpace.SpaceID, aliceSpace.SpaceID, "alice-charlie-share-key", aliceSpace.CurrentVersion, "charlie-share-key", charlieSpace.CurrentVersion))

	bobMessage := createRepoMessage(t, repos, bobID, bobSpace.SpaceID, aliceID, aliceSpace.SpaceID, "")
	charlieMessage := createRepoMessage(t, repos, charlieID, charlieSpace.SpaceID, aliceID, aliceSpace.SpaceID, "")

	_, err := controller.Create(newSpaceControllerContext(aliceID), bobSpace.SpaceID, models.CreateMessageRequest{
		MessageCipher:                spaceTestB64("reply-cipher"),
		SenderEncryptedMessageKey:    spaceTestB64("reply-sender-key"),
		RecipientEncryptedMessageKey: spaceTestB64("reply-recipient-key"),
		ReplyMessageID:               charlieMessage.MessageID,
	})
	require.Error(t, err)

	reply, err := controller.Create(newSpaceControllerContext(aliceID), bobSpace.SpaceID, models.CreateMessageRequest{
		MessageCipher:                spaceTestB64("reply-cipher"),
		SenderEncryptedMessageKey:    spaceTestB64("reply-sender-key"),
		RecipientEncryptedMessageKey: spaceTestB64("reply-recipient-key"),
		ReplyMessageID:               bobMessage.MessageID,
	})
	require.NoError(t, err)
	require.NotNil(t, reply.ReplyMessageID)
	require.Equal(t, bobMessage.MessageID, *reply.ReplyMessageID)

	require.NoError(t, repos.Messages.DeleteMessage(ctx, bobMessage.MessageID, bobID))
	_, err = controller.Create(newSpaceControllerContext(aliceID), bobSpace.SpaceID, models.CreateMessageRequest{
		MessageCipher:                spaceTestB64("reply-after-delete-cipher"),
		SenderEncryptedMessageKey:    spaceTestB64("reply-after-delete-sender-key"),
		RecipientEncryptedMessageKey: spaceTestB64("reply-after-delete-recipient-key"),
		ReplyMessageID:               bobMessage.MessageID,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot reply to a deleted message")
}

func TestMessageLikeAndDeleteAccess(t *testing.T) {
	controller, repos, ctx := setupMessagesControllerTest(t)
	aliceID, aliceSpace := createMessageControllerUserAndSpace(t, repos, "alice-message-actions", "alice-actions-public")
	bobID, bobSpace := createMessageControllerUserAndSpace(t, repos, "bob-message-actions", "bob-actions-public")
	require.NoError(t, repos.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	message := createRepoMessage(t, repos, bobID, bobSpace.SpaceID, aliceID, aliceSpace.SpaceID, "")
	messageToDelete := createRepoMessage(t, repos, bobID, bobSpace.SpaceID, aliceID, aliceSpace.SpaceID, "")

	liked, err := controller.ToggleLike(newSpaceControllerContext(aliceID), message.MessageID, models.LikeMessageRequest{Like: true})
	require.NoError(t, err)
	require.True(t, liked.Liked)
	viewed, err := repos.Messages.GetMessage(ctx, message.MessageID, aliceID)
	require.NoError(t, err)
	require.Equal(t, int64(1), viewed.Likes)
	require.True(t, viewed.ViewerLiked)

	require.NoError(t, controller.Delete(newSpaceControllerContext(bobID), messageToDelete.MessageID))
	_, err = controller.ToggleLike(newSpaceControllerContext(aliceID), messageToDelete.MessageID, models.LikeMessageRequest{Like: true})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot like a deleted message")

	require.NoError(t, repos.Friends.DeleteFriendship(ctx, aliceID, bobSpace.SpaceID))
	_, err = controller.ToggleLike(newSpaceControllerContext(aliceID), message.MessageID, models.LikeMessageRequest{Like: false})
	require.True(t, errors.Is(err, ente.ErrPermissionDenied))
	thread, _, err := repos.Messages.ListThread(ctx, aliceID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, thread, 1)

	require.Error(t, controller.Delete(newSpaceControllerContext(aliceID), message.MessageID))
	err = controller.Delete(newSpaceControllerContext(bobID), message.MessageID)
	require.True(t, errors.Is(err, ente.ErrPermissionDenied))
}

func TestValidateCreateMessageRequestLimits(t *testing.T) {
	valid := models.CreateMessageRequest{
		MessageCipher:                spaceTestB64("cipher"),
		SenderEncryptedMessageKey:    spaceTestB64("sender-key"),
		RecipientEncryptedMessageKey: spaceTestB64("recipient-key"),
	}
	require.NoError(t, validateCreateMessageRequest(valid))

	invalidBase64 := valid
	invalidBase64.MessageCipher = "not-base64"
	require.Error(t, validateCreateMessageRequest(invalidBase64))

	tooLargeCipher := valid
	tooLargeCipher.MessageCipher = base64.StdEncoding.EncodeToString(make([]byte, maxSpaceMessageCipherDecodedBytes+1))
	err := validateCreateMessageRequest(tooLargeCipher)
	require.Error(t, err)
	require.Contains(t, err.Error(), "messageCipher is too large")

	tooLargeKey := valid
	tooLargeKey.SenderEncryptedMessageKey = base64.StdEncoding.EncodeToString(make([]byte, maxSpaceMessageKeyDecodedBytes+1))
	err = validateCreateMessageRequest(tooLargeKey)
	require.Error(t, err)
	require.Contains(t, err.Error(), "senderEncryptedMessageKey is too large")
}

func createMessageControllerUserAndSpace(t *testing.T, repos *spacerepo.Module, slug string, publicKey string) (int64, *spacerepo.SpaceRecord) {
	t.Helper()
	userID := insertSpaceControllerUser(t, repos, slug+"@example.com", publicKey)
	space, err := repos.Spaces.CreateSpace(context.Background(), userID, slug, slug+"-space-key", slug+"-profile")
	require.NoError(t, err)
	return userID, space
}

func createRepoMessage(t *testing.T, repos *spacerepo.Module, senderID int64, senderSpaceID string, recipientID int64, recipientSpaceID string, replyMessageID string) *spacerepo.SpaceMessageRecord {
	t.Helper()
	input := spacerepo.CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     senderID,
		SenderSpaceID:                senderSpaceID,
		RecipientID:                  recipientID,
		RecipientSpaceID:             recipientSpaceID,
		MessageCipher:                "cipher",
		SenderEncryptedMessageKey:    "sender-key",
		RecipientEncryptedMessageKey: "recipient-key",
	}
	if replyMessageID != "" {
		input.ReplyMessageID.Valid = true
		input.ReplyMessageID.String = replyMessageID
	}
	message, err := repos.Messages.CreateMessage(context.Background(), input)
	require.NoError(t, err)
	return message
}

func spaceTestB64(value string) string {
	return base64.StdEncoding.EncodeToString([]byte(value))
}
