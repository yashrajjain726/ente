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
	encryptedKey, err := decodeEncodedSpaceField("encryptedKey", req.EncryptedKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
	if err != nil {
		return err
	}
	return c.EntityKeysRepo.CreateKey(ctx.Request.Context(), userID, keyType, encryptedKey)
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
	encryptedKey, err := decodeEncodedSpaceField("encryptedKey", req.EncryptedKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
	if err != nil {
		return nil, err
	}
	rec, err := c.EntityKeysRepo.EnsureKey(ctx.Request.Context(), userID, keyType, encryptedKey)
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
		EncryptedKey: encodeSpaceField(rec.EncryptedKey),
	}
}
