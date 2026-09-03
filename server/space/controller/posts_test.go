package controller

import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"testing"

	timeutil "github.com/ente/museum/pkg/utils/time"
	"github.com/ente/museum/space/models"
	spacerepo "github.com/ente/museum/space/repo"
	"github.com/stretchr/testify/require"
)

func TestPostLikeRejectsOwnPost(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-own-post-like@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_own_post_like", "alice-space-key", "alice-own-post-like-public", "alice-own-post-like-secret", "alice-own-post-like-secret-nonce", "alice-profile")
	require.NoError(t, err)
	postID, err := testCreatePost(ctx, repos, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = controller.SetLike(ctx, aliceSpace, postID, true)
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot like your own post")
}

func TestCreatePostRequiresAssetMetadataCipher(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-metadata-post@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_metadata_post", "alice-space-key", "alice-metadata-post-public", "alice-metadata-post-secret", "alice-metadata-post-secret-nonce", "alice-profile")
	require.NoError(t, err)

	_, err = controller.Create(ctx, aliceSpace, models.CreatePostRequest{
		EncryptedPostKey: "cG9zdC1rZXk=",
		KeyVersion:       aliceSpace.CurrentVersion,
		Objects: []models.PostObjectPayload{{
			ObjectKey: "space/alice-metadata-post/posts/object",
		}},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "metadataCipher is required")
}

func TestCreatePostRejectsMultipleObjects(t *testing.T) {
	controller := &PostsController{}

	_, err := controller.Create(t.Context(), &spacerepo.SpaceRecord{}, models.CreatePostRequest{
		EncryptedPostKey: "post-key",
		Objects: []models.PostObjectPayload{
			{ObjectKey: "first"},
			{ObjectKey: "second"},
		},
	})

	require.ErrorContains(t, err, "too many post objects")
}

func TestListPostsHydratesPostAssets(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-list-assets@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_list_assets", "alice-space-key", "alice-list-assets-public", "alice-list-assets-secret", "alice-list-assets-secret-nonce", "alice-profile")
	require.NoError(t, err)
	objectKey := "space/alice-list-assets/post/full"
	err = repos.Assets.AddTempObject(ctx, spacerepo.SpaceTempObjectRecord{
		ObjectKey:    objectKey,
		SpaceID:      sql.NullString{String: aliceSpace.SpaceID, Valid: true},
		Purpose:      spacerepo.TempObjectPurposePost,
		BucketID:     "b2-eu-cen",
		ExpectedSize: 123,
		ExpiresAt:    timeutil.MicrosecondsAfterMinutes(30),
	})
	require.NoError(t, err)
	_, err = testCreatePost(ctx, repos, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, []spacerepo.SpacePostAssetRecord{
		{
			ObjectKey:      objectKey,
			BucketID:       "b2-eu-cen",
			Size:           sql.NullInt64{Int64: 123, Valid: true},
			Position:       1,
			MetadataCipher: testSpaceBytes("metadata"),
		},
	})
	require.NoError(t, err)
	sessionHash := sha256.Sum256([]byte("alice-list-assets-session"))
	require.NoError(t, repos.Sessions.CreateBrowserSession(ctx, sessionHash[:], aliceID, "session-wrap-key", timeutil.MicrosecondsAfterMinutes(5)))
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set(SpaceBrowserSessionTokenHeader, "alice-list-assets-session")

	page, err := controller.List(ginCtx, models.ListPostsRequest{
		SpaceID: aliceSpace.SpaceID,
		Limit:   10,
	})
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.Len(t, page.Items[0].Objects, 1)
	require.Equal(t, objectKey, page.Items[0].Objects[0].ObjectKey)
	require.Equal(t, int64(123), page.Items[0].Objects[0].Size)
	require.Equal(t, 1, page.Items[0].Objects[0].Position)
	require.Equal(t, "bWV0YWRhdGE=", page.Items[0].Objects[0].MetadataCipher)
	post, err := repos.Posts.GetPost(ctx, page.Items[0].PostID, aliceSpace.SpaceID)
	require.NoError(t, err)
	require.Equal(t, post.CreatedAt, page.Items[0].CreatedAtMicros)
}

func TestListHomePostsSyncCursorUsesNewestVisiblePost(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-home-sync@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_home_sync", "alice-space-key", "alice-home-sync-public", "alice-home-sync-secret", "alice-home-sync-secret-nonce", "alice-profile")
	require.NoError(t, err)

	page, err := controller.ListHomePosts(ctx, aliceSpace, models.ListHomePostsRequest{Limit: 10})
	require.NoError(t, err)
	require.Equal(t, "0:0", page.SyncCursor)

	bobID := insertSpaceControllerUser(t, repos, "bob-home-sync@example.com", "bob-public")
	bobSpace, err := testCreateSpace(ctx, repos, bobID, "bob_home_sync", "bob-space-key", "bob-home-sync-public", "bob-home-sync-secret", "bob-home-sync-secret-nonce", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, testAddFriend(ctx, repos, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion))
	postID, err := testCreatePost(ctx, repos, bobID, bobSpace.SpaceID, "post-key", nil, bobSpace.CurrentVersion, nil)
	require.NoError(t, err)
	post, err := repos.Posts.GetPost(ctx, postID, aliceSpace.SpaceID)
	require.NoError(t, err)

	page, err = controller.ListHomePosts(ctx, aliceSpace, models.ListHomePostsRequest{Limit: 10})
	require.NoError(t, err)
	require.Equal(t, fmt.Sprintf("%d:%d", post.CreatedAt, post.PostID), page.SyncCursor)
}
