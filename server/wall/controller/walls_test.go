package controller

import (
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
	rotated, err := repos.Walls.RotateKey(ctx, aliceID, wall.WallID, "alice-wall-key-v2", "wrapped-prev-key", &profileV2)
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

func TestGetProfileIncludesFriendsCount(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice-friends@example.com", "alice-public")
	bobID := insertWallControllerUser(t, repos, "bob-friends@example.com", "bob-public")
	aliceWall, err := repos.Walls.CreateWall(ctx, aliceID, "alice-friends", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := repos.Walls.CreateWall(ctx, bobID, "bob-friends", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion))
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-friends-token", "127.0.0.1", "wall-test"))
	ginCtx := newPublicWallContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-friends-token")

	resp, err := module.Walls.GetProfile(ginCtx, models.GetWallProfileRequest{
		WallID: aliceWall.WallID,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.EqualValues(t, 1, resp.Friends)
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

func TestSlugAvailabilityReturnsFalseForExistingAndReservedSlugs(t *testing.T) {
	module, repos, _, ctx := setupWallAuthControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice-availability@example.com", "alice-public")
	_, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	ginCtx := newPublicWallContext()

	existing, err := module.Walls.SlugAvailability(ginCtx, "Alice")
	require.NoError(t, err)
	require.False(t, existing.Available)

	reserved, err := module.Walls.SlugAvailability(ginCtx, "support")
	require.NoError(t, err)
	require.False(t, reserved.Available)

	free, err := module.Walls.SlugAvailability(ginCtx, "new-person")
	require.NoError(t, err)
	require.True(t, free.Available)
}
