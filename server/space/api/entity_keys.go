package api

import (
	"database/sql"
	"net/http"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) CreateSpaceEntityKey(c *gin.Context) {
	var req models.SpaceEntityKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondStatus(c, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.EntityKeys.CreateKey(c, req))
}

func (h *Handlers) EnsureSpaceEntityKey(c *gin.Context) {
	var req models.SpaceEntityKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.EntityKeys.EnsureKey(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) GetSpaceEntityKey(c *gin.Context) {
	var req models.GetSpaceEntityKeyRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.EntityKeys.GetKey(c, req)
	if err != nil && stacktrace.RootCause(err) == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	respondJSON(c, resp, err)
}
