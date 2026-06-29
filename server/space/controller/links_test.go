package controller

import (
	"encoding/base64"
	"testing"

	"github.com/ente-io/museum/space/models"
	"github.com/stretchr/testify/require"
)

func TestCreateSpaceLinkReturnsExistingActiveLink(t *testing.T) {
	module, repos, _, ctx := setupSpaceAuthControllerTest(t)
	aliceID := insertSpaceControllerUser(t, repos, "alice-link-create@example.com", "alice-public")
	space, err := testCreateSpace(ctx, repos, aliceID, "alice_link_create", "alice-space-key", "alice-link-create-public", "alice-link-create-secret", "alice-link-create-secret-nonce", "alice-profile")
	require.NoError(t, err)
	existing, err := testUpsertLink(ctx, repos, space.SpaceID, []byte("old-hash"), space.CurrentVersion, "old-space-link-key", "old-owner-link-secret")
	require.NoError(t, err)
	authKey := make([]byte, 32)
	for i := range authKey {
		authKey[i] = byte(i + 1)
	}

	resp, err := module.Links.Create(ctx, space, models.SpaceLinkCreateRequest{
		AuthKey:             base64.StdEncoding.EncodeToString(authKey),
		KeyVersion:          space.CurrentVersion,
		LinkWrappedSpaceKey: base64.StdEncoding.EncodeToString([]byte("new-space-link-key")),
		EncryptedAccessKey:  base64.StdEncoding.EncodeToString([]byte("new-owner-link-secret")),
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.True(t, resp.Active)
	require.Equal(t, existing.SpaceID, resp.SpaceID)
	require.Equal(t, existing.SpaceSlug, resp.SpaceSlug)
	require.Equal(t, existing.KeyVersion, resp.KeyVersion)
	require.Equal(t, base64.StdEncoding.EncodeToString(existing.EncryptedAccessKey), resp.EncryptedAccessKey)
}
