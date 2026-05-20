package repo

import (
	"context"
	"database/sql"
	"strconv"
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/stretchr/testify/require"
)

func newSpaceTestModule(t *testing.T) *Module {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	return NewModule(db, nil)
}

func insertSpaceUser(t *testing.T, module *Module, email string, publicKey string) int64 {
	t.Helper()
	userID := testutil.InsertUser(t, module.Spaces.DB, testutil.UserFixture{
		Email:        email,
		CreationTime: timeutil.Microseconds(),
	})
	_, err := module.Spaces.DB.Exec(`
		INSERT INTO key_attributes (
			user_id, kek_salt, kek_hash_bytes, encrypted_key, key_decryption_nonce,
			public_key, encrypted_secret_key, secret_key_decryption_nonce
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, userID, "salt", []byte{1, 2, 3}, "encrypted-key", "nonce", publicKey, "encrypted-secret-key", "secret-nonce")
	require.NoError(t, err)
	return userID
}

func TestCreateSpaceRejectsReservedSlugs(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)
	userID := insertSpaceUser(t, module, "reserved@example.com", "reserved-public")

	for _, slug := range []string{"admin", " EnteCom ", "ente_com", "ente-com", "ente_gg", "ente-photos", "ente_space", "entegg", "enter", "images", "two-factor"} {
		_, err := module.Spaces.CreateSpace(ctx, userID, slug, "space-key", "profile")
		require.Error(t, err)
		require.Contains(t, err.Error(), "spaceSlug is reserved")
	}
}

func TestUpdateSlugRejectsReservedSlug(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)
	userID := insertSpaceUser(t, module, "rename@example.com", "rename-public")
	space, err := module.Spaces.CreateSpace(ctx, userID, "rename-user", "space-key", "profile")
	require.NoError(t, err)

	_, err = module.Spaces.UpdateSlug(ctx, userID, space.SpaceID, "support")
	require.Error(t, err)
	require.Contains(t, err.Error(), "spaceSlug is reserved")

	unchanged, err := module.Spaces.GetSpaceByID(ctx, space.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "rename-user", unchanged.SpaceSlug)
}

func TestSpaceMessagesThreadAndConversations(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-messages@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob-messages@example.com", "bob-public")

	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-messages", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-messages", "bob-space-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)

	message, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "cipher",
		SenderEncryptedMessageKey:    "sender-key",
		RecipientEncryptedMessageKey: "recipient-key",
	})
	require.NoError(t, err)
	require.Equal(t, "regular", message.Kind)
	require.Equal(t, "sender-key", message.EncryptedMessageKey)
	require.Equal(t, int64(0), message.Likes)
	require.False(t, message.ViewerLiked)

	require.NoError(t, module.Messages.SetLike(ctx, message.MessageID, aliceID, true))
	likedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, aliceID)
	require.NoError(t, err)
	require.Equal(t, int64(1), likedMessage.Likes)
	require.True(t, likedMessage.ViewerLiked)
	bobViewedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, bobID)
	require.NoError(t, err)
	require.Equal(t, int64(1), bobViewedMessage.Likes)
	require.False(t, bobViewedMessage.ViewerLiked)

	reply, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "reply-cipher",
		SenderEncryptedMessageKey:    "reply-sender-key",
		RecipientEncryptedMessageKey: "reply-recipient-key",
		ReplyMessageID:               sql.NullString{String: message.MessageID, Valid: true},
	})
	require.NoError(t, err)
	require.Equal(t, message.MessageID, reply.ReplyMessageID.String)
	setMessageCreatedAt(t, module, 1000, message.MessageID)
	setMessageCreatedAt(t, module, 2000, reply.MessageID)

	aliceThread, nextCursor, err := module.Messages.ListThread(ctx, aliceID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, aliceThread, 2)
	require.Equal(t, reply.MessageID, aliceThread[0].MessageID)
	require.Equal(t, message.MessageID, aliceThread[0].ReplyMessageID.String)
	require.Equal(t, "recipient-key", aliceThread[1].EncryptedMessageKey)
	require.Equal(t, bobSpace.SpaceID, aliceThread[1].Sender.SpaceID)

	conversations, nextCursor, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, conversations, 1)
	require.Equal(t, bobSpace.SpaceID, conversations[0].Friend.SpaceID)
	require.Equal(t, "message", conversations[0].LatestActivity.Type)
	require.Equal(t, reply.MessageID, conversations[0].LatestActivity.Message.MessageID)

	require.NoError(t, module.Messages.DeleteMessage(ctx, message.MessageID, bobID))
	deletedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, bobID)
	require.NoError(t, err)
	require.True(t, deletedMessage.IsDeleted)
	require.Empty(t, deletedMessage.MessageCipher)
	require.Empty(t, deletedMessage.EncryptedMessageKey)
	require.Equal(t, int64(0), deletedMessage.Likes)
	aliceThread, nextCursor, err = module.Messages.ListThread(ctx, aliceID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, aliceThread, 1)
	require.Equal(t, reply.MessageID, aliceThread[0].MessageID)
	require.Equal(t, message.MessageID, aliceThread[0].ReplyMessageID.String)

	_, err = module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "cipher",
		SenderEncryptedMessageKey:    "sender-key",
		RecipientEncryptedMessageKey: "recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: 1, Valid: true},
	})
	require.Error(t, err)
}

func TestSpaceMessageConversationsUseLatestActivity(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-activity@example.com", "alice-activity-public")
	bobID := insertSpaceUser(t, module, "bob-activity@example.com", "bob-activity-public")

	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-activity", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-activity", "bob-space-key", "bob-profile")
	require.NoError(t, err)

	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 1000, "friend_add", bobID, aliceID)

	conversations, nextCursor, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, conversations, 1)
	require.Equal(t, bobSpace.SpaceID, conversations[0].Friend.SpaceID)
	require.Equal(t, "friend_add", conversations[0].LatestActivity.Type)
	require.Nil(t, conversations[0].LatestActivity.Message)
	require.Nil(t, conversations[0].LatestActivity.Post)

	bobMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "bob-message-cipher",
		SenderEncryptedMessageKey:    "bob-message-sender-key",
		RecipientEncryptedMessageKey: "bob-message-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2000, bobMessage.MessageID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message", conversations[0].LatestActivity.Type)
	require.Equal(t, bobMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)

	aliceMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "alice-message-cipher",
		SenderEncryptedMessageKey:    "alice-message-sender-key",
		RecipientEncryptedMessageKey: "alice-message-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2500, aliceMessage.MessageID)
	require.NoError(t, module.Messages.SetLike(ctx, aliceMessage.MessageID, bobID, true))
	setMessageLikeCreatedAt(t, module, 3000, aliceMessage.MessageID, bobID)
	require.NoError(t, module.Messages.SetLike(ctx, bobMessage.MessageID, aliceID, true))
	setMessageLikeCreatedAt(t, module, 3500, bobMessage.MessageID, aliceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.Equal(t, aliceMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)

	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	_, err = module.Posts.DB.Exec(`
		INSERT INTO space_post_assets (post_id, object_key, bucket_id, width, height, media_type)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, postID, "activity-post-object", "bucket", 320, 240, "image/jpeg")
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, true))
	setPostLikeCreatedAt(t, module, 4000, postID, bobID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_like", conversations[0].LatestActivity.Type)
	require.NotNil(t, conversations[0].LatestActivity.Post)
	require.Equal(t, postID, conversations[0].LatestActivity.Post.PostID)
	require.Equal(t, "activity-post-object", conversations[0].LatestActivity.Post.ObjectKey.String)

	postReply, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "post-reply-cipher",
		SenderEncryptedMessageKey:    "post-reply-sender-key",
		RecipientEncryptedMessageKey: "post-reply-recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: postID, Valid: true},
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 5000, postReply.MessageID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_like_and_reply", conversations[0].LatestActivity.Type)
	require.NotNil(t, conversations[0].LatestActivity.Message)
	require.Equal(t, postReply.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, postID, conversations[0].LatestActivity.Post.PostID)

	replyOnlyPostID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "reply-only-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	replyOnly, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "reply-only-cipher",
		SenderEncryptedMessageKey:    "reply-only-sender-key",
		RecipientEncryptedMessageKey: "reply-only-recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: replyOnlyPostID, Valid: true},
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 5500, replyOnly.MessageID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_reply", conversations[0].LatestActivity.Type)
	require.NotNil(t, conversations[0].LatestActivity.Message)
	require.Equal(t, replyOnly.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, replyOnlyPostID, conversations[0].LatestActivity.Post.PostID)

	deletedReplyOnlyPostKeys, err := module.Posts.DeletePost(ctx, replyOnlyPostID, aliceID)
	require.NoError(t, err)
	require.Empty(t, deletedReplyOnlyPostKeys)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_reply", conversations[0].LatestActivity.Type)
	require.NotNil(t, conversations[0].LatestActivity.Message)
	require.Equal(t, replyOnly.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.NotNil(t, conversations[0].LatestActivity.Post)
	require.Equal(t, replyOnlyPostID, conversations[0].LatestActivity.Post.PostID)
	require.True(t, conversations[0].LatestActivity.Post.IsDeleted)
	require.False(t, conversations[0].LatestActivity.Post.ObjectKey.Valid)
	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(5500), latestActivityAt)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Friends.DeleteFriendship(ctx, bobID, aliceSpace.SpaceID))
	setFriendEventCreatedAt(t, module, 6000, "friend_remove", bobID, aliceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "friend_remove", conversations[0].LatestActivity.Type)
	require.Nil(t, conversations[0].LatestActivity.Message)
	require.Nil(t, conversations[0].LatestActivity.Post)
}

