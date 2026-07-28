package controller

import (
	"bytes"
	"crypto/ecdh"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"strings"

	"github.com/ente/museum/ente"
	"github.com/ente/museum/space/models"
	"github.com/ente/museum/space/repo"
	"github.com/ente/stacktrace"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

const (
	spaceWebPushEndpointMaxBytes = 2048
	spaceWebPushP256dhMaxBytes   = 256
	spaceWebPushAuthMaxBytes     = 128
)

type WebPushController struct {
	WebPushRepo *repo.WebPushRepository
	Links       *LinksController
}

type spaceWebPushConfig struct {
	PublicKey  string
	PrivateKey string
	Subscriber string
}

func (c *WebPushController) VAPIDPublicKey() (*models.SpaceWebPushVAPIDKeyResponse, error) {
	config, ok := configuredSpaceWebPush()
	if !ok {
		return nil, &ente.ApiError{
			Code:           ente.ErrorCode("SPACE_WEB_PUSH_UNAVAILABLE"),
			Message:        "space web push is unavailable",
			HttpStatusCode: http.StatusServiceUnavailable,
		}
	}
	return &models.SpaceWebPushVAPIDKeyResponse{PublicKey: config.PublicKey}, nil
}

func (c *WebPushController) UpsertAccountSubscription(
	ctx *gin.Context,
	sessionToken string,
	req models.SpaceWebPushSubscriptionRequest,
) (*models.SpaceWebPushTargetResponse, error) {
	if c == nil || c.WebPushRepo == nil {
		return nil, ente.ErrNotFound
	}
	endpoint, p256dh, auth, err := validatedWebPushSubscription(req)
	if err != nil {
		return nil, err
	}
	sessionHash := sha256.Sum256([]byte(sessionToken))
	targetID, err := c.WebPushRepo.UpsertAccountSubscription(
		ctx,
		sessionHash[:],
		endpoint,
		p256dh,
		auth,
	)
	if err != nil {
		return nil, err
	}
	return &models.SpaceWebPushTargetResponse{TargetID: targetID}, nil
}

func (c *WebPushController) DeleteAccountSubscription(
	ctx *gin.Context,
	sessionToken string,
	req models.SpaceWebPushUnsubscriptionRequest,
) error {
	if c == nil || c.WebPushRepo == nil {
		return ente.ErrNotFound
	}
	endpoint := strings.TrimSpace(req.Endpoint)
	if err := validateWebPushEndpoint(endpoint); err != nil {
		return err
	}
	sessionHash := sha256.Sum256([]byte(sessionToken))
	return c.WebPushRepo.DeleteAccountSubscription(ctx, sessionHash[:], endpoint)
}

func (c *WebPushController) UpsertLinkSubscription(
	ctx *gin.Context,
	slug string,
	req models.SpaceWebPushSubscriptionRequest,
) (*models.SpaceWebPushTargetResponse, error) {
	if c == nil || c.WebPushRepo == nil || c.Links == nil {
		return nil, ente.ErrNotFound
	}
	endpoint, p256dh, auth, err := validatedWebPushSubscription(req)
	if err != nil {
		return nil, err
	}
	link, err := c.Links.Authorize(ctx, slug)
	if err != nil {
		return nil, err
	}
	targetID, err := c.WebPushRepo.UpsertLinkSubscription(
		ctx,
		link.LinkID,
		endpoint,
		p256dh,
		auth,
	)
	if err != nil {
		if errors.Is(err, repo.ErrSpaceWebPushLinkSubscriptionLimit) {
			return nil, &ente.ApiError{
				Code:           ente.ErrorCode("SPACE_WEB_PUSH_SUBSCRIPTION_LIMIT"),
				Message:        "too many web push subscriptions for this Space link",
				HttpStatusCode: http.StatusTooManyRequests,
			}
		}
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrNotFound
		}
		return nil, err
	}
	return &models.SpaceWebPushTargetResponse{TargetID: targetID}, nil
}

