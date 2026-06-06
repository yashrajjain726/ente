package api

import (
	"context"
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	baserepo "github.com/ente-io/museum/pkg/repo"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/space/controller"
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupSpaceSessionAPITest(t *testing.T) (*Handlers, *spacerepo.Module, int64) {
	t.Helper()
	testutil.WithServerRoot(t)
	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() {
		testutil.ResetTables(t, db)
	})
	gin.SetMode(gin.TestMode)
	repos := spacerepo.NewModule(db, nil)
	userID := testutil.InsertUser(t, db, testutil.UserFixture{
		Email:        "space-session@example.com",
		CreationTime: timeutil.Microseconds(),
	})
	_, err := db.Exec(`
		INSERT INTO key_attributes (
			user_id, kek_salt, kek_hash_bytes, encrypted_key, key_decryption_nonce,
			public_key, encrypted_secret_key, secret_key_decryption_nonce
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, userID, "salt", []byte{1, 2, 3}, "encrypted-key", "nonce", "public-key", "encrypted-secret-key", "secret-nonce")
	require.NoError(t, err)
	return NewHandlers(controller.NewModule(repos, &baserepo.UserAuthRepository{DB: db})), repos, userID
}

func TestSpaceBrowserSessionCookieAttributes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, tt := range []struct {
		name     string
		origin   string
		expected []string
		absent   []string
	}{
		{
			name:   "production",
			origin: "https://ente.space",
			expected: []string{
				"ente_space_session=session-token",
				"Path=/space",
				"Max-Age=31536000",
				"HttpOnly",
				"Secure",
				"SameSite=None",
			},
			absent: []string{"Domain="},
		},
		{
			name:   "local dev",
			origin: "http://localhost:3012",
			expected: []string{
				"ente_space_session=session-token",
				"Path=/space",
				"Max-Age=31536000",
				"HttpOnly",
				"SameSite=Lax",
			},
			absent: []string{"Domain=", "Secure"},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/space/sessions", nil)
			ctx.Request.Header.Set("Origin", tt.origin)

			setSpaceBrowserSessionCookie(ctx, "session-token", spaceBrowserSessionCookieMaxAgeSeconds)

			header := recorder.Header().Get("Set-Cookie")
			for _, expected := range tt.expected {
				require.Contains(t, header, expected)
			}
			for _, absent := range tt.absent {
				require.NotContains(t, header, absent)
			}
		})
	}
}

func TestRequireSpaceBrowserSessionAcceptsValidCookie(t *testing.T) {
	handlers, repos, userID := setupSpaceSessionAPITest(t)
	token := "valid-space-session-token"
	tokenHash := sha256.Sum256([]byte(token))
	require.NoError(t, repos.Sessions.CreateBrowserSession(context.Background(), tokenHash[:], userID, "client-key", timeutil.NDaysFromNow(1)))

	router := gin.New()
	router.GET("/space", handlers.RequireSpaceBrowserSession(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"userID": c.Request.Header.Get("X-Auth-User-ID")})
	})
	req := httptest.NewRequest(http.MethodGet, "/space", nil)
	req.Header.Set("Origin", "https://ente.space")
	req.AddCookie(&http.Cookie{Name: controller.SpaceBrowserSessionCookieName, Value: token})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.JSONEq(t, `{"userID":"`+strconv.FormatInt(userID, 10)+`"}`, recorder.Body.String())
}

func TestRequireSpaceBrowserSessionClearsInvalidCookie(t *testing.T) {
	handlers, _, _ := setupSpaceSessionAPITest(t)
	router := gin.New()
	router.GET("/space", handlers.RequireSpaceBrowserSession(), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/space", nil)
	req.Header.Set("Origin", "https://ente.space")
	req.AddCookie(&http.Cookie{Name: controller.SpaceBrowserSessionCookieName, Value: "invalid-session-token"})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	setCookie := recorder.Header().Get("Set-Cookie")
	require.Contains(t, setCookie, "ente_space_session=")
	require.Contains(t, setCookie, "Path=/space")
	require.Contains(t, setCookie, "Max-Age=0")
	require.Contains(t, setCookie, "HttpOnly")
	require.Contains(t, setCookie, "Secure")
	require.Contains(t, setCookie, "SameSite=None")
}

func TestBootstrapBrowserSessionClearsInvalidCookie(t *testing.T) {
	handlers, _, _ := setupSpaceSessionAPITest(t)
	router := gin.New()
	router.POST("/space/sessions/bootstrap", handlers.BootstrapBrowserSession)
	req := httptest.NewRequest(http.MethodPost, "/space/sessions/bootstrap", nil)
	req.Header.Set("Origin", "https://ente.space")
	req.AddCookie(&http.Cookie{Name: controller.SpaceBrowserSessionCookieName, Value: "invalid-session-token"})
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	setCookie := recorder.Header().Get("Set-Cookie")
	require.Contains(t, setCookie, "ente_space_session=")
	require.Contains(t, setCookie, "Path=/space")
	require.Contains(t, setCookie, "Max-Age=0")
	require.Contains(t, setCookie, "SameSite=None")
}
