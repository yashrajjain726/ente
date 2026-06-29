package api

import (
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) CreatePost(c *gin.Context) {
	var req models.CreatePostRequest
	if !bindJSON(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Posts.Create(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListFeed(c *gin.Context) {
	var req models.ListFeedRequest
	if !bindQuery(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Posts.ListFeed(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListPosts(c *gin.Context) {
	var req models.ListPostsRequest
	if !bindQuery(c, &req) {
		return
	}
	req.SpaceID = c.Param("spaceID")
	resp, err := h.Module.Posts.List(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) GetPost(c *gin.Context) {
	var req models.GetPostRequest
	if !bindQuery(c, &req) {
		return
	}
	req.SpaceID = c.Param("spaceID")
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.Get(c, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdatePostCaption(c *gin.Context) {
	var req models.UpdatePostCaptionRequest
	if !bindJSON(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.UpdateCaption(c, space, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) LikePost(c *gin.Context) {
	h.setPostLike(c, true)
}

func (h *Handlers) UnlikePost(c *gin.Context) {
	h.setPostLike(c, false)
}

func (h *Handlers) setPostLike(c *gin.Context, like bool) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Posts.SetLike(c, space, postID, like)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeletePost(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	respondStatus(c, h.Module.Posts.Delete(c, space, postID))
}
