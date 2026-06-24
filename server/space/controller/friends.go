package controller

import (
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type FriendsController struct {
	FriendsRepo   *repo.FriendsRepository
	SpacesRepo    *repo.SpacesRepository
	EmailNotifier SpaceEmailNotifier
	auth          authDeps
}

func (c *FriendsController) Add(ctx *gin.Context, req models.AddFriendPayload) (*models.FriendStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if (strings.TrimSpace(req.TargetSpaceID) == "" && strings.TrimSpace(req.TargetUsername) == "") ||
		strings.TrimSpace(req.RequesterSpaceID) == "" ||
		strings.TrimSpace(req.RequesterFriendSealedSpaceKey) == "" ||
		req.RequesterKeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("targetSpaceId or targetUsername, requesterSpaceId, requesterFriendSealedSpaceKey and requesterKeyVersion are required")
	}
	requesterFriendSealedSpaceKey, err := decodeEncodedSpaceField("requesterFriendSealedSpaceKey", req.RequesterFriendSealedSpaceKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
	if err != nil {
		return nil, err
	}
	requesterSpace, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, strings.TrimSpace(req.RequesterSpaceID))
	if err != nil {
		return nil, err
	}
	var targetSpace *repo.SpaceRecord
	switch {
	case strings.TrimSpace(req.TargetSpaceID) != "":
		targetSpace, err = c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), strings.TrimSpace(req.TargetSpaceID))
	case strings.TrimSpace(req.TargetUsername) != "":
		targetSpace, err = c.SpacesRepo.GetSpaceBySlug(ctx.Request.Context(), strings.TrimSpace(req.TargetUsername))
	}
	if err != nil {
		return nil, err
	}
	request, created, err := c.FriendsRepo.CreateFriendRequest(
		ctx.Request.Context(),
		userID,
		requesterSpace.SpaceID,
		targetSpace.SpaceID,
		requesterFriendSealedSpaceKey,
		req.RequesterKeyVersion,
	)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), repo.ErrSelfFriendship) {
			return nil, ente.NewBadRequestWithMessage("cannot add yourself as a friend")
		}
		if errors.Is(stacktrace.RootCause(err), repo.ErrAlreadyFriends) {
			return &models.FriendStatusResponse{Status: "friend"}, nil
		}
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("space key version is stale")
		}
		return nil, err
	}
	if created && c.EmailNotifier != nil {
		go c.EmailNotifier.OnSpaceFriendRequested(requesterSpace.SpaceSlug, request.TargetID)
	}
	return &models.FriendStatusResponse{Status: "requested"}, nil
}

func (c *FriendsController) ListRequests(ctx *gin.Context) ([]models.SpaceFriendRequestResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	space, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	requests, err := c.FriendsRepo.ListFriendRequestsForSpace(ctx.Request.Context(), userID, space.SpaceID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.SpaceFriendRequestResponse, 0, len(requests))
	for _, request := range requests {
		resp = append(resp, models.SpaceFriendRequestResponse{
			RequestID: request.RequestID,
			Requester: toActorResponse(request.Requester, true),
			CreatedAt: formatMicros(request.CreatedAt),
		})
	}
	return resp, nil
}

func (c *FriendsController) ConfirmRequest(ctx *gin.Context, requestIDValue string, req models.ConfirmFriendRequestPayload) (*models.FriendStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	requestID, err := strconv.ParseInt(strings.TrimSpace(requestIDValue), 10, 64)
	if err != nil || requestID <= 0 {
		return nil, ente.ErrBadRequest
	}
	if strings.TrimSpace(req.TargetFriendSealedSpaceKey) == "" || req.TargetKeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("targetFriendSealedSpaceKey and targetKeyVersion are required")
	}
	targetFriendSealedSpaceKey, err := decodeEncodedSpaceField("targetFriendSealedSpaceKey", req.TargetFriendSealedSpaceKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
	if err != nil {
		return nil, err
	}
	targetSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	requesterID, created, err := c.FriendsRepo.ConfirmFriendRequest(
		ctx.Request.Context(),
		userID,
		targetSpace.SpaceID,
		requestID,
		targetFriendSealedSpaceKey,
		req.TargetKeyVersion,
	)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("friend request is stale or no longer available")
		}
		return nil, err
	}
	if created && c.EmailNotifier != nil {
		go c.EmailNotifier.OnSpaceFriendAdded(targetSpace.SpaceSlug, requesterID)
	}
	return &models.FriendStatusResponse{Status: "friend"}, nil
}

func (c *FriendsController) DeleteRequest(ctx *gin.Context, requestIDValue string) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	requestID, err := strconv.ParseInt(strings.TrimSpace(requestIDValue), 10, 64)
	if err != nil || requestID <= 0 {
		return ente.ErrBadRequest
	}
	if err := c.FriendsRepo.DeleteFriendRequest(ctx.Request.Context(), userID, requestID); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.ErrNotFound
		}
		return err
	}
	return nil
}

func (c *FriendsController) Unfriend(ctx *gin.Context, req models.FriendTargetPayload) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	actorSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
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
	return c.FriendsRepo.DeleteFriendship(ctx.Request.Context(), userID, actorSpace.SpaceID, space.SpaceID)
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
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	relationship, err := c.FriendsRepo.GetRelationship(ctx.Request.Context(), userID, viewerSpace.SpaceID, targetSpace.OwnerID, targetSpace.SpaceID)
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
	if len(req.Shares) > maxSpaceFriendSharesPerRefresh {
		return ente.NewBadRequestWithMessage("too many friend shares")
	}
	updates := make([]repo.SpaceShareUpdateRecord, 0, len(req.Shares))
	for _, share := range req.Shares {
		if strings.TrimSpace(share.FriendSpaceID) == "" || strings.TrimSpace(share.FriendSealedSpaceKey) == "" {
			return ente.NewBadRequestWithMessage("friendSpaceId and friendSealedSpaceKey are required for each share")
		}
		friendSealedSpaceKey, err := decodeEncodedSpaceField("friendSealedSpaceKey", share.FriendSealedSpaceKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
		if err != nil {
			return err
		}
		updates = append(updates, repo.SpaceShareUpdateRecord{
			FriendSpaceID:        strings.TrimSpace(share.FriendSpaceID),
			FriendSealedSpaceKey: friendSealedSpaceKey,
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
			Friend:               share.SpaceSlug,
			SpaceID:              share.SpaceID,
			SpaceSlug:            share.SpaceSlug,
			FriendSealedSpaceKey: encodeSpaceField(share.FriendSealedSpaceKey),
			KeyVersion:           share.KeyVersion,
		})
	}
	return resp, nil
}