func TestSpaceMessageConversationPreviewPrioritizesUnreadIncomingMessage(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-preview-priority@example.com", "alice-preview-public")
	bobID := insertSpaceUser(t, module, "bob-preview-priority@example.com", "bob-preview-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-preview-priority", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-preview-priority", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 100, "friend_add", bobID, aliceID)

	aliceOldMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "alice-old-cipher",
		SenderEncryptedMessageKey:    "alice-old-sender-key",
		RecipientEncryptedMessageKey: "alice-old-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1000, aliceOldMessage.MessageID)
	bobNewMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "bob-new-cipher",
		SenderEncryptedMessageKey:    "bob-new-sender-key",
		RecipientEncryptedMessageKey: "bob-new-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2000, bobNewMessage.MessageID)
	require.NoError(t, module.Messages.SetLike(ctx, aliceOldMessage.MessageID, bobID, true))
	setMessageLikeCreatedAt(t, module, 3000, aliceOldMessage.MessageID, bobID)

	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.True(t, conversations[0].Unread)
	require.Equal(t, "message", conversations[0].LatestActivity.Type)
	require.Equal(t, bobNewMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, int64(3000), conversations[0].SortCreatedAt)

	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(3000), latestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, bobSpace.SpaceID, latestActivityAt))

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.False(t, conversations[0].Unread)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.Equal(t, aliceOldMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)
}

