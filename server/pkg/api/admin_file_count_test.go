package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ente/museum/internal/testutil"
	"github.com/ente/museum/pkg/repo"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestInitializeFileCountsHandler(t *testing.T) {
	db := testutil.RequireTestDB(t)
	t.Cleanup(func() { testutil.ResetTables(t, db) })
	for _, tt := range []struct {
		name     string
		sql      string
		status   int
		response string
	}{
		{"initialize", "", http.StatusOK, `{"initialized":true}`},
		{"already_ready", `UPDATE usage SET photos_file_count = 0, locker_file_count = 0`,
			http.StatusOK, `{"initialized":false}`},
		{"ineligible", `INSERT INTO files(owner_id, file_decryption_header, thumbnail_decryption_header,
			metadata_decryption_header, encrypted_metadata, updation_time)
			VALUES (1, 'header', 'header', 'header', 'metadata', 1)`,
			http.StatusOK, `{"initialized":false,"reason":"file counts are ineligible: untrashed file without an owned membership"}`},
		{"missing_usage", `DELETE FROM usage`, http.StatusNotFound, `{}`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			testutil.ResetTables(t, db)
			testutil.InsertUser(t, db, testutil.UserFixture{UserID: 1, Email: "init@ente.io", CreationTime: 1})
			testutil.InsertUsage(t, db, 1, 0)
			if tt.sql != "" {
				_, err := db.Exec(tt.sql)
				require.NoError(t, err)
			}
			h := &AdminHandler{UsageRepo: &repo.UsageRepository{DB: db}}
			router := gin.New()
			router.POST("/admin/user/init-file-counts", h.InitializeFileCounts)
			request := httptest.NewRequest(http.MethodPost, "/admin/user/init-file-counts", strings.NewReader(`{"userID":1}`))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("X-Auth-User-ID", "9")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			require.Equal(t, tt.status, recorder.Code, recorder.Body.String())
			require.JSONEq(t, tt.response, recorder.Body.String())
		})
	}
}
