package api

import (
	"errors"
	"io"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) GetUnreadStatus(c *gin.Context) {
	resp, err := h.Module.Read.GetUnreadStatus(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) MarkNotificationsRead(c *gin.Context) {
	var req models.MarkNotificationsReadRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Read.MarkNotificationsRead(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) MarkMessageLikesRead(c *gin.Context) {
	resp, err := h.Module.Read.MarkMessageLikesRead(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) MarkMessageThreadRead(c *gin.Context) {
	var req models.MarkMessageThreadReadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Read.MarkMessageThreadRead(c, req)
	respondJSON(c, resp, err)
}
