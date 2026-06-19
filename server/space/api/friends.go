package api

import (
	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

func (h *Handlers) AddFriend(c *gin.Context) {
	var req models.AddFriendPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Friends.Add(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) Unfriend(c *gin.Context) {
	var req models.FriendTargetPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.Friends.Unfriend(c, req))
}

func (h *Handlers) ListFriendRequests(c *gin.Context) {
	resp, err := h.Module.Friends.ListRequests(c)
	respondJSON(c, resp, err)
}

func (h *Handlers) ConfirmFriendRequest(c *gin.Context) {
	var req models.ConfirmFriendRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Friends.ConfirmRequest(c, c.Param("requestID"), req)
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteFriendRequest(c *gin.Context) {
	respondStatus(c, h.Module.Friends.DeleteRequest(c, c.Param("requestID")))
}

func (h *Handlers) ListSpaceFriends(c *gin.Context) {
	var req models.ListSpaceFriendsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Friends.ListFriends(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) FriendRelationship(c *gin.Context) {
	var req models.FriendRelationshipRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	resp, err := h.Module.Friends.Relationship(c, req)
	respondJSON(c, resp, err)
}

func (h *Handlers) RefreshFriendShares(c *gin.Context) {
	var req models.RefreshFriendSharesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	respondStatus(c, h.Module.Friends.RefreshShares(c, req))
}

func (h *Handlers) ListFriendShares(c *gin.Context) {
	resp, err := h.Module.Friends.ListShares(c)
	respondJSON(c, resp, err)
}
