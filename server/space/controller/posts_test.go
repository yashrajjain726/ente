package controller

import (
	"strconv"
	"testing"

	"github.com/ente-io/museum/space/models"
	"github.com/stretchr/testify/require"
)

func TestPostLikeRejectsOwnPost(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-own-post-like@example.com", "alice-public")
	aliceSpace, err := testCreateSpace(ctx, repos, aliceID, "alice_own_post_like", "alice-space-key", "alice-own-post-like-public", "alice-own-post-like-secret", "alice-own-post-like-secret-nonce", "alice-profile")
	require.NoError(t, err)
	postID, err := testCreatePost(ctx, repos, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = controller.ToggleLike(newSpaceControllerContext(aliceID), strconv.FormatInt(postID, 10), models.LikePostRequest{Like: true})
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
