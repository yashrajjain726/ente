package controller

import (
	"context"
	"crypto/sha256"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/internal/testutil"
	baserepo "github.com/ente-io/museum/pkg/repo"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupWallAuthControllerTest(t *testing.T) (*Module, *wallrepo.Module, *baserepo.UserAuthRepository, context.Context) {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	gin.SetMode(gin.TestMode)
	repos := wallrepo.NewModule(db, nil)
	userAuthRepo := &baserepo.UserAuthRepository{DB: db}
	return NewModule(repos, userAuthRepo), repos, userAuthRepo, context.Background()
}

func newPublicWallContext() *gin.Context {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("GET", "/", nil)
	return ctx
}

func TestResolveViewerRejectsForgedUserHeaderWithoutToken(t *testing.T) {
	module, repos, _, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-User-ID", strconv.FormatInt(aliceID, 10))

	resp, err := module.Walls.GetProfile(ginCtx, models.GetWallProfileRequest{WallID: wall.WallID})

	require.Nil(t, resp)
	require.ErrorIs(t, err, ente.ErrAuthenticationRequired)
}

func TestResolveViewerAcceptsValidatedUserToken(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-token", "127.0.0.1", "wall-test"))
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-token")
	ginCtx.Request.Header.Set("X-Auth-User-ID", "999999")

	resp, err := module.Walls.GetProfile(ginCtx, models.GetWallProfileRequest{WallID: wall.WallID})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, wall.WallID, resp.WallID)
}

func TestResolveViewerAcceptsWallLinkSessionToken(t *testing.T) {
	module, repos, _, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	authHash := sha256.Sum256([]byte("link-auth-key"))
	link, err := repos.Links.UpsertLink(ctx, wall.WallID, authHash[:], wall.CurrentVersion, "encrypted-link-wall-key", "encrypted-owner-link-secret")
	require.NoError(t, err)
	sessionHash := sha256.Sum256([]byte("link-session-token"))
	require.NoError(t, repos.Links.CreateSession(ctx, sessionHash[:], link.WallID, link.AuthKeyHash, link.KeyVersion, timeutil.MicrosecondsAfterMinutes(5)))
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "link-session-token")

	resp, err := module.Walls.GetProfile(ginCtx, models.GetWallProfileRequest{WallID: wall.WallID})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, wall.WallID, resp.WallID)
}
