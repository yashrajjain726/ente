package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/pkg/utils/handler"
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

func setNoStore(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
}

func respondJSON(c *gin.Context, payload any, err error) {
	setNoStore(c)
	if err != nil {
		handler.Error(c, stacktrace.Propagate(err, ""))
		return
	}
	if payload == nil {
		c.Status(http.StatusOK)
		return
	}
	c.JSON(http.StatusOK, payload)
}

func respondStatus(c *gin.Context, err error) {
	setNoStore(c)
	if err != nil {
		handler.Error(c, stacktrace.Propagate(err, ""))
		return
	}
	c.Status(http.StatusOK)
}

func positiveInt64Param(c *gin.Context, name string) (int64, bool) {
	value := strings.TrimSpace(c.Param(name))
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		respondJSON(c, nil, ente.NewBadRequestWithMessage("invalid "+name))
		return 0, false
	}
	return id, true
}

func stringParam(c *gin.Context, name string) (string, bool) {
	value := strings.TrimSpace(c.Param(name))
	if value == "" {
		respondJSON(c, nil, ente.NewBadRequestWithMessage(name+" is required"))
		return "", false
	}
	return value, true
}

func selectedSpace(h *Handlers, c *gin.Context) (*spacerepo.SpaceRecord, bool) {
	space, err := h.Module.SelectedSpace(c)
	if err != nil {
		respondJSON(c, nil, err)
		return nil, false
	}
	return space, true
}

func bindJSON(c *gin.Context, req any) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return false
	}
	return true
}

func bindQuery(c *gin.Context, req any) bool {
	if err := c.ShouldBindQuery(req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return false
	}
	return true
}