func TestSpaceModuleLifecycle(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")

	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	require.Equal(t, 1, aliceSpace.CurrentVersion)

	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)

	listedSpaces, err := module.Spaces.ListSpacesByOwner(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, listedSpaces, 1)

	err = module.Assets.AddTempObject(ctx, SpaceTempObjectRecord{
		ObjectKey:    "space/alice/avatar.jpg",
		OwnerID:      aliceID,
		SpaceID:      sql.NullString{String: aliceSpace.SpaceID, Valid: true},
		Purpose:      TempObjectPurposeAvatar,
		BucketID:     "b2-eu-cen",
		ExpectedSize: 111,
		ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
	})
	require.NoError(t, err)
	updatedSpace, err := module.Spaces.UpdateProfile(ctx, aliceID, aliceSpace.SpaceID, "alice-profile-v2", &struct {
		ObjectKey string
		BucketID  string
		Size      int64
	}{
		ObjectKey: "space/alice/avatar.jpg",
		BucketID:  "b2-eu-cen",
		Size:      111,
	}, false)
	require.NoError(t, err)
	require.Equal(t, "alice-profile-v2", updatedSpace.EncryptedProfile)
	require.Equal(t, "space/alice/avatar.jpg", updatedSpace.AvatarObjectKey.String)
	require.Equal(t, "b2-eu-cen", updatedSpace.AvatarBucketID.String)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, 2, rotatedSpace.CurrentVersion)

	versions, err := module.Spaces.ListVersions(ctx, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Len(t, versions, 2)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", rotatedSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)

	shares, err := module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Len(t, shares, 1)
	require.Equal(t, "alice-share-key", shares[0].EncryptedSpaceKey)

	aliceShares, err := module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, aliceShares, 1)
	require.Equal(t, "bob-share-key", aliceShares[0].EncryptedSpaceKey)

	friends, err := module.Friends.ListFriendsForSpace(ctx, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Len(t, friends, 1)
	require.Equal(t, "bob", friends[0].Friend.SpaceSlug)

	bobFriends, err := module.Friends.ListFriendsForSpace(ctx, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Len(t, bobFriends, 1)
	require.Equal(t, "alice", bobFriends[0].Friend.SpaceSlug)

	for _, tempObject := range []SpaceTempObjectRecord{
		{
			ObjectKey:    "space/alice/post1/full",
			OwnerID:      aliceID,
			Purpose:      TempObjectPurposePost,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 123,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "space/alice/post1/thumb",
			OwnerID:      aliceID,
			Purpose:      TempObjectPurposePost,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 45,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
	} {
		err = module.Assets.AddTempObject(ctx, tempObject)
		require.NoError(t, err)
	}
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", ptr("caption"), rotatedSpace.CurrentVersion, []SpacePostAssetRecord{
		{
			ObjectKey:      "space/alice/post1/full",
			BucketID:       "b2-eu-cen",
			Size:           sqlNullInt64(123),
			Position:       0,
			Variant:        nullString("full"),
			BlurHashCipher: sqlNullString(""),
		},
		{
			ObjectKey:      "space/alice/post1/thumb",
			BucketID:       "b2-eu-cen",
			Size:           sqlNullInt64(45),
			Position:       0,
			Variant:        nullString("thumbnail"),
			BlurHashCipher: sqlNullString("blurhash"),
		},
	})
	require.NoError(t, err)

	post, err := module.Posts.GetPost(ctx, postID, bobID)
	require.NoError(t, err)
	require.Equal(t, "alice", post.Author.SpaceSlug)

	err = module.Posts.SetLike(ctx, postID, bobID, true)
	require.NoError(t, err)

	assets, err := module.Posts.ListAssetsByPostIDs(ctx, []int64{postID})
	require.NoError(t, err)
	require.Len(t, assets[postID], 2)
	require.Equal(t, "b2-eu-cen", assets[postID][0].BucketID)

	ok, err := module.Assets.AssetBelongsToSpace(ctx, aliceSpace.SpaceID, "space/alice/post1/full")
	require.NoError(t, err)
	require.True(t, ok)

	bucketID, err := module.Assets.GetAssetBucketID(ctx, aliceSpace.SpaceID, "space/alice/post1/full")
	require.NoError(t, err)
	require.Equal(t, "b2-eu-cen", bucketID)

	bucketID, err = module.Assets.GetAssetBucketID(ctx, aliceSpace.SpaceID, "space/alice/avatar.jpg")
	require.NoError(t, err)
	require.Equal(t, "b2-eu-cen", bucketID)

	spaceForObject, err := module.Assets.GetSpaceForObjectKey(ctx, "space/alice/post1/full")
	require.NoError(t, err)
	require.Equal(t, aliceSpace.SpaceID, spaceForObject.SpaceID)

	tx, err := module.Assets.DB.BeginTx(ctx, nil)
	require.NoError(t, err)
	referenced, err := IsObjectReferencedTx(ctx, tx, "space/alice/post1/full")
	require.NoError(t, err)
	require.True(t, referenced)
	require.NoError(t, tx.Rollback())

	deletedKeys, err := module.Posts.DeletePost(ctx, postID, aliceID)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"space/alice/post1/full", "space/alice/post1/thumb"}, deletedKeys)
	requireQueuedTempObject(t, module, "space/alice/post1/full", TempObjectPurposePost, "b2-eu-cen")
	requireQueuedTempObject(t, module, "space/alice/post1/thumb", TempObjectPurposePost, "b2-eu-cen")
	var likeCount int
	err = module.Posts.DB.QueryRow(`SELECT COUNT(*) FROM space_post_likes WHERE post_id = $1`, postID).Scan(&likeCount)
	require.NoError(t, err)
	require.Zero(t, likeCount)

	deletedKeys, err = module.Posts.DeletePost(ctx, postID, aliceID)
	require.NoError(t, err)
	require.Empty(t, deletedKeys)

	_, err = module.Posts.GetPost(ctx, postID, bobID)
	require.Error(t, err)

	ok, err = module.Assets.AssetBelongsToSpace(ctx, aliceSpace.SpaceID, "space/alice/post1/full")
	require.NoError(t, err)
	require.False(t, ok)

	_, err = module.Assets.GetSpaceForObjectKey(ctx, "space/alice/post1/full")
	require.Error(t, err)

	tx, err = module.Assets.DB.BeginTx(ctx, nil)
	require.NoError(t, err)
	referenced, err = IsObjectReferencedTx(ctx, tx, "space/alice/post1/full")
	require.NoError(t, err)
	require.False(t, referenced)
	require.NoError(t, tx.Rollback())

	link, err := module.Links.UpsertLink(ctx, aliceSpace.SpaceID, []byte("hash"), rotatedSpace.CurrentVersion, "space-link-key", "owner-link-secret")
	require.NoError(t, err)
	require.Equal(t, "space-link-key", link.EncryptedSpaceKey)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)

	session, err := module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)
	require.Equal(t, aliceSpace.SpaceID, session.SpaceID)

	newLink, err := module.Links.RotateLink(ctx, aliceSpace.SpaceID, []byte("new-hash"), rotatedSpace.CurrentVersion, "new-space-link-key", "new-owner-link-secret")
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.Error(t, err)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), newLink.SpaceID, newLink.AuthKeyHash, newLink.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	err = module.Links.DeleteLink(ctx, aliceSpace.SpaceID)
	require.NoError(t, err)

	lookup, err := module.Spaces.GetSpaceBySlug(ctx, "alice")
	require.NoError(t, err)
	require.Equal(t, aliceSpace.SpaceID, lookup.SpaceID)

	_ = bobSpace
}

