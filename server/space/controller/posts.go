package controller

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

type PostsController struct {
	PostsRepo     *repo.PostsRepository
	SpacesRepo    *repo.SpacesRepository
	FriendsRepo   *repo.FriendsRepository
	AssetsRepo    *repo.AssetsRepository
	EmailNotifier SpaceEmailNotifier
	auth          authDeps
}

func (c *PostsController) Create(ctx *gin.Context, req models.CreatePostRequest) (*models.CreatePostResponse, error) {
	space := mustSelectedSpace(ctx)
	if strings.TrimSpace(req.EncryptedPostKey) == "" || len(req.Objects) == 0 {
		return nil, ente.NewBadRequestWithMessage("encryptedPostKey and objects are required")
	}
	if len(req.Objects) > maxSpacePostObjects {
		return nil, ente.NewBadRequestWithMessage("too many post objects")
	}
	if req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("keyVersion is required")
	}
	encryptedPostKey, err := decodeEncodedSpaceField("encryptedPostKey", req.EncryptedPostKey, maxSpaceEncryptedKeyEncodedBytes, maxSpaceEncryptedKeyDecodedBytes)
	if err != nil {
		return nil, err
	}
	captionCipher, err := decodeOptionalEncodedSpacePointerField("captionCipher", req.CaptionCipher, maxSpaceCaptionCipherEncodedBytes, maxSpaceCaptionCipherDecodedBytes)
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
		metadataCipher, err := decodeEncodedSpaceField("metadataCipher", object.MetadataCipher, maxSpaceAssetMetadataEncodedBytes, maxSpaceAssetMetadataDecodedBytes)
		if err != nil {
			return nil, err
		}
		staged, err := verifyStagedUpload(ctx, c.AssetsRepo, object.ObjectKey, repo.TempObjectPurposePost, &space.SpaceID)
		if err != nil {
			return nil, err
		}
		assets = append(assets, repo.SpacePostAssetRecord{
			ObjectKey:      staged.ObjectKey,
			BucketID:       staged.BucketID,
			Size:           sql.NullInt64{Int64: staged.ExpectedSize, Valid: staged.ExpectedSize > 0},
			Position:       object.Position,
			MetadataCipher: metadataCipher,
		})
	}
	postID, err := c.PostsRepo.CreatePost(ctx, space.SpaceID, encryptedPostKey, captionCipher, req.KeyVersion, assets)
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

func (c *PostsController) postResponses(ctx context.Context, posts []repo.SpacePostRecord, includeAuthor bool) ([]models.PostResponse, error) {
	postIDs := make([]int64, 0, len(posts))
	for _, post := range posts {
		postIDs = append(postIDs, post.PostID)
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx, postIDs)
	if err != nil {
		return nil, err
	}
	resp := make([]models.PostResponse, 0, len(posts))
	for _, post := range posts {
		resp = append(resp, *toPostResponse(&post, assetsByPost[post.PostID], includeAuthor))
	}
	return resp, nil
}

func (c *PostsController) postResponse(ctx context.Context, post *repo.SpacePostRecord, includeAuthor bool) (*models.PostResponse, error) {
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx, []int64{post.PostID})
	if err != nil {
		return nil, err
	}
	return toPostResponse(post, assetsByPost[post.PostID], includeAuthor), nil
}

