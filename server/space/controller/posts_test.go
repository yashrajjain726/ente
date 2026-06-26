package controller

import (
	"crypto/sha256"
	"database/sql"
	"strconv"
	"testing"

	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/space/models"
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/stretchr/testify/require"
)

func TestPostLikeRejectsOwnPost(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-own-post-like@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_own_post_like", "alice-space-key", "alice-own-post-like-public", "alice-own-post-like-secret", "alice-own-post-like-secret-nonce", "alice-profile")
	require.NoError(t, err)
	postID, err := testCreatePost(ctx, repos, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = controller.ToggleLike(newSpaceControllerContext(aliceID), strconv.FormatInt(postID, 10), models.LikePostRequest{SpaceID: aliceSpace.SpaceID, Like: true})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot like your own post")
}

func TestCreatePostRequiresAssetMetadataCipher(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-metadata-post@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_metadata_post", "alice-space-key", "alice-metadata-post-public", "alice-metadata-post-secret", "alice-metadata-post-secret-nonce", "alice-profile")
	require.NoError(t, err)

	_, err = controller.Create(newSpaceControllerContext(aliceID), models.CreatePostRequest{
		SpaceID:          aliceSpace.SpaceID,
		EncryptedPostKey: "cG9zdC1rZXk=",
		KeyVersion:       aliceSpace.CurrentVersion,
		Objects: []models.PostObjectPayload{{
			ObjectKey: "space/alice-metadata-post/posts/object",
		}},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "metadataCipher is required")
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
}

func TestListPostLikersUsesRequestPagination(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-list-likers@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob-list-likers@example.com", "bob-public")
	charlieID := insertSpaceControllerUser(t, repos, "charlie-list-likers@example.com", "charlie-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_list_likers", "alice-space-key", "alice-list-likers-public", "alice-list-likers-secret", "alice-list-likers-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := testCreateSpace(ctx, repos, bobID, "bob_list_likers", "bob-space-key", "bob-list-likers-public", "bob-list-likers-secret", "bob-list-likers-secret-nonce", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := testCreateSpace(ctx, repos, charlieID, "charlie_list_likers", "charlie-space-key", "charlie-list-likers-public", "charlie-list-likers-secret", "charlie-list-likers-secret-nonce", "charlie-profile")
	require.NoError(t, err)
	postID, err := testCreatePost(ctx, repos, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)
	_, err = repos.Posts.SetLikeWithCreated(ctx, postID, bobSpace.SpaceID, true)
	require.NoError(t, err)
	_, err = repos.Posts.SetLikeWithCreated(ctx, postID, charlieSpace.SpaceID, true)
	require.NoError(t, err)
	sessionHash := sha256.Sum256([]byte("alice-list-likers-session"))
	require.NoError(t, repos.Sessions.CreateBrowserSession(ctx, sessionHash[:], aliceID, "session-wrap-key", timeutil.MicrosecondsAfterMinutes(5)))
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set(SpaceBrowserSessionTokenHeader, "alice-list-likers-session")

	page, err := controller.ListLikers(ginCtx, strconv.FormatInt(postID, 10), models.ListPostLikersRequest{Limit: 1})
	require.NoError(t, err)
	require.Len(t, page.Likers, 1)
	require.NotEmpty(t, page.NextCursor)

	page, err = controller.ListLikers(ginCtx, strconv.FormatInt(postID, 10), models.ListPostLikersRequest{
		Cursor: page.NextCursor,
		Limit:  1,
	})
	require.NoError(t, err)
	require.Len(t, page.Likers, 1)
	require.Empty(t, page.NextCursor)
}
