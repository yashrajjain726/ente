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
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

const spaceLinkSessionDurationMinutes = 60 * 24 * 30

type LinksController struct {
	LinksRepo  *repo.LinksRepository
	SpacesRepo *repo.SpacesRepository
	auth       authDeps
}

func (c *LinksController) Get(ctx *gin.Context, spaceID string) (*models.SpaceLinkStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	space, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, strings.TrimSpace(spaceID))
	if err != nil {
		return nil, err
	}
	link, err := c.LinksRepo.GetLink(ctx.Request.Context(), space.SpaceID)
	if err != nil {
		if !errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, err
		}
		return &models.SpaceLinkStatusResponse{
			SpaceID:    space.SpaceID,
			SpaceSlug:  space.SpaceSlug,
			KeyVersion: space.CurrentVersion,
			Active:     false,
		}, nil
	}
	return linkStatusResponse(link), nil
}

func (c *LinksController) Create(ctx *gin.Context, req models.SpaceLinkCreateRequest) (*models.SpaceLinkStatusResponse, error) {
	return c.writeLink(ctx, req, false)
}

func (c *LinksController) Rotate(ctx *gin.Context, req models.SpaceLinkCreateRequest) (*models.SpaceLinkStatusResponse, error) {
	return c.writeLink(ctx, req, true)
}

func (c *LinksController) writeLink(ctx *gin.Context, req models.SpaceLinkCreateRequest, rotate bool) (*models.SpaceLinkStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SpaceID) == "" || strings.TrimSpace(req.AuthKey) == "" || strings.TrimSpace(req.EncryptedSpaceKey) == "" || strings.TrimSpace(req.EncryptedAccessKey) == "" || req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("spaceId, authKey, encryptedSpaceKey, encryptedAccessKey and keyVersion are required")
	}
	if len(strings.TrimSpace(req.AuthKey)) > maxSpaceEncryptedKeyEncodedBytes {
		return nil, ente.NewBadRequestWithMessage("authKey is too large")
	}
	if err := validateEncodedSpaceField("encryptedSpaceKey", req.EncryptedSpaceKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes); err != nil {
		return nil, err
	}
	if err := validateEncodedSpaceField("encryptedAccessKey", req.EncryptedAccessKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes); err != nil {
		return nil, err
	}
	space, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, req.SpaceID)
	if err != nil {
		return nil, err
	}
	authKeyBytes, err := base64.StdEncoding.DecodeString(req.AuthKey)
	if err != nil || len(authKeyBytes) != 32 {
		return nil, ente.NewBadRequestWithMessage("invalid authKey encoding")
	}
	if req.KeyVersion != space.CurrentVersion {
		return nil, ente.NewBadRequestWithMessage("keyVersion does not match current space version")
	}
	sum := sha256.Sum256(authKeyBytes)
	var link *repo.SpaceLinkRecord
	if rotate {
		link, err = c.LinksRepo.RotateLink(ctx.Request.Context(), space.SpaceID, sum[:], req.KeyVersion, req.EncryptedSpaceKey, req.EncryptedAccessKey)
	} else {
		link, err = c.LinksRepo.UpsertLink(ctx.Request.Context(), space.SpaceID, sum[:], req.KeyVersion, req.EncryptedSpaceKey, req.EncryptedAccessKey)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("keyVersion does not match current space version")
		}
		if errors.Is(err, repo.ErrActiveLinkAlreadyExists) {
			if rotate {
				return nil, ente.NewBadRequestWithMessage("active space link already exists; rotate it instead")
			}
			existing, getErr := c.LinksRepo.GetLink(ctx.Request.Context(), space.SpaceID)
			if getErr != nil {
				return nil, getErr
			}
			return linkStatusResponse(existing), nil
		}
		if errors.Is(err, repo.ErrLinkAuthKeyReused) {
			return nil, ente.NewBadRequestWithMessage("space link secret has already been used")
		}
		return nil, err
	}
	return linkStatusResponse(link), nil
}

func linkStatusResponse(link *repo.SpaceLinkRecord) *models.SpaceLinkStatusResponse {
	return &models.SpaceLinkStatusResponse{
		SpaceID:            link.SpaceID,
		SpaceSlug:          link.SpaceSlug,
		KeyVersion:         link.KeyVersion,
		Active:             link.Active,
		EncryptedAccessKey: link.EncryptedAccessKey,
		CreatedAt:          formatMicros(link.CreatedAt),
		UpdatedAt:          formatMicros(link.UpdatedAt),
	}
}

func (c *LinksController) Delete(ctx *gin.Context, spaceID string) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	space, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, strings.TrimSpace(spaceID))
	if err != nil {
		return err
	}
	return c.LinksRepo.DeleteLink(ctx.Request.Context(), space.SpaceID)
}

func (c *LinksController) Login(ctx *gin.Context, req models.SpaceLinkLoginRequest) (*models.SpaceLinkLoginResponse, error) {
	if strings.TrimSpace(req.SpaceID) == "" || strings.TrimSpace(req.AuthKey) == "" {
		return nil, ente.NewBadRequestWithMessage("spaceId and authKey are required")
	}
	if len(strings.TrimSpace(req.AuthKey)) > maxSpaceEncryptedKeyEncodedBytes {
		return nil, ente.NewBadRequestWithMessage("authKey is too large")
	}
	authKeyBytes, err := base64.StdEncoding.DecodeString(req.AuthKey)
	if err != nil || len(authKeyBytes) != 32 {
		return nil, ente.NewBadRequestWithMessage("invalid authKey encoding")
	}
	sum := sha256.Sum256(authKeyBytes)
	link, err := c.LinksRepo.GetLinkByAuthHash(ctx.Request.Context(), strings.TrimSpace(req.SpaceID), sum[:])
	if err != nil {
		return nil, err
	}
	sessionToken := auth.GenerateURLSafeRandomString(32)
	sessionHash := sha256.Sum256([]byte(sessionToken))
	if err := c.LinksRepo.CreateSession(ctx.Request.Context(), sessionHash[:], link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.MicrosecondsAfterMinutes(spaceLinkSessionDurationMinutes)); err != nil {
		return nil, err
	}
	publicKey, err := c.SpacesRepo.GetOwnerPublicKey(ctx.Request.Context(), link.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceLinkLoginResponse{
		SessionToken:      sessionToken,
		SpaceID:           link.SpaceID,
		SpaceSlug:         link.SpaceSlug,
		Owner:             link.OwnerSlug,
		PublicKey:         publicKey,
		KeyVersion:        link.KeyVersion,
		EncryptedSpaceKey: link.EncryptedSpaceKey,
	}, nil
}
