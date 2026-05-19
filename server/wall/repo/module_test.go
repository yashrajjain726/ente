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

func newWallTestModule(t *testing.T) *Module {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	return NewModule(db, nil)
}

func insertWallUser(t *testing.T, module *Module, email string, publicKey string) int64 {
	t.Helper()
	userID := testutil.InsertUser(t, module.Walls.DB, testutil.UserFixture{
		Email:        email,
		CreationTime: timeutil.Microseconds(),
	})
	_, err := module.Walls.DB.Exec(`
		INSERT INTO key_attributes (
			user_id, kek_salt, kek_hash_bytes, encrypted_key, key_decryption_nonce,
			public_key, encrypted_secret_key, secret_key_decryption_nonce
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, userID, "salt", []byte{1, 2, 3}, "encrypted-key", "nonce", publicKey, "encrypted-secret-key", "secret-nonce")
	require.NoError(t, err)
	return userID
}

func TestCreateWallRejectsReservedSlugs(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)
	userID := insertWallUser(t, module, "reserved@example.com", "reserved-public")

	for _, slug := range []string{"admin", " EnteCom ", "ente_com", "ente-com", "ente_gg", "ente-photos", "ente_social", "entegg", "enter", "images", "two-factor"} {
		_, err := module.Walls.CreateWall(ctx, userID, slug, "wall-key", "profile")
		require.Error(t, err)
		require.Contains(t, err.Error(), "wallSlug is reserved")
	}
}

func TestUpdateSlugRejectsReservedSlug(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)
	userID := insertWallUser(t, module, "rename@example.com", "rename-public")
	wall, err := module.Walls.CreateWall(ctx, userID, "rename-user", "wall-key", "profile")
	require.NoError(t, err)

	_, err = module.Walls.UpdateSlug(ctx, userID, wall.WallID, "support")
	require.Error(t, err)
	require.Contains(t, err.Error(), "wallSlug is reserved")

	unchanged, err := module.Walls.GetWallByID(ctx, wall.WallID)
	require.NoError(t, err)
	require.Equal(t, "rename-user", unchanged.WallSlug)
}

func TestWallMessagesThreadAndConversations(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice-messages@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob-messages@example.com", "bob-public")

	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice-messages", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob-messages", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion)
	require.NoError(t, err)

	message, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
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

	reply, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderWallID:                 aliceWall.WallID,
		RecipientID:                  bobID,
		RecipientWallID:              bobWall.WallID,
		MessageCipher:                "reply-cipher",
		SenderEncryptedMessageKey:    "reply-sender-key",
		RecipientEncryptedMessageKey: "reply-recipient-key",
		ReplyMessageID:               sql.NullString{String: message.MessageID, Valid: true},
	})
	require.NoError(t, err)
	require.Equal(t, message.MessageID, reply.ReplyMessageID.String)
	setMessageCreatedAt(t, module, 1000, message.MessageID)
	setMessageCreatedAt(t, module, 2000, reply.MessageID)

	aliceThread, nextCursor, err := module.Messages.ListThread(ctx, aliceID, bobWall.WallID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, aliceThread, 2)
	require.Equal(t, reply.MessageID, aliceThread[0].MessageID)
	require.Equal(t, message.MessageID, aliceThread[0].ReplyMessageID.String)
	require.Equal(t, "recipient-key", aliceThread[1].EncryptedMessageKey)
	require.Equal(t, bobWall.WallID, aliceThread[1].Sender.WallID)

	conversations, nextCursor, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, conversations, 1)
	require.Equal(t, bobWall.WallID, conversations[0].Friend.WallID)
	require.Equal(t, "message", conversations[0].LatestActivity.Type)
	require.Equal(t, reply.MessageID, conversations[0].LatestActivity.Message.MessageID)

	require.NoError(t, module.Messages.DeleteMessage(ctx, message.MessageID, bobID))
	deletedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, bobID)
	require.NoError(t, err)
	require.True(t, deletedMessage.IsDeleted)
	require.Empty(t, deletedMessage.MessageCipher)
	require.Empty(t, deletedMessage.EncryptedMessageKey)
	require.Equal(t, int64(0), deletedMessage.Likes)
	aliceThread, nextCursor, err = module.Messages.ListThread(ctx, aliceID, bobWall.WallID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, aliceThread, 1)
	require.Equal(t, reply.MessageID, aliceThread[0].MessageID)
	require.Equal(t, message.MessageID, aliceThread[0].ReplyMessageID.String)

	_, err = module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
		MessageCipher:                "cipher",
		SenderEncryptedMessageKey:    "sender-key",
		RecipientEncryptedMessageKey: "recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: 1, Valid: true},
	})
	require.Error(t, err)
}

func TestWallMessageConversationsUseLatestActivity(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice-activity@example.com", "alice-activity-public")
	bobID := insertWallUser(t, module, "bob-activity@example.com", "bob-activity-public")

	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice-activity", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob-activity", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion))
	setFriendEventCreatedAt(t, module, 1000, "friend_add", bobID, aliceID)

	conversations, nextCursor, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, conversations, 1)
	require.Equal(t, bobWall.WallID, conversations[0].Friend.WallID)
	require.Equal(t, "friend_add", conversations[0].LatestActivity.Type)
	require.Nil(t, conversations[0].LatestActivity.Message)
	require.Nil(t, conversations[0].LatestActivity.Post)

	bobMessage, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
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

	aliceMessage, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderWallID:                 aliceWall.WallID,
		RecipientID:                  bobID,
		RecipientWallID:              bobWall.WallID,
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

	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceWall.WallID, "post-key", nil, aliceWall.CurrentVersion, nil)
	require.NoError(t, err)
	_, err = module.Posts.DB.Exec(`
		INSERT INTO wall_post_assets (post_id, object_key, bucket_id, width, height, media_type)
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

	postReply, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
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

	replyOnlyPostID, err := module.Posts.CreatePost(ctx, aliceID, aliceWall.WallID, "reply-only-post-key", nil, aliceWall.CurrentVersion, nil)
	require.NoError(t, err)
	replyOnly, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
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
	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, bobWall.WallID)
	require.NoError(t, err)
	require.Equal(t, int64(5500), latestActivityAt)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Friends.DeleteFriendship(ctx, bobID, aliceWall.WallID))
	setFriendEventCreatedAt(t, module, 6000, "friend_remove", bobID, aliceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "friend_remove", conversations[0].LatestActivity.Type)
	require.Nil(t, conversations[0].LatestActivity.Message)
	require.Nil(t, conversations[0].LatestActivity.Post)
}

