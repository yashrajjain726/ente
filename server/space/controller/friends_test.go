package controller

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"testing"

	timeutil "github.com/ente-io/museum/pkg/utils/time"
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

func TestAddFriendRejectsOwnLink(t *testing.T) {
	friends, repos, ctx := setupFriendsControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-own-link@example.com", "alice-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-own-link", "alice-space-key", "alice-profile")
	require.NoError(t, err)
	authHash := sha256.Sum256([]byte("self-link-auth-key"))
	link, err := repos.Links.UpsertLink(ctx, aliceSpace.SpaceID, authHash[:], aliceSpace.CurrentVersion, "alice-link-key", "alice-link-secret")
	require.NoError(t, err)
	sessionHash := sha256.Sum256([]byte("self-link-session-token"))
	require.NoError(t, repos.Links.CreateSession(ctx, sessionHash[:], link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.MicrosecondsAfterMinutes(5)))

	resp, err := friends.Add(newSpaceControllerContext(aliceID), models.AddFriendPayload{
		TargetSpaceID:              aliceSpace.SpaceID,
		LinkSessionToken:           "self-link-session-token",
		RequesterSpaceID:           aliceSpace.SpaceID,
		TargetEncryptedSpaceKey:    base64.StdEncoding.EncodeToString([]byte("alice-target-key")),
		TargetKeyVersion:           aliceSpace.CurrentVersion,
		RequesterEncryptedSpaceKey: base64.StdEncoding.EncodeToString([]byte("alice-requester-key")),
		RequesterKeyVersion:        aliceSpace.CurrentVersion,
	})

	require.Nil(t, resp)
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot join your own space link")
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
