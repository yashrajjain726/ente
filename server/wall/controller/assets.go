package controller

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/ente/base"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
)

const (
	maxPostUploadBytes     int64 = 10 * 1024 * 1024
	maxAvatarUploadBytes   int64 = 2 * 1024 * 1024
	uploadURLExpiry              = 15 * time.Minute
	uploadTempObjectExpiry       = 2 * uploadURLExpiry
	uploadPurposePost            = wallrepo.TempObjectPurposePost
	uploadPurposeAvatar          = wallrepo.TempObjectPurposeAvatar
	uploadContentType            = "application/octet-stream"
)

type AssetsController struct {
	AssetsRepo *wallrepo.AssetsRepository
	WallsRepo  *wallrepo.WallsRepository
	LinksRepo  *wallrepo.LinksRepository
	auth       authDeps
}

func (c *AssetsController) PresignUpload(ctx *gin.Context, req models.PresignUploadRequest) (*models.PresignUploadResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	purpose := uploadPurposePost
	if req.Purpose != nil && strings.TrimSpace(*req.Purpose) != "" {
		purpose = strings.TrimSpace(*req.Purpose)
	}
	maxUploadBytes, err := maxUploadBytesForPurpose(purpose)
	if err != nil {
		return nil, err
	}
	if req.Size <= 0 || req.Size > maxUploadBytes {
		return nil, ente.NewBadRequestWithMessage(fmt.Sprintf("size must be between 1 and %d bytes", maxUploadBytes))
	}
	var wallID sql.NullString
	switch purpose {
	case uploadPurposePost:
	case uploadPurposeAvatar:
		if req.WallID == nil || strings.TrimSpace(*req.WallID) == "" {
			return nil, ente.NewBadRequestWithMessage("wallId is required for avatar uploads")
		}
		wallID.String = strings.TrimSpace(*req.WallID)
		wallID.Valid = true
		if _, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, wallID.String); err != nil {
			return nil, err
		}
	default:
		return nil, ente.NewBadRequestWithMessage("invalid upload purpose")
	}

	bucketID := c.AssetsRepo.S3Config.GetHotDataCenter()
	bucket := c.AssetsRepo.S3Config.GetBucket(bucketID)
	s3Client := c.AssetsRepo.S3Config.GetS3Client(bucketID)

	keyPrefix := fmt.Sprintf("wall/%d/posts", userID)
	if purpose == uploadPurposeAvatar {
		keyPrefix = fmt.Sprintf("wall/%d/avatar", userID)
	}
	objectKey := fmt.Sprintf("%s/%s", keyPrefix, base.MustNewID("wo"))
	input := &s3.PutObjectInput{
		Bucket:        bucket,
		Key:           aws.String(objectKey),
		ContentLength: aws.Int64(req.Size),
		ContentType:   aws.String(uploadContentType),
	}
	putReq, _ := s3Client.PutObjectRequest(input)
	url, err := putReq.Presign(uploadURLExpiry)
	if err != nil {
		return nil, err
	}
	err = c.AssetsRepo.AddTempObject(ctx.Request.Context(), wallrepo.WallTempObjectRecord{
		ObjectKey:    objectKey,
		OwnerID:      userID,
		WallID:       wallID,
		Purpose:      purpose,
		BucketID:     bucketID,
		ExpectedSize: req.Size,
		ExpiresAt:    timeutil.Microseconds() + int64(uploadTempObjectExpiry/time.Microsecond),
	})
	if err != nil {
		return nil, err
	}
	return &models.PresignUploadResponse{
		URL:       url,
		Method:    "PUT",
		Headers:   map[string]string{"Content-Type": uploadContentType},
		ObjectKey: objectKey,
		ExpiresIn: int(uploadURLExpiry.Seconds()),
	}, nil
}

func maxUploadBytesForPurpose(purpose string) (int64, error) {
	switch purpose {
	case uploadPurposePost:
		return maxPostUploadBytes, nil
	case uploadPurposeAvatar:
		return maxAvatarUploadBytes, nil
	default:
		return 0, ente.NewBadRequestWithMessage("invalid upload purpose")
	}
}

func verifyStagedUpload(ctx *gin.Context, assetsRepo *wallrepo.AssetsRepository, ownerID int64, objectKey, purpose string, wallID *string) (*wallrepo.WallTempObjectRecord, error) {
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" {
		return nil, ente.NewBadRequestWithMessage("objectKey is required")
	}
	rec, err := assetsRepo.GetTempObject(ctx.Request.Context(), ownerID, objectKey, purpose, wallID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("staged wall upload not found")
		}
		return nil, err
	}
	if rec.ExpiresAt <= timeutil.Microseconds() {
		return nil, ente.NewBadRequestWithMessage("staged wall upload expired")
	}
	s3Client := assetsRepo.S3Config.GetS3Client(rec.BucketID)
	head, err := s3Client.HeadObject(&s3.HeadObjectInput{
		Bucket: assetsRepo.S3Config.GetBucket(rec.BucketID),
		Key:    aws.String(rec.ObjectKey),
	})
	if err != nil {
		return nil, err
	}
	if head.ContentLength == nil || *head.ContentLength != rec.ExpectedSize {
		return nil, ente.NewBadRequestWithMessage("wall upload size mismatch")
	}
	return rec, nil
}

func (c *AssetsController) Redirect(ctx *gin.Context, req models.AssetRedirectRequest) (*models.AssetDownloadResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), req.WallID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), viewer, wall); err != nil {
		return nil, err
	}
	bucketID, err := c.AssetsRepo.GetAssetBucketID(ctx.Request.Context(), wall.WallID, req.ObjectKey)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		return nil, ente.ErrNotFound
	}
	bucket := c.AssetsRepo.S3Config.GetBucket(bucketID)
	s3Client := c.AssetsRepo.S3Config.GetS3Client(bucketID)
	getReq, _ := s3Client.GetObjectRequest(&s3.GetObjectInput{Bucket: bucket, Key: aws.String(req.ObjectKey)})
	url, err := getReq.Presign(uploadURLExpiry)
	if err != nil {
		return nil, err
	}
	return &models.AssetDownloadResponse{
		URL:       url,
		ExpiresIn: int(uploadURLExpiry.Seconds()),
	}, nil
}
