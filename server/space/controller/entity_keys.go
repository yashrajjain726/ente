package controller

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

const spaceEntityKeyType = "space"

type EntityKeysController struct {
	EntityKeysRepo *repo.EntityKeysRepository
	auth           authDeps
}

func (c *EntityKeysController) CreateKey(ctx *gin.Context, req models.SpaceEntityKeyRequest) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	keyType, err := validateSpaceEntityKeyType(req.Type)
	if err != nil {
		return err
	}
	if strings.TrimSpace(req.EncryptedKey) == "" || strings.TrimSpace(req.Header) == "" {
		return ente.NewBadRequestWithMessage("encryptedKey and header are required")
	}
	return c.EntityKeysRepo.CreateKey(ctx.Request.Context(), userID, keyType, strings.TrimSpace(req.EncryptedKey), strings.TrimSpace(req.Header))
}

func (c *EntityKeysController) EnsureKey(ctx *gin.Context, req models.SpaceEntityKeyRequest) (*models.SpaceEntityKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	keyType, err := validateSpaceEntityKeyType(req.Type)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.EncryptedKey) == "" || strings.TrimSpace(req.Header) == "" {
		return nil, ente.NewBadRequestWithMessage("encryptedKey and header are required")
	}
	rec, err := c.EntityKeysRepo.EnsureKey(ctx.Request.Context(), userID, keyType, strings.TrimSpace(req.EncryptedKey), strings.TrimSpace(req.Header))
	if err != nil {
		return nil, err
	}
	return toSpaceEntityKeyResponse(rec), nil
}

func (c *EntityKeysController) GetKey(ctx *gin.Context, req models.GetSpaceEntityKeyRequest) (*models.SpaceEntityKeyResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	keyType, err := validateSpaceEntityKeyType(req.Type)
	if err != nil {
		return nil, err
	}
	rec, err := c.EntityKeysRepo.GetKey(ctx.Request.Context(), userID, keyType)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, err
		}
		return nil, err
	}
	return toSpaceEntityKeyResponse(rec), nil
}

func validateSpaceEntityKeyType(value string) (string, error) {
	keyType := strings.TrimSpace(value)
	if keyType != spaceEntityKeyType {
		return "", ente.NewBadRequestWithMessage("invalid entity key type")
	}
	return keyType, nil
}

func toSpaceEntityKeyResponse(rec *repo.SpaceEntityKeyRecord) *models.SpaceEntityKeyResponse {
	return &models.SpaceEntityKeyResponse{
		Type:         rec.KeyType,
		EncryptedKey: rec.EncryptedKey,
		Header:       rec.Header,
	}
}
