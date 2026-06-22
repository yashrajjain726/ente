package repo

import (
	"context"
	"crypto/sha256"
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

func countSpaceRows(t *testing.T, module *Module, query string, args ...any) int64 {
	t.Helper()
	var count int64
	err := module.Spaces.DB.QueryRow(query, args...).Scan(&count)
	require.NoError(t, err)
	return count
}

func TestGetBrowserSession(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)
	userID := insertSpaceUser(t, module, "browser-session@example.com", "browser-session-public")
	tokenHash := sha256.Sum256([]byte("browser-session-token"))
	expiresAt := timeutil.NDaysFromNow(1)

	err := module.Sessions.CreateBrowserSession(ctx, tokenHash[:], userID, "client-key", expiresAt)
	require.NoError(t, err)

	session, err := module.Sessions.GetBrowserSession(ctx, tokenHash[:])
	require.NoError(t, err)
	require.Equal(t, userID, session.UserID)
	require.Equal(t, "client-key", session.ClientKey)
	require.Equal(t, expiresAt, session.ExpiresAt)
}

func TestCreateSpaceRejectsReservedSlugs(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)
	userID := insertSpaceUser(t, module, "reserved@example.com", "reserved-public")

	for _, slug := range []string{"admin", " EnteCom ", "ente_com", "ente-com", "ente_gg", "ente-photos", "ente_space", "entegg", "enter", "images", "two-factor"} {
		_, err := module.Spaces.CreateSpace(ctx, userID, slug, "space-key", slug+"-public", slug+"-secret", slug+"-secret-nonce", "profile")
		require.Error(t, err)
		require.Contains(t, err.Error(), "spaceSlug is reserved")
	}
}

func TestUpdateSlugRejectsReservedSlug(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)
	userID := insertSpaceUser(t, module, "rename@example.com", "rename-public")
	space, err := module.Spaces.CreateSpace(ctx, userID, "rename_user", "space-key", "rename-user-public", "rename-user-secret", "rename-user-secret-nonce", "profile")
	require.NoError(t, err)

	_, err = module.Spaces.UpdateSlug(ctx, userID, space.SpaceID, "support")
	require.Error(t, err)
	require.Contains(t, err.Error(), "spaceSlug is reserved")

	unchanged, err := module.Spaces.GetSpaceByID(ctx, space.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "rename_user", unchanged.SpaceSlug)
}

func TestSpaceAccountDeletionResetUserAccess(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-reset-space@example.com", "alice-reset-public")
	bobID := insertSpaceUser(t, module, "bob-reset-space@example.com", "bob-reset-public")
	charlieID := insertSpaceUser(t, module, "charlie-reset-space@example.com", "charlie-reset-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_reset_space", "alice-space-key", "alice-reset-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_reset_space", "bob-space-key", "bob-reset-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie_reset_space", "charlie-space-key", "charlie-reset-public", "charlie-secret", "charlie-secret-nonce", "charlie-profile")
	require.NoError(t, err)

	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	pendingRequest, created, err := module.Friends.CreateFriendRequest(ctx, aliceID, aliceSpace.SpaceID, charlieSpace.SpaceID, "alice-charlie-share-key", aliceSpace.CurrentVersion)
	require.NoError(t, err)
	require.True(t, created)
	_, err = module.Links.UpsertLink(ctx, aliceSpace.SpaceID, []byte("alice-auth-hash"), aliceSpace.CurrentVersion, "alice-link-space-key", "alice-link-access-key")
	require.NoError(t, err)
	require.NoError(t, module.Links.CreateSession(ctx, []byte("alice-link-token"), aliceSpace.SpaceID, []byte("alice-auth-hash"), aliceSpace.CurrentVersion, timeutil.NDaysFromNow(1)))
	require.NoError(t, module.Sessions.CreateBrowserSession(ctx, []byte("alice-browser-token"), aliceID, "client-key", timeutil.NDaysFromNow(1)))

	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "alice-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, bobSpace.SpaceID, true))
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
	require.NoError(t, module.Messages.SetLike(ctx, message.MessageID, aliceID, aliceSpace.SpaceID, true))
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, timeutil.Microseconds()))

	require.NoError(t, module.ResetUserAccess(ctx, aliceID))

	require.Equal(t, int64(1), countSpaceRows(t, module, `SELECT COUNT(*) FROM spaces WHERE owner_id = $1`, aliceID))
	require.Equal(t, int64(1), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_posts WHERE owner_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_browser_sessions WHERE user_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_link_sessions WHERE space_id = $1`, aliceSpace.SpaceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_friend_shares WHERE space_id = $1 OR friend_space_id = $1 OR friend_id = $2`, aliceSpace.SpaceID, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_friend_requests WHERE requester_id = $1 OR target_id = $1 OR requester_space_id = $2 OR target_space_id = $2`, aliceID, aliceSpace.SpaceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_friend_events WHERE actor_space_id = $1 OR target_space_id = $1 OR actor_id = $2 OR target_id = $2`, aliceSpace.SpaceID, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_notification_read_markers WHERE viewer_space_id = $1 OR friend_space_id = $1 OR user_id = $2`, aliceSpace.SpaceID, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_post_likes WHERE post_id = $1`, postID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_message_likes WHERE message_id = $1`, message.MessageID))
	_, _, err = module.Friends.ConfirmFriendRequest(ctx, charlieID, charlieSpace.SpaceID, pendingRequest.RequestID, "charlie-share-key", charlieSpace.CurrentVersion)
	require.Error(t, err)
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_friend_shares WHERE (space_id = $1 AND friend_space_id = $2) OR (space_id = $2 AND friend_space_id = $1)`, aliceSpace.SpaceID, charlieSpace.SpaceID))

	var active bool
	require.NoError(t, module.Links.DB.QueryRow(`SELECT active FROM space_links WHERE space_id = $1`, aliceSpace.SpaceID).Scan(&active))
	require.False(t, active)
}

