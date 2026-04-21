package controller

import (
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/ente-io/museum/wall/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type PostsController struct {
	PostsRepo  *repo.PostsRepository
	WallsRepo  *repo.WallsRepository
	FollowRepo *repo.FollowRepository
	AssetsRepo *repo.AssetsRepository
	auth       authDeps
}

func (c *PostsController) Create(ctx *gin.Context, req models.CreatePostRequest) (*models.CreatePostResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WallID) == "" || strings.TrimSpace(req.EncryptedPostKey) == "" || len(req.Objects) == 0 {
		return nil, ente.NewBadRequestWithMessage("wallId, encryptedPostKey and objects are required")
	}
	if req.KeyVersion <= 0 {
		return nil, ente.NewBadRequestWithMessage("keyVersion is required")
	}
	wall, err := c.auth.requireWallOwner(ctx.Request.Context(), userID, req.WallID)
	if err != nil {
		return nil, err
	}
	assets := make([]repo.WallPostAssetRecord, 0, len(req.Objects))
	for _, object := range req.Objects {
		if strings.TrimSpace(object.ObjectKey) == "" {
			return nil, ente.NewBadRequestWithMessage("objectKey is required for each object")
		}
		staged, err := verifyStagedUpload(ctx, c.AssetsRepo, userID, object.ObjectKey, repo.TempObjectPurposePost, nil)
		if err != nil {
			return nil, err
		}
		assets = append(assets, repo.WallPostAssetRecord{
			ObjectKey:      staged.ObjectKey,
			BucketID:       staged.BucketID,
			Size:           sql.NullInt64{Int64: staged.ExpectedSize, Valid: staged.ExpectedSize > 0},
			Position:       object.Position,
			Variant:        sql.NullString{String: object.Variant, Valid: strings.TrimSpace(object.Variant) != ""},
			BlurHashCipher: sql.NullString{String: object.BlurHashCipher, Valid: strings.TrimSpace(object.BlurHashCipher) != ""},
		})
	}
	postID, err := c.PostsRepo.CreatePost(ctx.Request.Context(), userID, wall.WallID, req.EncryptedPostKey, req.CaptionCipher, req.KeyVersion, assets)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("keyVersion does not match current wall version")
		}
		return nil, err
	}
	return &models.CreatePostResponse{PostID: postID}, nil
}

func (c *PostsController) List(ctx *gin.Context, req models.ListPostsRequest) (*models.PostPage, error) {
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), strings.TrimSpace(req.WallID))
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), viewer, wall); err != nil {
		return nil, err
	}
	viewerID := int64(0)
	if viewer != nil {
		viewerID = viewer.UserID
	}
	posts, nextCursor, err := c.PostsRepo.ListPostsByWall(ctx.Request.Context(), wall.WallID, viewerID, req.Cursor, req.Limit)
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
		resp = append(resp, *toPostResponse(&post, assetsByPost[post.PostID]))
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
	posts, nextCursor, err := c.PostsRepo.ListFeed(ctx.Request.Context(), userID, req.Cursor, req.Limit)
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
		items = append(items, *toPostResponse(&post, assetsByPost[post.PostID]))
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
	if viewer != nil {
		viewerID = viewer.UserID
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, viewerID)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), post.WallID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), viewer, wall); err != nil {
		return nil, err
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx.Request.Context(), []int64{id})
	if err != nil {
		return nil, err
	}
	return toPostResponse(post, assetsByPost[id]), nil
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
	if err := c.PostsRepo.UpdateCaption(ctx.Request.Context(), id, userID, req.CaptionCipher); err != nil {
		return nil, err
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, userID)
	if err != nil {
		return nil, err
	}
	assetsByPost, err := c.PostsRepo.ListAssetsByPostIDs(ctx.Request.Context(), []int64{id})
	if err != nil {
		return nil, err
	}
	return toPostResponse(post, assetsByPost[id]), nil
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
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, userID)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), post.WallID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), &viewerAuth{UserID: userID}, wall); err != nil {
		return nil, err
	}
	if err := c.PostsRepo.SetLike(ctx.Request.Context(), id, userID, req.Like); err != nil {
		return nil, err
	}
	return &models.LikePostResponse{Liked: req.Like}, nil
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

