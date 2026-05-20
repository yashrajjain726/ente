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

type FriendsController struct {
	FriendsRepo *repo.FriendsRepository
	SpacesRepo  *repo.SpacesRepository
	auth        authDeps
}

func (c *FriendsController) Add(ctx *gin.Context, req models.AddFriendPayload) (*models.FriendStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.TargetSpaceID) == "" ||
		strings.TrimSpace(req.LinkSessionToken) == "" ||
		strings.TrimSpace(req.RequesterSpaceID) == "" ||
		strings.TrimSpace(req.TargetEncryptedSpaceKey) == "" ||
		strings.TrimSpace(req.RequesterEncryptedSpaceKey) == "" ||
		req.TargetKeyVersion <= 0 ||
		req.RequesterKeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("targetSpaceId, linkSessionToken, requesterSpaceId, encrypted space keys and key versions are required")
	}
	session, err := c.auth.requireLinkSession(ctx.Request.Context(), req.LinkSessionToken)
	if err != nil {
		return nil, err
	}
	if session.SpaceID != strings.TrimSpace(req.TargetSpaceID) {
		return nil, ente.ErrPermissionDenied
	}
	if session.KeyVersion != req.TargetKeyVersion {
		return nil, ente.NewBadRequestWithMessage("targetKeyVersion does not match link session")
	}
	if _, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, strings.TrimSpace(req.RequesterSpaceID)); err != nil {
		return nil, err
	}
	if err := c.FriendsRepo.AddFriend(
		ctx.Request.Context(),
		userID,
		strings.TrimSpace(req.RequesterSpaceID),
		strings.TrimSpace(req.TargetSpaceID),
		strings.TrimSpace(req.TargetEncryptedSpaceKey),
		req.TargetKeyVersion,
		strings.TrimSpace(req.RequesterEncryptedSpaceKey),
		req.RequesterKeyVersion,
	); err != nil {
		if errors.Is(stacktrace.RootCause(err), repo.ErrAlreadyFriends) {
			return &models.FriendStatusResponse{Status: "friend"}, nil
		}
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("space key version is stale")
		}
		return nil, err
	}
	return &models.FriendStatusResponse{Status: "friend"}, nil
}

func (c *FriendsController) Unfriend(ctx *gin.Context, req models.FriendTargetPayload) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	var space *repo.SpaceRecord
	switch {
	case req.TargetSpaceID != nil && strings.TrimSpace(*req.TargetSpaceID) != "":
		space, err = c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), strings.TrimSpace(*req.TargetSpaceID))
	case req.TargetUsername != nil && strings.TrimSpace(*req.TargetUsername) != "":
		space, err = c.SpacesRepo.GetSpaceBySlug(ctx.Request.Context(), strings.TrimSpace(*req.TargetUsername))
	default:
		return ente.NewBadRequestWithMessage("targetUsername or targetSpaceId is required")
	}
	if err != nil {
		return err
	}
	return c.FriendsRepo.DeleteFriendship(ctx.Request.Context(), userID, space.SpaceID)
}

func (c *FriendsController) ListFriends(ctx *gin.Context, req models.ListSpaceFriendsRequest) ([]models.SpaceFriendResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	space, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, req.SpaceID)
	if err != nil {
		return nil, err
	}
	friends, err := c.FriendsRepo.ListFriendsForSpace(ctx.Request.Context(), space.SpaceID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.SpaceFriendResponse, 0, len(friends))
	for _, friend := range friends {
		resp = append(resp, models.SpaceFriendResponse{
			Friend:          toActorResponse(friend.Friend, true),
			ShareKeyVersion: friend.ShareKeyVersion,
			CreatedAt:       formatMicros(friend.CreatedAt),
		})
	}
	return resp, nil
}

func (c *FriendsController) Relationship(ctx *gin.Context, req models.FriendRelationshipRequest) (*models.FriendRelationshipResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	targetSpaceID := strings.TrimSpace(req.TargetSpaceID)
	if targetSpaceID == "" {
		return nil, ente.NewBadRequestWithMessage("targetSpaceId is required")
	}
	targetSpace, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), targetSpaceID)
	if err != nil {
		return nil, err
	}
	relationship, err := c.FriendsRepo.GetRelationship(ctx.Request.Context(), userID, targetSpace.OwnerID, targetSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	return &models.FriendRelationshipResponse{Relationship: relationship}, nil
}

func (c *FriendsController) RefreshShares(ctx *gin.Context, req models.RefreshFriendSharesRequest) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	space, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, req.SpaceID)
	if err != nil {
		return err
	}
	if req.KeyVersion <= 0 {
		return ente.NewBadRequestWithMessage("keyVersion is required")
	}
	updates := make([]repo.SpaceShareUpdateRecord, 0, len(req.Shares))
	for _, share := range req.Shares {
		if share.FriendID == 0 || strings.TrimSpace(share.EncryptedSpaceKey) == "" {
			return ente.NewBadRequestWithMessage("friendId and encryptedSpaceKey are required for each share")
		}
		updates = append(updates, repo.SpaceShareUpdateRecord{
			FriendID:          share.FriendID,
			EncryptedSpaceKey: share.EncryptedSpaceKey,
		})
	}
	if err := c.FriendsRepo.UpdateShares(ctx.Request.Context(), space.SpaceID, updates, req.KeyVersion); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.NewBadRequestWithMessage("keyVersion does not match current space version or friend share does not exist")
		}
		return err
	}
	return nil
}

func (c *FriendsController) ListShares(ctx *gin.Context) ([]models.FriendShareResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	shares, err := c.FriendsRepo.ListSharesForFriend(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.FriendShareResponse, 0, len(shares))
	for _, share := range shares {
		resp = append(resp, models.FriendShareResponse{
			Friend:            share.SpaceSlug,
			SpaceID:           share.SpaceID,
			SpaceSlug:         share.SpaceSlug,
			EncryptedSpaceKey: share.EncryptedSpaceKey,
			KeyVersion:        share.KeyVersion,
		})
	}
	return resp, nil
}
