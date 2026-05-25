package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) GetSpaceLink(c *gin.Context) {
	resp, err := h.Module.Links.Get(c, c.Param("spaceID"))
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateSpaceLink(c *gin.Context) {
	var req models.SpaceLinkCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Links.Create(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RotateSpaceLink(c *gin.Context) {
	var req models.SpaceLinkCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Links.Rotate(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteSpaceLink(c *gin.Context) {
	respondStatus(c, h.Module.Links.Delete(c, c.Param("spaceID")))
}

func (h *Handlers) SpaceLinkLogin(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var req models.SpaceLinkLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Links.Login(c, req)
	respondJSON(c, resp, err)
}
