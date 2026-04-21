package controller

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type FollowController struct {
	FollowRepo *repo.FollowRepository
	WallsRepo  *repo.WallsRepository
	auth       authDeps
}

func (c *FollowController) Community(ctx *gin.Context, req models.CommunityRequest) (*models.CommunityResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	users, next, err := c.FollowRepo.ListCommunity(ctx.Request.Context(), userID, req.Query, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	resp := &models.CommunityResponse{NextCursor: next, Users: make([]models.CommunityUserResponse, 0, len(users))}
	for _, user := range users {
		resp.Users = append(resp.Users, models.CommunityUserResponse{
			Username:     user.Username,
			WallID:       user.WallID,
			WallSlug:     user.WallSlug,
			Followers:    user.Followers,
			Following:    user.Following,
			Posts:        user.Posts,
			Relationship: user.Relationship,
			Bio:          user.Bio,
		})
	}
	return resp, nil
}

func (c *FollowController) Request(ctx *gin.Context, req models.FollowRequestPayload) (*models.FollowRequestCreatedResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	var wall *repo.WallRecord
	switch {
	case req.TargetWallID != nil && strings.TrimSpace(*req.TargetWallID) != "":
		wall, err = c.WallsRepo.GetWallByID(ctx.Request.Context(), strings.TrimSpace(*req.TargetWallID))
	case req.TargetUsername != nil && strings.TrimSpace(*req.TargetUsername) != "":
		wall, err = c.WallsRepo.GetWallBySlug(ctx.Request.Context(), strings.TrimSpace(*req.TargetUsername))
	default:
		return nil, ente.NewBadRequestWithMessage("targetUsername or targetWallId is required")
	}
	if err != nil {
		return nil, err
	}
	if wall.OwnerID == userID {
		return nil, ente.NewBadRequestWithMessage("cannot follow yourself")
	}
	created, err := c.FollowRepo.CreateRequest(ctx.Request.Context(), userID, wall.WallID)
	if err != nil {
		return nil, err
	}
	return &models.FollowRequestCreatedResponse{RequestID: created.RequestID, Status: created.Status}, nil
}

func (c *FollowController) ListRequests(ctx *gin.Context) ([]models.FollowRequestResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	requests, err := c.FollowRepo.ListIncomingRequests(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.FollowRequestResponse, 0, len(requests))
	for _, request := range requests {
		resp = append(resp, models.FollowRequestResponse{
			RequestID:         request.RequestID,
			Follower:          request.RequesterSlug,
			WallID:            request.TargetWallID,
			WallSlug:          request.TargetSlug,
			FollowerPublicKey: request.RequesterKey,
			Status:            request.Status,
			CreatedAt:         formatMicros(request.CreatedAt),
		})
	}
	return resp, nil
}

func (c *FollowController) ListOutgoingRequests(ctx *gin.Context) ([]models.OutgoingFollowRequestResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	requests, err := c.FollowRepo.ListOutgoingRequests(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.OutgoingFollowRequestResponse, 0, len(requests))
	for _, request := range requests {
		resp = append(resp, models.OutgoingFollowRequestResponse{
			RequestID: request.RequestID,
			Followee:  request.TargetSlug,
			WallID:    request.TargetWallID,
			WallSlug:  request.TargetSlug,
			Status:    request.Status,
			CreatedAt: formatMicros(request.CreatedAt),
		})
	}
	return resp, nil
}

func (c *FollowController) CancelRequest(ctx *gin.Context, req models.CancelFollowRequestPayload) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	record, err := c.FollowRepo.GetRequest(ctx.Request.Context(), req.RequestID)
	if err != nil {
		return err
	}
	if record.RequesterID != userID {
		return ente.ErrPermissionDenied
	}
	if err := c.FollowRepo.UpdatePendingRequestStatus(ctx.Request.Context(), req.RequestID, "cancelled"); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.NewBadRequestWithMessage("follow request is not pending")
		}
		return err
	}
	return nil
}

func (c *FollowController) Approve(ctx *gin.Context, req models.ApproveFollowPayload) (*models.FollowRequestCreatedResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if req.RequestID <= 0 || strings.TrimSpace(req.WallID) == "" || strings.TrimSpace(req.EncryptedWallKey) == "" || req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("requestId, wallId, encryptedWallKey and keyVersion are required")
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return nil, err
	}
	record, err := c.FollowRepo.ApproveRequest(ctx.Request.Context(), req.RequestID, wall.WallID, req.EncryptedWallKey, req.KeyVersion)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("follow request is not pending or keyVersion does not match current wall version")
		}
		return nil, err
	}
	return &models.FollowRequestCreatedResponse{RequestID: record.RequestID, Status: record.Status}, nil
}

