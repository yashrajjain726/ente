package controller

import (
	"context"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
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