func (c *PostsController) ListComments(ctx *gin.Context, postID string) (*models.ListCommentsResponse, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	viewer, err := c.auth.resolveViewer(ctx)
	if err != nil {
		return nil, err
	}
	viewerID := int64(0)
	if viewer != nil {
		viewerID = viewer.UserID
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, viewerID)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), post.WallID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), viewer, wall); err != nil {
		return nil, err
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(ctx.Query("limit")))
	comments, nextCursor, err := c.PostsRepo.ListTopLevelComments(ctx.Request.Context(), id, viewerID, ctx.Query("cursor"), limit)
	if err != nil {
		return nil, err
	}
	parentIDs := make([]int64, 0, len(comments))
	for _, comment := range comments {
		parentIDs = append(parentIDs, comment.CommentID)
	}
	repliesByParent, err := c.PostsRepo.ListReplies(ctx.Request.Context(), id, viewerID, parentIDs)
	if err != nil {
		return nil, err
	}
	resp := make([]models.CommentResponse, 0, len(comments))
	for _, comment := range comments {
		replies := repliesByParent[comment.CommentID]
		replyResp := make([]models.CommentResponse, 0, len(replies))
		for _, reply := range replies {
			replyResp = append(replyResp, toCommentResponse(reply, nil))
		}
		resp = append(resp, toCommentResponse(comment, replyResp))
	}
	return &models.ListCommentsResponse{Comments: resp, NextCursor: nextCursor}, nil
}

func (c *PostsController) CreateComment(ctx *gin.Context, postID string, req models.CreateCommentRequest) (*models.CommentResponse, error) {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.CommentCipher) == "" {
		return nil, ente.NewBadRequestWithMessage("commentCipher is required")
	}
	id, err := strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil || id <= 0 {
		return nil, ente.NewBadRequestWithMessage("invalid postID")
	}
	post, err := c.PostsRepo.GetPost(ctx.Request.Context(), id, userID)
	if err != nil {
		return nil, err
	}
	wall, err := c.WallsRepo.GetWallByID(ctx.Request.Context(), post.WallID)
	if err != nil {
		return nil, err
	}
	if err := c.auth.canViewWall(ctx.Request.Context(), &viewerAuth{UserID: userID}, wall); err != nil {
		return nil, err
	}
	if req.ParentCommentID != nil {
		if *req.ParentCommentID <= 0 {
			return nil, ente.NewBadRequestWithMessage("invalid parentCommentId")
		}
		parent, err := c.PostsRepo.GetComment(ctx.Request.Context(), *req.ParentCommentID, userID)
		if err != nil {
			if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
				return nil, ente.NewBadRequestWithMessage("invalid parentCommentId")
			}
			return nil, err
		}
		if parent.PostID != id || parent.ParentCommentID.Valid {
			return nil, ente.NewBadRequestWithMessage("invalid parentCommentId")
		}
	}
	comment, err := c.PostsRepo.CreateComment(ctx.Request.Context(), id, userID, req.CommentCipher, req.ParentCommentID)
	if err != nil {
		return nil, err
	}
	resp := toCommentResponse(*comment, nil)
	return &resp, nil
}

func (c *PostsController) DeleteComment(ctx *gin.Context, postID, commentID string) error {
	userID, err := c.auth.requireUser(ctx)
	if err != nil {
		return err
	}
	_, err = strconv.ParseInt(strings.TrimSpace(postID), 10, 64)
	if err != nil {
		return ente.NewBadRequestWithMessage("invalid postID")
	}
	commentIDInt, err := strconv.ParseInt(strings.TrimSpace(commentID), 10, 64)
	if err != nil || commentIDInt <= 0 {
		return ente.NewBadRequestWithMessage("invalid commentID")
	}
	return c.PostsRepo.DeleteComment(ctx.Request.Context(), commentIDInt, userID)
}