func TestSpaceAccountDeletionDeleteUserData(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-delete-space@example.com", "alice-delete-public")
	bobID := insertSpaceUser(t, module, "bob-delete-space@example.com", "bob-delete-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_delete_space", "alice-space-key", "alice-delete-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_delete_space", "bob-space-key", "bob-delete-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)

	_, err = module.Spaces.DB.Exec(`
		UPDATE spaces
		SET avatar_object_key = $2,
		    avatar_bucket_id = $3,
		    avatar_size = 11,
		    cover_object_key = $4,
		    cover_bucket_id = $5,
		    cover_size = 22
		WHERE space_id = $1
	`, aliceSpace.SpaceID, "space/alice/avatar", "hot", "space/alice/cover", "cold")
	require.NoError(t, err)
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "alice-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	_, err = module.Posts.DB.Exec(`
		INSERT INTO space_post_assets (post_id, object_key, bucket_id, size, position, metadata_cipher)
		VALUES ($1, $2, $3, 33, 0, $4)
	`, postID, "space/alice/post-asset", "hot", "metadata")
	require.NoError(t, err)
	require.NoError(t, module.Assets.AddTempObject(ctx, SpaceTempObjectRecord{
		ObjectKey:    "space/alice/staged-upload",
		OwnerID:      aliceID,
		SpaceID:      sql.NullString{String: aliceSpace.SpaceID, Valid: true},
		Purpose:      TempObjectPurposePost,
		BucketID:     "hot",
		ExpectedSize: 44,
		ExpiresAt:    timeutil.NDaysFromNow(1),
	}))
	require.NoError(t, module.EntityKeys.CreateKey(ctx, aliceID, "primary", "encrypted-key", "header"))
	require.NoError(t, module.Sessions.CreateBrowserSession(ctx, []byte("alice-delete-browser-token"), aliceID, "client-key", timeutil.NDaysFromNow(1)))
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	_, err = module.Links.UpsertLink(ctx, aliceSpace.SpaceID, []byte("alice-delete-auth-hash"), aliceSpace.CurrentVersion, "alice-link-space-key", "alice-link-access-key")
	require.NoError(t, err)
	require.NoError(t, module.Links.CreateSession(ctx, []byte("alice-delete-link-token"), aliceSpace.SpaceID, []byte("alice-delete-auth-hash"), aliceSpace.CurrentVersion, timeutil.NDaysFromNow(1)))
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
	require.NoError(t, module.Messages.SetLike(ctx, message.MessageID, aliceID, aliceSpace.SpaceID, true))
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, bobSpace.SpaceID, true))
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, timeutil.Microseconds()))

	require.NoError(t, module.DeleteUserData(ctx, aliceID))

	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM spaces WHERE owner_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_posts WHERE owner_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_post_assets WHERE object_key = $1`, "space/alice/post-asset"))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_messages WHERE sender_id = $1 OR recipient_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_entity_keys WHERE user_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_browser_sessions WHERE user_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_link_sessions WHERE owner_id = $1`, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_links WHERE space_id = $1`, aliceSpace.SpaceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_friend_shares WHERE space_id = $1 OR friend_space_id = $1 OR friend_id = $2`, aliceSpace.SpaceID, aliceID))
	require.Equal(t, int64(0), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_notification_read_markers WHERE viewer_space_id = $1 OR friend_space_id = $1 OR user_id = $2`, aliceSpace.SpaceID, aliceID))

	for _, objectKey := range []string{"space/alice/avatar", "space/alice/cover", "space/alice/post-asset", "space/alice/staged-upload"} {
		require.Equal(t, int64(1), countSpaceRows(t, module, `SELECT COUNT(*) FROM space_temp_objects WHERE object_key = $1 AND owner_id = $2 AND space_id IS NULL AND cleanup_after <= now_utc_micro_seconds()`, objectKey, aliceID))
	}
}

