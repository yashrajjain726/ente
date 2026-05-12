package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) ListNotifications(c *gin.Context) {
	var req models.ListNotificationsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Notifications.List(c, req)
	respondJSON(c, resp, err)
}
