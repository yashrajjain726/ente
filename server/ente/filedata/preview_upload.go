package filedata

import (
	"crypto/md5"
	"encoding/base64"
	"fmt"

	"github.com/ente/museum/ente"
)

const (
	maxPreviewUploadSize = int64(10 << 30)
	maxPreviewPartSize   = int64(5 << 30)
	minPreviewPartSize   = int64(5 << 20)
)

type PreviewUploadRequest struct {
	FileID        int64           `json:"fileID" binding:"required"`
	Type          ente.ObjectType `json:"type" binding:"required"`
	ContentLength int64           `json:"contentLength" binding:"required"`
	ContentMD5    string          `json:"contentMD5" binding:"required"`
}

func (r PreviewUploadRequest) Validate() error {
	if err := validatePreviewUpload(r.FileID, r.Type, r.ContentLength); err != nil {
		return err
	}
	if r.ContentLength > maxPreviewPartSize {
		return ente.NewBadRequestWithMessage("previews larger than 5 GiB require multipart upload")
	}
	return validatePreviewMD5(r.ContentMD5)
}

type MultipartPreviewUploadRequest struct {
	FileID        int64           `json:"fileID" binding:"required"`
	Type          ente.ObjectType `json:"type" binding:"required"`
	ContentLength int64           `json:"contentLength" binding:"required"`
	PartLength    int64           `json:"partLength" binding:"required"`
	PartMD5s      []string        `json:"partMd5s" binding:"required"`
}

func (r MultipartPreviewUploadRequest) Validate() error {
	if err := validatePreviewUpload(r.FileID, r.Type, r.ContentLength); err != nil {
		return err
	}
	if r.PartLength <= 0 || r.PartLength > maxPreviewPartSize {
		return ente.NewBadRequestWithMessage("partLength must be between 1 byte and 5 GiB")
	}
	if r.ContentLength > r.PartLength && r.PartLength < minPreviewPartSize {
		return ente.NewBadRequestWithMessage("partLength must be at least 5 MiB when more than one part is required")
	}
	partCount := (r.ContentLength-1)/r.PartLength + 1
	if int64(len(r.PartMD5s)) != partCount {
		return ente.NewBadRequestWithMessage(fmt.Sprintf("partMd5s must contain exactly %d checksums", partCount))
	}
	for _, checksum := range r.PartMD5s {
		if err := validatePreviewMD5(checksum); err != nil {
			return err
		}
	}
	return nil
}

func validatePreviewUpload(fileID int64, objectType ente.ObjectType, contentLength int64) error {
	if fileID <= 0 {
		return ente.NewBadRequestWithMessage("fileID must be greater than 0")
	}
	if objectType != ente.PreviewVideo && objectType != ente.PreviewImage {
		return ente.NewBadRequestWithMessage(fmt.Sprintf("unsupported object type %s", objectType))
	}
	if contentLength <= 0 || contentLength > maxPreviewUploadSize {
		return ente.NewBadRequestWithMessage("contentLength must be between 1 byte and 10 GiB")
	}
	return nil
}

func validatePreviewMD5(checksum string) error {
	digest, err := base64.StdEncoding.DecodeString(checksum)
	if err != nil || len(digest) != md5.Size || base64.StdEncoding.EncodeToString(digest) != checksum {
		return ente.NewBadRequestWithMessage("MD5 checksums must be base64-encoded 16-byte digests")
	}
	return nil
}