func (c *WebPushController) DeleteLinkSubscription(
	ctx *gin.Context,
	slug string,
	req models.SpaceWebPushUnsubscriptionRequest,
) error {
	if c == nil || c.WebPushRepo == nil || c.Links == nil {
		return ente.ErrNotFound
	}
	endpoint := strings.TrimSpace(req.Endpoint)
	if err := validateWebPushEndpoint(endpoint); err != nil {
		return err
	}
	link, err := c.Links.Authorize(ctx, slug)
	if err != nil {
		return err
	}
	return c.WebPushRepo.DeleteLinkSubscription(ctx, link.LinkID, endpoint)
}

func validatedWebPushSubscription(
	req models.SpaceWebPushSubscriptionRequest,
) (string, string, string, error) {
	endpoint := strings.TrimSpace(req.Endpoint)
	p256dh := strings.TrimSpace(req.Keys.P256dh)
	auth := strings.TrimSpace(req.Keys.Auth)
	if err := validateWebPushSubscription(endpoint, p256dh, auth); err != nil {
		return "", "", "", err
	}
	return endpoint, p256dh, auth, nil
}

func validateWebPushSubscription(endpoint, p256dh, auth string) error {
	if err := validateWebPushEndpoint(endpoint); err != nil {
		return err
	}
	if p256dh == "" || len(p256dh) > spaceWebPushP256dhMaxBytes {
		return ente.NewBadRequestWithMessage("invalid web push p256dh key")
	}
	decodedP256dh, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(p256dh, "="))
	_, publicKeyErr := ecdh.P256().NewPublicKey(decodedP256dh)
	if err != nil || len(decodedP256dh) != 65 || publicKeyErr != nil {
		return ente.NewBadRequestWithMessage("invalid web push p256dh key")
	}
	if auth == "" || len(auth) > spaceWebPushAuthMaxBytes {
		return ente.NewBadRequestWithMessage("invalid web push auth key")
	}
	decodedAuth, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(auth, "="))
	if err != nil || len(decodedAuth) != 16 {
		return ente.NewBadRequestWithMessage("invalid web push auth key")
	}
	return nil
}

func configuredSpaceWebPush() (spaceWebPushConfig, bool) {
	config := spaceWebPushConfig{
		PublicKey:  strings.TrimSpace(viper.GetString("space.webPush.publicKey")),
		PrivateKey: strings.TrimSpace(viper.GetString("space.webPush.privateKey")),
		Subscriber: strings.TrimSpace(viper.GetString("space.webPush.subscriber")),
	}
	decodedPublicKey, publicKeyErr := decodeBase64URL(config.PublicKey)
	_, publicCurveErr := ecdh.P256().NewPublicKey(decodedPublicKey)
	decodedPrivateKey, privateKeyErr := decodeBase64URL(config.PrivateKey)
	privateKey, privateCurveErr := ecdh.P256().NewPrivateKey(decodedPrivateKey)
	subscriber, subscriberErr := mail.ParseAddress(config.Subscriber)
	if publicKeyErr != nil ||
		len(decodedPublicKey) != 65 ||
		publicCurveErr != nil ||
		privateKeyErr != nil ||
		len(decodedPrivateKey) != 32 ||
		privateCurveErr != nil ||
		!bytes.Equal(privateKey.PublicKey().Bytes(), decodedPublicKey) ||
		subscriberErr != nil ||
		subscriber.Address != config.Subscriber {
		return spaceWebPushConfig{}, false
	}
	return config, true
}

func decodeBase64URL(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(value, "="))
}

func validateWebPushEndpoint(endpoint string) error {
	if endpoint == "" ||
		len(endpoint) > spaceWebPushEndpointMaxBytes ||
		strings.Contains(endpoint, "#") {
		return ente.NewBadRequestWithMessage("invalid web push endpoint")
	}
	parsed, err := url.ParseRequestURI(endpoint)
	if err != nil ||
		parsed.Scheme != "https" ||
		parsed.Hostname() == "" ||
		parsed.User != nil ||
		parsed.Fragment != "" {
		return ente.NewBadRequestWithMessage("invalid web push endpoint")
	}
	return nil
}
