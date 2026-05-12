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
	require.Equal(t, "bob", friends[0].Username)

	bobFriends, err := module.Friends.ListFriendsForWall(ctx, bobWall.WallID)
	require.NoError(t, err)
	require.Len(t, bobFriends, 1)
	require.Equal(t, "alice", bobFriends[0].Username)

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
	require.Equal(t, "alice", post.Author)

	err = module.Posts.SetLike(ctx, postID, bobID, true)
	require.NoError(t, err)

	comment, err := module.Posts.CreateComment(ctx, postID, bobID, "comment-1", nil)
	require.NoError(t, err)
	_, err = module.Posts.CreateComment(ctx, postID, aliceID, "reply-1", &comment.CommentID)
	require.NoError(t, err)

	comments, nextCommentsCursor, err := module.Posts.ListComments(ctx, postID, bobID, "", 20)
	require.NoError(t, err)
	require.Len(t, comments, 2)
	require.Empty(t, nextCommentsCursor)
	require.Equal(t, comment.CommentID, comments[1].CommentID)
	require.Equal(t, comment.CommentID, comments[0].ParentCommentID.Int64)

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
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM wall_friend_events WHERE actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
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
	err = module.Friends.DB.QueryRow(`SELECT COUNT(*) FROM wall_friend_events WHERE actor_id = $1 AND target_id = $2`, bobID, aliceID).Scan(&eventCount)
	require.NoError(t, err)
	require.Equal(t, 1, eventCount)
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

	page, nextCursor, err := module.Posts.ListFeed(ctx, aliceID, "", 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Equal(t, "3000:"+strconv.FormatInt(first, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListFeed(ctx, aliceID, nextCursor, 1)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, second, page[0].PostID)
	require.Equal(t, "2000:"+strconv.FormatInt(second, 10), nextCursor)
}

func TestNotificationsIncludeWallSocialEvents(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)

	postID, err := module.Posts.CreatePost(ctx, aliceID, aliceWall.WallID, "post-key", nil, aliceWall.CurrentVersion, nil)
	require.NoError(t, err)
	err = module.Posts.SetLike(ctx, postID, bobID, true)
	require.NoError(t, err)
	setPostLikeCreatedAt(t, module, 2000, postID, bobID)

	bobComment, err := module.Posts.CreateComment(ctx, postID, bobID, "bob-comment", nil)
	require.NoError(t, err)
	setCommentCreatedAt(t, module, 3000, bobComment.CommentID)

	aliceComment, err := module.Posts.CreateComment(ctx, postID, aliceID, "alice-comment", nil)
	require.NoError(t, err)
	bobReply, err := module.Posts.CreateComment(ctx, postID, bobID, "bob-reply", &aliceComment.CommentID)
	require.NoError(t, err)
	setCommentCreatedAt(t, module, 4000, bobReply.CommentID)

	err = module.Posts.SetCommentLike(ctx, postID, aliceComment.CommentID, bobID, true)
	require.NoError(t, err)
	setCommentLikeCreatedAt(t, module, 5000, aliceComment.CommentID, bobID)

	err = module.Friends.AddFriend(ctx, bobID, bobWall.WallID, aliceWall.WallID, "alice-share-key", aliceWall.CurrentVersion, "bob-share-key", bobWall.CurrentVersion)
	require.NoError(t, err)
	setFriendEventCreatedAt(t, module, 6000, bobID, aliceID)

	page, nextCursor, err := module.Notifications.List(ctx, aliceID, "", 3)
	require.NoError(t, err)
	require.Len(t, page, 3)
	require.Equal(t, "addedYouAsFriend", page[0].Type)
	require.Equal(t, "likedComment", page[1].Type)
	require.Equal(t, "repliedToComment", page[2].Type)
	require.NotEmpty(t, nextCursor)

	page, nextCursor, err = module.Notifications.List(ctx, aliceID, nextCursor, 3)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, "commentedOnPost", page[0].Type)
	require.Equal(t, "likedPost", page[1].Type)
	require.Empty(t, nextCursor)
}

func TestListCommentsPaginates(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	postID, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)

	first, err := module.Posts.CreateComment(ctx, postID, aliceID, "comment-1", nil)
	require.NoError(t, err)
	second, err := module.Posts.CreateComment(ctx, postID, aliceID, "comment-2", nil)
	require.NoError(t, err)
	third, err := module.Posts.CreateComment(ctx, postID, aliceID, "comment-3", nil)
	require.NoError(t, err)

	page, nextCursor, err := module.Posts.ListComments(ctx, postID, aliceID, "", 2)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, third.CommentID, page[0].CommentID)
	require.Equal(t, second.CommentID, page[1].CommentID)
	require.Equal(t, strconv.FormatInt(second.CommentID, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListComments(ctx, postID, aliceID, nextCursor, 2)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first.CommentID, page[0].CommentID)
	require.Empty(t, nextCursor)
}

func TestDeleteCommentRequiresPostAndAuthorMatch(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	wall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	firstPostID, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-1", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	secondPostID, err := module.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-2", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	comment, err := module.Posts.CreateComment(ctx, firstPostID, bobID, "comment", nil)
	require.NoError(t, err)

	err = module.Posts.DeleteComment(ctx, secondPostID, comment.CommentID, bobID)
	require.ErrorIs(t, err, sql.ErrNoRows)
	require.Equal(t, 1, countActivePostComments(t, module, firstPostID))

	err = module.Posts.DeleteComment(ctx, firstPostID, comment.CommentID, aliceID)
	require.ErrorIs(t, err, sql.ErrNoRows)
	require.Equal(t, 1, countActivePostComments(t, module, firstPostID))

	err = module.Posts.DeleteComment(ctx, firstPostID, comment.CommentID, bobID)
	require.NoError(t, err)
	require.Equal(t, 0, countActivePostComments(t, module, firstPostID))
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

func countActivePostComments(t *testing.T, module *Module, postID int64) int {
	t.Helper()
	var count int
	err := module.Posts.DB.QueryRow(`SELECT COUNT(*) FROM wall_post_comments WHERE post_id = $1 AND is_deleted = FALSE`, postID).Scan(&count)
	require.NoError(t, err)
	return count
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

func setCommentCreatedAt(t *testing.T, module *Module, createdAt, commentID int64) {
	t.Helper()
	_, err := module.Posts.DB.Exec(`UPDATE wall_post_comments SET created_at = $1 WHERE comment_id = $2`, createdAt, commentID)
	require.NoError(t, err)
}

func setCommentLikeCreatedAt(t *testing.T, module *Module, createdAt, commentID, userID int64) {
	t.Helper()
	_, err := module.Posts.DB.Exec(`UPDATE wall_comment_likes SET created_at = $1 WHERE comment_id = $2 AND user_id = $3`, createdAt, commentID, userID)
	require.NoError(t, err)
}

func setFriendEventCreatedAt(t *testing.T, module *Module, createdAt, actorID, targetID int64) {
	t.Helper()
	_, err := module.Friends.DB.Exec(`UPDATE wall_friend_events SET created_at = $1 WHERE actor_id = $2 AND target_id = $3`, createdAt, actorID, targetID)
	require.NoError(t, err)
}
