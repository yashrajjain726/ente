package controller

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

type PostsController struct {
	PostsRepo       *repo.PostsRepository
	SpacesRepo      *repo.SpacesRepository
	FriendsRepo     *repo.FriendsRepository
	AssetsRepo      *repo.AssetsRepository
	ReadMarkersRepo *repo.ReadMarkersRepository
	EmailNotifier   SpacePostEmailNotifier
	auth            authDeps
}

func (c *PostsController) Create(ctx *gin.Context, req models.CreatePostRequest) (*models.CreatePostResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.SpaceID) == "" || strings.TrimSpace(req.EncryptedPostKey) == "" || len(req.Objects) == 0 {
		return nil, ente.NewBadRequestWithMessage("spaceId, encryptedPostKey and objects are required")
	}
	if len(req.Objects) > maxSpacePostObjects {
		return nil, ente.NewBadRequestWithMessage("too many post objects")
	}
	if req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("keyVersion is required")
	}
	if err := validateEncodedSpaceField("encryptedPostKey", req.EncryptedPostKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes); err != nil {
		return nil, err
	}
	if err := validateOptionalEncodedSpacePointerField("captionCipher", req.CaptionCipher, maxSpaceCaptionCipherEncodedBytes, maxSpaceCaptionCipherDecodedBytes); err != nil {
		return nil, err
	}
	space, err := c.auth.requireSpaceOwner(ctx.Request.Context(), userID, req.SpaceID)
	if err != nil {
		return nil, err
	}
	assets := make([]repo.SpacePostAssetRecord, 0, len(req.Objects))
	for _, object := range req.Objects {
		if strings.TrimSpace(object.ObjectKey) == "" {
			return nil, ente.NewBadRequestWithMessage("objectKey is required for each object")
		}
		if err := validateSpaceTextFieldBytes("objectKey", object.ObjectKey, maxSpaceObjectKeyBytes); err != nil {
			return nil, err
		}
		if object.Position < 0 || object.Position >= maxSpacePostObjects {
			return nil, ente.NewBadRequestWithMessage("invalid object position")
		}
		if err := validateOptionalEncodedSpaceField("blurHashCipher", object.BlurHashCipher, maxSpaceBlurHashCipherEncodedBytes, maxSpaceBlurHashCipherDecodedBytes); err != nil {
			return nil, err
		}
		if err := validateSpaceTextFieldBytes("variant", object.Variant, maxSpaceVariantBytes); err != nil {
			return nil, err
		}
		if err := validateSpaceTextFieldBytes("mediaType", object.MediaType, maxSpaceMediaTypeBytes); err != nil {
			return nil, err
		}
		staged, err := verifyStagedUpload(ctx, c.AssetsRepo, userID, object.ObjectKey, repo.TempObjectPurposePost, &space.SpaceID)
		if err != nil {
			return nil, err
		}
		assets = append(assets, repo.SpacePostAssetRecord{
			ObjectKey:      staged.ObjectKey,
			BucketID:       staged.BucketID,
			Size:           sql.NullInt64{Int64: staged.ExpectedSize, Valid: staged.ExpectedSize > 0},
			Position:       object.Position,
			Variant:        sql.NullString{String: object.Variant, Valid: strings.TrimSpace(object.Variant) != ""},
			BlurHashCipher: sql.NullString{String: object.BlurHashCipher, Valid: strings.TrimSpace(object.BlurHashCipher) != ""},
			Width:          sql.NullInt64{Int64: int64(object.Width), Valid: object.Width > 0},
			Height:         sql.NullInt64{Int64: int64(object.Height), Valid: object.Height > 0},
			MediaType:      sql.NullString{String: object.MediaType, Valid: strings.TrimSpace(object.MediaType) != ""},
		})
	}
	postID, err := c.PostsRepo.CreatePost(ctx.Request.Context(), userID, space.SpaceID, req.EncryptedPostKey, req.CaptionCipher, req.KeyVersion, assets)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("keyVersion does not match current space version")
		}
		return nil, err
	}
	c.notifyFriendsOfNewPost(space.SpaceID, space.SpaceSlug)
	return &models.CreatePostResponse{PostID: postID}, nil
}

func (c *PostsController) notifyFriendsOfNewPost(spaceID, spaceSlug string) {
	if c.EmailNotifier == nil || c.FriendsRepo == nil {
		return
	}
	go func() {
		friends, err := c.FriendsRepo.ListFriendsForSpace(context.Background(), spaceID)
		if err != nil {
			log.WithField("space_id", spaceID).WithError(err).Error("Failed to list friends for space post email")
			return
		}
		recipientUserIDs := make([]int64, 0, len(friends))
		for _, friend := range friends {
			if friend.Friend.UserID > 0 {
				recipientUserIDs = append(recipientUserIDs, friend.Friend.UserID)
			}
		}
		if len(recipientUserIDs) == 0 {
			return
		}
		c.EmailNotifier.OnSpacePostCreated(spaceSlug, recipientUserIDs)
	}()
}