func TestUpdateProfileQueuesOldAvatarForCleanup(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	for _, rec := range []SpaceTempObjectRecord{
		{
			ObjectKey:    "space/alice/avatar-old",
			OwnerID:      aliceID,
			SpaceID:      sql.NullString{String: space.SpaceID, Valid: true},
			Purpose:      TempObjectPurposeAvatar,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 111,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "space/alice/avatar-new",
			OwnerID:      aliceID,
			SpaceID:      sql.NullString{String: space.SpaceID, Valid: true},
			Purpose:      TempObjectPurposeAvatar,
			BucketID:     "b2-us-west",
			ExpectedSize: 222,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
	} {
		require.NoError(t, module.Assets.AddTempObject(ctx, rec))
	}

	oldAvatar := &struct {
		ObjectKey string
		BucketID  string
		Size      int64
	}{ObjectKey: "space/alice/avatar-old", BucketID: "b2-eu-cen", Size: 111}
	_, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, "alice-profile-old-avatar", oldAvatar, false)
	require.NoError(t, err)

	newAvatar := &struct {
		ObjectKey string
		BucketID  string
		Size      int64
	}{ObjectKey: "space/alice/avatar-new", BucketID: "b2-us-west", Size: 222}
	updated, err := module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, "alice-profile-new-avatar", newAvatar, false)
	require.NoError(t, err)
	require.Equal(t, "space/alice/avatar-new", updated.AvatarObjectKey.String)
	requireQueuedTempObject(t, module, "space/alice/avatar-old", TempObjectPurposeAvatar, "b2-eu-cen")

	updated, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, "alice-profile-no-avatar", nil, true)
	require.NoError(t, err)
	require.False(t, updated.AvatarObjectKey.Valid)
	requireQueuedTempObject(t, module, "space/alice/avatar-new", TempObjectPurposeAvatar, "b2-us-west")
}

func TestAddFriendCreatesReciprocalSharesAndEvent(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)

	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "alice-share-key", share.EncryptedSpaceKey)
	require.Equal(t, aliceSpace.CurrentVersion, share.KeyVersion)

	reciprocalShare, err := module.Friends.GetShareForFriendAndSpace(ctx, aliceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "bob-share-key", reciprocalShare.EncryptedSpaceKey)
	require.Equal(t, bobSpace.CurrentVersion, reciprocalShare.KeyVersion)

	var eventCount int
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM space_friend_events WHERE event_type = 'friend_add' AND actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 1, eventCount)
}

func TestAddFriendIsIdempotentForExistingFriends(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key-v2", aliceSpace.CurrentVersion, "bob-share-key-v2", bobSpace.CurrentVersion)

	require.NoError(t, err)
	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "alice-share-key-v2", share.EncryptedSpaceKey)
	var eventCount int
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM space_friend_events WHERE event_type = 'friend_add' AND actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 1, eventCount)
}

