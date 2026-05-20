package controller

import (
	"context"
	"testing"

	"github.com/ente-io/museum/space/models"
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/stretchr/testify/require"
)

func setupFriendsControllerTest(t *testing.T) (*FriendsController, *spacerepo.Module, context.Context) {
	t.Helper()
	_, repos, ctx := setupPostsControllerTest(t)
	return NewModule(repos, nil).Friends, repos, ctx
}

func TestFriendRelationshipReportsSelfFriendAndEmpty(t *testing.T) {
	friends, repos, ctx := setupFriendsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob@example.com", "bob-public")
	charlieID := insertSpaceControllerUser(t, repos, "charlie@example.com", "charlie-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := repos.Spaces.CreateSpace(ctx, bobID, "bob", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	charlieSpace, err := repos.Spaces.CreateSpace(ctx, charlieID, "charlie", "charlie-space-key", "charlie-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion))

	resp, err := friends.Relationship(newSpaceControllerContext(aliceID), models.FriendRelationshipRequest{TargetSpaceID: aliceSpace.SpaceID})
	require.NoError(t, err)
	require.Equal(t, "self", resp.Relationship)

	resp, err = friends.Relationship(newSpaceControllerContext(aliceID), models.FriendRelationshipRequest{TargetSpaceID: bobSpace.SpaceID})
	require.NoError(t, err)
	require.Equal(t, "friend", resp.Relationship)

	resp, err = friends.Relationship(newSpaceControllerContext(aliceID), models.FriendRelationshipRequest{TargetSpaceID: charlieSpace.SpaceID})
	require.NoError(t, err)
	require.Empty(t, resp.Relationship)
}

func TestUnfriendBySpaceIDRemovesReciprocalShares(t *testing.T) {
	friends, repos, ctx := setupFriendsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-unfriend-space@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob-unfriend-space@example.com", "bob-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-unfriend-space", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := repos.Spaces.CreateSpace(ctx, bobID, "bob-unfriend-space", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion))

	err = friends.Unfriend(newSpaceControllerContext(aliceID), models.FriendTargetPayload{TargetSpaceID: &bobSpace.SpaceID})

	require.NoError(t, err)
	aliceShares, err := repos.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Empty(t, aliceShares)
	bobShares, err := repos.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Empty(t, bobShares)
}

func TestUnfriendByUsernameRemovesReciprocalShares(t *testing.T) {
	friends, repos, ctx := setupFriendsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-unfriend-username@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob-unfriend-username@example.com", "bob-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-unfriend-username", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := repos.Spaces.CreateSpace(ctx, bobID, "bob-unfriend-username", "bob-space-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceSpace.SpaceID, bobSpace.SpaceID, "bob-share-key", bobSpace.CurrentVersion, "alice-share-key", aliceSpace.CurrentVersion))

	targetUsername := "bob-unfriend-username"
	err = friends.Unfriend(newSpaceControllerContext(aliceID), models.FriendTargetPayload{TargetUsername: &targetUsername})

	require.NoError(t, err)
	aliceShares, err := repos.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Empty(t, aliceShares)
	bobShares, err := repos.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Empty(t, bobShares)
}
