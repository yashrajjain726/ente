package controller

import (
	"database/sql"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type SpacesController struct {
	SpacesRepo *repo.SpacesRepository
	AssetsRepo *repo.AssetsRepository
	auth       authDeps
}

func (c *SpacesController) List(ctx *gin.Context, _ models.ListSpacesRequest) ([]models.SpaceKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	spaces, err := c.SpacesRepo.ListSpacesByOwner(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.SpaceKeyResponse, 0, len(spaces))
	for _, space := range spaces {
		resp = append(resp, *toSpaceKeyResponse(&space))
	}
	return resp, nil
}

func (c *SpacesController) Create(ctx *gin.Context, req models.CreateSpaceRequest) (*models.SpaceKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SpaceSlug) == "" || strings.TrimSpace(req.EncryptedSpaceKey) == "" {
		return nil, ente.NewBadRequestWithMessage("spaceSlug and encryptedSpaceKey are required")
	}
	space, err := c.SpacesRepo.CreateSpace(ctx.Request.Context(), userID, req.SpaceSlug, req.EncryptedSpaceKey, req.EncryptedProfile)
	if err != nil {
		return nil, err
	}
	return toSpaceKeyResponse(space), nil
}

func (c *SpacesController) GetProfile(ctx *gin.Context, req models.GetSpaceProfileRequest) (*models.SpaceProfileResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), strings.TrimSpace(req.SpaceID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx.Request.Context(), viewer, space); err != nil {
		return nil, err
	}
	friendsCount := int64(0)
	if c.auth.FriendsRepo != nil {
		var err error
		friendsCount, err = c.auth.FriendsRepo.CountFriendsForSpace(ctx.Request.Context(), space.SpaceID)
		if err != nil {
			return nil, err
		}
	}
	if req.Version != nil {
		if *req.Version <= 0 {
			return nil, ente.NewBadRequestWithMessage("invalid version")
		}
		if *req.Version != space.CurrentVersion {
			version, err := c.SpacesRepo.GetVersion(ctx.Request.Context(), space.SpaceID, *req.Version)
			if err != nil {
				return nil, err
			}
			return &models.SpaceProfileResponse{
				SpaceID:          space.SpaceID,
				SpaceSlug:        space.SpaceSlug,
				Version:          version.Version,
				EncryptedProfile: version.EncryptedProfile,
				UpdatedAt:        formatMicros(version.CreatedAt),
				Friends:          friendsCount,
			}, nil
		}
	}
	return &models.SpaceProfileResponse{
		SpaceID:          space.SpaceID,
		SpaceSlug:        space.SpaceSlug,
		Version:          space.CurrentVersion,
		EncryptedProfile: space.EncryptedProfile,
		UpdatedAt:        formatMicros(space.UpdatedAt),
		Avatar:           toAvatarResponse(space),
		Friends:          friendsCount,
	}, nil
}

func (c *SpacesController) UpdateProfile(ctx *gin.Context, req models.UpdateSpaceProfileRequest) (*models.UpdateSpaceProfileResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SpaceID) == "" || strings.TrimSpace(req.EncryptedProfile) == "" {
		return nil, ente.NewBadRequestWithMessage("spaceId and encryptedProfile are required")
	}
	if req.RemoveAvatar && req.Avatar != nil {
		return nil, ente.NewBadRequestWithMessage("avatar and removeAvatar cannot both be set")
	}
	spaceID := strings.TrimSpace(req.SpaceID)
	if _, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, spaceID); err != nil {
		return nil, err
	}
	avatar := (*struct {
		ObjectKey string
		BucketID  string
		Size      int64
	})(nil)
	if req.Avatar != nil {
		staged, err := verifyStagedUpload(ctx, c.AssetsRepo, userID, req.Avatar.ObjectKey, repo.TempObjectPurposeAvatar, &spaceID)
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
	space, err := c.SpacesRepo.UpdateProfile(ctx.Request.Context(), userID, spaceID, req.EncryptedProfile, avatar, req.RemoveAvatar)
	if err != nil {
		return nil, err
	}
	return &models.UpdateSpaceProfileResponse{
		Status: "updated",
		Avatar: toAvatarResponse(space),
	}, nil
}

func (c *SpacesController) UpdateSlug(ctx *gin.Context, spaceID string, req models.UpdateSpaceSlugRequest) (*models.SpaceLookupResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SpaceSlug) == "" {
		return nil, ente.NewBadRequestWithMessage("spaceSlug is required")
	}
	space, err := c.SpacesRepo.UpdateSlug(ctx.Request.Context(), userID, strings.TrimSpace(spaceID), req.SpaceSlug)
	if err != nil {
		return nil, err
	}
	publicKey, err := c.SpacesRepo.GetOwnerPublicKey(ctx.Request.Context(), space.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceLookupResponse{SpaceID: space.SpaceID, SpaceSlug: space.SpaceSlug, Owner: space.SpaceSlug, PublicKey: publicKey}, nil
}

func (c *SpacesController) LookupBySlug(ctx *gin.Context, spaceSlug string) (*models.SpaceLookupResponse, error) {
	space, err := c.SpacesRepo.GetSpaceBySlug(ctx.Request.Context(), spaceSlug)
	if err != nil {
		return nil, err
	}
	publicKey, err := c.SpacesRepo.GetOwnerPublicKey(ctx.Request.Context(), space.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceLookupResponse{
		SpaceID:   space.SpaceID,
		SpaceSlug: space.SpaceSlug,
		Owner:     space.SpaceSlug,
		PublicKey: publicKey,
	}, nil
}

func (c *SpacesController) SlugAvailability(ctx *gin.Context, spaceSlug string) (*models.SpaceSlugAvailabilityResponse, error) {
	normalizedSlug, err := repo.ValidateSpaceSlug(spaceSlug)
	if err != nil {
		return &models.SpaceSlugAvailabilityResponse{Available: false}, nil
	}
	if _, err := c.SpacesRepo.GetSpaceBySlug(ctx.Request.Context(), normalizedSlug); err != nil {
		if stacktrace.RootCause(err) == sql.ErrNoRows {
			return &models.SpaceSlugAvailabilityResponse{Available: true}, nil
		}
		return nil, err
	}
	return &models.SpaceSlugAvailabilityResponse{Available: false}, nil
}

func (c *SpacesController) RotateKey(ctx *gin.Context, req models.RotateSpaceKeyRequest) (*models.SpaceKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SpaceID) == "" || strings.TrimSpace(req.EncryptedSpaceKey) == "" || strings.TrimSpace(req.WrappedPrevKey) == "" {
		return nil, ente.NewBadRequestWithMessage("spaceId, encryptedSpaceKey and wrappedPrevKey are required")
	}
	space, err := c.SpacesRepo.RotateKey(ctx.Request.Context(), userID, req.SpaceID, req.EncryptedSpaceKey, req.WrappedPrevKey, req.EncryptedProfile)
	if err != nil {
		return nil, err
	}
	return toSpaceKeyResponse(space), nil
}

func (c *SpacesController) ListVersions(ctx *gin.Context, req models.GetSpaceProfileRequest) ([]models.SpaceKeyVersionResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), strings.TrimSpace(req.SpaceID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx.Request.Context(), viewer, space); err != nil {
		return nil, err
	}
	versions, err := c.SpacesRepo.ListVersions(ctx.Request.Context(), space.SpaceID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.SpaceKeyVersionResponse, 0, len(versions))
	for _, version := range versions {
		item := models.SpaceKeyVersionResponse{
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
