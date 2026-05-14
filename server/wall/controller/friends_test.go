package controller

import (
	"context"
	"testing"

	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/stretchr/testify/require"
)

func setupFriendsControllerTest(t *testing.T) (*FriendsController, *wallrepo.Module, context.Context) {
	t.Helper()
	_, repos, ctx := setupPostsControllerTest(t)
	return NewModule(repos, nil).Friends, repos, ctx
}

func TestFriendRelationshipReportsSelfFriendAndEmpty(t *testing.T) {
	friends, repos, ctx := setupFriendsControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice@example.com", "alice-public")
	bobID := insertWallControllerUser(t, repos, "bob@example.com", "bob-public")
	charlieID := insertWallControllerUser(t, repos, "charlie@example.com", "charlie-public")
	aliceWall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := repos.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	charlieWall, err := repos.Walls.CreateWall(ctx, charlieID, "charlie", "charlie-wall-key", "charlie-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion))

	resp, err := friends.Relationship(newWallControllerContext(aliceID), models.FriendRelationshipRequest{TargetWallID: aliceWall.WallID})
	require.NoError(t, err)
	require.Equal(t, "self", resp.Relationship)

	resp, err = friends.Relationship(newWallControllerContext(aliceID), models.FriendRelationshipRequest{TargetWallID: bobWall.WallID})
	require.NoError(t, err)
	require.Equal(t, "friend", resp.Relationship)

	resp, err = friends.Relationship(newWallControllerContext(aliceID), models.FriendRelationshipRequest{TargetWallID: charlieWall.WallID})
	require.NoError(t, err)
	require.Empty(t, resp.Relationship)
}

func TestUnfriendByWallIDRemovesReciprocalShares(t *testing.T) {
	friends, repos, ctx := setupFriendsControllerTest(t)
	aliceID := insertWallControllerUser(t, repos, "alice-unfriend-wall@example.com", "alice-public")
	bobID := insertWallControllerUser(t, repos, "bob-unfriend-wall@example.com", "bob-public")
	aliceWall, err := repos.Walls.CreateWall(ctx, aliceID, "alice-unfriend-wall", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := repos.Walls.CreateWall(ctx, bobID, "bob-unfriend-wall", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion))

	err = friends.Unfriend(newWallControllerContext(aliceID), models.FriendTargetPayload{TargetWallID: &bobWall.WallID})

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
	aliceID := insertWallControllerUser(t, repos, "alice-unfriend-username@example.com", "alice-public")
	bobID := insertWallControllerUser(t, repos, "bob-unfriend-username@example.com", "bob-public")
	aliceWall, err := repos.Walls.CreateWall(ctx, aliceID, "alice-unfriend-username", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := repos.Walls.CreateWall(ctx, bobID, "bob-unfriend-username", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion))

	targetUsername := "bob-unfriend-username"
	err = friends.Unfriend(newWallControllerContext(aliceID), models.FriendTargetPayload{TargetUsername: &targetUsername})

	require.NoError(t, err)
	aliceShares, err := repos.Friends.ListSharesForFriend(ctx, aliceID)
	require.NoError(t, err)
	require.Empty(t, aliceShares)
	bobShares, err := repos.Friends.ListSharesForFriend(ctx, bobID)
	require.NoError(t, err)
	require.Empty(t, bobShares)
}
