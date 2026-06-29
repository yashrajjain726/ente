package api

import (
	"github.com/ente/museum/space/models"
	spacerepo "github.com/ente/museum/space/repo"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) GetSpaceLink(c *gin.Context, space *spacerepo.SpaceRecord) {
	resp, err := h.Module.Links.Get(c, space)
	respondJSON(c, resp, err)
}

func (h *Handlers) CreateSpaceLink(c *gin.Context, space *spacerepo.SpaceRecord) {
	var req models.SpaceLinkCreateRequest
	if !bindJSON(c, &req) {
		return
	}
	resp, err := h.Module.Links.Create(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RotateSpaceLink(c *gin.Context, space *spacerepo.SpaceRecord) {
	var req models.SpaceLinkCreateRequest
	if !bindJSON(c, &req) {
		return
	}
	resp, err := h.Module.Links.Rotate(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteSpaceLink(c *gin.Context, space *spacerepo.SpaceRecord) {
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