func TestWallModuleLifecycle(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")

	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	require.Equal(t, 1, aliceWall.CurrentVersion)

	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	listedWalls, err := module.Walls.ListWallsByOwner(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, listedWalls, 1)

	err = module.Assets.AddTempObject(ctx, WallTempObjectRecord{
		ObjectKey:    "wall/alice/avatar.jpg",
		OwnerID:      aliceID,
		WallID:       sql.NullString{String: aliceWall.WallID, Valid: true},
		Purpose:      TempObjectPurposeAvatar,
		BucketID:     "b2-eu-cen",
		ExpectedSize: 111,
		ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
	})
	require.NoError(t, err)
	updatedWall, err := module.Walls.UpdateProfile(ctx, aliceID, aliceWall.WallID, "alice-profile-v2", &struct {
		ObjectKey string
		BucketID  string
		Size      int64
	}{
		ObjectKey: "wall/alice/avatar.jpg",
		BucketID:  "b2-eu-cen",
		Size:      111,
	}, false)
	require.NoError(t, err)
	require.Equal(t, "alice-profile-v2", updatedWall.EncryptedProfile)
	require.Equal(t, "wall/alice/avatar.jpg", updatedWall.AvatarObjectKey.String)
	require.Equal(t, "b2-eu-cen", updatedWall.AvatarBucketID.String)

	rotatedWall, err := module.Walls.RotateKey(ctx, aliceID, aliceWall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, 2, rotatedWall.CurrentVersion)

	versions, err := module.Walls.ListVersions(ctx, aliceWall.WallID)
	require.NoError(t, err)
	require.Len(t, versions, 2)

	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", rotatedWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion)
	require.NoError(t, err)

	shares, err := module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Len(t, shares, 1)
	require.Equal(t, "alice-share-key", shares[0].EncryptedWallKey)

	aliceShares, err := module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, aliceShares, 1)
	require.Equal(t, "bob-share-key", aliceShares[0].EncryptedWallKey)

	friends, err := module.Friends.ListFriendsForWall(ctx, aliceWall.WallID)
	require.NoError(t, err)
	require.Len(t, friends, 1)
	require.Equal(t, "bob", friends[0].Friend.WallSlug)

	bobFriends, err := module.Friends.ListFriendsForWall(ctx, bobWall.WallID)
	require.NoError(t, err)
	require.Len(t, bobFriends, 1)
	require.Equal(t, "alice", bobFriends[0].Friend.WallSlug)

	for _, tempObject := range []WallTempObjectRecord{
		{
			ObjectKey:    "wall/alice/post1/full",
			OwnerID:      aliceID,
			Purpose:      TempObjectPurposePost,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 123,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "wall/alice/post1/thumb",
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
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceWall.WallID, "post-key", ptr("caption"), rotatedWall.CurrentVersion, []WallPostAssetRecord{
		{
			ObjectKey:      "wall/alice/post1/full",
			BucketID:       "b2-eu-cen",
			Size:           sqlNullInt64(123),
			Position:       0,
			Variant:        nullString("full"),
			BlurHashCipher: sqlNullString(""),
		},
		{
			ObjectKey:      "wall/alice/post1/thumb",
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
	require.Equal(t, "alice", post.Author.WallSlug)

	err = module.Posts.SetLike(ctx, postID, bobID, true)
	require.NoError(t, err)

	assets, err := module.Posts.ListAssetsByPostIDs(ctx, []int64{postID})
	require.NoError(t, err)
	require.Len(t, assets[postID], 2)
	require.Equal(t, "b2-eu-cen", assets[postID][0].BucketID)

	ok, err := module.Assets.AssetBelongsToWall(ctx, aliceWall.WallID, "wall/alice/post1/full")
	require.NoError(t, err)
	require.True(t, ok)

	bucketID, err := module.Assets.GetAssetBucketID(ctx, aliceWall.WallID, "wall/alice/post1/full")
	require.NoError(t, err)
	require.Equal(t, "b2-eu-cen", bucketID)

	bucketID, err = module.Assets.GetAssetBucketID(ctx, aliceWall.WallID, "wall/alice/avatar.jpg")
	require.NoError(t, err)
	require.Equal(t, "b2-eu-cen", bucketID)

	wallForObject, err := module.Assets.GetWallForObjectKey(ctx, "wall/alice/post1/full")
	require.NoError(t, err)
	require.Equal(t, aliceWall.WallID, wallForObject.WallID)

	tx, err := module.Assets.DB.BeginTx(ctx, nil)
	require.NoError(t, err)
	referenced, err := IsObjectReferencedTx(ctx, tx, "wall/alice/post1/full")
	require.NoError(t, err)
	require.True(t, referenced)
	require.NoError(t, tx.Rollback())

	deletedKeys, err := module.Posts.DeletePost(ctx, postID, aliceID)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"wall/alice/post1/full", "wall/alice/post1/thumb"}, deletedKeys)
	requireQueuedTempObject(t, module, "wall/alice/post1/full", TempObjectPurposePost, "b2-eu-cen")
	requireQueuedTempObject(t, module, "wall/alice/post1/thumb", TempObjectPurposePost, "b2-eu-cen")
	var likeCount int
	err = module.Posts.DB.QueryRow(`SELECT COUNT(*) FROM wall_post_likes WHERE post_id = $1`, postID).Scan(&likeCount)
	require.NoError(t, err)
	require.Zero(t, likeCount)

	deletedKeys, err = module.Posts.DeletePost(ctx, postID, aliceID)
	require.NoError(t, err)
	require.Empty(t, deletedKeys)

	_, err = module.Posts.GetPost(ctx, postID, bobID)
	require.Error(t, err)

	ok, err = module.Assets.AssetBelongsToWall(ctx, aliceWall.WallID, "wall/alice/post1/full")
	require.NoError(t, err)
	require.False(t, ok)

	_, err = module.Assets.GetWallForObjectKey(ctx, "wall/alice/post1/full")
	require.Error(t, err)

	tx, err = module.Assets.DB.BeginTx(ctx, nil)
	require.NoError(t, err)
	referenced, err = IsObjectReferencedTx(ctx, tx, "wall/alice/post1/full")
	require.NoError(t, err)
	require.False(t, referenced)
	require.NoError(t, tx.Rollback())

	link, err := module.Links.UpsertLink(ctx, aliceWall.WallID, []byte("hash"), rotatedWall.CurrentVersion, "wall-link-key")
	require.NoError(t, err)
	require.Equal(t, "wall-link-key", link.EncryptedWallKey)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.WallID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)

	session, err := module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)
	require.Equal(t, aliceWall.WallID, session.WallID)

	newLink, err := module.Links.UpsertLink(ctx, aliceWall.WallID, []byte("new-hash"), rotatedWall.CurrentVersion, "new-wall-link-key")
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.Error(t, err)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), newLink.WallID, newLink.AuthKeyHash, newLink.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	err = module.Links.DeleteLink(ctx, aliceWall.WallID)
	require.NoError(t, err)

	lookup, err := module.Walls.GetWallBySlug(ctx, "alice")
	require.NoError(t, err)
	require.Equal(t, aliceWall.WallID, lookup.WallID)

	_ = bobWall
}

