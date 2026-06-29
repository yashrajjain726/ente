package api

import (
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) PresignUpload(c *gin.Context) {
	var req models.PresignUploadRequest
	if !bindJSON(c, &req) {
		return
	}
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Assets.PresignUpload(c, space, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) AssetRedirect(c *gin.Context) {
	var req models.AssetRedirectRequest
	if !bindQuery(c, &req) {
		return
	}
	req.SpaceID = c.Param("spaceID")
	resp, err := h.Module.Assets.Redirect(c, req)
	respondJSON(c, resp, err)
}
