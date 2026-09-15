package pkg

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/ente/cli/internal/api"
	"github.com/ente/cli/pkg/model"
)

func TestFetchRemoteCollectionsHandlesDeletedCollectionsWithoutDecrypting(t *testing.T) {
	var sinceTime string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/collections/v2" {
			http.NotFound(w, r)
			return
		}
		sinceTime = r.URL.Query().Get("sinceTime")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"collections":[{"id":7,"owner":{"id":1},"updationTime":9,"isDeleted":true},{"id":8,"owner":{"id":1},"updationTime":11,"isDeleted":true}]}`))
	}))
	defer server.Close()

	db, err := GetDB(t.TempDir() + "/cli.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	account := model.Account{UserID: 2, App: api.AppPhotos}
	if err := createDataBuckets(db, account); err != nil {
		t.Fatal(err)
	}
	ctx := context.WithValue(context.Background(), "app", string(account.App))
	ctx = context.WithValue(ctx, "account_key", account.AccountKey())
	ctx = context.WithValue(ctx, "user_id", account.UserID)

	ctrl := ClICtrl{
		Client: api.NewClient(api.Params{Host: server.URL}),
		DB:     db,
		// A nil holder proves tombstones never enter key or metadata decryption.
		KeyHolder: nil,
	}
	existing := model.RemoteAlbum{
		ID:        7,
		OwnerID:   1,
		IsShared:  true,
		AlbumName: "Vacation",
		AlbumKey: model.EncString{
			CipherText: "local-key",
			Nonce:      "local-nonce",
		},
		PrivateMeta: map[string]interface{}{"visibility": float64(1)},
	}
	existingJSON, err := json.Marshal(&existing)
	if err != nil {
		t.Fatal(err)
	}
	if err := ctrl.PutValue(ctx, model.RemoteAlbums, []byte(strconv.FormatInt(existing.ID, 10)), existingJSON); err != nil {
		t.Fatal(err)
	}
	if err := ctrl.PutConfigValue(ctx, model.CollectionsSyncKey, []byte("5")); err != nil {
		t.Fatal(err)
	}

	if err := ctrl.fetchRemoteCollections(ctx); err != nil {
		t.Fatal(err)
	}
	if sinceTime != "5" {
		t.Fatalf("sinceTime = %q, want 5", sinceTime)
	}

	stored, err := ctrl.GetValue(ctx, model.RemoteAlbums, []byte("7"))
	if err != nil {
		t.Fatal(err)
	}
	var album model.RemoteAlbum
	if err := json.Unmarshal(stored, &album); err != nil {
		t.Fatal(err)
	}
	if !album.IsDeleted || album.LastUpdatedAt != 9 || album.AlbumName != existing.AlbumName || album.AlbumKey != existing.AlbumKey || album.PrivateMeta["visibility"] != float64(1) {
		t.Fatalf("deleted album lost local export state: %+v", album)
	}
	unknown, err := ctrl.GetValue(ctx, model.RemoteAlbums, []byte("8"))
	if err != nil {
		t.Fatal(err)
	}
	if unknown != nil {
		t.Fatalf("unknown tombstone created album: %s", unknown)
	}
	cursor, err := ctrl.GetInt64ConfigValue(ctx, model.CollectionsSyncKey)
	if err != nil || cursor != 11 {
		t.Fatalf("cursor = %d, %v; want 11", cursor, err)
	}
}
