package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ente/museum/pkg/controller/collections"
	"github.com/gin-gonic/gin"
)

func TestBatchShareHandlerValidatesEachShare(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := &CollectionHandler{Controller: &collections.CollectionController{}}
	router.POST("/collections/share/batch", handler.BatchShare)

	tests := []struct {
		name string
		body string
	}{
		{"missing collectionID", `{"shares":[{"email":"sharee@example.com","encryptedKey":"a"}]}`},
		{"missing email", `{"shares":[{"collectionID":1,"encryptedKey":"a"}]}`},
		{"one bad item among good ones", `{"shares":[{"collectionID":1,"email":"a@example.com"},{"collectionID":1}]}`},
		{"empty shares list", `{"shares":[]}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/collections/share/batch", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Auth-User-ID", "1")
			router.ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}