func TestUpdateProfileQueuesOldAvatarForCleanup(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)

	for _, rec := range []WallTempObjectRecord{
		{
			ObjectKey:    "wall/alice/avatar-old",
			OwnerID:      aliceID,
			WallID:       sql.NullString{String: wall.WallID, Valid: true},
			Purpose:      TempObjectPurposeAvatar,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 111,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "wall/alice/avatar-new",
			OwnerID:      aliceID,
			WallID:       sql.NullString{String: wall.WallID, Valid: true},
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
	}{ObjectKey: "wall/alice/avatar-old", BucketID: "b2-eu-cen", Size: 111}
	_, err = module.Walls.UpdateProfile(ctx, aliceID, wall.WallID, "alice-profile-old-avatar", oldAvatar, false)
	require.NoError(t, err)

	newAvatar := &struct {
		ObjectKey string
		BucketID  string
		Size      int64
	}{ObjectKey: "wall/alice/avatar-new", BucketID: "b2-us-west", Size: 222}
	updated, err := module.Walls.UpdateProfile(ctx, aliceID, wall.WallID, "alice-profile-new-avatar", newAvatar, false)
	require.NoError(t, err)
	require.Equal(t, "wall/alice/avatar-new", updated.AvatarObjectKey.String)
	requireQueuedTempObject(t, module, "wall/alice/avatar-old", TempObjectPurposeAvatar, "b2-eu-cen")

	updated, err = module.Walls.UpdateProfile(ctx, aliceID, wall.WallID, "alice-profile-no-avatar", nil, true)
	require.NoError(t, err)
	require.False(t, updated.AvatarObjectKey.Valid)
	requireQueuedTempObject(t, module, "wall/alice/avatar-new", TempObjectPurposeAvatar, "b2-us-west")
}

