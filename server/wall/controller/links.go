package controller

import (
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/pkg/utils/auth"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/gin-gonic/gin"
)

const wallLinkSessionDurationMinutes = 60 * 24 * 30

type LinksController struct {
	LinksRepo *repo.LinksRepository
	WallsRepo *repo.WallsRepository
	auth      authDeps
}

func (c *LinksController) Get(ctx *gin.Context, wallID string) (*models.WallLinkStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, strings.TrimSpace(wallID))
	if err != nil {
		return nil, err
	}
	link, err := c.LinksRepo.GetLink(ctx.Request.Context(), wall.WallID)
	if err != nil {
		return &models.WallLinkStatusResponse{
			WallID:     wall.WallID,
			WallSlug:   wall.WallSlug,
			KeyVersion: wall.CurrentVersion,
			Active:     false,
		}, nil
	}
	return &models.WallLinkStatusResponse{
		WallID:             link.WallID,
		WallSlug:           link.WallSlug,
		KeyVersion:         link.KeyVersion,
		Active:             link.Active,
		EncryptedAccessKey: link.EncryptedAccessKey,
		CreatedAt:          formatMicros(link.CreatedAt),
		UpdatedAt:          formatMicros(link.UpdatedAt),
	}, nil
}

func (c *LinksController) Create(ctx *gin.Context, req models.WallLinkCreateRequest) (*models.WallLinkStatusResponse, error) {
	return c.writeLink(ctx, req, false)
}

func (c *LinksController) Rotate(ctx *gin.Context, req models.WallLinkCreateRequest) (*models.WallLinkStatusResponse, error) {
	return c.writeLink(ctx, req, true)
}

func (c *LinksController) writeLink(ctx *gin.Context, req models.WallLinkCreateRequest, rotate bool) (*models.WallLinkStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WallID) == "" || strings.TrimSpace(req.AuthKey) == "" || strings.TrimSpace(req.EncryptedWallKey) == "" || strings.TrimSpace(req.EncryptedAccessKey) == "" || req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("wallId, authKey, encryptedWallKey, encryptedAccessKey and keyVersion are required")
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return nil, err
	}
	authKeyBytes, err := base64.StdEncoding.DecodeString(req.AuthKey)
	if err != nil || len(authKeyBytes) != 32 {
		return nil, ente.NewBadRequestWithMessage("invalid authKey encoding")
	}
	if req.KeyVersion != wall.CurrentVersion {
		return nil, ente.NewBadRequestWithMessage("keyVersion does not match current wall version")
	}
	sum := sha256.Sum256(authKeyBytes)
	var link *repo.WallLinkRecord
	if rotate {
		link, err = c.LinksRepo.RotateLink(ctx.Request.Context(), wall.WallID, sum[:], req.KeyVersion, req.EncryptedWallKey, req.EncryptedAccessKey)
	} else {
		link, err = c.LinksRepo.UpsertLink(ctx.Request.Context(), wall.WallID, sum[:], req.KeyVersion, req.EncryptedWallKey, req.EncryptedAccessKey)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("keyVersion does not match current wall version")
		}
		if errors.Is(err, repo.ErrActiveLinkAlreadyExists) {
			return nil, ente.NewBadRequestWithMessage("active wall link already exists; rotate it instead")
		}
		if errors.Is(err, repo.ErrLinkAuthKeyReused) {
			return nil, ente.NewBadRequestWithMessage("wall link secret has already been used")
		}
		return nil, err
	}
	return &models.WallLinkStatusResponse{
		WallID:             link.WallID,
		WallSlug:           link.WallSlug,
		KeyVersion:         link.KeyVersion,
		Active:             link.Active,
		EncryptedAccessKey: link.EncryptedAccessKey,
		CreatedAt:          formatMicros(link.CreatedAt),
		UpdatedAt:          formatMicros(link.UpdatedAt),
	}, nil
}

func (c *LinksController) Delete(ctx *gin.Context, wallID string) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, strings.TrimSpace(wallID))
	if err != nil {
		return err
	}
	return c.LinksRepo.DeleteLink(ctx.Request.Context(), wall.WallID)
}

func (c *LinksController) Login(ctx *gin.Context, req models.WallLinkLoginRequest) (*models.WallLinkLoginResponse, error) {
	if strings.TrimSpace(req.WallID) == "" || strings.TrimSpace(req.AuthKey) == "" {
		return nil, ente.NewBadRequestWithMessage("wallId and authKey are required")
	}
	authKeyBytes, err := base64.StdEncoding.DecodeString(req.AuthKey)
	if err != nil || len(authKeyBytes) != 32 {
		return nil, ente.NewBadRequestWithMessage("invalid authKey encoding")
	}
	sum := sha256.Sum256(authKeyBytes)
	link, err := c.LinksRepo.GetLinkByAuthHash(ctx.Request.Context(), strings.TrimSpace(req.WallID), sum[:])
	if err != nil {
		return nil, err
	}
	sessionToken, err := auth.GenerateURLSafeRandomString(32)
	if err != nil {
		return nil, err
	}
	sessionHash := sha256.Sum256([]byte(sessionToken))
	if err := c.LinksRepo.CreateSession(ctx.Request.Context(), sessionHash[:], link.WallID, link.AuthKeyHash, link.KeyVersion, timeutil.MicrosecondsAfterMinutes(wallLinkSessionDurationMinutes)); err != nil {
		return nil, err
	}
	publicKey, err := c.WallsRepo.GetOwnerPublicKey(ctx.Request.Context(), link.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.WallLinkLoginResponse{
		SessionToken:     sessionToken,
		WallID:           link.WallID,
		WallSlug:         link.WallSlug,
		Owner:            link.OwnerSlug,
		PublicKey:        publicKey,
		KeyVersion:       link.KeyVersion,
		EncryptedWallKey: link.EncryptedWallKey,
	}, nil
}
