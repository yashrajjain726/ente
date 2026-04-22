package controller

import (
	"strconv"
	"testing"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/stretchr/testify/require"
)

func TestGetProfileReturnsHistoricalVersion(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	profileV2 := "alice-profile-v2"
	rotated, err := repos.Walls.RotateKey(ctx, aliceID, wall.WallID, wall.CurrentVersion, "alice-wall-key-v2", "wrapped-prev-key", &profileV2)
	require.NoError(t, err)
	require.Equal(t, 2, rotated.CurrentVersion)
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-token", "127.0.0.1", "wall-test"))
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-token")
	version := 1

	resp, err := module.Walls.GetProfile(ginCtx, models.GetWallProfileRequest{
		WallID:  wall.WallID,
		Version: &version,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, wall.WallID, resp.WallID)
	require.Equal(t, "alice", resp.WallSlug)
	require.Equal(t, 1, resp.Version)
	require.Equal(t, "alice-profile-v1", resp.EncryptedProfile)
	require.NotEmpty(t, resp.UpdatedAt)
	require.Nil(t, resp.Avatar)
}

func TestGetProfileRejectsInvalidVersion(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-token", "127.0.0.1", "wall-test"))
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-token")
	version := 0

	resp, err := module.Walls.GetProfile(ginCtx, models.GetWallProfileRequest{
		WallID:  wall.WallID,
		Version: &version,
	})

	require.Nil(t, resp)
	require.Error(t, err)
}

func TestRotateKeyRejectsStaleKeyVersion(t *testing.T) {
	module, repos, _, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	wall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-User-ID", strconv.FormatInt(aliceID, 10))
	profileV2 := "alice-profile-v2"

	resp, err := module.Walls.RotateKey(ginCtx, models.RotateWallKeyRequest{
		WallID:           wall.WallID,
		KeyVersion:       wall.CurrentVersion + 1,
		EncryptedWallKey: "alice-wall-key-v2",
		WrappedPrevKey:   "wrapped-prev-key",
		EncryptedProfile: &profileV2,
	})

	require.Nil(t, resp)
	var apiErr *ente.ApiError
	require.ErrorAs(t, err, &apiErr)
	require.Equal(t, ente.BadRequest, apiErr.Code)
	require.Equal(t, "keyVersion does not match current wall version", apiErr.Message)
}
