package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/wall/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) Community(c *gin.Context) {
	var req models.CommunityRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Follow.Community(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) FollowRequest(c *gin.Context) {
	var req models.FollowRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Follow.Request(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListFollowRequests(c *gin.Context) {
	resp, err := h.Module.Follow.ListRequests(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) ListOutgoingFollowRequests(c *gin.Context) {
	resp, err := h.Module.Follow.ListOutgoingRequests(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) CancelFollowRequest(c *gin.Context) {
	var req models.CancelFollowRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.Follow.CancelRequest(c, req))
}

func (h *Handlers) ApproveFollow(c *gin.Context) {
	var req models.ApproveFollowPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Follow.Approve(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RejectFollow(c *gin.Context) {
	var req models.RejectFollowPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.Follow.Reject(c, req))
}

func (h *Handlers) Unfollow(c *gin.Context) {
	var req models.FollowRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.Follow.Unfollow(c, req))
}

func (h *Handlers) ListWallFollowers(c *gin.Context) {
	var req models.ListWallFollowersRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Follow.ListFollowers(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RefreshFollowShares(c *gin.Context) {
	var req models.RefreshFollowSharesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.Follow.RefreshShares(c, req))
}

func (h *Handlers) ListFollowShares(c *gin.Context) {
	resp, err := h.Module.Follow.ListShares(c)
	respondJSON(c, resp, err)
}
