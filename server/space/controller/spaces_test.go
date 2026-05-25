package controller

import (
	"strconv"
	"testing"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/stretchr/testify/require"
)

func TestGetProfileReturnsHistoricalVersion(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice@example.com", "alice-public")
	space, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	profileV2 := "alice-profile-v2"
	rotated, err := repos.Spaces.RotateKey(ctx, aliceID, space.SpaceID, space.CurrentVersion, "alice-space-key-v2", "wrapped-prev-key", &profileV2)
	require.NoError(t, err)
	require.Equal(t, 2, rotated.CurrentVersion)
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-token", "127.0.0.1", "space-test"))
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-token")
	version := 1

	resp, err := module.Spaces.GetProfile(ginCtx, models.GetSpaceProfileRequest{
		SpaceID: space.SpaceID,
		Version: &version,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, space.SpaceID, resp.SpaceID)
	require.Equal(t, "alice", resp.SpaceSlug)
	require.Equal(t, 1, resp.Version)
	require.Equal(t, "alice-profile-v1", resp.EncryptedProfile)
	require.NotEmpty(t, resp.UpdatedAt)
	require.Nil(t, resp.Avatar)
}

func TestGetProfileIncludesFriendsCount(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-friends@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob-friends@example.com", "bob-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-friends", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := repos.Spaces.CreateSpace(ctx, bobID, "bob-friends", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion))
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-friends-token", "127.0.0.1", "space-test"))
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-friends-token")

	resp, err := module.Spaces.GetProfile(ginCtx, models.GetSpaceProfileRequest{
		SpaceID: aliceSpace.SpaceID,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.EqualValues(t, 1, resp.Friends)
}

func TestGetProfileRejectsInvalidVersion(t *testing.T) {
	module, repos, userAuthRepo, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice@example.com", "alice-public")
	space, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	require.NoError(t, userAuthRepo.AddToken(aliceID, ente.Photos, "alice-token", "127.0.0.1", "space-test"))
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set("X-Auth-Token", "alice-token")
	version := 0

	resp, err := module.Spaces.GetProfile(ginCtx, models.GetSpaceProfileRequest{
		SpaceID: space.SpaceID,
		Version: &version,
	})

	require.Nil(t, resp)
	require.Error(t, err)
}

func TestRotateKeyRejectsStaleKeyVersion(t *testing.T) {
	module, repos, _, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice@example.com", "alice-public")
	space, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set("X-Auth-User-ID", strconv.FormatInt(aliceID, 10))
	profileV2 := "alice-profile-v2"

	resp, err := module.Spaces.RotateKey(ginCtx, models.RotateSpaceKeyRequest{
		SpaceID:           space.SpaceID,
		KeyVersion:        space.CurrentVersion + 1,
		EncryptedSpaceKey: "alice-space-key-v2",
		WrappedPrevKey:    "wrapped-prev-key",
		EncryptedProfile:  &profileV2,
	})

	require.Nil(t, resp)
	var apiErr *ente.ApiError
	require.ErrorAs(t, err, &apiErr)
	require.Equal(t, ente.BadRequest, apiErr.Code)
	require.Equal(t, "keyVersion does not match current space version", apiErr.Message)
}

func TestUpdateProfileRejectsStaleKeyVersion(t *testing.T) {
	module, repos, _, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice@example.com", "alice-public")
	space, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key-v1", "alice-profile-v1")
	require.NoError(t, err)
	ginCtx := newPublicSpaceContext()
	ginCtx.Request.Header.Set("X-Auth-User-ID", strconv.FormatInt(aliceID, 10))

	resp, err := module.Spaces.UpdateProfile(ginCtx, models.UpdateSpaceProfileRequest{
		SpaceID:          space.SpaceID,
		KeyVersion:       space.CurrentVersion + 1,
		EncryptedProfile: "alice-profile-v2",
	})

	require.Nil(t, resp)
	var apiErr *ente.ApiError
	require.ErrorAs(t, err, &apiErr)
	require.Equal(t, ente.BadRequest, apiErr.Code)
	require.Equal(t, "keyVersion does not match current space version", apiErr.Message)
}

func TestSlugAvailabilityReturnsFalseForExistingAndReservedSlugs(t *testing.T) {
	module, repos, _, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-availability@example.com", "alice-public")
	_, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	ginCtx := newPublicSpaceContext()

	existing, err := module.Spaces.SlugAvailability(ginCtx, "Alice")
	require.NoError(t, err)
	require.False(t, existing.Available)

	reserved, err := module.Spaces.SlugAvailability(ginCtx, "support")
	require.NoError(t, err)
	require.False(t, reserved.Available)

	free, err := module.Spaces.SlugAvailability(ginCtx, "new-person")
	require.NoError(t, err)
	require.True(t, free.Available)
}
