package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/internal/testutil"
	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupMessagesControllerTest(t *testing.T) (*MessagesController, *wallrepo.Module, context.Context) {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	gin.SetMode(gin.TestMode)
	repos := wallrepo.NewModule(db, nil)
	return NewModule(repos, nil).Messages, repos, context.Background()
}

func TestMessageReplyValidation(t *testing.T) {
	controller, repos, ctx := setupMessagesControllerTest(t)
	aliceID, aliceWall := createMessageControllerUserAndWall(t, repos, "alice-reply-validation", "alice-public")
	bobID, bobWall := createMessageControllerUserAndWall(t, repos, "bob-reply-validation", "bob-public")
	charlieID, charlieWall := createMessageControllerUserAndWall(t, repos, "charlie-reply-validation", "charlie-public")
	require.NoError(t, repos.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion))
	require.NoError(t, repos.Friends.AddFriend(ctx, charlieID, charlieWall.WallID, aliceWall.WallID, "alice-charlie-share-key", aliceWall.CurrentVersion, "charlie-share-key", charlieWall.CurrentVersion))

	bobMessage := createRepoMessage(t, repos, bobID, bobWall.WallID, aliceID, aliceWall.WallID, "")
	charlieMessage := createRepoMessage(t, repos, charlieID, charlieWall.WallID, aliceID, aliceWall.WallID, "")

	_, err := controller.Create(newWallControllerContext(aliceID), bobWall.WallID, models.CreateMessageRequest{
		MessageCipher:                "reply-cipher",
		SenderEncryptedMessageKey:    "reply-sender-key",
		RecipientEncryptedMessageKey: "reply-recipient-key",
		ReplyMessageID:               charlieMessage.MessageID,
	})
	require.Error(t, err)

	reply, err := controller.Create(newWallControllerContext(aliceID), bobWall.WallID, models.CreateMessageRequest{
		MessageCipher:                "reply-cipher",
		SenderEncryptedMessageKey:    "reply-sender-key",
		RecipientEncryptedMessageKey: "reply-recipient-key",
		ReplyMessageID:               bobMessage.MessageID,
	})
	require.NoError(t, err)
	require.NotNil(t, reply.ReplyMessageID)
	require.Equal(t, bobMessage.MessageID, *reply.ReplyMessageID)

	require.NoError(t, repos.Messages.DeleteMessage(ctx, bobMessage.MessageID, bobID))
	_, err = controller.Create(newWallControllerContext(aliceID), bobWall.WallID, models.CreateMessageRequest{
		MessageCipher:                "reply-after-delete-cipher",
		SenderEncryptedMessageKey:    "reply-after-delete-sender-key",
		RecipientEncryptedMessageKey: "reply-after-delete-recipient-key",
		ReplyMessageID:               bobMessage.MessageID,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot reply to a deleted message")
}

func TestMessageLikeAndDeleteAccess(t *testing.T) {
	controller, repos, ctx := setupMessagesControllerTest(t)
	aliceID, aliceWall := createMessageControllerUserAndWall(t, repos, "alice-message-actions", "alice-actions-public")
	bobID, bobWall := createMessageControllerUserAndWall(t, repos, "bob-message-actions", "bob-actions-public")
	require.NoError(t, repos.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion))
	message := createRepoMessage(t, repos, bobID, bobWall.WallID, aliceID, aliceWall.WallID, "")

	liked, err := controller.ToggleLike(newWallControllerContext(aliceID), message.MessageID, models.LikeMessageRequest{Like: true})
	require.NoError(t, err)
	require.True(t, liked.Liked)
	viewed, err := repos.Messages.GetMessage(ctx, message.MessageID, aliceID)
	require.NoError(t, err)
	require.Equal(t, int64(1), viewed.Likes)
	require.True(t, viewed.ViewerLiked)

	require.NoError(t, repos.Friends.DeleteFriendship(ctx, aliceID, bobWall.WallID))
	_, err = controller.ToggleLike(newWallControllerContext(aliceID), message.MessageID, models.LikeMessageRequest{Like: false})
	require.True(t, errors.Is(err, ente.ErrPermissionDenied))
	thread, _, err := repos.Messages.ListThread(ctx, aliceID, bobWall.WallID, "", 10)
	require.NoError(t, err)
	require.Len(t, thread, 1)

	require.Error(t, controller.Delete(newWallControllerContext(aliceID), message.MessageID))
	require.NoError(t, controller.Delete(newWallControllerContext(bobID), message.MessageID))
	_, err = controller.ToggleLike(newWallControllerContext(aliceID), message.MessageID, models.LikeMessageRequest{Like: true})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot like a deleted message")
}

func createMessageControllerUserAndWall(t *testing.T, repos *wallrepo.Module, slug string, publicKey string) (int64, *wallrepo.WallRecord) {
	t.Helper()
	userID := insertWallControllerUser(t, repos, slug+"@example.com", publicKey)
	wall, err := repos.Walls.CreateWall(context.Background(), userID, slug, slug+"-wall-key", slug+"-profile")
	require.NoError(t, err)
	return userID, wall
}

func createRepoMessage(t *testing.T, repos *wallrepo.Module, senderID int64, senderWallID string, recipientID int64, recipientWallID string, replyMessageID string) *wallrepo.WallMessageRecord {
	t.Helper()
	input := wallrepo.CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     senderID,
		SenderWallID:                 senderWallID,
		RecipientID:                  recipientID,
		RecipientWallID:              recipientWallID,
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
