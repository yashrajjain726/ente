package controller

import (
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
	if wall.AvatarContentType.Valid {
		resp.ContentType = wall.AvatarContentType.String
	}
	if wall.AvatarSize.Valid {
		resp.Size = wall.AvatarSize.Int64
	}
	return resp
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
	if asset.ContentType.Valid {
		resp.ContentType = asset.ContentType.String
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
	return resp
}

func toPostResponse(post *wallrepo.WallPostRecord, assets []wallrepo.WallPostAssetRecord) *models.PostResponse {
	resp := &models.PostResponse{
		PostID:           post.PostID,
		WallID:           post.WallID,
		WallSlug:         post.WallSlug,
		OwnerUserID:      post.OwnerID,
		Author:           post.Author,
		EncryptedPostKey: post.EncryptedPostKey,
		CaptionCipher:    post.CaptionCipher,
		KeyVersion:       post.KeyVersion,
		CreatedAt:        formatMicros(post.CreatedAt),
		Likes:            post.Likes,
		ViewerLiked:      post.ViewerLiked,
		Comments:         post.Comments,
	}
	if len(assets) > 0 {
		resp.Objects = make([]models.PostObjectPayload, 0, len(assets))
		for _, asset := range assets {
			resp.Objects = append(resp.Objects, toPostObjectPayload(asset))
		}
	}
	return resp
}

func toCommentResponse(comment wallrepo.WallCommentRecord, replies []models.CommentResponse) models.CommentResponse {
	resp := models.CommentResponse{
		CommentID:       comment.CommentID,
		Author:          comment.Author,
		CommentCipher:   comment.CommentCipher,
		CreatedAt:       formatMicros(comment.CreatedAt),
		ViewerCanDelete: comment.ViewerCanDelete,
		Replies:         replies,
	}
	if comment.ParentCommentID.Valid {
		parentID := comment.ParentCommentID.Int64
		resp.ParentCommentID = &parentID
	}
	return resp
}
