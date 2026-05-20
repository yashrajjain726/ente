package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) GetWallLink(c *gin.Context) {
	resp, err := h.Module.Links.Get(c, c.Param("wallID"))
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateWallLink(c *gin.Context) {
	var req models.WallLinkCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Links.Create(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RotateWallLink(c *gin.Context) {
	var req models.WallLinkCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Links.Rotate(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteWallLink(c *gin.Context) {
	respondStatus(c, h.Module.Links.Delete(c, c.Param("wallID")))
}

func (h *Handlers) WallLinkLogin(c *gin.Context) {
	var req models.WallLinkLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Links.Login(c, req)
	respondJSON(c, resp, err)
}