func TestAddFriendCreatesReciprocalSharesAndEvent(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion)
	require.NoError(t, err)

	share, err := module.Friends.GetShareForFriendAndWall(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "alice-share-key", share.EncryptedWallKey)
	require.Equal(t, aliceWall.CurrentVersion, share.KeyVersion)

	reciprocalShare, err := module.Friends.GetShareForFriendAndWall(ctx, aliceID, bobWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "bob-share-key", reciprocalShare.EncryptedWallKey)
	require.Equal(t, bobWall.CurrentVersion, reciprocalShare.KeyVersion)

	var eventCount int
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM wall_friend_events WHERE event_type = 'friend_add' AND actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 1, eventCount)
}

func TestAddFriendIsIdempotentForExistingFriends(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion)
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key-v2", aliceWall.CurrentVersion, "bob-share-key-v2", bobWall.CurrentVersion)

	require.NoError(t, err)
	share, err := module.Friends.GetShareForFriendAndWall(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "alice-share-key-v2", share.EncryptedWallKey)
	var eventCount int
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM wall_friend_events WHERE event_type = 'friend_add' AND actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 1, eventCount)
}

func TestDeleteFriendshipRemovesReciprocalShares(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice-delete-friend@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob-delete-friend@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice-delete-friend", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob-delete-friend", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion)
	require.NoError(t, err)

	aliceShares, err := module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, aliceShares, 1)
	bobShares, err := module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Len(t, bobShares, 1)

	err = module.Friends.DeleteFriendship(ctx, aliceID, bobWall.WallID)
	require.NoError(t, err)

	aliceShares, err = module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Empty(t, aliceShares)
	bobShares, err = module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Empty(t, bobShares)
	aliceFriends, err := module.Friends.ListFriendsForWall(ctx, aliceWall.WallID)
	require.NoError(t, err)
	require.Empty(t, aliceFriends)
	bobFriends, err := module.Friends.ListFriendsForWall(ctx, bobWall.WallID)
	require.NoError(t, err)
	require.Empty(t, bobFriends)
	relationship, err := module.Friends.GetRelationship(ctx, aliceID, bobID, bobWall.WallID)
	require.NoError(t, err)
	require.Empty(t, relationship)

	var removeEventCount int
	err = module.Friends.DB.QueryRow(`
		SELECT COUNT(*)
		FROM wall_friend_events
		WHERE event_type = 'friend_remove'
		  AND actor_id = $1
		  AND actor_wall_id = $2
		  AND target_id = $3
		  AND target_wall_id = $4
	`, aliceID, aliceWall.WallID, bobID, bobWall.WallID).Scan(&removeEventCount)
	require.NoError(t, err)
	require.Equal(t, 1, removeEventCount)

	err = module.Friends.DeleteFriendship(ctx, aliceID, bobWall.WallID)
	require.NoError(t, err)
	err = module.Friends.DB.QueryRow(`
		SELECT COUNT(*)
		FROM wall_friend_events
		WHERE event_type = 'friend_remove'
		  AND actor_id = $1
		  AND target_id = $2
	`, aliceID, bobID).Scan(&removeEventCount)
	require.NoError(t, err)
	require.Equal(t, 1, removeEventCount)
}