func TestSpaceMessagesThreadAndConversations(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-messages@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob-messages@example.com", "bob-public")

	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_messages", "alice-space-key", "alice-messages-public", "alice-messages-secret", "alice-messages-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_messages", "bob-space-key", "bob-messages-public", "bob-messages-secret", "bob-messages-secret-nonce", "bob-profile")
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

	require.NoError(t, module.Messages.SetLike(ctx, message.MessageID, aliceID, aliceSpace.SpaceID, true))
	likedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(1), likedMessage.Likes)
	require.True(t, likedMessage.ViewerLiked)
	bobViewedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, bobID, bobSpace.SpaceID)
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

	aliceThread, nextCursor, err := module.Messages.ListThread(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, aliceThread, 2)
	require.Equal(t, reply.MessageID, aliceThread[0].MessageID)
	require.Equal(t, message.MessageID, aliceThread[0].ReplyMessageID.String)
	require.Equal(t, "recipient-key", aliceThread[1].EncryptedMessageKey)
	require.Equal(t, bobSpace.SpaceID, aliceThread[1].Sender.SpaceID)

	conversations, nextCursor, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Empty(t, nextCursor)
	require.Len(t, conversations, 1)
	require.Equal(t, bobSpace.SpaceID, conversations[0].Friend.SpaceID)
	require.Equal(t, "message", conversations[0].LatestActivity.Type)
	require.Equal(t, reply.MessageID, conversations[0].LatestActivity.Message.MessageID)

	require.NoError(t, module.Messages.DeleteMessage(ctx, message.MessageID, bobID, bobSpace.SpaceID))
	deletedMessage, err := module.Messages.GetMessage(ctx, message.MessageID, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, deletedMessage.IsDeleted)
	require.Empty(t, deletedMessage.MessageCipher)
	require.Empty(t, deletedMessage.EncryptedMessageKey)
	require.Equal(t, int64(0), deletedMessage.Likes)
	aliceThread, nextCursor, err = module.Messages.ListThread(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "", 10)
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

	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_activity", "alice-space-key", "alice-activity-public", "alice-activity-secret", "alice-activity-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_activity", "bob-space-key", "bob-activity-public", "bob-activity-secret", "bob-activity-secret-nonce", "bob-profile")
	require.NoError(t, err)

	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 1000, "friend_add", bobID, aliceID)

	conversations, nextCursor, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
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

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
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
	require.NoError(t, module.Messages.SetLike(ctx, aliceMessage.MessageID, bobID, bobSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 3000, aliceMessage.MessageID, bobSpace.SpaceID)
	require.NoError(t, module.Messages.SetLike(ctx, bobMessage.MessageID, aliceID, aliceSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 3500, bobMessage.MessageID, aliceSpace.SpaceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.True(t, conversations[0].LatestActivity.Outgoing)
	require.Equal(t, bobMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)

	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	_, err = module.Posts.DB.Exec(`
			INSERT INTO space_post_assets (post_id, object_key, bucket_id, metadata_cipher)
			VALUES ($1, $2, $3, $4)
		`, postID, "activity-post-object", "bucket", "metadata")
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, bobSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 4000, postID, bobSpace.SpaceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
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

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_reply", conversations[0].LatestActivity.Type)
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

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_reply", conversations[0].LatestActivity.Type)
	require.NotNil(t, conversations[0].LatestActivity.Message)
	require.Equal(t, replyOnly.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, replyOnlyPostID, conversations[0].LatestActivity.Post.PostID)

	deletedReplyOnlyPostKeys, err := module.Posts.DeletePost(ctx, replyOnlyPostID, aliceID)
	require.NoError(t, err)
	require.Empty(t, deletedReplyOnlyPostKeys)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_reply", conversations[0].LatestActivity.Type)
	require.NotNil(t, conversations[0].LatestActivity.Message)
	require.Equal(t, replyOnly.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.NotNil(t, conversations[0].LatestActivity.Post)
	require.Equal(t, replyOnlyPostID, conversations[0].LatestActivity.Post.PostID)
	require.True(t, conversations[0].LatestActivity.Post.IsDeleted)
	require.False(t, conversations[0].LatestActivity.Post.ObjectKey.Valid)
	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(5500), latestActivityAt)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Friends.DeleteFriendship(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID))
	setFriendEventCreatedAt(t, module, 6000, "friend_remove", bobID, aliceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "friend_remove", conversations[0].LatestActivity.Type)
	require.Nil(t, conversations[0].LatestActivity.Message)
	require.Nil(t, conversations[0].LatestActivity.Post)
}

func TestSpaceFriendEventsCreateConversationForBothSides(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-friend-events@example.com", "alice-friend-events-public")
	bobID := insertSpaceUser(t, module, "bob-friend-events@example.com", "bob-friend-events-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_friend_events", "alice-space-key", "alice-friend-events-public", "alice-friend-events-secret", "alice-friend-events-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_friend_events", "bob-space-key", "bob-friend-events-public", "bob-friend-events-secret", "bob-friend-events-secret-nonce", "bob-profile")
	require.NoError(t, err)

	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 1000, "friend_add", bobID, aliceID)

	aliceConversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, aliceConversations, 1)
	require.Equal(t, bobSpace.SpaceID, aliceConversations[0].Friend.SpaceID)
	require.Equal(t, "friend_add", aliceConversations[0].LatestActivity.Type)
	require.False(t, aliceConversations[0].LatestActivity.Outgoing)
	require.False(t, aliceConversations[0].Unread)
	require.True(t, aliceConversations[0].NotificationUnread)

	bobConversations, _, err := module.Messages.ListConversations(ctx, bobID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, bobConversations, 1)
	require.Equal(t, aliceSpace.SpaceID, bobConversations[0].Friend.SpaceID)
	require.Equal(t, "friend_add", bobConversations[0].LatestActivity.Type)
	require.True(t, bobConversations[0].LatestActivity.Outgoing)
	require.False(t, bobConversations[0].Unread)
	require.False(t, bobConversations[0].NotificationUnread)

	aliceUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, aliceUnread)
	bobUnread, err := module.Messages.HasUnreadNotifications(ctx, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, bobUnread)
	bobLatestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(1000), bobLatestActivityAt)

	require.NoError(t, module.Friends.DeleteFriendship(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID))
	setFriendEventCreatedAt(t, module, 2000, "friend_remove", bobID, aliceID)

	aliceConversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, aliceConversations, 1)
	require.Equal(t, "friend_remove", aliceConversations[0].LatestActivity.Type)
	require.False(t, aliceConversations[0].LatestActivity.Outgoing)
	require.False(t, aliceConversations[0].Unread)
	require.True(t, aliceConversations[0].NotificationUnread)

	bobConversations, _, err = module.Messages.ListConversations(ctx, bobID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, bobConversations, 1)
	require.Equal(t, "friend_remove", bobConversations[0].LatestActivity.Type)
	require.True(t, bobConversations[0].LatestActivity.Outgoing)
	require.False(t, bobConversations[0].Unread)
	require.False(t, bobConversations[0].NotificationUnread)
	bobLatestActivityAt, err = module.Messages.GetLatestConversationActivityAt(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(2000), bobLatestActivityAt)
}

func TestConfirmFriendRequestCreatesFriendshipAndNotifiesRequester(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-confirm-request@example.com", "alice-confirm-request-public")
	bobID := insertSpaceUser(t, module, "bob-confirm-request@example.com", "bob-confirm-request-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_confirm_request", "alice-space-key", "alice-confirm-request-public", "alice-confirm-secret", "alice-confirm-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_confirm_request", "bob-space-key", "bob-confirm-request-public", "bob-confirm-secret", "bob-confirm-secret-nonce", "bob-profile")
	require.NoError(t, err)

	request, created, err := module.Friends.CreateFriendRequest(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)
	require.True(t, created)
	_, created, err = module.Friends.CreateFriendRequest(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "alice-pending-share-key", aliceSpace.CurrentVersion)
	require.NoError(t, err)
	require.True(t, created)
	aliceUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, aliceUnread)

	requesterID, created, err := module.Friends.ConfirmFriendRequest(ctx, aliceID, aliceSpace.SpaceID, request.RequestID, "alice-share-key", aliceSpace.CurrentVersion)
	require.NoError(t, err)
	require.True(t, created)
	require.Equal(t, bobID, requesterID)

	aliceShare, err := module.Friends.GetShareForFriendAndSpace(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "bob-share-key", aliceShare.EncryptedSpaceKey)
	bobShare, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "alice-share-key", bobShare.EncryptedSpaceKey)
	requests, err := module.Friends.ListFriendRequestsForSpace(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Empty(t, requests)
	aliceUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, aliceUnread)
	bobRequests, err := module.Friends.ListFriendRequestsForSpace(ctx, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Empty(t, bobRequests)
	bobUnread, err := module.Messages.HasUnreadNotifications(ctx, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, bobUnread)
}

func TestDeleteFriendRequestClearsUnread(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-delete-request@example.com", "alice-delete-request-public")
	bobID := insertSpaceUser(t, module, "bob-delete-request@example.com", "bob-delete-request-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_delete_request", "alice-space-key", "alice-delete-request-public", "alice-delete-secret", "alice-delete-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_delete_request", "bob-space-key", "bob-delete-request-public", "bob-delete-secret", "bob-delete-secret-nonce", "bob-profile")
	require.NoError(t, err)

	request, created, err := module.Friends.CreateFriendRequest(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)
	require.True(t, created)
	aliceUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, aliceUnread)

	require.NoError(t, module.Friends.DeleteFriendRequest(ctx, aliceID, request.RequestID))
	aliceUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, aliceUnread)
	requests, err := module.Friends.ListFriendRequestsForSpace(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Empty(t, requests)
}

