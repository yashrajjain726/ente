package api

import "github.com/gin-gonic/gin"

func (h *Handlers) GetUnreadStatus(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	resp, err := h.Module.Read.GetUnreadStatus(c, space)
	respondJSON(c, resp, err)
}

func (h *Handlers) MarkNotificationsRead(c *gin.Context) {
	space, ok := selectedSpace(h, c)
	if !ok {
		return
	}
	friendSpaceID, ok := stringParam(c, "friendSpaceID")
	if !ok {
		return
	}
	resp, err := h.Module.Read.MarkNotificationsRead(c, space, friendSpaceID)
	respondJSON(c, resp, err)
}
