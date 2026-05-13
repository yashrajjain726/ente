package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
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
	resp, err := h.Module.Posts.Get(c, c.Param("postID"))
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdatePostCaption(c *gin.Context) {
	var req models.UpdatePostCaptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.UpdateCaption(c, c.Param("postID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) TogglePostLike(c *gin.Context) {
	var req models.LikePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.ToggleLike(c, c.Param("postID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListPostLikers(c *gin.Context) {
	resp, err := h.Module.Posts.ListLikers(c, c.Param("postID"))
	respondJSON(c, resp, err)
}

func (h *Handlers) DeletePost(c *gin.Context) {
	respondStatus(c, h.Module.Posts.Delete(c, c.Param("postID")))
}

func (h *Handlers) ListComments(c *gin.Context) {
	resp, err := h.Module.Posts.ListComments(c, c.Param("postID"))
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateComment(c *gin.Context) {
	var req models.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.CreateComment(c, c.Param("postID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ToggleCommentLike(c *gin.Context) {
	var req models.LikeCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Posts.ToggleCommentLike(c, c.Param("postID"), c.Param("commentID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteComment(c *gin.Context) {
	respondStatus(c, h.Module.Posts.DeleteComment(c, c.Param("postID"), c.Param("commentID")))
}
