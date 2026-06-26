package api

import (
	"database/sql"
	"net/http"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) ListSpaces(c *gin.Context) {
	resp, err := h.Module.Spaces.List(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateSpace(c *gin.Context) {
	var req models.CreateSpaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Spaces.Create(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) GetSpaceProfile(c *gin.Context) {
	var req models.GetSpaceProfileRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Spaces.GetProfile(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdateSpaceProfile(c *gin.Context) {
	var req models.UpdateSpaceProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Spaces.UpdateProfile(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdateSpaceSlug(c *gin.Context) {
	var req models.UpdateSpaceSlugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Spaces.UpdateSlug(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) LookupSpaceBySlug(c *gin.Context) {
	resp, err := h.Module.Spaces.LookupBySlug(c, c.Param("spaceSlug"))
	if err != nil && stacktrace.RootCause(err) == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	respondJSON(c, resp, err)
}

func (h *Handlers) SpaceSlugAvailability(c *gin.Context) {
	resp, err := h.Module.Spaces.SlugAvailability(c, c.Param("spaceSlug"))
	respondJSON(c, resp, err)
}

func (h *Handlers) RotateSpaceKey(c *gin.Context) {
	var req models.RotateSpaceKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Spaces.RotateKey(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListSpaceKeyVersions(c *gin.Context) {
	var req models.GetSpaceProfileRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Spaces.ListVersions(c, req)
	respondJSON(c, resp, err)
}