func TestUpdateShareOnlyRefreshesExistingShares(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.UpsertShare(ctx, aliceWall.WallID, bobID, "share-key-v1", aliceWall.CurrentVersion)
	require.NoError(t, err)

	rotatedWall, err := module.Walls.RotateKey(ctx, aliceID, aliceWall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	err = module.Friends.UpdateShare(ctx, aliceWall.WallID, bobID, "share-key-v2", rotatedWall.CurrentVersion)
	require.NoError(t, err)
	share, err := module.Friends.GetShareForFriendAndWall(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v2", share.EncryptedWallKey)
	require.Equal(t, rotatedWall.CurrentVersion, share.KeyVersion)

	err = module.Friends.DeleteShareByWallAndFriend(ctx, aliceWall.WallID, bobID)
	require.NoError(t, err)
	err = module.Friends.UpdateShare(ctx, aliceWall.WallID, bobID, "stale-share-key", rotatedWall.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Friends.GetShareForFriendAndWall(ctx, bobID, aliceWall.WallID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestCreatePostRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Walls.RotateKey(ctx, aliceID, wall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	postID, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-stale", nil, wall.CurrentVersion, nil)
	require.Zero(t, postID)
	require.ErrorIs(t, err, sql.ErrNoRows)

	posts, next, err := module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, "", 20)
	require.NoError(t, err)
	require.Empty(t, next)
	require.Empty(t, posts)
}

func TestAddFriendRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	_, err = module.Walls.RotateKey(ctx, aliceID, aliceWall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "stale-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Friends.GetShareForFriendAndWall(ctx, bobID, aliceWall.WallID)
	require.ErrorIs(t, err, sql.ErrNoRows)
	_, err = module.Friends.GetShareForFriendAndWall(ctx, aliceID, bobWall.WallID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestUpdateShareRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	err = module.Friends.UpsertShare(ctx, aliceWall.WallID, bobID, "share-key-v1", aliceWall.CurrentVersion)
	require.NoError(t, err)
	_, err = module.Walls.RotateKey(ctx, aliceID, aliceWall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)

	err = module.Friends.UpdateShare(ctx, aliceWall.WallID, bobID, "stale-share-key", aliceWall.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	share, err := module.Friends.GetShareForFriendAndWall(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v1", share.EncryptedWallKey)
	require.Equal(t, aliceWall.CurrentVersion, share.KeyVersion)
}

func TestRotateKeyRevokesWallLinks(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)

	link, err := module.Links.UpsertLink(ctx, wall.WallID, []byte("hash"), wall.CurrentVersion, "wall-link-key")
	require.NoError(t, err)
	require.Equal(t, "wall-link-key", link.EncryptedWallKey)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.WallID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)

	rotatedWall, err := module.Walls.RotateKey(ctx, aliceID, wall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, 2, rotatedWall.CurrentVersion)

	_, err = module.Links.GetLink(ctx, wall.WallID)
	require.Error(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.Error(t, err)

	versions, err := module.Walls.ListVersions(ctx, wall.WallID)
	require.NoError(t, err)
	require.Len(t, versions, 2)
}

func TestGetVersionReturnsHistoricalProfile(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	rotated, err := module.Walls.RotateKey(ctx, aliceID, wall.WallID, "alice-wall-key-v2", "wrapped-prev-key", ptr("alice-profile-v2"))
	require.NoError(t, err)
	require.Equal(t, 2, rotated.CurrentVersion)

	v1, err := module.Walls.GetVersion(ctx, wall.WallID, 1)
	require.NoError(t, err)
	require.Equal(t, 1, v1.Version)
	require.Equal(t, "alice-profile-v1", v1.EncryptedProfile)

	v2, err := module.Walls.GetVersion(ctx, wall.WallID, 2)
	require.NoError(t, err)
	require.Equal(t, 2, v2.Version)
	require.Equal(t, "alice-profile-v2", v2.EncryptedProfile)
}

func TestUpsertLinkReusesExistingLinkWithoutRevokingSessions(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)

	link, err := module.Links.UpsertLink(ctx, wall.WallID, []byte("same-hash"), wall.CurrentVersion, "wall-link-key")
	require.NoError(t, err)
	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.WallID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)

	reused, err := module.Links.UpsertLink(ctx, wall.WallID, []byte("same-hash"), wall.CurrentVersion, "new-random-envelope")
	require.NoError(t, err)
	require.Equal(t, link.AuthKeyHash, reused.AuthKeyHash)
	require.Equal(t, link.EncryptedWallKey, reused.EncryptedWallKey)

	session, err := module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)
	require.Equal(t, link.AuthKeyHash, session.AuthKeyHash)
}

func TestCreateSessionRejectsStaleLinkAuthHash(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)

	oldLink, err := module.Links.UpsertLink(ctx, wall.WallID, []byte("old-hash"), wall.CurrentVersion, "old-wall-link-key")
	require.NoError(t, err)
	newLink, err := module.Links.UpsertLink(ctx, wall.WallID, []byte("new-hash"), wall.CurrentVersion, "new-wall-link-key")
	require.NoError(t, err)

	err = module.Links.CreateSession(ctx, []byte("stale-token"), oldLink.WallID, oldLink.AuthKeyHash, oldLink.KeyVersion, timeutil.NMinFromNow(30))
	require.Error(t, err)

	err = module.Links.CreateSession(ctx, []byte("fresh-token"), newLink.WallID, newLink.AuthKeyHash, newLink.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	session, err := module.Links.GetSession(ctx, []byte("fresh-token"))
	require.NoError(t, err)
	require.Equal(t, newLink.KeyVersion, session.KeyVersion)
	require.Equal(t, newLink.AuthKeyHash, session.AuthKeyHash)
}

func TestGetSessionRejectsStaleLinkMetadata(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)

	oldLink, err := module.Links.UpsertLink(ctx, wall.WallID, []byte("old-hash"), wall.CurrentVersion, "old-wall-link-key")
	require.NoError(t, err)
	_, err = module.Links.UpsertLink(ctx, wall.WallID, []byte("new-hash"), wall.CurrentVersion, "new-wall-link-key")
	require.NoError(t, err)

	_, err = module.Links.DB.Exec(`
		INSERT INTO wall_link_sessions (token_hash, wall_id, owner_id, auth_key_hash, key_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, []byte("stale-auth-token"), oldLink.WallID, oldLink.OwnerID, oldLink.AuthKeyHash, oldLink.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("stale-auth-token"))
	require.Error(t, err)

	rotatedWall, err := module.Walls.RotateKey(ctx, aliceID, wall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	reusedHashLink, err := module.Links.UpsertLink(ctx, wall.WallID, oldLink.AuthKeyHash, rotatedWall.CurrentVersion, "reused-hash-new-version-key")
	require.NoError(t, err)
	_, err = module.Links.DB.Exec(`
		INSERT INTO wall_link_sessions (token_hash, wall_id, owner_id, auth_key_hash, key_version, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, []byte("stale-version-token"), reusedHashLink.WallID, reusedHashLink.OwnerID, reusedHashLink.AuthKeyHash, wall.CurrentVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("stale-version-token"))
	require.Error(t, err)
}

func TestUpsertLinkRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)

	rotatedWall, err := module.Walls.RotateKey(ctx, aliceID, wall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, wall.CurrentVersion+1, rotatedWall.CurrentVersion)

	_, err = module.Links.UpsertLink(ctx, wall.WallID, []byte("stale-hash"), wall.CurrentVersion, "stale-wall-link-key")
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Links.GetLink(ctx, wall.WallID)
	require.Error(t, err)
}

func TestListPostsByWallPaginates(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-1", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-2", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-3", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 1000, first, second, third)

	page, nextCursor, err := module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, "", 2)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, third, page[0].PostID)
	require.Equal(t, second, page[1].PostID)
	require.Equal(t, "1000:"+strconv.FormatInt(second, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, nextCursor, 2)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Empty(t, nextCursor)
}

