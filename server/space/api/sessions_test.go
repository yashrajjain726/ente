package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
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

func TestCreateSpaceBrowserSessionReturnsToken(t *testing.T) {
	handlers, repos, userID := setupSpaceSessionAPITest(t)
	router := gin.New()
	router.POST("/space/sessions", handlers.CreateBrowserSession)
	req := httptest.NewRequest(http.MethodPost, "/space/sessions", bytes.NewBufferString(`{"clientKey":"client-key"}`))
	req.Header.Set("X-Auth-User-ID", strconv.FormatInt(userID, 10))
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	var resp struct {
		SessionToken string `json:"sessionToken"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.SessionToken)
	tokenHash := sha256.Sum256([]byte(resp.SessionToken))
	session, err := repos.Sessions.GetBrowserSession(context.Background(), tokenHash[:])
	require.NoError(t, err)
	require.Equal(t, userID, session.UserID)
}

func TestRequireSpaceBrowserSessionAcceptsValidHeader(t *testing.T) {
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
	req.Header.Set(controller.SpaceBrowserSessionTokenHeader, token)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.JSONEq(t, `{"userID":"`+strconv.FormatInt(userID, 10)+`"}`, recorder.Body.String())
}

func TestRequireSpaceBrowserSessionRejectsInvalidHeader(t *testing.T) {
	handlers, _, _ := setupSpaceSessionAPITest(t)
	router := gin.New()
	router.GET("/space", handlers.RequireSpaceBrowserSession(), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/space", nil)
	req.Header.Set("Origin", "https://ente.space")
	req.Header.Set(controller.SpaceBrowserSessionTokenHeader, "invalid-session-token")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
}

func TestBootstrapBrowserSessionAcceptsHeader(t *testing.T) {
	handlers, repos, userID := setupSpaceSessionAPITest(t)
	token := "valid-space-session-token"
	tokenHash := sha256.Sum256([]byte(token))
	require.NoError(t, repos.Sessions.CreateBrowserSession(context.Background(), tokenHash[:], userID, "client-key", timeutil.NDaysFromNow(1)))
	router := gin.New()
	router.POST("/space/sessions/bootstrap", handlers.BootstrapBrowserSession)
	req := httptest.NewRequest(http.MethodPost, "/space/sessions/bootstrap", nil)
	req.Header.Set(controller.SpaceBrowserSessionTokenHeader, token)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.JSONEq(t, `{"id":`+strconv.FormatInt(userID, 10)+`,"clientKey":"client-key","keyAttributes":{"kekSalt":"salt","encryptedKey":"encrypted-key","keyDecryptionNonce":"nonce","publicKey":"public-key","encryptedSecretKey":"encrypted-secret-key","secretKeyDecryptionNonce":"secret-nonce","memLimit":0,"opsLimit":0}}`, recorder.Body.String())
}

func TestDeleteBrowserSessionRevokesHeaderSession(t *testing.T) {
	handlers, repos, userID := setupSpaceSessionAPITest(t)
	token := "valid-space-session-token"
	tokenHash := sha256.Sum256([]byte(token))
	require.NoError(t, repos.Sessions.CreateBrowserSession(context.Background(), tokenHash[:], userID, "client-key", timeutil.NDaysFromNow(1)))
	router := gin.New()
	router.DELETE("/space/sessions/current", handlers.DeleteBrowserSession)
	req := httptest.NewRequest(http.MethodDelete, "/space/sessions/current", nil)
	req.Header.Set(controller.SpaceBrowserSessionTokenHeader, token)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	_, err := repos.Sessions.GetBrowserSession(context.Background(), tokenHash[:])
	require.Error(t, err)
}
