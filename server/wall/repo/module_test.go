package repo

import (
	"context"
	"database/sql"
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
		ContentType:  "image/jpeg",
		ExpectedSize: 111,
		ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
	})
	require.NoError(t, err)
	updatedWall, err := module.Walls.UpdateProfile(ctx, aliceID, aliceWall.WallID, "alice-profile-v2", &struct {
		ObjectKey   string
		ContentType string
		Size        int64
	}{
		ObjectKey:   "wall/alice/avatar.jpg",
		ContentType: "image/jpeg",
		Size:        111,
	}, false)
	require.NoError(t, err)
	require.Equal(t, "alice-profile-v2", updatedWall.EncryptedProfile)
	require.Equal(t, "wall/alice/avatar.jpg", updatedWall.AvatarObjectKey.String)

	rotatedWall, err := module.Walls.RotateKey(ctx, aliceID, aliceWall.WallID, "alice-wall-key-v2", "wrapped-prev-key", nil)
	require.NoError(t, err)
	require.Equal(t, 2, rotatedWall.CurrentVersion)

	versions, err := module.Walls.ListVersions(ctx, aliceWall.WallID)
	require.NoError(t, err)
	require.Len(t, versions, 2)

	request, err := module.Follow.CreateRequest(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "pending", request.Status)

	incoming, err := module.Follow.ListIncomingRequests(ctx, aliceID)
	require.NoError(t, err)
	require.Len(t, incoming, 1)

	err = module.Follow.UpsertShare(ctx, aliceWall.WallID, bobID, "share-key", rotatedWall.CurrentVersion)
	require.NoError(t, err)
	err = module.Follow.UpdateRequestStatus(ctx, request.RequestID, "approved")
	require.NoError(t, err)

	shares, err := module.Follow.ListSharesForFollower(ctx, bobID)
	require.NoError(t, err)
	require.Len(t, shares, 1)
	require.Equal(t, "share-key", shares[0].EncryptedWallKey)

	followers, err := module.Follow.ListFollowersForWall(ctx, aliceWall.WallID)
	require.NoError(t, err)
	require.Len(t, followers, 1)
	require.Equal(t, "bob", followers[0].Username)

	for _, tempObject := range []WallTempObjectRecord{
		{
			ObjectKey:    "wall/alice/post1/full",
			OwnerID:      aliceID,
			Purpose:      TempObjectPurposePost,
			BucketID:     "b2-eu-cen",
			ContentType:  "image/jpeg",
			ExpectedSize: 123,
			ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
		},
		{
			ObjectKey:    "wall/alice/post1/thumb",
			OwnerID:      aliceID,
			Purpose:      TempObjectPurposePost,
			BucketID:     "b2-eu-cen",
			ContentType:  "image/jpeg",
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
			ContentType:    nullString("image/jpeg"),
			Size:           sqlNullInt64(123),
			Position:       0,
			Variant:        nullString("full"),
			BlurHashCipher: sqlNullString(""),
		},
		{
			ObjectKey:      "wall/alice/post1/thumb",
			ContentType:    nullString("image/jpeg"),
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

	comments, err := module.Posts.ListTopLevelComments(ctx, postID, bobID, "", 20)
	require.NoError(t, err)
	require.Len(t, comments, 1)

	replies, err := module.Posts.ListReplies(ctx, postID, bobID, []int64{comment.CommentID})
	require.NoError(t, err)
	require.Len(t, replies[comment.CommentID], 1)

	assets, err := module.Posts.ListAssetsByPostIDs(ctx, []int64{postID})
	require.NoError(t, err)
	require.Len(t, assets[postID], 2)

	ok, err := module.Assets.AssetBelongsToWall(ctx, aliceWall.WallID, "wall/alice/post1/full")
	require.NoError(t, err)
	require.True(t, ok)

	link, err := module.Links.UpsertLink(ctx, aliceWall.WallID, []byte("hash"), rotatedWall.CurrentVersion, "wall-link-key")
	require.NoError(t, err)
	require.Equal(t, "wall-link-key", link.EncryptedWallKey)

	err = module.Links.CreateSession(ctx, []byte("token-hash"), aliceWall.WallID, aliceID, timeutil.NMinFromNow(30))
	require.NoError(t, err)

	session, err := module.Links.GetSession(ctx, []byte("token-hash"))
	require.NoError(t, err)
	require.Equal(t, aliceWall.WallID, session.WallID)

	err = module.Links.DeleteLink(ctx, aliceWall.WallID)
	require.NoError(t, err)

	lookup, err := module.Walls.GetWallBySlug(ctx, "alice")
	require.NoError(t, err)
	require.Equal(t, aliceWall.WallID, lookup.WallID)

	_ = bobWall
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
