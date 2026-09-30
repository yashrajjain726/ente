package middleware

import (
	"net/http"

	"github.com/ente/museum/pkg/utils/handler"
	"github.com/gin-gonic/gin"
)

// Match client_max_body_size in scripts/deploy/museum.nginx.conf.
const maxRequestBodySize = 4 << 20

func LimitRequestBody() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxRequestBodySize {
			handler.Error(c, &http.MaxBytesError{Limit: maxRequestBodySize})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRequestBodySize)
		c.Next()
	}
}