func (c *FollowController) Reject(ctx *gin.Context, req models.RejectFollowPayload) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	record, err := c.FollowRepo.GetRequest(ctx.Request.Context(), req.RequestID)
	if err != nil {
		return err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), record.TargetWallID)
	if err != nil {
		return err
	}
	if wall.OwnerID != userID {
		return ente.ErrPermissionDenied
	}
	if err := c.FollowRepo.UpdatePendingRequestStatus(ctx.Request.Context(), req.RequestID, "rejected"); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.NewBadRequestWithMessage("follow request is not pending")
		}
		return err
	}
	return nil
}

func (c *FollowController) Unfollow(ctx *gin.Context, req models.FollowRequestPayload) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	var wall *repo.WallRecord
	switch {
	case req.TargetWallID != nil && strings.TrimSpace(*req.TargetWallID) != "":
		wall, err = c.WallsRepo.GetWallByID(ctx.Request.Context(), strings.TrimSpace(*req.TargetWallID))
	case req.TargetUsername != nil && strings.TrimSpace(*req.TargetUsername) != "":
		wall, err = c.WallsRepo.GetWallBySlug(ctx.Request.Context(), strings.TrimSpace(*req.TargetUsername))
	default:
		return ente.NewBadRequestWithMessage("targetUsername or targetWallId is required")
	}
	if err != nil {
		return err
	}
	if err := c.FollowRepo.DeleteShareByWallAndFollower(ctx.Request.Context(), wall.WallID, userID); err != nil {
		return err
	}
	requests, err := c.FollowRepo.ListOutgoingRequests(ctx.Request.Context(), userID)
	if err == nil {
		for _, request := range requests {
			if request.TargetWallID == wall.WallID {
				_ = c.FollowRepo.UpdateRequestStatus(ctx.Request.Context(), request.RequestID, "unfollowed")
			}
		}
	}
	return nil
}

func (c *FollowController) ListFollowers(ctx *gin.Context, req models.ListWallFollowersRequest) ([]models.WallFollowerResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return nil, err
	}
	followers, err := c.FollowRepo.ListFollowersForWall(ctx.Request.Context(), wall.WallID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.WallFollowerResponse, 0, len(followers))
	for _, follower := range followers {
		resp = append(resp, models.WallFollowerResponse{
			FollowerID: follower.FollowerID,
			Username:   follower.Username,
			PublicKey:  follower.PublicKey,
			KeyVersion: follower.KeyVersion,
			CreatedAt:  formatMicros(follower.CreatedAt),
		})
	}
	return resp, nil
}

func (c *FollowController) RefreshShares(ctx *gin.Context, req models.RefreshFollowSharesRequest) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return err
	}
	if req.KeyVersion <= 0 {
		return ente.NewBadRequestWithMessage("keyVersion is required")
	}
	updates := make([]repo.WallShareUpdateRecord, 0, len(req.Shares))
	for _, share := range req.Shares {
		if share.FollowerID == 0 || strings.TrimSpace(share.EncryptedWallKey) == "" {
			return ente.NewBadRequestWithMessage("followerId and encryptedWallKey are required for each share")
		}
		updates = append(updates, repo.WallShareUpdateRecord{
			FollowerID:       share.FollowerID,
			EncryptedWallKey: share.EncryptedWallKey,
		})
	}
	if err := c.FollowRepo.UpdateShares(ctx.Request.Context(), wall.WallID, updates, req.KeyVersion); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.NewBadRequestWithMessage("keyVersion does not match current wall version or follow share does not exist")
		}
		return err
	}
	return nil
}

func (c *FollowController) ListShares(ctx *gin.Context) ([]models.FollowShareResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	shares, err := c.FollowRepo.ListSharesForFollower(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.FollowShareResponse, 0, len(shares))
	for _, share := range shares {
		resp = append(resp, models.FollowShareResponse{
			Followee:         share.FolloweeSlug,
			WallID:           share.WallID,
			WallSlug:         share.FolloweeSlug,
			EncryptedWallKey: share.EncryptedWallKey,
			KeyVersion:       share.KeyVersion,
		})
	}
	return resp, nil
}