func TestListPostsByWallCursorUsesCreatedAtSortOrder(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-1", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-2", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-3", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 3000, first)
	setPostCreatedAt(t, module, 2000, second)
	setPostCreatedAt(t, module, 1000, third)

	page, nextCursor, err := module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Equal(t, "3000:"+strconv.FormatInt(first, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, second, page[0].PostID)
	require.Equal(t, "2000:"+strconv.FormatInt(second, 10), nextCursor)
}

func TestListFeedCursorUsesCreatedAtSortOrder(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	charlieID := insertWallUser(t, module, "charlie@example.com", "charlie-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	charlieWall, err := module.Walls.CreateWall(ctx, charlieID, "charlie", "charlie-wall-key", "charlie-profile")
	require.NoError(t, err)
	err = module.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion)
	require.NoError(t, err)

	ownPost, err := module.Posts.CreatePost(ctx, aliceID, aliceWall.WallID, "own-post-key", nil, aliceWall.CurrentVersion, nil)
	require.NoError(t, err)
	unrelatedPost, err := module.Posts.CreatePost(ctx, charlieID, charlieWall.WallID, "unrelated-post-key", nil, charlieWall.CurrentVersion, nil)
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, bobID, bobWall.WallID, "post-key-1", nil, bobWall.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, bobID, bobWall.WallID, "post-key-2", nil, bobWall.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, bobID, bobWall.WallID, "post-key-3", nil, bobWall.CurrentVersion, nil)
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

func TestWallReadMarkersDriveUnreadState(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice-unread@example.com", "alice-unread-public")
	bobID := insertWallUser(t, module, "bob-unread@example.com", "bob-unread-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice-unread", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob-unread", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion))
	setFriendEventCreatedAt(t, module, 500, "friend_add", bobID, aliceID)

	postID, err := module.Posts.CreatePost(ctx, bobID, bobWall.WallID, "post-key", nil, bobWall.CurrentVersion, nil)
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

	incoming, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
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

	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, bobWall.WallID, 2000))
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, "", 10)
	require.NoError(t, err)
	require.False(t, conversations[0].Unread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)

	outgoing, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderWallID:                 aliceWall.WallID,
		RecipientID:                  bobID,
		RecipientWallID:              bobWall.WallID,
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

