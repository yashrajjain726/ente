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

func (c *LinksController) Get(ctx *gin.Context) (*models.SpaceLinkStatusResponse, error) {
	_, space, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	link, err := c.LinksRepo.GetLink(ctx, space.SpaceID)
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
	_, space, err := selectedSpace(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.AuthKey) == "" || strings.TrimSpace(req.LinkWrappedSpaceKey) == "" || strings.TrimSpace(req.EncryptedAccessKey) == "" || req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("authKey, linkWrappedSpaceKey, encryptedAccessKey and keyVersion are required")
	}
	if len(strings.TrimSpace(req.AuthKey)) > maxSpaceEncryptedKeyEncodedBytes {
		return nil, ente.NewBadRequestWithMessage("authKey is too large")
	}
	linkWrappedSpaceKey, err := decodeEncodedSpaceField("linkWrappedSpaceKey", req.LinkWrappedSpaceKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
	if err != nil {
		return nil, err
	}
	encryptedAccessKey, err := decodeEncodedSpaceField("encryptedAccessKey", req.EncryptedAccessKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
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
		link, err = c.LinksRepo.RotateLink(ctx, space.SpaceID, sum[:], req.KeyVersion, linkWrappedSpaceKey, encryptedAccessKey)
	} else {
		link, err = c.LinksRepo.UpsertLink(ctx, space.SpaceID, sum[:], req.KeyVersion, linkWrappedSpaceKey, encryptedAccessKey)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("keyVersion does not match current space version")
		}
		if errors.Is(err, repo.ErrActiveLinkAlreadyExists) {
			if rotate {
				return nil, ente.NewBadRequestWithMessage("active space link already exists; rotate it instead")
			}
			existing, getErr := c.LinksRepo.GetLink(ctx, space.SpaceID)
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
		EncryptedAccessKey: encodeSpaceField(link.EncryptedAccessKey),
		CreatedAt:          formatMicros(link.CreatedAt),
		UpdatedAt:          formatMicros(link.UpdatedAt),
	}
}

func (c *LinksController) Delete(ctx *gin.Context) error {
	_, space, err := selectedSpace(ctx)
	if err != nil {
		return err
	}
	return c.LinksRepo.DeleteLink(ctx, space.SpaceID)
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
	link, err := c.LinksRepo.GetLinkByAuthHash(ctx, strings.TrimSpace(req.SpaceID), sum[:])
	if err != nil {
		return nil, err
	}
	sessionToken := auth.GenerateURLSafeRandomString(32)
	sessionHash := sha256.Sum256([]byte(sessionToken))
	if err := c.LinksRepo.CreateSession(ctx, sessionHash[:], link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.MicrosecondsAfterMinutes(spaceLinkSessionDurationMinutes)); err != nil {
		return nil, err
	}
	publicKey, err := c.SpacesRepo.GetOwnerPublicKey(ctx, link.OwnerID)
	if err != nil {
		return nil, err
	}
	return &models.SpaceLinkLoginResponse{
		SessionToken:        sessionToken,
		SpaceID:             link.SpaceID,
		SpaceSlug:           link.SpaceSlug,
		Owner:               link.OwnerSlug,
		PublicKey:           encodeSpaceField(publicKey),
		KeyVersion:          link.KeyVersion,
		LinkWrappedSpaceKey: encodeSpaceField(link.LinkWrappedSpaceKey),
	}, nil
}