func (c *PostsController) List(ctx *gin.Context, req models.ListPostsRequest) (*models.PostPage, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), strings.TrimSpace(req.SpaceID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx.Request.Context(), viewer, space); err != nil {
		return nil, err
	}
	viewerID := int64(0)
	viewerSpaceID := ""
	if viewer != nil {
		viewerID = viewer.UserID
		viewerSpaceID = viewer.SpaceID
	}
	posts, nextCursor, err := c.PostsRepo.ListPostsBySpace(ctx.Request.Context(), space.SpaceID, viewerID, viewerSpaceID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	postIDs := make([]int64, 0, len(posts))
	for _, post := range posts {
		postIDs = append(postIDs, post.PostID)
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx.Request.Context(), postIDs)
	if err != nil {
		return nil, err
	}
	resp := make([]models.PostResponse, 0, len(posts))
	for _, post := range posts {
		resp = append(resp, *toPostResponse(&post, assetsByPost[post.PostID], true))
	}
	return &models.PostPage{
		Items:      resp,
		NextCursor: nextCursor,
	}, nil
}

func (c *PostsController) ListFeed(ctx *gin.Context, req models.ListFeedRequest) (*models.FeedPage, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	marker, err := c.ReadMarkersRepo.Get(ctx.Request.Context(), userID, viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	posts, nextCursor, err := c.PostsRepo.ListFeed(ctx.Request.Context(), userID, viewerSpace.SpaceID, req.Cursor, req.Limit, marker.FeedReadCreatedAt, marker.FeedReadPostID)
	if err != nil {
		return nil, err
	}
	postIDs := make([]int64, 0, len(posts))
	for _, post := range posts {
		postIDs = append(postIDs, post.PostID)
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx.Request.Context(), postIDs)
	if err != nil {
		return nil, err
	}
	items := make([]models.PostResponse, 0, len(posts))
	for _, post := range posts {
		items = append(items, *toPostResponse(&post, assetsByPost[post.PostID], true))
	}
	return &models.FeedPage{
		Items:      items,
		NextCursor: nextCursor,
	}, nil
}

func (c *PostsController) Get(ctx *gin.Context, postID string) (*models.PostResponse, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	viewerID := int64(0)
	viewerSpaceID := ""
	if viewer != nil {
		viewerID = viewer.UserID
		viewerSpaceID = viewer.SpaceID
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, viewerID, viewerSpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), post.SpaceID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx.Request.Context(), viewer, space); err != nil {
		return nil, err
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx.Request.Context(), []int64{id})
	if err != nil {
		return nil, err
	}
	return toPostResponse(post, assetsByPost[id], true), nil
}

func (c *PostsController) UpdateCaption(ctx *gin.Context, postID string, req models.UpdatePostCaptionRequest) (*models.PostResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	if err := validateOptionalEncodedSpacePointerField("captionCipher", req.CaptionCipher, maxSpaceCaptionCipherEncodedBytes, maxSpaceCaptionCipherDecodedBytes); err != nil {
		return nil, err
	}
	if err := c.PostsRepo.UpdateCaption(ctx.Request.Context(), id, userID, req.CaptionCipher); err != nil {
		return nil, err
	}
	viewerSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, userID, viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx.Request.Context(), []int64{id})
	if err != nil {
		return nil, err
	}
	return toPostResponse(post, assetsByPost[id], true), nil
}

func (c *PostsController) ToggleLike(ctx *gin.Context, postID string, req models.LikePostRequest) (*models.LikePostResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	actorSpace, err := c.auth.requireDefaultSpace(ctx.Request.Context(), userID)
	if err != nil {
		return nil, err
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, userID, actorSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), post.SpaceID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx.Request.Context(), &viewerAuth{UserID: userID, SpaceID: actorSpace.SpaceID}, space); err != nil {
		return nil, err
	}
	if err := c.PostsRepo.SetLike(ctx.Request.Context(), id, userID, actorSpace.SpaceID, req.Like); err != nil {
		return nil, err
	}
	return &models.LikePostResponse{Liked: req.Like}, nil
}

func (c *PostsController) ListLikers(ctx *gin.Context, postID string) (*models.ListPostLikersResponse, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	viewerID := int64(0)
	viewerSpaceID := ""
	if viewer != nil {
		viewerID = viewer.UserID
		viewerSpaceID = viewer.SpaceID
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, viewerID, viewerSpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx.Request.Context(), post.SpaceID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx.Request.Context(), viewer, space); err != nil {
		return nil, err
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(ctx.Query("limit")))
	likers, nextCursor, err := c.PostsRepo.ListPostLikers(ctx.Request.Context(), id, ctx.Query("cursor"), limit)
	if err != nil {
		return nil, err
	}
	resp := make([]models.PostLikerResponse, 0, len(likers))
	actors := make([]repo.SpaceActorRecord, 0, len(likers))
	for _, liker := range likers {
		actors = append(actors, liker.Actor)
	}
	visible, err := actorVisibility(ctx.Request.Context(), c.auth, viewer, actors...)
	if err != nil {
		return nil, err
	}
	for _, liker := range likers {
		resp = append(resp, models.PostLikerResponse{
			Actor:     toActorResponse(liker.Actor, visibleActor(visible, liker.Actor)),
			CreatedAt: formatMicros(liker.CreatedAt),
		})
	}
	return &models.ListPostLikersResponse{Likers: resp, NextCursor: nextCursor}, nil
}

func (c *PostsController) Delete(ctx *gin.Context, postID string) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return ente.NewBadRequestWithMessage("invalid postID")
	}
	_, err = c.PostsRepo.DeletePost(ctx.Request.Context(), id, userID)
	return err
}