func (c *PostsController) List(ctx *gin.Context, req models.ListPostsRequest) (*models.PostPage, error) {
	viewer, err := c.auth.resolveViewer(ctx, req.ViewerSpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx, strings.TrimSpace(req.SpaceID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx, viewer, space); err != nil {
		return nil, err
	}
	viewerSpaceID := ""
	if viewer != nil {
		viewerSpaceID = viewer.SpaceID
	}
	posts, nextCursor, err := c.PostsRepo.ListPostsBySpace(ctx, space.SpaceID, viewerSpaceID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	resp, err := c.postResponses(ctx, posts, true)
	if err != nil {
		return nil, err
	}
	return &models.PostPage{
		Items:      resp,
		NextCursor: nextCursor,
	}, nil
}

func (c *PostsController) ListFeed(ctx *gin.Context, req models.ListFeedRequest) (*models.FeedPage, error) {
	viewerSpace := mustSelectedSpace(ctx)
	posts, nextCursor, err := c.PostsRepo.ListFeed(ctx, viewerSpace.SpaceID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	items, err := c.postResponses(ctx, posts, true)
	if err != nil {
		return nil, err
	}
	return &models.FeedPage{
		Items:      items,
		NextCursor: nextCursor,
	}, nil
}

func (c *PostsController) Get(ctx *gin.Context, postID int64, req models.GetPostRequest) (*models.PostResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx, req.ViewerSpaceID)
	if err != nil {
		return nil, err
	}
	viewerSpaceID := ""
	if viewer != nil {
		viewerSpaceID = viewer.SpaceID
	}
	post, err := c.PostsRepo.GetPost(ctx, postID, viewerSpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx, post.SpaceID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx, viewer, space); err != nil {
		return nil, err
	}
	return c.postResponse(ctx, post, true)
}

func (c *PostsController) UpdateCaption(ctx *gin.Context, postID int64, req models.UpdatePostCaptionRequest) (*models.PostResponse, error) {
	viewerSpace := mustSelectedSpace(ctx)
	captionCipher, err := decodeOptionalEncodedSpacePointerField("captionCipher", req.CaptionCipher, maxSpaceCaptionCipherEncodedBytes, maxSpaceCaptionCipherDecodedBytes)
	if err != nil {
		return nil, err
	}
	if err := c.PostsRepo.UpdateCaption(ctx, postID, viewerSpace.SpaceID, captionCipher); err != nil {
		return nil, err
	}
	post, err := c.PostsRepo.GetPost(ctx, postID, viewerSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	return c.postResponse(ctx, post, true)
}

func (c *PostsController) ToggleLike(ctx *gin.Context, postID int64, req models.LikePostRequest) (*models.LikePostResponse, error) {
	actorSpace := mustSelectedSpace(ctx)
	post, err := c.PostsRepo.GetPost(ctx, postID, actorSpace.SpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx, post.SpaceID)
	if err != nil {
		return nil, err
	}
	if space.OwnerID == actorSpace.OwnerID {
		return nil, ente.NewBadRequestWithMessage("cannot like your own post")
	}
	if err := c.auth.canViewSpace(ctx, &viewerAuth{UserID: actorSpace.OwnerID, SpaceID: actorSpace.SpaceID}, space); err != nil {
		return nil, err
	}
	created, err := c.PostsRepo.SetLikeWithCreated(ctx, postID, actorSpace.SpaceID, req.Like)
	if err != nil {
		return nil, err
	}
	if req.Like && created && c.EmailNotifier != nil {
		go c.EmailNotifier.OnSpacePostLiked(actorSpace.SpaceSlug, post.OwnerID)
	}
	return &models.LikePostResponse{Liked: req.Like}, nil
}

func (c *PostsController) ListLikers(ctx *gin.Context, postID int64, req models.ListPostLikersRequest) (*models.ListPostLikersResponse, error) {
	viewer, err := c.auth.resolveViewer(ctx, req.ViewerSpaceID)
	if err != nil {
		return nil, err
	}
	viewerSpaceID := ""
	if viewer != nil {
		viewerSpaceID = viewer.SpaceID
	}
	post, err := c.PostsRepo.GetPost(ctx, postID, viewerSpaceID)
	if err != nil {
		return nil, err
	}
	space, err := c.SpacesRepo.GetSpaceByID(ctx, post.SpaceID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewSpace(ctx, viewer, space); err != nil {
		return nil, err
	}
	likers, nextCursor, err := c.PostsRepo.ListPostLikers(ctx, postID, req.Cursor, req.Limit)
	if err != nil {
		return nil, err
	}
	resp := make([]models.PostLikerResponse, 0, len(likers))
	actors := make([]repo.SpaceActorRecord, 0, len(likers))
	for _, liker := range likers {
		actors = append(actors, liker.Actor)
	}
	visible, err := actorVisibility(ctx, c.auth, viewer, actors...)
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

func (c *PostsController) Delete(ctx *gin.Context, postID int64) error {
	space := mustSelectedSpace(ctx)
	_, err := c.PostsRepo.DeletePost(ctx, postID, space.SpaceID)
	return err
}
