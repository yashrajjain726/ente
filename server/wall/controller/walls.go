package controller

import (
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
)

type WallsController struct {
	WallsRepo  *repo.WallsRepository
	AssetsRepo *repo.AssetsRepository
	auth       authDeps
}

func (c *WallsController) List(ctx *gin.Context, _ models.ListWallsRequest) ([]models.WallKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	walls, err := c.WallsRepo.ListWallsByOwner(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.WallKeyResponse, 0, len(walls))
	for _, wall := range walls {
		resp = append(resp, *toWallKeyResponse(&wall))
	}
	return resp, nil
}

func (c *WallsController) Create(ctx *gin.Context, req models.CreateWallRequest) (*models.WallKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WallSlug) == "" || strings.TrimSpace(req.EncryptedWallKey) == "" {
		return nil, ente.NewBadRequestWithMessage("wallSlug and encryptedWallKey are required")
	}
	wall, err := c.WallsRepo.CreateWall(ctx.Request.Context(), userID, req.WallSlug, req.EncryptedWallKey, req.EncryptedProfile)
	if err != nil {
		return nil, err
	}
	return toWallKeyResponse(wall), nil
}

func (c *WallsController) GetProfile(ctx *gin.Context, req models.GetWallProfileRequest) (*models.WallProfileResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), strings.TrimSpace(req.WallID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), viewer, wall); err != nil {
		return nil, err
	}
	if req.Version != nil {
		if *req.Version <= 0 {
			return nil, ente.NewBadRequestWithMessage("invalid version")
		}
		if *req.Version != wall.CurrentVersion {
			version, err := c.WallsRepo.GetVersion(ctx.Request.Context(), wall.WallID, *req.Version)
			if err != nil {
				return nil, err
			}
			return &models.WallProfileResponse{
				WallID:           wall.WallID,
				WallSlug:         wall.WallSlug,
				Version:          version.Version,
				EncryptedProfile: version.EncryptedProfile,
				UpdatedAt:        formatMicros(version.CreatedAt),
			}, nil
		}
	}
	return &models.WallProfileResponse{
		WallID:           wall.WallID,
		WallSlug:         wall.WallSlug,
		Version:          wall.CurrentVersion,
		EncryptedProfile: wall.EncryptedProfile,
		UpdatedAt:        formatMicros(wall.UpdatedAt),
		Avatar:           toAvatarResponse(wall),
	}, nil
}

func (c *WallsController) UpdateProfile(ctx *gin.Context, req models.UpdateWallProfileRequest) (*models.UpdateWallProfileResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WallID) == "" || strings.TrimSpace(req.EncryptedProfile) == "" {
		return nil, ente.NewBadRequestWithMessage("wallId and encryptedProfile are required")
	}
	if req.RemoveAvatar && req.Avatar != nil {
		return nil, ente.NewBadRequestWithMessage("avatar and removeAvatar cannot both be set")
	}
	wallID := strings.TrimSpace(req.WallID)
	if _, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, wallID); err != nil {
		return nil, err
	}
	avatar := (*struct {
		ObjectKey string
		BucketID  string
		Size      int64
	})(nil)
	if req.Avatar != nil {
		staged, err := verifyStagedUpload(ctx, c.AssetsRepo, userID, req.Avatar.ObjectKey, repo.TempObjectPurposeAvatar, &wallID)
		if err != nil {
			return nil, err
		}
		avatar = &struct {
			ObjectKey string
			BucketID  string
			Size      int64
		}{
			ObjectKey: staged.ObjectKey,
			BucketID:  staged.BucketID,
			Size:      staged.ExpectedSize,
		}
	}
	wall, err := c.WallsRepo.UpdateProfile(ctx.Request.Context(), userID, wallID, req.EncryptedProfile, avatar, req.RemoveAvatar)
	if err != nil {
		return nil, err
	}
	return &models.UpdateWallProfileResponse{
		Status: "updated",
		Avatar: toAvatarResponse(wall),
	}, nil
}

func (c *WallsController) UpdateSlug(ctx *gin.Context, wallID string, req models.UpdateWallSlugRequest) (*models.WallLookupResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WallSlug) == "" {
		return nil, ente.NewBadRequestWithMessage("wallSlug is required")
	}
	wall, err := c.WallsRepo.UpdateSlug(ctx.Request.Context(), userID, strings.TrimSpace(wallID), req.WallSlug)
	if err != nil {
		return nil, err
	}
	publicKey, err := c.WallsRepo.GetOwnerPublicKey(ctx.Request.Context(), wall.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.WallLookupResponse{WallID: wall.WallID, WallSlug: wall.WallSlug, Owner: wall.WallSlug, PublicKey: publicKey}, nil
}

func (c *WallsController) LookupBySlug(ctx *gin.Context, wallSlug string) (*models.WallLookupResponse, error) {
	wall, err := c.WallsRepo.GetWallBySlug(ctx.Request.Context(), wallSlug)
	if err != nil {
		return nil, err
	}
	publicKey, err := c.WallsRepo.GetOwnerPublicKey(ctx.Request.Context(), wall.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.WallLookupResponse{
		WallID:    wall.WallID,
		WallSlug:  wall.WallSlug,
		Owner:     wall.WallSlug,
		PublicKey: publicKey,
	}, nil
}

func (c *WallsController) RotateKey(ctx *gin.Context, req models.RotateWallKeyRequest) (*models.WallKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WallID) == "" || strings.TrimSpace(req.EncryptedWallKey) == "" || strings.TrimSpace(req.WrappedPrevKey) == "" {
		return nil, ente.NewBadRequestWithMessage("wallId, encryptedWallKey and wrappedPrevKey are required")
	}
	wall, err := c.WallsRepo.RotateKey(ctx.Request.Context(), userID, req.WallID, req.EncryptedWallKey, req.WrappedPrevKey, req.EncryptedProfile)
	if err != nil {
		return nil, err
	}
	return toWallKeyResponse(wall), nil
}

func (c *WallsController) ListVersions(ctx *gin.Context, req models.GetWallProfileRequest) ([]models.WallKeyVersionResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), strings.TrimSpace(req.WallID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), viewer, wall); err != nil {
		return nil, err
	}
	versions, err := c.WallsRepo.ListVersions(ctx.Request.Context(), wall.WallID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.WallKeyVersionResponse, 0, len(versions))
	for _, version := range versions {
		item := models.WallKeyVersionResponse{
			Version:   version.Version,
			CreatedAt: formatMicros(version.CreatedAt),
		}
		if version.WrappedPrevKey.Valid {
			item.WrappedPrevKey = version.WrappedPrevKey.String
		}
		resp = append(resp, item)
	}
	return resp, nil
}
