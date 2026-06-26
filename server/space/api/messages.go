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
	err := h.Module.Messages.Delete(c, c.Param("messageID"), models.DeleteMessageRequest{})
	respondJSON(c, nil, err)
}

func (h *Handlers) ReplyToPost(c *gin.Context) {
	var req models.CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Messages.ReplyToPost(c, c.Param("postID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListMessages(c *gin.Context) {
	var req models.ListMessagesRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Messages.List(c, req)
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
