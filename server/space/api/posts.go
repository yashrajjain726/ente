package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) CreatePost(c *gin.Context) {
	var req models.CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.Create(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListFeed(c *gin.Context) {
	var req models.ListFeedRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.ListFeed(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListPosts(c *gin.Context) {
	var req models.ListPostsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.List(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) GetPost(c *gin.Context) {
	var req models.GetPostRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.Get(c, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdatePostCaption(c *gin.Context) {
	var req models.UpdatePostCaptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.UpdateCaption(c, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) TogglePostLike(c *gin.Context) {
	var req models.LikePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.ToggleLike(c, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListPostLikers(c *gin.Context) {
	var req models.ListPostLikersRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.ListLikers(c, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeletePost(c *gin.Context) {
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	respondStatus(c, h.Module.Posts.Delete(c, postID))
}