func TestDeleteFriendshipRemovesReciprocalShares(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-delete-friend@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob-delete-friend@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-delete-friend", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-delete-friend", "bob-space-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion)
	require.NoError(t, err)

	aliceShares, err := module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, aliceShares, 1)
	bobShares, err := module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Len(t, bobShares, 1)

	err = module.Friends.DeleteFriendship(ctx, aliceID, bobSpace.SpaceID)
	require.NoError(t, err)

	aliceShares, err = module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Empty(t, aliceShares)
	bobShares, err = module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Empty(t, bobShares)
	aliceFriends, err := module.Friends.ListFriendsForSpace(ctx, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Empty(t, aliceFriends)
	bobFriends, err := module.Friends.ListFriendsForSpace(ctx, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Empty(t, bobFriends)
	relationship, err := module.Friends.GetRelationship(ctx, aliceID, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Empty(t, relationship)

	var removeEventCount int
	err = module.Friends.DB.QueryRow(`
		SELECT COUNT(*)
		FROM space_friend_events
		WHERE event_type = 'friend_remove'
		  AND actor_id = $1
		  AND actor_space_id = $2
		  AND target_id = $3
		  AND target_space_id = $4
	`, aliceID, aliceSpace.SpaceID, bobID, bobSpace.SpaceID).Scan(&removeEventCount)
	require.NoError(t, err)
	require.Equal(t, 1, removeEventCount)

	err = module.Friends.DeleteFriendship(ctx, aliceID, bobSpace.SpaceID)
	require.NoError(t, err)
	err = module.Friends.DB.QueryRow(`
		SELECT COUNT(*)
		FROM space_friend_events
		WHERE event_type = 'friend_remove'
		  AND actor_id = $1
		  AND target_id = $2
	`, aliceID, bobID).Scan(&removeEventCount)
	require.NoError(t, err)
	require.Equal(t, 1, removeEventCount)
}

func TestUpdateShareOnlyRefreshesExistingShares(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.UpsertShare(ctx, aliceSpace.SpaceID, bobID, "share-key-v1", aliceSpace.CurrentVersion)
	require.NoError(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	err = module.Friends.UpdateShare(ctx, aliceSpace.SpaceID, bobID, "share-key-v2", rotatedSpace.CurrentVersion)
	require.NoError(t, err)
	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v2", share.EncryptedSpaceKey)
	require.Equal(t, rotatedSpace.CurrentVersion, share.KeyVersion)

	err = module.Friends.DeleteShareBySpaceAndFriend(ctx, aliceSpace.SpaceID, bobID)
	require.NoError(t, err)
	err = module.Friends.UpdateShare(ctx, aliceSpace.SpaceID, bobID, "stale-share-key", rotatedSpace.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Friends.GetShareForFriendAndSpace(ctx, bobID, aliceSpace.SpaceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestCreatePostRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	postID, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-stale", nil, space.CurrentVersion, nil)
	require.Zero(t, postID)
	require.ErrorIs(t, err, sql.ErrNoRows)

	posts, next, err := module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, "", 20)
	require.NoError(t, err)
	require.Empty(t, next)
	require.Empty(t, posts)
}

func TestAddFriendRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	_, err = module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "stale-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Friends.GetShareForFriendAndSpace(ctx, bobID, aliceSpace.SpaceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
	_, err = module.Friends.GetShareForFriendAndSpace(ctx, aliceID, bobSpace.SpaceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestUpdateShareRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	err = module.Friends.UpsertShare(ctx, aliceSpace.SpaceID, bobID, "share-key-v1", aliceSpace.CurrentVersion)
	require.NoError(t, err)
	_, err = module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	err = module.Friends.UpdateShare(ctx, aliceSpace.SpaceID, bobID, "stale-share-key", aliceSpace.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v1", share.EncryptedSpaceKey)
	require.Equal(t, aliceSpace.CurrentVersion, share.KeyVersion)
}

func TestRotateKeyRevokesSpaceLinks(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	link, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("hash"), space.CurrentVersion, "space-link-key", "owner-link-secret")
	require.NoError(t, err)
	require.Equal(t, "space-link-key", link.EncryptedSpaceKey)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, 2, rotatedSpace.CurrentVersion)

	_, err = module.Links.GetLink(ctx, space.SpaceID)
	require.Error(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.Error(t, err)

	versions, err := module.Spaces.ListVersions(ctx, space.SpaceID)
	require.NoError(t, err)
	require.Len(t, versions, 2)
}

func TestGetVersionReturnsHistoricalProfile(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	rotated, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, "alice-space-key-v2", "wrapped-prev-key", ptr("alice-profile-v2"))
	require.NoError(t, err)
	require.Equal(t, 2, rotated.CurrentVersion)

	v1, err := module.Spaces.GetVersion(ctx, space.SpaceID, 1)
	require.NoError(t, err)
	require.Equal(t, 1, v1.Version)
	require.Equal(t, "alice-profile-v1", v1.EncryptedProfile)

	v2, err := module.Spaces.GetVersion(ctx, space.SpaceID, 2)
	require.NoError(t, err)
	require.Equal(t, 2, v2.Version)
	require.Equal(t, "alice-profile-v2", v2.EncryptedProfile)
}

func TestUpsertLinkReusesExistingLinkWithoutRevokingSessions(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	link, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("same-hash"), space.CurrentVersion, "space-link-key", "owner-link-secret")
	require.NoError(t, err)
	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)

	reused, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("same-hash"), space.CurrentVersion, "new-random-envelope", "new-owner-link-secret")
	require.NoError(t, err)
	require.Equal(t, link.AuthKeyHash, reused.AuthKeyHash)
	require.Equal(t, link.EncryptedSpaceKey, reused.EncryptedSpaceKey)
	require.Equal(t, link.EncryptedAccessKey, reused.EncryptedAccessKey)

	session, err := module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)
	require.Equal(t, link.AuthKeyHash, session.AuthKeyHash)
}

