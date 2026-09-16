package network

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestClientInfoForStorage(t *testing.T) {
	for _, tc := range []struct{ pkg, version, want string }{
		{"", "", ""},
		{"io.ente.photos", "", "io.ente.photos"},
		{"io.ente.photos", "1.0", "io.ente.photos/1.0"},
		{strings.Repeat("x", 300), "", strings.Repeat("x", 256)},
		{strings.Repeat("界", 100), "", strings.Repeat("界", 85)},
		{"client\x00\xff", "", "client�"},
	} {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest("GET", "/", nil)
		ctx.Request.Header.Set("X-Client-Package", tc.pkg)
		ctx.Request.Header.Set("X-Client-Version", tc.version)
		require.Equal(t, tc.want, GetClientInfoForStorage(ctx))
	}
}
