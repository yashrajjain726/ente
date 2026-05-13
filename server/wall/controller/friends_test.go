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
	devID := insertWallControllerUser(t, repos, "dev@example.com", "dev-public")
	aliceWall, err := repos.Walls.CreateWall(ctx, aliceID, "alice", "alice-wall-key", "alice-profile")
	require.NoError(t, err)
	bobWall, err := repos.Walls.CreateWall(ctx, bobID, "bob", "bob-wall-key", "bob-profile")
	require.NoError(t, err)
	devWall, err := repos.Walls.CreateWall(ctx, devID, "dev", "dev-wall-key", "dev-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, aliceID, aliceWall.WallID, bobWall.WallID, "bob-share-key", bobWall.CurrentVersion, "alice-share-key", aliceWall.CurrentVersion))

	resp, err := friends.Relationship(newWallControllerContext(aliceID), models.FriendRelationshipRequest{TargetWallID: aliceWall.WallID})
	require.NoError(t, err)
	require.Equal(t, "self", resp.Relationship)

	resp, err = friends.Relationship(newWallControllerContext(aliceID), models.FriendRelationshipRequest{TargetWallID: bobWall.WallID})
	require.NoError(t, err)
	require.Equal(t, "friend", resp.Relationship)

	resp, err = friends.Relationship(newWallControllerContext(aliceID), models.FriendRelationshipRequest{TargetWallID: devWall.WallID})
	require.NoError(t, err)
	require.Empty(t, resp.Relationship)
}