func TestWallNotificationReadMarkersArePerFriend(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice-per-friend-unread@example.com", "alice-per-friend-public")
	bobID := insertWallUser(t, module, "bob-per-friend-unread@example.com", "bob-per-friend-public")
	charlieID := insertWallUser(t, module, "charlie-per-friend-unread@example.com", "charlie-per-friend-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice-per-friend-unread", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob-per-friend-unread", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	charlieWall, err := module.Walls.CreateWall(ctx, charlieID, "charlie-per-friend-unread", "charlie-wall-key", "charlie-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-bob-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion))
	require.NoError(t, module.Friends.AddFriend(ctx, charlieID, charlieWall.WallID, aliceWall.WallID, "alice-charlie-share-key", aliceWall.CurrentVersion, "charlie-share-key", charlieWall.CurrentVersion))
	setFriendEventCreatedAt(t, module, 100, "friend_add", bobID, aliceID)
	setFriendEventCreatedAt(t, module, 200, "friend_add", charlieID, aliceID)

	bobMessage, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
		MessageCipher:                "bob-cipher",
		SenderEncryptedMessageKey:    "bob-sender-key",
		RecipientEncryptedMessageKey: "bob-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1000, bobMessage.MessageID)
	aliceMessageToBob, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderWallID:                 aliceWall.WallID,
		RecipientID:                  bobID,
		RecipientWallID:              bobWall.WallID,
		MessageCipher:                "alice-bob-cipher",
		SenderEncryptedMessageKey:    "alice-bob-sender-key",
		RecipientEncryptedMessageKey: "alice-bob-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1001, aliceMessageToBob.MessageID)
	require.NoError(t, module.Messages.SetLike(ctx, aliceMessageToBob.MessageID, bobID, true))
	setMessageLikeCreatedAt(t, module, 1002, aliceMessageToBob.MessageID, bobID)
	charlieMessage, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     charlieID,
		SenderWallID:                 charlieWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
		MessageCipher:                "charlie-cipher",
		SenderEncryptedMessageKey:    "charlie-sender-key",
		RecipientEncryptedMessageKey: "charlie-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 2000, charlieMessage.MessageID)

	conversationByWallID := func(wallID string) WallMessageConversationRecord {
		t.Helper()
		conversations, _, err := module.Messages.ListConversations(ctx, aliceID, "", 10)
		require.NoError(t, err)
		for _, conversation := range conversations {
			if conversation.Friend.WallID == wallID {
				return conversation
			}
		}
		require.FailNowf(t, "conversation not found", "wallID=%s", wallID)
		return WallMessageConversationRecord{}
	}

	require.True(t, conversationByWallID(bobWall.WallID).Unread)
	require.True(t, conversationByWallID(charlieWall.WallID).Unread)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	bobLatestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, bobWall.WallID)
	require.NoError(t, err)
	require.Equal(t, int64(1002), bobLatestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, bobWall.WallID, bobLatestActivityAt))
	require.False(t, conversationByWallID(bobWall.WallID).Unread)
	require.True(t, conversationByWallID(charlieWall.WallID).Unread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, charlieWall.WallID, 2000))
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestUnreadNotificationsFollowLatestConversationActivity(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice-latest-unread@example.com", "alice-latest-unread-public")
	bobID := insertWallUser(t, module, "bob-latest-unread@example.com", "bob-latest-unread-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice-latest-unread", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob-latest-unread", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion))
	setFriendEventCreatedAt(t, module, 100, "friend_add", bobID, aliceID)

	incoming, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     bobID,
		SenderWallID:                 bobWall.WallID,
		RecipientID:                  aliceID,
		RecipientWallID:              aliceWall.WallID,
		MessageCipher:                "incoming-cipher",
		SenderEncryptedMessageKey:    "incoming-sender-key",
		RecipientEncryptedMessageKey: "incoming-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 1000, incoming.MessageID)
	outgoing, err := module.Messages.CreateMessage(ctx, CreateWallMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderWallID:                 aliceWall.WallID,
		RecipientID:                  bobID,
		RecipientWallID:              bobWall.WallID,
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
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	charlieID := insertWallUser(t, module, "charlie@example.com", "charlie-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	charlieWall, err := module.Walls.CreateWall(ctx, charlieID, "charlie", "charlie-wall-key", "charlie-profile")
	require.NoError(t, err)
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceWall.WallID, "post-key", nil, aliceWall.CurrentVersion, nil)
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, true))
	require.NoError(t, module.Posts.SetLike(ctx, postID, charlieID, true))
	setPostLikeCreatedAt(t, module, 3000, postID, bobID)
	setPostLikeCreatedAt(t, module, 2000, postID, charlieID)

	page, nextCursor, err := module.Posts.ListPostLikers(ctx, postID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, bobID, page[0].Actor.UserID)
	require.Equal(t, bobWall.WallID, page[0].Actor.WallID)
	require.Equal(t, "3000:"+strconv.FormatInt(bobID, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostLikers(ctx, postID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, charlieID, page[0].Actor.UserID)
	require.Equal(t, charlieWall.WallID, page[0].Actor.WallID)
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
		FROM wall_temp_objects
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
		_, err := module.Posts.DB.Exec(`UPDATE wall_posts SET created_at = $1 WHERE post_id = $2`, createdAt, postID)
		require.NoError(t, err)
	}
}

func setPostLikeCreatedAt(t *testing.T, module *Module, createdAt, postID, userID int64) {
	t.Helper()
	_, err := module.Posts.DB.Exec(`UPDATE wall_post_likes SET created_at = $1 WHERE post_id = $2 AND user_id = $3`, createdAt, postID, userID)
	require.NoError(t, err)
}

func setFriendEventCreatedAt(t *testing.T, module *Module, createdAt int64, eventType string, actorID, targetID int64) {
	t.Helper()
	_, err := module.Friends.DB.Exec(`UPDATE wall_friend_events SET created_at = $1 WHERE event_type = $2 AND actor_id = $3 AND target_id = $4`, createdAt, eventType, actorID, targetID)
	require.NoError(t, err)
}

func setMessageCreatedAt(t *testing.T, module *Module, createdAt int64, messageID string) {
	t.Helper()
	_, err := module.Messages.DB.Exec(`UPDATE wall_messages SET created_at = $1 WHERE message_id = $2`, createdAt, messageID)
	require.NoError(t, err)
}

func setMessageLikeCreatedAt(t *testing.T, module *Module, createdAt int64, messageID string, userID int64) {
	t.Helper()
	_, err := module.Messages.DB.Exec(`UPDATE wall_message_likes SET created_at = $1 WHERE message_id = $2 AND user_id = $3`, createdAt, messageID, userID)
	require.NoError(t, err)
}