func TestFriendRequestConversationSupersedesPreviousFriendEvent(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-request-conversation@example.com", "alice-request-conversation-public")
	bobID := insertSpaceUser(t, module, "bob-request-conversation@example.com", "bob-request-conversation-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_request_conversation", "alice-space-key", "alice-request-conversation-public", "alice-request-secret", "alice-request-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_request_conversation", "bob-space-key", "bob-request-conversation-public", "bob-request-secret", "bob-request-secret-nonce", "bob-profile")
	require.NoError(t, err)

	require.NoError(t, module.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 500, "friend_add", aliceID, bobID)
	require.NoError(t, module.Friends.DeleteFriendship(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID))
	setFriendEventCreatedAt(t, module, 1000, "friend_remove", aliceID, bobID)
	request, created, err := module.Friends.CreateFriendRequest(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "bob-share-key-v2", bobSpace.CurrentVersion)
	require.NoError(t, err)
	require.True(t, created)
	setFriendRequestCreatedAt(t, module, 2000, request.RequestID)

	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.Equal(t, bobSpace.SpaceID, conversations[0].Friend.SpaceID)
	require.Empty(t, conversations[0].Friend.EncryptedProfile)
	require.False(t, conversations[0].Friend.AvatarObjectKey.Valid)
	require.False(t, conversations[0].Friend.Friends.Valid)
	require.False(t, conversations[0].Friend.Posts.Valid)
	require.Equal(t, "friend_request", conversations[0].LatestActivity.Type)
	require.Equal(t, "friend_request:"+strconv.FormatInt(request.RequestID, 10), conversations[0].LatestActivity.ID)
	require.False(t, conversations[0].LatestActivity.Outgoing)
	require.Nil(t, conversations[0].LatestActivity.Message)
	require.Nil(t, conversations[0].LatestActivity.Post)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(1), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)

	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(2000), latestActivityAt)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Friends.DeleteFriendRequest(ctx, aliceID, request.RequestID))
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.Equal(t, "friend_remove", conversations[0].LatestActivity.Type)
	require.Equal(t, int64(1000), conversations[0].LatestActivity.CreatedAt)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestSpaceMessageConversationPreviewUsesLatestActivityWithSeparateUnreadState(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-preview-priority@example.com", "alice-preview-public")
	bobID := insertSpaceUser(t, module, "bob-preview-priority@example.com", "bob-preview-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_preview_priority", "alice-space-key", "alice-preview-priority-public", "alice-preview-priority-secret", "alice-preview-priority-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_preview_priority", "bob-space-key", "bob-preview-priority-public", "bob-preview-priority-secret", "bob-preview-priority-secret-nonce", "bob-profile")
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
	require.NoError(t, module.Messages.SetLike(ctx, aliceOldMessage.MessageID, bobID, bobSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 3000, aliceOldMessage.MessageID, bobSpace.SpaceID)

	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.True(t, conversations[0].Unread)
	require.True(t, conversations[0].NotificationUnread)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.Equal(t, aliceOldMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, int64(3000), conversations[0].SortCreatedAt)

	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(3000), latestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, latestActivityAt))

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.False(t, conversations[0].Unread)
	require.False(t, conversations[0].NotificationUnread)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.Equal(t, aliceOldMessage.MessageID, conversations[0].LatestActivity.Message.MessageID)
}

func TestPostLikeUnreadCountSuppression(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-post-like-unread@example.com", "alice-post-like-unread-public")
	bobID := insertSpaceUser(t, module, "bob-post-like-unread@example.com", "bob-post-like-unread-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_post_like_unread", "alice-space-key", "alice-post-like-unread-public", "alice-post-like-unread-secret", "alice-post-like-unread-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_post_like_unread", "bob-space-key", "bob-post-like-unread-public", "bob-post-like-unread-secret", "bob-post-like-unread-secret-nonce", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 100, "friend_add", bobID, aliceID)

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
	setMessageCreatedAt(t, module, 1000, aliceMessage.MessageID)

	firstPostID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "first-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	secondPostID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "second-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	thirdPostID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "third-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	require.NoError(t, module.Posts.SetLike(ctx, firstPostID, bobID, bobSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 2000, firstPostID, bobSpace.SpaceID)
	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.Equal(t, "post_like", conversations[0].LatestActivity.Type)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)

	require.NoError(t, module.Posts.SetLike(ctx, secondPostID, bobID, bobSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 3000, secondPostID, bobSpace.SpaceID)
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_like", conversations[0].LatestActivity.Type)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(2), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)

	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(3000), latestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, latestActivityAt))
	require.NoError(t, module.Posts.SetLike(ctx, thirdPostID, bobID, bobSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 4000, thirdPostID, bobSpace.SpaceID)
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_like", conversations[0].LatestActivity.Type)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)

	require.NoError(t, module.Messages.SetLike(ctx, aliceMessage.MessageID, bobID, bobSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 5000, aliceMessage.MessageID, bobSpace.SpaceID)
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(1), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)

	latestActivityAt, err = module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(5000), latestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, latestActivityAt))
	secondAliceMessage, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "regular",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "second-alice-message-cipher",
		SenderEncryptedMessageKey:    "second-alice-message-sender-key",
		RecipientEncryptedMessageKey: "second-alice-message-recipient-key",
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 6000, secondAliceMessage.MessageID)
	require.NoError(t, module.Messages.SetLike(ctx, secondAliceMessage.MessageID, bobID, bobSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 7000, secondAliceMessage.MessageID, bobSpace.SpaceID)
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)
}

func TestSpaceModuleLifecycle(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")

	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	require.Equal(t, 1, aliceSpace.CurrentVersion)

	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
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
	updatedSpace, err := module.Spaces.UpdateProfile(ctx, aliceID, aliceSpace.SpaceID, aliceSpace.CurrentVersion, "alice-profile-v2", &ProfileAssetUpdate{
		ObjectKey: "space/alice/avatar.jpg",
		BucketID:  "b2-eu-cen",
		Size:      111,
	}, nil, false, false)
	require.NoError(t, err)
	require.Equal(t, "alice-profile-v2", updatedSpace.EncryptedProfile)
	require.Equal(t, "space/alice/avatar.jpg", updatedSpace.AvatarObjectKey.String)
	require.Equal(t, "b2-eu-cen", updatedSpace.AvatarBucketID.String)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, updatedSpace.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v3")
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
			SpaceID:      sql.NullString{String: aliceSpace.SpaceID, Valid: true},
			Purpose:      TempObjectPurposePost,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 123,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "space/alice/post1/thumb",
			OwnerID:      aliceID,
			SpaceID:      sql.NullString{String: aliceSpace.SpaceID, Valid: true},
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
			MetadataCipher: "full-metadata",
		},
		{
			ObjectKey:      "space/alice/post1/thumb",
			BucketID:       "b2-eu-cen",
			Size:           sqlNullInt64(45),
			Position:       1,
			MetadataCipher: "thumbnail-metadata",
		},
	})
	require.NoError(t, err)

	post, err := module.Posts.GetPost(ctx, postID, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "alice", post.Author.SpaceSlug)

	err = module.Posts.SetLike(ctx, postID, bobID, bobSpace.SpaceID, true)
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

	_, err = module.Posts.GetPost(ctx, postID, bobID, bobSpace.SpaceID)
	require.Error(t, err)

	err = module.Posts.UpdateCaption(ctx, postID, aliceID, ptr("edited-caption"))
	require.ErrorIs(t, err, sql.ErrNoRows)

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

