package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) ListWalls(c *gin.Context) {
	var req models.ListWallsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.List(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateWall(c *gin.Context) {
	var req models.CreateWallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.Create(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) GetWallProfile(c *gin.Context) {
	var req models.GetWallProfileRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.GetProfile(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdateWallProfile(c *gin.Context) {
	var req models.UpdateWallProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.UpdateProfile(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) UpdateWallSlug(c *gin.Context) {
	var req models.UpdateWallSlugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.UpdateSlug(c, c.Param("wallID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) LookupWallBySlug(c *gin.Context) {
	resp, err := h.Module.Walls.LookupBySlug(c, c.Param("wallSlug"))
	respondJSON(c, resp, err)
}

func (h *Handlers) RotateWallKey(c *gin.Context) {
	var req models.RotateWallKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.RotateKey(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListWallKeyVersions(c *gin.Context) {
	var req models.GetWallProfileRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Walls.ListVersions(c, req)
	respondJSON(c, resp, err)
}
