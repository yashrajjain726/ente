package filedata

import (
	"testing"

	"github.com/ente/museum/ente"
	"github.com/stretchr/testify/require"
)

func TestPreviewUploadSizeBoundaries(t *testing.T) {
	const checksum = "XUFAKrxLKna5cZ2REBfFkg=="
	for _, size := range []int64{1, ente.MaxMultipartPartSize} {
		require.NoError(t, (PreviewUploadRequest{
			FileID: 1, Type: ente.PreviewImage, ContentLength: size, ContentMD5: checksum,
		}).Validate())
	}
	for _, tc := range []struct {
		name       string
		size       int64
		partLength int64
		partCount  int
	}{
		{"small single part", 1, 1, 1},
		{"part length exceeds object", 1, ente.MinMultipartPartSize, 1},
		{"exact multiple", ente.MinMultipartPartSize * 2, ente.MinMultipartPartSize, 2},
		{"maximum size", maxPreviewUploadSize, ente.MaxMultipartPartSize, 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			checksums := make([]string, tc.partCount)
			for i := range checksums {
				checksums[i] = checksum
			}
			require.NoError(t, (MultipartPreviewUploadRequest{
				FileID: 1, Type: ente.PreviewVideo, ContentLength: tc.size,
				PartLength: tc.partLength, PartMD5s: checksums,
			}).Validate())
		})
	}
}