func TestPostAssetPositionIsUnique(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-assets@example.com", "alice-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_assets", "alice-space-key", "alice-assets-public", "alice-assets-secret", "alice-assets-secret-nonce", "alice-profile")
	require.NoError(t, err)
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = module.Posts.DB.Exec(`
			INSERT INTO space_post_assets (post_id, object_key, bucket_id, position, metadata_cipher)
			VALUES ($1, $2, $3, $4, $5)
		`, postID, "space/alice-assets/post/full-1", "b2-eu-cen", 0, "metadata-1")
	require.NoError(t, err)
	_, err = module.Posts.DB.Exec(`
			INSERT INTO space_post_assets (post_id, object_key, bucket_id, position, metadata_cipher)
			VALUES ($1, $2, $3, $4, $5)
		`, postID, "space/alice-assets/post/full-2", "b2-eu-cen", 0, "metadata-2")

	require.Error(t, err)
}

func TestUpdateProfileQueuesOldAvatarForCleanup(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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

	oldAvatar := &ProfileAssetUpdate{ObjectKey: "space/alice/avatar-old", BucketID: "b2-eu-cen", Size: 111}
	_, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-profile-old-avatar", oldAvatar, nil, false, false)
	require.NoError(t, err)

	newAvatar := &ProfileAssetUpdate{ObjectKey: "space/alice/avatar-new", BucketID: "b2-us-west", Size: 222}
	updated, err := module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-profile-new-avatar", newAvatar, nil, false, false)
	require.NoError(t, err)
	require.Equal(t, "space/alice/avatar-new", updated.AvatarObjectKey.String)
	requireQueuedTempObject(t, module, "space/alice/avatar-old", TempObjectPurposeAvatar, "b2-eu-cen")

	updated, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-profile-no-avatar", nil, nil, true, false)
	require.NoError(t, err)
	require.False(t, updated.AvatarObjectKey.Valid)
	requireQueuedTempObject(t, module, "space/alice/avatar-new", TempObjectPurposeAvatar, "b2-us-west")
}

func TestUpdateProfileQueuesOldCoverForCleanup(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-cover@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_cover", "alice-space-key", "alice-cover-public", "alice-cover-secret", "alice-cover-secret-nonce", "alice-profile")
	require.NoError(t, err)

	for _, rec := range []SpaceTempObjectRecord{
		{
			ObjectKey:    "space/alice-cover/cover-old",
			OwnerID:      aliceID,
			SpaceID:      sql.NullString{String: space.SpaceID, Valid: true},
			Purpose:      TempObjectPurposeCover,
			BucketID:     "b2-eu-cen",
			ExpectedSize: 333,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "space/alice-cover/cover-new",
			OwnerID:      aliceID,
			SpaceID:      sql.NullString{String: space.SpaceID, Valid: true},
			Purpose:      TempObjectPurposeCover,
			BucketID:     "b2-us-west",
			ExpectedSize: 444,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
	} {
		require.NoError(t, module.Assets.AddTempObject(ctx, rec))
	}

	oldCover := &ProfileAssetUpdate{ObjectKey: "space/alice-cover/cover-old", BucketID: "b2-eu-cen", Size: 333}
	_, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-profile-old-cover", nil, oldCover, false, false)
	require.NoError(t, err)

	newCover := &ProfileAssetUpdate{ObjectKey: "space/alice-cover/cover-new", BucketID: "b2-us-west", Size: 444}
	updated, err := module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-profile-new-cover", nil, newCover, false, false)
	require.NoError(t, err)
	require.Equal(t, "space/alice-cover/cover-new", updated.CoverObjectKey.String)
	requireQueuedTempObject(t, module, "space/alice-cover/cover-old", TempObjectPurposeCover, "b2-eu-cen")

	updated, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-profile-no-cover", nil, nil, false, true)
	require.NoError(t, err)
	require.False(t, updated.CoverObjectKey.Valid)
	requireQueuedTempObject(t, module, "space/alice-cover/cover-new", TempObjectPurposeCover, "b2-us-west")
}

func TestAddFriendCreatesReciprocalSharesAndEvent(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)

	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "alice-share-key", share.EncryptedSpaceKey)
	require.Equal(t, aliceSpace.CurrentVersion, share.KeyVersion)

	reciprocalShare, err := module.Friends.GetShareForFriendAndSpace(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "bob-share-key", reciprocalShare.EncryptedSpaceKey)
	require.Equal(t, bobSpace.CurrentVersion, reciprocalShare.KeyVersion)

	var eventCount int
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM space_friend_events WHERE event_type = 'friend_add' AND actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 1, eventCount)
}

func TestAddFriendRejectsSelfFriendship(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-self@example.com", "alice-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_self", "alice-space-key", "alice-self-public", "alice-self-secret", "alice-self-secret-nonce", "alice-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion)

	require.ErrorIs(t, err, ErrSelfFriendship)
}

