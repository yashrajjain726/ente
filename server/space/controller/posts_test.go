package controller

import (
	"encoding/base64"
	"strconv"
	"testing"

	"github.com/ente-io/museum/space/models"
	"github.com/stretchr/testify/require"
)

func TestPostLikeRejectsOwnPost(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-own-post-like@example.com", "alice-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-own-post-like", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	postID, err := repos.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = controller.ToggleLike(newSpaceControllerContext(aliceID), strconv.FormatInt(postID, 10), models.LikePostRequest{Like: true})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot like your own post")
}

func TestCreatePostRejectsVideoObject(t *testing.T) {
	controller, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-video-post@example.com", "alice-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-video-post", "alice-space-key", "alice-profile")
	require.NoError(t, err)

	_, err = controller.Create(newSpaceControllerContext(aliceID), models.CreatePostRequest{
		SpaceID:          aliceSpace.SpaceID,
		EncryptedPostKey: base64.StdEncoding.EncodeToString([]byte("post-key")),
		KeyVersion:       aliceSpace.CurrentVersion,
		Objects: []models.PostObjectPayload{{
			ObjectKey: "space/alice-video-post/posts/object",
			MediaType: "video/mp4",
			Width:     1920,
			Height:    1080,
		}},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "only photos can be uploaded")
}