func TestUpsertLinkRejectsDifferentActiveLinkSecret(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	_, err = module.Links.UpsertLink(ctx, space.SpaceID, []byte("old-hash"), space.CurrentVersion, "old-space-link-key", "old-owner-link-secret")
	require.NoError(t, err)

	_, err = module.Links.UpsertLink(ctx, space.SpaceID, []byte("new-hash"), space.CurrentVersion, "new-space-link-key", "new-owner-link-secret")
	require.ErrorIs(t, err, ErrActiveLinkAlreadyExists)
}

func TestDeleteLinkTombstonesAuthHash(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	link, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("old-hash"), space.CurrentVersion, "old-space-link-key", "old-owner-link-secret")
	require.NoError(t, err)
	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)

	require.NoError(t, module.Links.DeleteLink(ctx, space.SpaceID))
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.Error(t, err)

	_, err = module.Links.UpsertLink(ctx, space.SpaceID, link.AuthKeyHash, space.CurrentVersion, "resurrected-space-link-key", "resurrected-owner-link-secret")
	require.ErrorIs(t, err, ErrLinkAuthKeyReused)

	freshLink, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("fresh-hash"), space.CurrentVersion, "fresh-space-link-key", "fresh-owner-link-secret")
	require.NoError(t, err)
	require.Equal(t, "fresh-space-link-key", freshLink.EncryptedSpaceKey)
}

func TestCreateSessionRejectsStaleLinkAuthHash(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	oldLink, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("old-hash"), space.CurrentVersion, "old-space-link-key", "old-owner-link-secret")
	require.NoError(t, err)
	newLink, err := module.Links.RotateLink(ctx, space.SpaceID, []byte("new-hash"), space.CurrentVersion, "new-space-link-key", "new-owner-link-secret")
	require.NoError(t, err)

	err = module.Links.CreateSession(ctx, []byte("stale-token"), oldLink.SpaceID, oldLink.AuthKeyHash, oldLink.KeyVersion, timeutil.NMinFromNow(30))
	require.Error(t, err)

	err = module.Links.CreateSession(ctx, []byte("fresh-token"), newLink.SpaceID, newLink.AuthKeyHash, newLink.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	session, err := module.Links.GetSession(ctx, []byte("fresh-token"))
	require.NoError(t, err)
	require.Equal(t, newLink.KeyVersion, session.KeyVersion)
	require.Equal(t, newLink.AuthKeyHash, session.AuthKeyHash)
}

func TestGetSessionRejectsStaleLinkMetadata(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	oldLink, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("old-hash"), space.CurrentVersion, "old-space-link-key", "old-owner-link-secret")
	require.NoError(t, err)
	_, err = module.Links.RotateLink(ctx, space.SpaceID, []byte("new-hash"), space.CurrentVersion, "new-space-link-key", "new-owner-link-secret")
	require.NoError(t, err)

	_, err = module.Links.DB.Exec(`
		INSERT INTO space_link_sessions (token_hash, space_id, owner_id, auth_key_hash, key_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, []byte("stale-auth-token"), oldLink.SpaceID, oldLink.OwnerID, oldLink.AuthKeyHash, oldLink.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("stale-auth-token"))
	require.Error(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	reusedHashLink, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("fresh-after-space-rotate"), rotatedSpace.CurrentVersion, "fresh-new-version-key", "fresh-owner-link-secret")
	require.NoError(t, err)
	_, err = module.Links.DB.Exec(`
		INSERT INTO space_link_sessions (token_hash, space_id, owner_id, auth_key_hash, key_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, []byte("stale-version-token"), reusedHashLink.SpaceID, reusedHashLink.OwnerID, reusedHashLink.AuthKeyHash, space.CurrentVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("stale-version-token"))
	require.Error(t, err)
}

func TestUpsertLinkRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, "alice-space-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, space.CurrentVersion+1, rotatedSpace.CurrentVersion)

	_, err = module.Links.UpsertLink(ctx, space.SpaceID, []byte("stale-hash"), space.CurrentVersion, "stale-space-link-key", "stale-owner-link-secret")
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Links.GetLink(ctx, space.SpaceID)
	require.Error(t, err)
}

func TestListPostsBySpacePaginates(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-1", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-2", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-3", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 1000, first, second, third)

	page, nextCursor, err := module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, "", 2)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, third, page[0].PostID)
	require.Equal(t, second, page[1].PostID)
	require.Equal(t, "1000:"+strconv.FormatInt(second, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, nextCursor, 2)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Empty(t, nextCursor)
}

