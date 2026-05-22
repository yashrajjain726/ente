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
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-own-post-like", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	postID, err := repos.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = controller.ToggleLike(newSpaceControllerContext(aliceID), strconv.FormatInt(postID, 10), models.LikePostRequest{Like: true})
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot like your own post")
}
