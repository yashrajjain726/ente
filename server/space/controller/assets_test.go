package controller

import (
	"strconv"
	"testing"

	"github.com/ente-io/museum/space/models"
	"github.com/stretchr/testify/require"
)

func TestPresignUploadRejectsOversizedPost(t *testing.T) {
	controller := &AssetsController{}
	ctx := newSpaceControllerContext(1)

	_, err := controller.PresignUpload(ctx, models.PresignUploadRequest{
		Size:       maxPostUploadBytes + 1,
		ContentMD5: "XUFAKrxLKna5cZ2REBfFkg==",
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), strconv.FormatInt(maxPostUploadBytes, 10))
}

func TestPresignUploadRejectsOversizedAvatar(t *testing.T) {
	controller := &AssetsController{}
	ctx := newSpaceControllerContext(1)
	purpose := uploadPurposeAvatar

	_, err := controller.PresignUpload(ctx, models.PresignUploadRequest{
		Size:       maxAvatarUploadBytes + 1,
		ContentMD5: "XUFAKrxLKna5cZ2REBfFkg==",
		Purpose:    &purpose,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), strconv.FormatInt(maxAvatarUploadBytes, 10))
}

func TestPresignUploadRejectsOversizedCover(t *testing.T) {
	controller := &AssetsController{}
	ctx := newSpaceControllerContext(1)
	purpose := uploadPurposeCover

	_, err := controller.PresignUpload(ctx, models.PresignUploadRequest{
		Size:       maxCoverUploadBytes + 1,
		ContentMD5: "XUFAKrxLKna5cZ2REBfFkg==",
		Purpose:    &purpose,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), strconv.FormatInt(maxCoverUploadBytes, 10))
}

func TestMaxUploadBytesForPurpose(t *testing.T) {
	postLimit, err := maxUploadBytesForPurpose(uploadPurposePost)
	require.NoError(t, err)
	require.Equal(t, maxPostUploadBytes, postLimit)

	avatarLimit, err := maxUploadBytesForPurpose(uploadPurposeAvatar)
	require.NoError(t, err)
	require.Equal(t, maxAvatarUploadBytes, avatarLimit)

	coverLimit, err := maxUploadBytesForPurpose(uploadPurposeCover)
	require.NoError(t, err)
	require.Equal(t, maxCoverUploadBytes, coverLimit)
}

func TestNormalizeContentMD5(t *testing.T) {
	normalized, err := normalizeContentMD5("5d41402abc4b2a76b9719d911017c592")
	require.NoError(t, err)
	require.Equal(t, "XUFAKrxLKna5cZ2REBfFkg==", normalized)

	normalized, err = normalizeContentMD5(" XUFAKrxLKna5cZ2REBfFkg== ")
	require.NoError(t, err)
	require.Equal(t, "XUFAKrxLKna5cZ2REBfFkg==", normalized)
}

func TestNormalizeContentMD5RejectsInvalidValues(t *testing.T) {
	_, err := normalizeContentMD5("")
	require.Error(t, err)
	require.Contains(t, err.Error(), "contentMD5 is required")

	_, err = normalizeContentMD5("not-md5")
	require.Error(t, err)
	require.Contains(t, err.Error(), "contentMD5 must be base64 or hex encoded")

	_, err = normalizeContentMD5("aGVsbG8=")
	require.Error(t, err)
	require.Contains(t, err.Error(), "contentMD5 must be exactly 16 bytes")
}
