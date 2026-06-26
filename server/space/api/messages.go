package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) CreateMessage(c *gin.Context) {
	var req models.CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Messages.Create(c, c.Param("friendSpaceID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ToggleMessageLike(c *gin.Context) {
	var req models.LikeMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Messages.ToggleLike(c, c.Param("messageID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteMessage(c *gin.Context) {
	err := h.Module.Messages.Delete(c, c.Param("messageID"))
	respondJSON(c, nil, err)
}

func (h *Handlers) ReplyToPost(c *gin.Context) {
	var req models.CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	postID, ok := positiveInt64Param(c, "postID")
	if !ok {
		return
	}
	resp, err := h.Module.Messages.ReplyToPost(c, postID, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListConversations(c *gin.Context) {
	resp, err := h.Module.Messages.ListConversations(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListMessageThread(c *gin.Context) {
	var req models.ListMessageThreadRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Messages.ListThread(c, c.Param("friendSpaceID"), req)
	respondJSON(c, resp, err)
}
