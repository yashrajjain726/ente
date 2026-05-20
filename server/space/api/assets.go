package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) PresignUpload(c *gin.Context) {
	var req models.PresignUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Assets.PresignUpload(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) AssetRedirect(c *gin.Context) {
	var req models.AssetRedirectRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Assets.Redirect(c, req)
	respondJSON(c, resp, err)
}
