package api

import (
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) GetSpaceLink(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Links.Get(c, space)
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateSpaceLink(c *gin.Context) {
	var req models.SpaceLinkCreateRequest
	if !bindJSON(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Links.Create(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RotateSpaceLink(c *gin.Context) {
	var req models.SpaceLinkCreateRequest
	if !bindJSON(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Links.Rotate(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteSpaceLink(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	respondStatus(c, h.Module.Links.Delete(c, space))
}

func (h *Handlers) SpaceLinkLogin(c *gin.Context) {
	var req models.SpaceLinkLoginRequest
	if !bindJSON(c, &req) {
		return
	}
	resp, err := h.Module.Links.Login(c, req)
	respondJSON(c, resp, err)
}
