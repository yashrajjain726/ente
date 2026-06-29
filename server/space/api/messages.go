package api

import (
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) CreateMessage(c *gin.Context) {
	var req models.CreateMessageRequest
	if !bindJSON(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	friendSpaceID, ok := stringParam(c, "friendSpaceID")
	if !ok {
		return
	}
	resp, err := h.Module.Messages.Create(c, space, friendSpaceID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) LikeMessage(c *gin.Context) {
	h.setMessageLike(c, true)
}

func (h *Handlers) UnlikeMessage(c *gin.Context) {
	h.setMessageLike(c, false)
}

func (h *Handlers) setMessageLike(c *gin.Context, like bool) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	messageID, ok := stringParam(c, "messageID")
	if !ok {
		return
	}
	resp, err := h.Module.Messages.SetLike(c, space, messageID, like)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteMessage(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	messageID, ok := stringParam(c, "messageID")
	if !ok {
		return
	}
	err := h.Module.Messages.Delete(c, space, messageID)
	respondJSON(c, nil, err)
}

func (h *Handlers) ReplyToPost(c *gin.Context) {
	var req models.CreateMessageRequest
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
	resp, err := h.Module.Messages.ReplyToPost(c, space, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListConversations(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Messages.ListConversations(c, space)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListMessageThread(c *gin.Context) {
	var req models.ListMessageThreadRequest
	if !bindQuery(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	friendSpaceID, ok := stringParam(c, "friendSpaceID")
	if !ok {
		return
	}
	resp, err := h.Module.Messages.ListThread(c, space, friendSpaceID, req)
	respondJSON(c, resp, err)
}