func TestListPostsBySpaceCursorUsesCreatedAtSortOrder(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-1", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-2", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-3", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 3000, first)
	setPostCreatedAt(t, module, 2000, second)
	setPostCreatedAt(t, module, 1000, third)

	page, nextCursor, err := module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Equal(t, "3000:"+strconv.FormatInt(first, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, second, page[0].PostID)
	require.Equal(t, "2000:"+strconv.FormatInt(second, 10), nextCursor)
}

func TestListFeedCursorUsesCreatedAtSortOrder(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	charlieID := insertSpaceUser(t, module, "charlie@example.com", "charlie-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie", "charlie-space-key", "charlie-profile")
	require.NoError(t, err)
	err = module.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion)
	require.NoError(t, err)

	ownPost, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "own-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	unrelatedPost, err := module.Posts.CreatePost(ctx, charlieID, charlieSpace.SpaceID, "unrelated-post-key", nil, charlieSpace.CurrentVersion, nil)
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, bobID, bobSpace.SpaceID, "post-key-1", nil, bobSpace.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, bobID, bobSpace.SpaceID, "post-key-2", nil, bobSpace.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, bobID, bobSpace.SpaceID, "post-key-3", nil, bobSpace.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 5000, ownPost)
	setPostCreatedAt(t, module, 4000, unrelatedPost)
	setPostCreatedAt(t, module, 3000, first)
	setPostCreatedAt(t, module, 2000, second)
	setPostCreatedAt(t, module, 1000, third)

	page, nextCursor, err := module.Posts.ListFeed(ctx, aliceID, "", 1, 0, 0)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Equal(t, "3000:"+strconv.FormatInt(first, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListFeed(ctx, aliceID, nextCursor, 1, 0, 0)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, second, page[0].PostID)
	require.Equal(t, "2000:"+strconv.FormatInt(second, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListFeed(ctx, aliceID, nextCursor, 1, 0, 0)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, third, page[0].PostID)
	require.Empty(t, nextCursor)
}

func TestSpaceReadMarkersDriveUnreadState(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-unread@example.com", "alice-unread-public")
	bobID := insertSpaceUser(t, module, "bob-unread@example.com", "bob-unread-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-unread", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-unread", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 500, "friend_add", bobID, aliceID)

	postID, err := module.Posts.CreatePost(ctx, bobID, bobSpace.SpaceID, "post-key", nil, bobSpace.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 1000, postID)
	feed, _, err := module.Posts.ListFeed(ctx, aliceID, "", 10, 0, 0)
	require.NoError(t, err)
	require.Len(t, feed, 1)
	require.True(t, feed[0].ViewerUnread)
	feedUnread, err := module.Posts.HasUnreadFeed(ctx, aliceID, 0, 0)
	require.NoError(t, err)
	require.True(t, feedUnread)

	createdAt, markerPostID, err := module.Posts.GetFeedPostMarker(ctx, aliceID, postID)
	require.NoError(t, err)
	require.NoError(t, module.Read.UpsertFeedReadMarker(ctx, aliceID, createdAt, markerPostID))
	marker, err := module.Read.Get(ctx, aliceID)
	require.NoError(t, err)
	feed, _, err = module.Posts.ListFeed(ctx, aliceID, "", 10, marker.FeedReadCreatedAt, marker.FeedReadPostID)
	require.NoError(t, err)
	require.False(t, feed[0].ViewerUnread)
	feedUnread, err = module.Posts.HasUnreadFeed(ctx, aliceID, marker.FeedReadCreatedAt, marker.FeedReadPostID)
	require.NoError(t, err)
	require.False(t, feedUnread)

	incoming, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "incoming-cipher",
		SenderEncryptedMessageKey:    "incoming-sender-key",
		RecipientEncryptedMessageKey: "incoming-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2000, incoming.MessageID)
	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.True(t, conversations[0].Unread)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, bobSpace.SpaceID, 2000))
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.False(t, conversations[0].Unread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)

	outgoing, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "outgoing-cipher",
		SenderEncryptedMessageKey:    "outgoing-sender-key",
		RecipientEncryptedMessageKey: "outgoing-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 3000, outgoing.MessageID)
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, outgoing.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.False(t, conversations[0].Unread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestSpaceNotificationReadMarkersArePerFriend(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-per-friend-unread@example.com", "alice-per-friend-public")
	bobID := insertSpaceUser(t, module, "bob-per-friend-unread@example.com", "bob-per-friend-public")
	charlieID := insertSpaceUser(t, module, "charlie-per-friend-unread@example.com", "charlie-per-friend-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-per-friend-unread", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-per-friend-unread", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie-per-friend-unread", "charlie-space-key", "charlie-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-bob-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	require.NoError(t, module.Friends.AddFriend(ctx, charlieID, charlieSpace.SpaceID, aliceSpace.SpaceID, "alice-charlie-share-key", aliceSpace.CurrentVersion, "charlie-share-key", charlieSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 100, "friend_add", bobID, aliceID)
	setFriendEventCreatedAt(t, module, 200, "friend_add", charlieID, aliceID)

	bobMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "bob-cipher",
		SenderEncryptedMessageKey:    "bob-sender-key",
		RecipientEncryptedMessageKey: "bob-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1000, bobMessage.MessageID)
	aliceMessageToBob, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "alice-bob-cipher",
		SenderEncryptedMessageKey:    "alice-bob-sender-key",
		RecipientEncryptedMessageKey: "alice-bob-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1001, aliceMessageToBob.MessageID)
	require.NoError(t, module.Messages.SetLike(ctx, aliceMessageToBob.MessageID, bobID, true))
	setMessageLikeCreatedAt(t, module, 1002, aliceMessageToBob.MessageID, bobID)
	charlieMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     charlieID,
		SenderSpaceID:                charlieSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "charlie-cipher",
		SenderEncryptedMessageKey:    "charlie-sender-key",
		RecipientEncryptedMessageKey: "charlie-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2000, charlieMessage.MessageID)

	conversationBySpaceID := func(spaceID string) SpaceMessageConversationRecord {
		t.Helper()
		conversations, _, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
		require.NoError(t, err)
		for _, conversation := range conversations {
			if conversation.Friend.SpaceID == spaceID {
				return conversation
			}
		}
		require.FailNowf(t, "conversation not found", "spaceID=%s", spaceID)
		return SpaceMessageConversationRecord{}
	}

	require.True(t, conversationBySpaceID(bobSpace.SpaceID).Unread)
	require.True(t, conversationBySpaceID(charlieSpace.SpaceID).Unread)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	bobLatestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(1002), bobLatestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, bobSpace.SpaceID, bobLatestActivityAt))
	require.False(t, conversationBySpaceID(bobSpace.SpaceID).Unread)
	require.True(t, conversationBySpaceID(charlieSpace.SpaceID).Unread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, charlieSpace.SpaceID, 2000))
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestUnreadNotificationsFollowLatestConversationActivity(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-latest-unread@example.com", "alice-latest-unread-public")
	bobID := insertSpaceUser(t, module, "bob-latest-unread@example.com", "bob-latest-unread-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice-latest-unread", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob-latest-unread", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 100, "friend_add", bobID, aliceID)

	incoming, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "incoming-cipher",
		SenderEncryptedMessageKey:    "incoming-sender-key",
		RecipientEncryptedMessageKey: "incoming-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1000, incoming.MessageID)
	outgoing, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "outgoing-cipher",
		SenderEncryptedMessageKey:    "outgoing-sender-key",
		RecipientEncryptedMessageKey: "outgoing-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2000, outgoing.MessageID)

	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.Equal(t, outgoing.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.False(t, conversations[0].Unread)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestListPostLikersPaginates(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	charlieID := insertSpaceUser(t, module, "charlie@example.com", "charlie-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie", "charlie-space-key", "charlie-profile")
	require.NoError(t, err)
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, true))
	require.NoError(t, module.Posts.SetLike(ctx, postID, charlieID, true))
	setPostLikeCreatedAt(t, module, 3000, postID, bobID)
	setPostLikeCreatedAt(t, module, 2000, postID, charlieID)

	page, nextCursor, err := module.Posts.ListPostLikers(ctx, postID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, bobID, page[0].Actor.UserID)
	require.Equal(t, bobSpace.SpaceID, page[0].Actor.SpaceID)
	require.Equal(t, "3000:"+strconv.FormatInt(bobID, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostLikers(ctx, postID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, charlieID, page[0].Actor.UserID)
	require.Equal(t, charlieSpace.SpaceID, page[0].Actor.SpaceID)
	require.Empty(t, nextCursor)
}

func ptr(value string) *string {
	return &value
}

func sqlNullInt64(value int64) sql.NullInt64 {
	return sql.NullInt64{Int64: value, Valid: true}
}

func sqlNullString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
}

func requireQueuedTempObject(t *testing.T, module *Module, objectKey, purpose, bucketID string) {
	t.Helper()
	var gotPurpose, gotBucketID string
	var expired bool
	err := module.Assets.DB.QueryRow(`
		SELECT purpose, bucket_id, expires_at <= now_utc_micro_seconds()
		FROM space_temp_objects
		WHERE object_key = $1
	`, objectKey).Scan(&gotPurpose, &gotBucketID, &expired)
	require.NoError(t, err)
	require.Equal(t, purpose, gotPurpose)
	require.Equal(t, bucketID, gotBucketID)
	require.True(t, expired)
}

func setPostCreatedAt(t *testing.T, module *Module, createdAt int64, postIDs ...int64) {
	t.Helper()
	for _, postID := range postIDs {
		_, err := module.Posts.DB.Exec(`UPDATE space_posts SET created_at = $1 WHERE post_id = $2`, createdAt, postID)
		require.NoError(t, err)
	}
}

func setPostLikeCreatedAt(t *testing.T, module *Module, createdAt, postID, userID int64) {
	t.Helper()
	_, err := module.Posts.DB.Exec(`UPDATE space_post_likes SET created_at = $1 WHERE post_id = $2 AND user_id = $3`, createdAt, postID, userID)
	require.NoError(t, err)
}

func setFriendEventCreatedAt(t *testing.T, module *Module, createdAt int64, eventType string, actorID, targetID int64) {
	t.Helper()
	_, err := module.Friends.DB.Exec(`UPDATE space_friend_events SET created_at = $1 WHERE event_type = $2 AND actor_id = $3 AND target_id = $4`, createdAt, eventType, actorID, targetID)
	require.NoError(t, err)
}

func setMessageCreatedAt(t *testing.T, module *Module, createdAt int64, messageID string) {
	t.Helper()
	_, err := module.Messages.DB.Exec(`UPDATE space_messages SET created_at = $1 WHERE message_id = $2`, createdAt, messageID)
	require.NoError(t, err)
}

func setMessageLikeCreatedAt(t *testing.T, module *Module, createdAt int64, messageID string, userID int64) {
	t.Helper()
	_, err := module.Messages.DB.Exec(`UPDATE space_message_likes SET created_at = $1 WHERE message_id = $2 AND user_id = $3`, createdAt, messageID, userID)
	require.NoError(t, err)
}
