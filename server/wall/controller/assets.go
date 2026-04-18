package controller

import (
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
)

const (
	maxUploadBytes      int64 = 2 * 1024 * 1024
	uploadURLExpiry           = 15 * time.Minute
	uploadPurposeAvatar       = "avatar"
)

type AssetsController struct {
	AssetsRepo *wallrepo.AssetsRepository
	WallsRepo  *wallrepo.WallsRepository
	FollowRepo *wallrepo.FollowRepository
	LinksRepo  *wallrepo.LinksRepository
	auth       authDeps
}

func (c *AssetsController) PresignUpload(ctx *gin.Context, req models.PresignUploadRequest) (*models.PresignUploadResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ContentType) == "" {
		return nil, ente.NewBadRequestWithMessage("contentType is required")
	}
	if req.Size <= 0 || req.Size > maxUploadBytes {
		return nil, ente.NewBadRequestWithMessage(fmt.Sprintf("size must be between 1 and %d bytes", maxUploadBytes))
	}
	if req.Purpose != nil && strings.TrimSpace(*req.Purpose) == uploadPurposeAvatar {
		if req.WallID == nil || strings.TrimSpace(*req.WallID) == "" {
			return nil, ente.NewBadRequestWithMessage("wallId is required for avatar uploads")
		}
		if _, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, strings.TrimSpace(*req.WallID)); err != nil {
			return nil, err
		}
	}

	bucketID := c.AssetsRepo.S3Config.GetHotDataCenter()
	bucket := c.AssetsRepo.S3Config.GetBucket(bucketID)
	s3Client := c.AssetsRepo.S3Config.GetS3Client(bucketID)

	keyPrefix := fmt.Sprintf("wall/%d/posts", userID)
	if req.Purpose != nil && strings.TrimSpace(*req.Purpose) == uploadPurposeAvatar {
		keyPrefix = fmt.Sprintf("wall/%d/avatar", userID)
	}
	objectKey := fmt.Sprintf("%s/%s", keyPrefix, base.MustNewID("wo"))
	input := &s3.PutObjectInput{
		Bucket:        bucket,
		Key:           aws.String(objectKey),
		ContentLength: aws.Int64(req.Size),
		ContentType:   aws.String(req.ContentType),
	}
	putReq, _ := s3Client.PutObjectRequest(input)
	url, err := putReq.Presign(uploadURLExpiry)
	if err != nil {
		return nil, err
	}
	return &models.PresignUploadResponse{
		URL:       url,
		Method:    "PUT",
		Headers:   map[string]string{"Content-Type": req.ContentType},
		ObjectKey: objectKey,
		ExpiresIn: int(uploadURLExpiry.Seconds()),
	}, nil
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
	ok, err := c.AssetsRepo.AssetBelongsToWall(ctx.Request.Context(), wall.WallID, req.ObjectKey)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ente.ErrNotFound
	}
	bucketID := c.AssetsRepo.S3Config.GetHotDataCenter()
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