func TestAddFriendIsIdempotentForExistingFriends(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)
	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key-v2", aliceSpace.CurrentVersion, "bob-share-key-v2", bobSpace.CurrentVersion)

	require.NoError(t, err)
	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
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
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_delete_friend", "alice-space-key", "alice-delete-friend-public", "alice-delete-friend-secret", "alice-delete-friend-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_delete_friend", "bob-space-key", "bob-delete-friend-public", "bob-delete-friend-secret", "bob-delete-friend-secret-nonce", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion)
	require.NoError(t, err)

	aliceShares, err := module.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, aliceShares, 1)
	bobShares, err := module.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Len(t, bobShares, 1)

	err = module.Friends.DeleteFriendship(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
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
	relationship, err := module.Friends.GetRelationship(ctx, aliceID, aliceSpace.SpaceID, bobID, bobSpace.SpaceID)
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

	err = module.Friends.DeleteFriendship(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
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
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)

	err = module.Friends.UpsertShare(ctx, aliceSpace.SpaceID, bobID, bobSpace.SpaceID, "share-key-v1", aliceSpace.CurrentVersion)
	require.NoError(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, aliceSpace.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
	require.NoError(t, err)

	err = module.Friends.UpdateShare(ctx, aliceSpace.SpaceID, bobID, bobSpace.SpaceID, "share-key-v2", rotatedSpace.CurrentVersion)
	require.NoError(t, err)
	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v2", share.EncryptedSpaceKey)
	require.Equal(t, rotatedSpace.CurrentVersion, share.KeyVersion)

	err = module.Friends.DeleteShareBySpaceAndFriend(ctx, aliceSpace.SpaceID, bobID, bobSpace.SpaceID)
	require.NoError(t, err)
	err = module.Friends.UpdateShare(ctx, aliceSpace.SpaceID, bobID, bobSpace.SpaceID, "stale-share-key", rotatedSpace.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestCreatePostRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	_, err = module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
	require.NoError(t, err)

	postID, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-stale", nil, space.CurrentVersion, nil)
	require.Zero(t, postID)
	require.ErrorIs(t, err, sql.ErrNoRows)

	posts, next, err := module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, space.SpaceID, "", 20)
	require.NoError(t, err)
	require.Empty(t, next)
	require.Empty(t, posts)
}

func TestUpdateProfileRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile-v1")
	require.NoError(t, err)

	rotated, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
	require.NoError(t, err)
	require.Equal(t, 2, rotated.CurrentVersion)

	_, err = module.Spaces.UpdateProfile(ctx, aliceID, space.SpaceID, space.CurrentVersion, "stale-profile", nil, nil, false, false)
	require.ErrorIs(t, err, sql.ErrNoRows)

	current, err := module.Spaces.GetSpaceByID(ctx, space.SpaceID)
	require.NoError(t, err)
	require.Equal(t, rotated.CurrentVersion, current.CurrentVersion)
	require.Equal(t, "alice-profile-v2", current.EncryptedProfile)
}

func TestRotateKeyRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile-v1")
	require.NoError(t, err)

	rotated, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-v1", "alice-profile-v2")
	require.NoError(t, err)
	require.Equal(t, 2, rotated.CurrentVersion)

	_, err = module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v3", "stale-wrapped-v1", "alice-profile-v3")
	require.ErrorIs(t, err, sql.ErrNoRows)

	current, err := module.Spaces.GetSpaceByID(ctx, space.SpaceID)
	require.NoError(t, err)
	require.Equal(t, 2, current.CurrentVersion)
	require.Equal(t, "alice-space-key-v2", current.EncryptedSpaceKey)

	versions, err := module.Spaces.ListVersions(ctx, space.SpaceID)
	require.NoError(t, err)
	require.Len(t, versions, 2)
}

func TestAddFriendRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)
	_, err = module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, aliceSpace.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
	require.NoError(t, err)

	err = module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "stale-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
	_, err = module.Friends.GetShareForFriendAndSpace(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestUpdateShareRejectsStaleKeyVersion(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)
	err = module.Friends.UpsertShare(ctx, aliceSpace.SpaceID, bobID, bobSpace.SpaceID, "share-key-v1", aliceSpace.CurrentVersion)
	require.NoError(t, err)
	_, err = module.Spaces.RotateKey(ctx, aliceID, aliceSpace.SpaceID, aliceSpace.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
	require.NoError(t, err)

	err = module.Friends.UpdateShare(ctx, aliceSpace.SpaceID, bobID, bobSpace.SpaceID, "stale-share-key", aliceSpace.CurrentVersion)
	require.ErrorIs(t, err, sql.ErrNoRows)

	share, err := module.Friends.GetShareForFriendAndSpace(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v1", share.EncryptedSpaceKey)
	require.Equal(t, aliceSpace.CurrentVersion, share.KeyVersion)
}

func TestRotateKeyRevokesSpaceLinks(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)

	link, err := module.Links.UpsertLink(ctx, space.SpaceID, []byte("hash"), space.CurrentVersion, "space-link-key", "owner-link-secret")
	require.NoError(t, err)
	require.Equal(t, "space-link-key", link.EncryptedSpaceKey)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.NMinFromNow(30))
	require.NoError(t, err)
	_, err = module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile-v1")
	require.NoError(t, err)
	rotated, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)

	rotatedSpace, err := module.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", "alice-profile-v2")
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
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	first, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-1", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	second, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-2", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	third, err := module.Posts.CreatePost(ctx, aliceID, space.SpaceID, "post-key-3", nil, space.CurrentVersion, nil)
	require.NoError(t, err)
	setPostCreatedAt(t, module, 1000, first, second, third)

	page, nextCursor, err := module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, space.SpaceID, "", 2)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, third, page[0].PostID)
	require.Equal(t, second, page[1].PostID)
	require.Equal(t, "1000:"+strconv.FormatInt(second, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, space.SpaceID, nextCursor, 2)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Empty(t, nextCursor)
}

