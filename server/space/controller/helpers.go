package controller

import (
	"context"
	"time"

	"github.com/ente-io/museum/space/models"
	spacerepo "github.com/ente-io/museum/space/repo"
)

func formatMicros(value int64) string {
	if value <= 0 {
		return ""
	}
	return time.UnixMicro(value).UTC().Format(time.RFC3339Nano)
}

func toAvatarResponse(space *spacerepo.SpaceRecord) *models.ProfileAvatarResponse {
	if !space.AvatarObjectKey.Valid {
		return nil
	}
	resp := &models.ProfileAvatarResponse{
		ObjectKey: space.AvatarObjectKey.String,
		UpdatedAt: formatMicros(space.UpdatedAt),
	}
	if space.AvatarSize.Valid {
		resp.Size = space.AvatarSize.Int64
	}
	return resp
}

func toActorAvatarResponse(actor spacerepo.SpaceActorRecord) *models.ProfileAvatarResponse {
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

func toActorResponse(actor spacerepo.SpaceActorRecord, includePrivate bool) models.SpaceActorResponse {
	resp := models.SpaceActorResponse{
		SpaceSlug: actor.SpaceSlug,
	}
	if !includePrivate {
		return resp
	}
	resp.UserID = actor.UserID
	resp.SpaceID = actor.SpaceID
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

func actorVisibility(ctx context.Context, auth authDeps, viewer *viewerAuth, actors ...spacerepo.SpaceActorRecord) (map[string]bool, error) {
	visible := make(map[string]bool)
	if len(actors) == 0 || viewer == nil {
		return visible, nil
	}
	spaceIDSet := make(map[string]struct{}, len(actors))
	for _, actor := range actors {
		if actor.SpaceID != "" {
			spaceIDSet[actor.SpaceID] = struct{}{}
		}
	}
	if len(spaceIDSet) == 0 {
		return visible, nil
	}
	if viewer.Link != nil {
		visible[viewer.Link.SpaceID] = true
		return visible, nil
	}
	if viewer.UserID <= 0 || auth.FriendsRepo == nil {
		return visible, nil
	}
	spaceIDs := make([]string, 0, len(spaceIDSet))
	for spaceID := range spaceIDSet {
		spaceIDs = append(spaceIDs, spaceID)
	}
	return auth.FriendsRepo.ListAccessibleSpaceIDs(ctx, viewer.UserID, spaceIDs)
}

func visibleActor(visible map[string]bool, actor spacerepo.SpaceActorRecord) bool {
	return visible[actor.SpaceID]
}

func toSpaceKeyResponse(space *spacerepo.SpaceRecord) *models.SpaceKeyResponse {
	return &models.SpaceKeyResponse{
		SpaceID:           space.SpaceID,
		SpaceSlug:         space.SpaceSlug,
		EncryptedSpaceKey: space.EncryptedSpaceKey,
		EncryptedProfile:  space.EncryptedProfile,
		KeyVersion:        space.CurrentVersion,
	}
}

func toPostObjectPayload(asset spacerepo.SpacePostAssetRecord) models.PostObjectPayload {
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

func toPostResponse(post *spacerepo.SpacePostRecord, assets []spacerepo.SpacePostAssetRecord, includeAuthorPrivate bool) *models.PostResponse {
	resp := &models.PostResponse{
		PostID:           post.PostID,
		SpaceID:          post.SpaceID,
		SpaceSlug:        post.SpaceSlug,
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
