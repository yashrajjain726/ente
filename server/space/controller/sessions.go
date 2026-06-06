package controller

import (
	"crypto/sha256"
	"database/sql"
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

const spaceBrowserSessionDurationDays = 365
const SpaceBrowserSessionCookieName = "ente_space_session"
const SpaceBrowserSessionCookiePath = "/space"

type SessionsController struct {
	SessionsRepo *repo.SessionsRepository
}

type CreatedBrowserSession struct {
	Token    string
	Response models.SpaceBrowserSessionResponse
}

func (c *SessionsController) CreateBrowserSession(ctx *gin.Context, userID int64, clientKey string) (*CreatedBrowserSession, error) {
	sessionToken, err := auth.GenerateURLSafeRandomString(32)
	if err != nil {
		return nil, err
	}
	clientKey = strings.TrimSpace(clientKey)
	if clientKey == "" {
		return nil, ente.NewBadRequestWithMessage("clientKey is required")
	}
	sessionHash := sha256.Sum256([]byte(sessionToken))
	expiresAt := timeutil.NDaysFromNow(spaceBrowserSessionDurationDays)
	if err := c.SessionsRepo.CreateBrowserSession(ctx.Request.Context(), sessionHash[:], userID, clientKey, expiresAt); err != nil {
		return nil, err
	}
	return &CreatedBrowserSession{
		Token:    sessionToken,
		Response: models.SpaceBrowserSessionResponse{ClientKey: clientKey},
	}, nil
}

func (c *SessionsController) BootstrapBrowserSession(ctx *gin.Context, sessionToken string) (*models.SpaceBrowserSessionBootstrapResponse, error) {
	session, err := c.ValidateBrowserSession(ctx, sessionToken)
	if err != nil {
		return nil, err
	}
	return &models.SpaceBrowserSessionBootstrapResponse{
		ID:            session.UserID,
		ClientKey:     session.ClientKey,
		KeyAttributes: keyAttributesResponse(session.KeyAttributes),
	}, nil
}

func (c *SessionsController) ValidateBrowserSession(ctx *gin.Context, sessionToken string) (*repo.SpaceBrowserSessionRecord, error) {
	return validateBrowserSession(ctx, c.SessionsRepo, sessionToken)
}

func validateBrowserSession(ctx *gin.Context, sessionsRepo *repo.SessionsRepository, sessionToken string) (*repo.SpaceBrowserSessionRecord, error) {
	if sessionToken == "" || sessionsRepo == nil {
		return nil, ente.ErrAuthenticationRequired
	}
	sessionHash := sha256.Sum256([]byte(sessionToken))
	session, err := sessionsRepo.GetBrowserSession(ctx.Request.Context(), sessionHash[:])
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrAuthenticationRequired
		}
		return nil, err
	}
	if session.ExpiresAt <= timeutil.Microseconds() {
		_ = sessionsRepo.DeleteBrowserSession(ctx.Request.Context(), sessionHash[:])
		return nil, ente.ErrAuthenticationRequired
	}
	if err := sessionsRepo.TouchBrowserSession(ctx.Request.Context(), sessionHash[:]); err != nil {
		return nil, err
	}
	return session, nil
}

func (c *SessionsController) RevokeBrowserSession(ctx *gin.Context, sessionToken string) error {
	if sessionToken == "" {
		return nil
	}
	sessionHash := sha256.Sum256([]byte(sessionToken))
	return c.SessionsRepo.DeleteBrowserSession(ctx.Request.Context(), sessionHash[:])
}

func keyAttributesResponse(attrs repo.SpaceKeyAttributesRecord) models.SpaceKeyAttributes {
	return models.SpaceKeyAttributes{
		KEKSalt:                           attrs.KEKSalt,
		EncryptedKey:                      attrs.EncryptedKey,
		KeyDecryptionNonce:                attrs.KeyDecryptionNonce,
		PublicKey:                         attrs.PublicKey,
		EncryptedSecretKey:                attrs.EncryptedSecretKey,
		SecretKeyDecryptionNonce:          attrs.SecretKeyDecryptionNonce,
		MemLimit:                          attrs.MemLimit,
		OpsLimit:                          attrs.OpsLimit,
		MasterKeyEncryptedWithRecoveryKey: attrs.MasterKeyEncryptedWithRecoveryKey.String,
		MasterKeyDecryptionNonce:          attrs.MasterKeyDecryptionNonce.String,
		RecoveryKeyEncryptedWithMasterKey: attrs.RecoveryKeyEncryptedWithMasterKey.String,
		RecoveryKeyDecryptionNonce:        attrs.RecoveryKeyDecryptionNonce.String,
	}
}
