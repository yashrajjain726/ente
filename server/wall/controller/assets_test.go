package controller

import (
	"strconv"
	"testing"

	"github.com/ente-io/museum/wall/models"
	"github.com/stretchr/testify/require"
)

func TestPresignUploadRejectsOversizedPost(t *testing.T) {
	controller := &AssetsController{}
	ctx := newWallControllerContext(1)

	_, err := controller.PresignUpload(ctx, models.PresignUploadRequest{
		Size: maxPostUploadBytes + 1,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), strconv.FormatInt(maxPostUploadBytes, 10))
}

func TestPresignUploadRejectsOversizedAvatar(t *testing.T) {
	controller := &AssetsController{}
	ctx := newWallControllerContext(1)
	purpose := uploadPurposeAvatar

	_, err := controller.PresignUpload(ctx, models.PresignUploadRequest{
		Size:    maxAvatarUploadBytes + 1,
		Purpose: &purpose,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), strconv.FormatInt(maxAvatarUploadBytes, 10))
}

func TestMaxUploadBytesForPurpose(t *testing.T) {
	postLimit, err := maxUploadBytesForPurpose(uploadPurposePost)
	require.NoError(t, err)
	require.Equal(t, maxPostUploadBytes, postLimit)

	avatarLimit, err := maxUploadBytesForPurpose(uploadPurposeAvatar)
	require.NoError(t, err)
	require.Equal(t, maxAvatarUploadBytes, avatarLimit)
}
