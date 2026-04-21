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

	comments, nextCommentsCursor, err := module.Posts.ListTopLevelComments(ctx, postID, bobID, "", 20)
	require.NoError(t, err)
	require.Len(t, comments, 1)
	require.Empty(t, nextCommentsCursor)

	replies, err := module.Posts.ListReplies(ctx, postID, bobID, []int64{comment.CommentID})
	require.NoError(t, err)
	require.Len(t, replies[comment.CommentID], 1)

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

func TestApproveRequestCreatesShareAndMarksRequestApproved(t *testing.T) {
	ctx := context.Background()
	module := newWallTestModule(t)

	aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
	bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
	aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	_, err = module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	request, err := module.Follow.CreateRequest(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)

	approved, err := module.Follow.ApproveRequest(ctx, request.RequestID, aliceWall.WallID, "share-key", aliceWall.CurrentVersion)
	require.NoError(t, err)
	require.Equal(t, request.RequestID, approved.RequestID)
	require.Equal(t, "approved", approved.Status)

	share, err := module.Follow.GetShareForFollowerAndWall(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "share-key", share.EncryptedWallKey)
	require.Equal(t, aliceWall.CurrentVersion, share.KeyVersion)

	stored, err := module.Follow.GetRequest(ctx, request.RequestID)
	require.NoError(t, err)
	require.Equal(t, "approved", stored.Status)
}

func TestApproveRequestRejectsStaleRequestStates(t *testing.T) {
	for _, status := range []string{"cancelled", "rejected", "unfollowed", "approved"} {
		t.Run(status, func(t *testing.T) {
			ctx := context.Background()
			module := newWallTestModule(t)

			aliceID := insertWallUser(t, module, "alice@example.com", "alice-public")
			bobID := insertWallUser(t, module, "bob@example.com", "bob-public")
			aliceWall, err := module.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
			require.NoError(t, err)
			_, err = module.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
			require.NoError(t, err)
			request, err := module.Follow.CreateRequest(ctx, bobID, aliceWall.WallID)
			require.NoError(t, err)

			if status == "approved" {
				_, err = module.Follow.ApproveRequest(ctx, request.RequestID, aliceWall.WallID, "initial-share-key", aliceWall.CurrentVersion)
				require.NoError(t, err)
				err = module.Follow.DeleteShareByWallAndFollower(ctx, aliceWall.WallID, bobID)
				require.NoError(t, err)
			} else {
				err = module.Follow.UpdateRequestStatus(ctx, request.RequestID, status)
				require.NoError(t, err)
			}

			approved, err := module.Follow.ApproveRequest(ctx, request.RequestID, aliceWall.WallID, "stale-share-key", aliceWall.CurrentVersion)
			require.Nil(t, approved)
			require.ErrorIs(t, err, sql.ErrNoRows)
			_, err = module.Follow.GetShareForFollowerAndWall(ctx, bobID, aliceWall.WallID)
			require.ErrorIs(t, err, sql.ErrNoRows)
		})
	}
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

	err = module.Follow.UpsertShare(ctx, aliceWall.WallID, bobID, "share-key-v1", aliceWall.CurrentVersion)
	require.NoError(t, err)

	err = module.Follow.UpdateShare(ctx, aliceWall.WallID, bobID, "share-key-v2", aliceWall.CurrentVersion+1)
	require.NoError(t, err)
	share, err := module.Follow.GetShareForFollowerAndWall(ctx, bobID, aliceWall.WallID)
	require.NoError(t, err)
	require.Equal(t, "share-key-v2", share.EncryptedWallKey)
	require.Equal(t, aliceWall.CurrentVersion+1, share.KeyVersion)

	err = module.Follow.DeleteShareByWallAndFollower(ctx, aliceWall.WallID, bobID)
	require.NoError(t, err)
	err = module.Follow.UpdateShare(ctx, aliceWall.WallID, bobID, "stale-share-key", aliceWall.CurrentVersion+2)
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = module.Follow.GetShareForFollowerAndWall(ctx, bobID, aliceWall.WallID)
	require.ErrorIs(t, err, sql.ErrNoRows)
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

	page, nextCursor, err := module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, "", 2)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, third, page[0].PostID)
	require.Equal(t, second, page[1].PostID)
	require.Equal(t, strconv.FormatInt(second, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListPostsByWall(ctx, wall.WallID, aliceID, nextCursor, 2)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first, page[0].PostID)
	require.Empty(t, nextCursor)
}

func TestListTopLevelCommentsPaginates(t *testing.T) {
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

	page, nextCursor, err := module.Posts.ListTopLevelComments(ctx, postID, aliceID, "", 2)
	require.NoError(t, err)
	require.Len(t, page, 2)
	require.Equal(t, third.CommentID, page[0].CommentID)
	require.Equal(t, second.CommentID, page[1].CommentID)
	require.Equal(t, strconv.FormatInt(second.CommentID, 10), nextCursor)

	page, nextCursor, err = module.Posts.ListTopLevelComments(ctx, postID, aliceID, nextCursor, 2)
	require.NoError(t, err)
	require.Len(t, page, 1)
	require.Equal(t, first.CommentID, page[0].CommentID)
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
