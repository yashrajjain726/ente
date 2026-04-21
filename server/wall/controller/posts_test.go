package controller

import (
	"context"
	"database/sql"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupPostsControllerTest(t *testing.T) (*PostsController, *wallrepo.Module, context.Context) {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	gin.SetMode(gin.TestMode)
	repos := wallrepo.NewModule(db, nil)
	return NewModule(repos, nil).Posts, repos, context.Background()
}

func insertWallControllerUser(t *testing.T, module *wallrepo.Module, email string, publicKey string) int64 {
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

func newWallControllerContext(userID int64) *gin.Context {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("POST", "/", nil)
	ctx.Request.Header.Set("X-Auth-User-ID", strconv.FormatInt(userID, 10))
	return ctx
}

func countWallComments(t *testing.T, db *sql.DB, postID int64) int {
	t.Helper()
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM wall_post_comments WHERE post_id = $1`, postID).Scan(&count)
	require.NoError(t, err)
	return count
}

func TestCreateCommentRejectsParentFromAnotherPost(t *testing.T) {
	posts, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	firstPostID, err := repos.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-1", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	secondPostID, err := repos.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key-2", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	parent, err := repos.Posts.CreateComment(ctx, firstPostID, aliceID, "parent-comment", nil)
	require.NoError(t, err)

	resp, err := posts.CreateComment(newWallControllerContext(aliceID), strconv.FormatInt(secondPostID, 10), models.CreateCommentRequest{
		CommentCipher:   "cross-post-reply",
		ParentCommentID: &parent.CommentID,
	})

	require.Nil(t, resp)
	require.Error(t, err)
	require.Equal(t, 0, countWallComments(t, repos.Posts.DB, secondPostID))
}

func TestCreateCommentRejectsReplyAsParent(t *testing.T) {
	posts, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	postID, err := repos.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	parent, err := repos.Posts.CreateComment(ctx, postID, aliceID, "parent-comment", nil)
	require.NoError(t, err)
	reply, err := repos.Posts.CreateComment(ctx, postID, aliceID, "reply-comment", &parent.CommentID)
	require.NoError(t, err)

	resp, err := posts.CreateComment(newWallControllerContext(aliceID), strconv.FormatInt(postID, 10), models.CreateCommentRequest{
		CommentCipher:   "nested-reply",
		ParentCommentID: &reply.CommentID,
	})

	require.Nil(t, resp)
	require.Error(t, err)
	require.Equal(t, 2, countWallComments(t, repos.Posts.DB, postID))
}

func TestCreateCommentAcceptsTopLevelParentOnSamePost(t *testing.T) {
	posts, repos, ctx := setupPostsControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	postID, err := repos.Posts.CreatePost(ctx, aliceID, wall.WallID, "post-key", nil, wall.CurrentVersion, nil)
	require.NoError(t, err)
	parent, err := repos.Posts.CreateComment(ctx, postID, aliceID, "parent-comment", nil)
	require.NoError(t, err)

	resp, err := posts.CreateComment(newWallControllerContext(aliceID), strconv.FormatInt(postID, 10), models.CreateCommentRequest{
		CommentCipher:   "reply-comment",
		ParentCommentID: &parent.CommentID,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, parent.CommentID, *resp.ParentCommentID)
	require.Equal(t, 2, countWallComments(t, repos.Posts.DB, postID))
}
