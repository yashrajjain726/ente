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

type FriendsController struct {
	FriendsRepo *repo.FriendsRepository
	WallsRepo   *repo.WallsRepository
	auth        authDeps
}

func (c *FriendsController) Add(ctx *gin.Context, req models.AddFriendPayload) (*models.FriendStatusResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.TargetWallID) == "" ||
		strings.TrimSpace(req.LinkSessionToken) == "" ||
		strings.TrimSpace(req.RequesterWallID) == "" ||
		strings.TrimSpace(req.TargetEncryptedWallKey) == "" ||
		strings.TrimSpace(req.RequesterEncryptedWallKey) == "" ||
		req.TargetKeyVersion <= 0 ||
		req.RequesterKeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("targetWallId, linkSessionToken, requesterWallId, encrypted wall keys and key versions are required")
	}
	session, err := c.auth.requireLinkSession(ctx.Request.Context(), req.LinkSessionToken)
	if err != nil {
		return nil, err
	}
	if session.WallID != strings.TrimSpace(req.TargetWallID) {
		return nil, ente.ErrPermissionDenied
	}
	if session.KeyVersion != req.TargetKeyVersion {
		return nil, ente.NewBadRequestWithMessage("targetKeyVersion does not match link session")
	}
	if _, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, strings.TrimSpace(req.RequesterWallID)); err != nil {
		return nil, err
	}
	if err := c.FriendsRepo.AddFriend(
		ctx.Request.Context(),
		userID,
		strings.TrimSpace(req.RequesterWallID),
		strings.TrimSpace(req.TargetWallID),
		strings.TrimSpace(req.TargetEncryptedWallKey),
		req.TargetKeyVersion,
		strings.TrimSpace(req.RequesterEncryptedWallKey),
		req.RequesterKeyVersion,
	); err != nil {
		if errors.Is(stacktrace.RootCause(err), repo.ErrAlreadyFriends) {
			return &models.FriendStatusResponse{Status: "friend"}, nil
		}
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("wall key version is stale")
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
	return c.FriendsRepo.DeleteFriendship(ctx.Request.Context(), userID, wall.WallID)
}

func (c *FriendsController) ListFriends(ctx *gin.Context, req models.ListWallFriendsRequest) ([]models.WallFriendResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return nil, err
	}
	friends, err := c.FriendsRepo.ListFriendsForWall(ctx.Request.Context(), wall.WallID)
	if err != nil {
		return nil, err
	}
	resp := make([]models.WallFriendResponse, 0, len(friends))
	for _, friend := range friends {
		var avatar *models.ProfileAvatarResponse
		if friend.AvatarObjectKey.Valid {
			avatar = &models.ProfileAvatarResponse{
				ObjectKey: friend.AvatarObjectKey.String,
			}
			if friend.AvatarSize.Valid {
				avatar.Size = friend.AvatarSize.Int64
			}
		}
		resp = append(resp, models.WallFriendResponse{
			FriendID:         friend.FriendID,
			WallID:           friend.WallID,
			Username:         friend.Username,
			PublicKey:        friend.PublicKey,
			KeyVersion:       friend.KeyVersion,
			EncryptedProfile: friend.EncryptedProfile,
			Avatar:           avatar,
			Friends:          friend.Friends,
			Posts:            friend.Posts,
			CreatedAt:        formatMicros(friend.CreatedAt),
		})
	}
	return resp, nil
}

func (c *FriendsController) Relationship(ctx *gin.Context, req models.FriendRelationshipRequest) (*models.FriendRelationshipResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	targetWallID := strings.TrimSpace(req.TargetWallID)
	if targetWallID == "" {
		return nil, ente.NewBadRequestWithMessage("targetWallId is required")
	}
	targetWall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), targetWallID)
	if err != nil {
		return nil, err
	}
	relationship, err := c.FriendsRepo.GetRelationship(ctx.Request.Context(), userID, targetWall.OwnerID, targetWall.WallID)
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
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return err
	}
	if req.KeyVersion <= 0 {
		return ente.NewBadRequestWithMessage("keyVersion is required")
	}
	updates := make([]repo.WallShareUpdateRecord, 0, len(req.Shares))
	for _, share := range req.Shares {
		if share.FriendID == 0 || strings.TrimSpace(share.EncryptedWallKey) == "" {
			return ente.NewBadRequestWithMessage("friendId and encryptedWallKey are required for each share")
		}
		updates = append(updates, repo.WallShareUpdateRecord{
			FriendID:         share.FriendID,
			EncryptedWallKey: share.EncryptedWallKey,
		})
	}
	if err := c.FriendsRepo.UpdateShares(ctx.Request.Context(), wall.WallID, updates, req.KeyVersion); err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return ente.NewBadRequestWithMessage("keyVersion does not match current wall version or friend share does not exist")
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
			Friend:           share.WallSlug,
			WallID:           share.WallID,
			WallSlug:         share.WallSlug,
			EncryptedWallKey: share.EncryptedWallKey,
			KeyVersion:       share.KeyVersion,
		})
	}
	return resp, nil
}