func TestListPostsBySpaceCursorUsesCreatedAtSortOrder(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	space, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
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

	page, nextCursor, err := module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, space.SpaceID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Equal(t, "3000:"+strconv.FormatInt(first, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsBySpace(ctx, space.SpaceID, aliceID, space.SpaceID, nextCursor, 1)
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
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie", "charlie-space-key", "charlie-public", "charlie-secret", "charlie-secret-nonce", "charlie-profile")
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

	page, nextCursor, err := module.Posts.ListFeed(ctx, aliceID, aliceSpace.SpaceID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, ownPost, page[0].PostID)
	require.Equal(t, aliceSpace.SpaceID, page[0].SpaceID)
	require.False(t, page[0].ViewerLiked)
	require.Equal(t, "5000:"+strconv.FormatInt(ownPost, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListFeed(ctx, aliceID, aliceSpace.SpaceID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Equal(t, "3000:"+strconv.FormatInt(first, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListFeed(ctx, aliceID, aliceSpace.SpaceID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, second, page[0].PostID)
	require.Equal(t, "2000:"+strconv.FormatInt(second, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListFeed(ctx, aliceID, aliceSpace.SpaceID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, third, page[0].PostID)
	require.Empty(t, nextCursor)
}

func TestSpaceReadMarkersDriveNotificationState(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-unread@example.com", "alice-unread-public")
	bobID := insertSpaceUser(t, module, "bob-unread@example.com", "bob-unread-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_unread", "alice-space-key", "alice-unread-public", "alice-unread-secret", "alice-unread-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_unread", "bob-space-key", "bob-unread-public", "bob-unread-secret", "bob-unread-secret-nonce", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, module.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	setFriendEventCreatedAt(t, module, 500, "friend_add", bobID, aliceID)

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
	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(1), conversations[0].UnreadCount)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, 2000))
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
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
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, outgoing.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestSpaceNotificationReadMarkersArePerFriend(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-per-friend-unread@example.com", "alice-per-friend-public")
	bobID := insertSpaceUser(t, module, "bob-per-friend-unread@example.com", "bob-per-friend-public")
	charlieID := insertSpaceUser(t, module, "charlie-per-friend-unread@example.com", "charlie-per-friend-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_per_friend_unread", "alice-space-key", "alice-per-friend-unread-public", "alice-per-friend-unread-secret", "alice-per-friend-unread-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_per_friend_unread", "bob-space-key", "bob-per-friend-unread-public", "bob-per-friend-unread-secret", "bob-per-friend-unread-secret-nonce", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie_per_friend_unread", "charlie-space-key", "charlie-per-friend-unread-public", "charlie-per-friend-unread-secret", "charlie-per-friend-unread-secret-nonce", "charlie-profile")
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
	require.NoError(t, module.Messages.SetLike(ctx, aliceMessageToBob.MessageID, bobID, bobSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 1002, aliceMessageToBob.MessageID, bobSpace.SpaceID)
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
		conversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
		require.NoError(t, err)
		for _, conversation := range conversations {
			if conversation.Friend.SpaceID == spaceID {
				return conversation
			}
		}
		require.FailNowf(t, "conversation not found", "spaceID=%s", spaceID)
		return SpaceMessageConversationRecord{}
	}

	bobConversation := conversationBySpaceID(bobSpace.SpaceID)
	require.True(t, bobConversation.Unread)
	require.Equal(t, int64(1), bobConversation.UnreadCount)
	charlieConversation := conversationBySpaceID(charlieSpace.SpaceID)
	require.True(t, charlieConversation.Unread)
	require.Equal(t, int64(1), charlieConversation.UnreadCount)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	bobLatestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(1002), bobLatestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, bobLatestActivityAt))
	bobConversation = conversationBySpaceID(bobSpace.SpaceID)
	require.True(t, bobConversation.Unread)
	require.Equal(t, int64(0), bobConversation.UnreadCount)
	charlieConversation = conversationBySpaceID(charlieSpace.SpaceID)
	require.True(t, charlieConversation.Unread)
	require.Equal(t, int64(1), charlieConversation.UnreadCount)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, charlieSpace.SpaceID, 2000))
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestUnreadNotificationsTrackReadableActivityWithoutChangingLatestPreview(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice-priority-unread@example.com", "alice-priority-unread-public")
	bobID := insertSpaceUser(t, module, "bob-priority-unread@example.com", "bob-priority-unread-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice_priority_unread", "alice-space-key", "alice-priority-unread-public", "alice-priority-unread-secret", "alice-priority-unread-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob_priority_unread", "bob-space-key", "bob-priority-unread-public", "bob-priority-unread-secret", "bob-priority-unread-secret-nonce", "bob-profile")
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

	conversations, _, err := module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Len(t, conversations, 1)
	require.Equal(t, outgoing.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, int64(2000), conversations[0].SortCreatedAt)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(1), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)
	notificationsUnread, err := module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	latestActivityAt, err := module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(2000), latestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, latestActivityAt))
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, outgoing.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.False(t, conversations[0].NotificationUnread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)

	require.NoError(t, module.Messages.SetLike(ctx, incoming.MessageID, aliceID, aliceSpace.SpaceID, true))
	setMessageLikeCreatedAt(t, module, 2500, incoming.MessageID, aliceSpace.SpaceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message_like", conversations[0].LatestActivity.Type)
	require.True(t, conversations[0].LatestActivity.Outgoing)
	require.Equal(t, incoming.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, int64(2500), conversations[0].SortCreatedAt)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.False(t, conversations[0].NotificationUnread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
	latestActivityAt, err = module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(2500), latestActivityAt)

	alicePostID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "alice-post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	bobPostID, err := module.Posts.CreatePost(ctx, bobID, bobSpace.SpaceID, "bob-post-key", nil, bobSpace.CurrentVersion, nil)
	require.NoError(t, err)
	_, err = module.Posts.DB.Exec(`
			INSERT INTO space_post_assets (post_id, object_key, bucket_id, metadata_cipher)
			VALUES ($1, $2, $3, $4)
		`, bobPostID, "bob-post-object", "bucket", "metadata")
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, alicePostID, bobID, bobSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 3000, alicePostID, bobSpace.SpaceID)
	outgoingPostReply, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     aliceID,
		SenderSpaceID:                aliceSpace.SpaceID,
		RecipientID:                  bobID,
		RecipientSpaceID:             bobSpace.SpaceID,
		MessageCipher:                "outgoing-post-reply-cipher",
		SenderEncryptedMessageKey:    "outgoing-post-reply-sender-key",
		RecipientEncryptedMessageKey: "outgoing-post-reply-recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: bobPostID, Valid: true},
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 4000, outgoingPostReply.MessageID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "message", conversations[0].LatestActivity.Type)
	require.Equal(t, outgoingPostReply.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.NotNil(t, conversations[0].LatestActivity.Post)
	require.Equal(t, bobPostID, conversations[0].LatestActivity.Post.PostID)
	require.Equal(t, "bob-post-object", conversations[0].LatestActivity.Post.ObjectKey.String)
	require.Equal(t, int64(4000), conversations[0].SortCreatedAt)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	require.NoError(t, module.Posts.SetLike(ctx, bobPostID, aliceID, aliceSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 4500, bobPostID, aliceSpace.SpaceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_like", conversations[0].LatestActivity.Type)
	require.True(t, conversations[0].LatestActivity.Outgoing)
	require.NotNil(t, conversations[0].LatestActivity.Post)
	require.Equal(t, bobPostID, conversations[0].LatestActivity.Post.PostID)
	require.Equal(t, "bob-post-object", conversations[0].LatestActivity.Post.ObjectKey.String)
	require.Equal(t, int64(4500), conversations[0].SortCreatedAt)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)
	latestActivityAt, err = module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(4500), latestActivityAt)

	thread, _, err := module.Messages.ListThread(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(thread), 3)
	require.Equal(t, "post_like", thread[0].Kind)
	require.Equal(t, "You liked a post", thread[0].Text)
	require.NotNil(t, thread[0].Quote)
	require.Equal(t, bobPostID, thread[0].Quote.PostID)
	require.Equal(t, "bob-post-object", thread[0].Quote.ObjectKey.String)
	require.Equal(t, "post_reply", thread[1].Kind)
	require.Equal(t, outgoingPostReply.MessageID, thread[1].MessageID)
	require.Equal(t, "post_like", thread[2].Kind)
	require.Equal(t, "Liked your post", thread[2].Text)
	require.NotNil(t, thread[2].Quote)
	require.Equal(t, alicePostID, thread[2].Quote.PostID)

	incomingPostReply, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "incoming-post-reply-cipher",
		SenderEncryptedMessageKey:    "incoming-post-reply-sender-key",
		RecipientEncryptedMessageKey: "incoming-post-reply-recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: alicePostID, Valid: true},
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 5000, incomingPostReply.MessageID)
	secondIncomingPostReply, err := module.Messages.CreateMessage(ctx, CreateSpaceMessageRecord{
		Kind:                         "post_reply",
		SenderID:                     bobID,
		SenderSpaceID:                bobSpace.SpaceID,
		RecipientID:                  aliceID,
		RecipientSpaceID:             aliceSpace.SpaceID,
		MessageCipher:                "second-incoming-post-reply-cipher",
		SenderEncryptedMessageKey:    "second-incoming-post-reply-sender-key",
		RecipientEncryptedMessageKey: "second-incoming-post-reply-recipient-key",
		ReplyPostID:                  sql.NullInt64{Int64: alicePostID, Valid: true},
	})
	require.NoError(t, err)
	setMessageCreatedAt(t, module, 5001, secondIncomingPostReply.MessageID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_reply", conversations[0].LatestActivity.Type)
	require.Equal(t, secondIncomingPostReply.MessageID, conversations[0].LatestActivity.Message.MessageID)
	require.Equal(t, int64(5001), conversations[0].SortCreatedAt)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(3), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	setPostLikeCreatedAt(t, module, 6000, alicePostID, bobSpace.SpaceID)

	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.Equal(t, "post_like", conversations[0].LatestActivity.Type)
	require.Equal(t, alicePostID, conversations[0].LatestActivity.Post.PostID)
	require.Equal(t, int64(6000), conversations[0].SortCreatedAt)
	require.True(t, conversations[0].Unread)
	require.Equal(t, int64(3), conversations[0].UnreadCount)
	require.True(t, conversations[0].NotificationUnread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.True(t, notificationsUnread)

	latestActivityAt, err = module.Messages.GetLatestConversationActivityAt(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, int64(6000), latestActivityAt)
	require.NoError(t, module.Read.UpsertNotificationReadMarker(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, latestActivityAt))
	conversations, _, err = module.Messages.ListConversations(ctx, aliceID, aliceSpace.SpaceID, "", 10)
	require.NoError(t, err)
	require.False(t, conversations[0].Unread)
	require.Equal(t, int64(0), conversations[0].UnreadCount)
	require.False(t, conversations[0].NotificationUnread)
	notificationsUnread, err = module.Messages.HasUnreadNotifications(ctx, aliceID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.False(t, notificationsUnread)
}

func TestListPostLikersPaginates(t *testing.T) {
	ctx := context.Background()
	module := newSpaceTestModule(t)

	aliceID := insertSpaceUser(t, module, "alice@example.com", "alice-public")
	bobID := insertSpaceUser(t, module, "bob@example.com", "bob-public")
	charlieID := insertSpaceUser(t, module, "charlie@example.com", "charlie-public")
	aliceSpace, err := module.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-public", "alice-secret", "alice-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := module.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-public", "bob-secret", "bob-secret-nonce", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := module.Spaces.CreateSpace(ctx, charlieID, "charlie", "charlie-space-key", "charlie-public", "charlie-secret", "charlie-secret-nonce", "charlie-profile")
	require.NoError(t, err)
	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	require.NoError(t, module.Posts.SetLike(ctx, postID, bobID, bobSpace.SpaceID, true))
	require.NoError(t, module.Posts.SetLike(ctx, postID, charlieID, charlieSpace.SpaceID, true))
	setPostLikeCreatedAt(t, module, 3000, postID, bobSpace.SpaceID)
	setPostLikeCreatedAt(t, module, 2000, postID, charlieSpace.SpaceID)

	page, nextCursor, err := module.Posts.ListPostLikers(ctx, postID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, bobID, page[0].Actor.UserID)
	require.Equal(t, bobSpace.SpaceID, page[0].Actor.SpaceID)
	require.Equal(t, "3000:"+bobSpace.SpaceID, nextCursor)

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

func setPostLikeCreatedAt(t *testing.T, module *Module, createdAt, postID int64, actorSpaceID string) {
	t.Helper()
	_, err := module.Posts.DB.Exec(`UPDATE space_post_likes SET created_at = $1 WHERE post_id = $2 AND actor_space_id = $3`, createdAt, postID, actorSpaceID)
	require.NoError(t, err)
}

func setFriendEventCreatedAt(t *testing.T, module *Module, createdAt int64, eventType string, actorID, targetID int64) {
	t.Helper()
	_, err := module.Friends.DB.Exec(`UPDATE space_friend_events SET created_at = $1 WHERE event_type = $2 AND actor_id = $3 AND target_id = $4`, createdAt, eventType, actorID, targetID)
	require.NoError(t, err)
}

func setFriendRequestCreatedAt(t *testing.T, module *Module, createdAt int64, requestID int64) {
	t.Helper()
	_, err := module.Friends.DB.Exec(`UPDATE space_friend_requests SET created_at = $1 WHERE request_id = $2`, createdAt, requestID)
	require.NoError(t, err)
}

func setMessageCreatedAt(t *testing.T, module *Module, createdAt int64, messageID string) {
	t.Helper()
	_, err := module.Messages.DB.Exec(`UPDATE space_messages SET created_at = $1 WHERE message_id = $2`, createdAt, messageID)
	require.NoError(t, err)
}

func setMessageLikeCreatedAt(t *testing.T, module *Module, createdAt int64, messageID string, actorSpaceID string) {
	t.Helper()
	_, err := module.Messages.DB.Exec(`UPDATE space_message_likes SET created_at = $1 WHERE message_id = $2 AND actor_space_id = $3`, createdAt, messageID, actorSpaceID)
	require.NoError(t, err)
}
