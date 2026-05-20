package api

import (
	"net/http"

	"github.com/ente-io/museum/pkg/utils/handler"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

func respondJSON(c *gin.Context, payload any, err error) {
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
	if err != nil {
		handler.Error(c, stacktrace.Propagate(err, ""))
		return
	}
	c.Status(http.StatusOK)
}
