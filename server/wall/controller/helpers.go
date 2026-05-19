package controller

import (
	"context"
	"time"

	"github.com/ente-io/museum/wall/models"
	wallrepo "github.com/ente-io/museum/wall/repo"
)

func formatMicros(value int64) string {
	if value <= 0 {
		return ""
	}
	return time.UnixMicro(value).UTC().Format(time.RFC3339Nano)
}

func toAvatarResponse(wall *wallrepo.WallRecord) *models.ProfileAvatarResponse {
	if !wall.AvatarObjectKey.Valid {
		return nil
	}
	resp := &models.ProfileAvatarResponse{
		ObjectKey: wall.AvatarObjectKey.String,
		UpdatedAt: formatMicros(wall.UpdatedAt),
	}
	if wall.AvatarSize.Valid {
		resp.Size = wall.AvatarSize.Int64
	}
	return resp
}

func toActorAvatarResponse(actor wallrepo.WallActorRecord) *models.ProfileAvatarResponse {
	if !actor.AvatarObjectKey.Valid {
		return nil
	}
	resp := &models.ProfileAvatarResponse{
		ObjectKey: actor.AvatarObjectKey.String,
		UpdatedAt: formatMicros(actor.UpdatedAt),
	}
	if actor.AvatarSize.Valid {
		resp.Size = actor.AvatarSize.Int64
	}
	return resp
}

func toActorResponse(actor wallrepo.WallActorRecord, includePrivate bool) models.WallActorResponse {
	resp := models.WallActorResponse{
		WallSlug: actor.WallSlug,
	}
	if !includePrivate {
		return resp
	}
	resp.UserID = actor.UserID
	resp.WallID = actor.WallID
	resp.PublicKey = actor.PublicKey
	resp.KeyVersion = actor.KeyVersion
	resp.EncryptedProfile = actor.EncryptedProfile
	resp.Avatar = toActorAvatarResponse(actor)
	if actor.Friends.Valid {
		friends := actor.Friends.Int64
		resp.Friends = &friends
	}
	if actor.Posts.Valid {
		posts := actor.Posts.Int64
		resp.Posts = &posts
	}
	return resp
}

func actorVisibility(ctx context.Context, auth authDeps, viewer *viewerAuth, actors ...wallrepo.WallActorRecord) (map[string]bool, error) {
	visible := make(map[string]bool)
	if len(actors) == 0 || viewer == nil {
		return visible, nil
	}
	wallIDSet := make(map[string]struct{}, len(actors))
	for _, actor := range actors {
		if actor.WallID != "" {
			wallIDSet[actor.WallID] = struct{}{}
		}
	}
	if len(wallIDSet) == 0 {
		return visible, nil
	}
	if viewer.Link != nil {
		visible[viewer.Link.WallID] = true
		return visible, nil
	}
	if viewer.UserID <= 0 || auth.FriendsRepo == nil {
		return visible, nil
	}
	wallIDs := make([]string, 0, len(wallIDSet))
	for wallID := range wallIDSet {
		wallIDs = append(wallIDs, wallID)
	}
	return auth.FriendsRepo.ListAccessibleWallIDs(ctx, viewer.UserID, wallIDs)
}

func visibleActor(visible map[string]bool, actor wallrepo.WallActorRecord) bool {
	return visible[actor.WallID]
}

func toWallKeyResponse(wall *wallrepo.WallRecord) *models.WallKeyResponse {
	return &models.WallKeyResponse{
		WallID:           wall.WallID,
		WallSlug:         wall.WallSlug,
		EncryptedWallKey: wall.EncryptedWallKey,
		EncryptedProfile: wall.EncryptedProfile,
		KeyVersion:       wall.CurrentVersion,
	}
}

func toPostObjectPayload(asset wallrepo.WallPostAssetRecord) models.PostObjectPayload {
	resp := models.PostObjectPayload{
		ObjectKey: asset.ObjectKey,
		Position:  asset.Position,
	}
	if asset.Size.Valid {
		resp.Size = asset.Size.Int64
	}
	if asset.Variant.Valid {
		resp.Variant = asset.Variant.String
	}
	if asset.BlurHashCipher.Valid {
		resp.BlurHashCipher = asset.BlurHashCipher.String
	}
	if asset.Width.Valid {
		resp.Width = int(asset.Width.Int64)
	}
	if asset.Height.Valid {
		resp.Height = int(asset.Height.Int64)
	}
	if asset.MediaType.Valid {
		resp.MediaType = asset.MediaType.String
	}
	return resp
}

func toPostResponse(post *wallrepo.WallPostRecord, assets []wallrepo.WallPostAssetRecord, includeAuthorPrivate bool) *models.PostResponse {
	resp := &models.PostResponse{
		PostID:           post.PostID,
		WallID:           post.WallID,
		WallSlug:         post.WallSlug,
		OwnerUserID:      post.OwnerID,
		Author:           toActorResponse(post.Author, includeAuthorPrivate),
		EncryptedPostKey: post.EncryptedPostKey,
		CaptionCipher:    post.CaptionCipher,
		KeyVersion:       post.KeyVersion,
		CreatedAt:        formatMicros(post.CreatedAt),
		Likes:            post.Likes,
		ViewerLiked:      post.ViewerLiked,
		ViewerUnread:     post.ViewerUnread,
	}
	if len(assets) > 0 {
		resp.Objects = make([]models.PostObjectPayload, 0, len(assets))
		for _, asset := range assets {
			resp.Objects = append(resp.Objects, toPostObjectPayload(asset))
		}
	}
	return resp
}
