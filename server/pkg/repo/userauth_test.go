package repo

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"testing"

	"github.com/ente/museum/ente"
	"github.com/ente/museum/internal/testutil"
	"github.com/ente/museum/pkg/utils/time"
)

func TestTokenHashTrigger(t *testing.T) {
	testutil.WithServerRoot(t)

	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() { testutil.ResetTables(t, db) })

	userID := testutil.InsertUser(t, db, testutil.UserFixture{
		Email:        "token-hash@example.com",
		CreationTime: 1,
	})
	rawToken := "existing-bearer-token-π"
	var storedToken sql.NullString
	var storedHash []byte
	err := db.QueryRow(
		`INSERT INTO tokens(user_id, token, token_hash, creation_time, last_used_at, app)
		 VALUES($1, $2, $3, $4, $5, $6)
		 RETURNING token, token_hash`,
		userID, rawToken, bytes.Repeat([]byte{0xff}, sha256.Size), 1, 1, ente.Photos,
	).Scan(&storedToken, &storedHash)
	if err != nil {
		t.Fatalf("failed to insert token: %v", err)
	}

	expectedHash := sha256.Sum256([]byte(rawToken))
	if storedToken.Valid {
		t.Fatalf("raw token was stored: %q", storedToken.String)
	}
	if !bytes.Equal(storedHash, expectedHash[:]) {
		t.Fatalf("unexpected token hash: got %x want %x", storedHash, expectedHash)
	}

	rawToken = "updated-bearer-token"
	if err := db.QueryRow(
		`UPDATE tokens SET token = $1 WHERE user_id = $2 RETURNING token, token_hash`, rawToken, userID,
	).Scan(&storedToken, &storedHash); err != nil {
		t.Fatalf("failed to update token: %v", err)
	}
	if storedToken.Valid {
		t.Fatalf("updated raw token was stored: %q", storedToken.String)
	}
	expectedHash = sha256.Sum256([]byte(rawToken))
	if !bytes.Equal(storedHash, expectedHash[:]) {
		t.Fatalf("unexpected updated token hash: got %x want %x", storedHash, expectedHash)
	}

	explicitHash := sha256.Sum256([]byte("explicit-token-hash"))
	err = db.QueryRow(
		`INSERT INTO tokens(user_id, token_hash, creation_time, last_used_at, app)
		 VALUES($1, $2, $3, $4, $5)
		 RETURNING token, token_hash`,
		userID, explicitHash[:], 2, 2, ente.Photos,
	).Scan(&storedToken, &storedHash)
	if err != nil {
		t.Fatalf("failed to insert explicit token hash: %v", err)
	}
	if storedToken.Valid || !bytes.Equal(storedHash, explicitHash[:]) {
		t.Fatalf("explicit token hash changed: token=%q hash=%x", storedToken.String, storedHash)
	}
	if err := db.QueryRow(
		`UPDATE tokens SET token = NULL WHERE token_hash = $1 RETURNING token_hash`, explicitHash[:],
	).Scan(&storedHash); err != nil {
		t.Fatalf("failed to clear token: %v", err)
	}
	if !bytes.Equal(storedHash, explicitHash[:]) {
		t.Fatalf("clearing token changed hash: got %x want %x", storedHash, explicitHash)
	}
}

func TestUserAuthRepositoryRemoveOTTReturnsWhetherRowWasConsumed(t *testing.T) {
	testutil.WithServerRoot(t)

	db := testutil.RequireTestDB(t)
	if _, err := db.Exec(`TRUNCATE TABLE otts RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("failed to reset otts: %v", err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec(`TRUNCATE TABLE otts RESTART IDENTITY CASCADE`); err != nil {
			t.Errorf("failed to reset otts: %v", err)
		}
	})

	repo := &UserAuthRepository{DB: db}
	emailHash := "duplicate-verify-email-hash"
	ott := "123456"
	app := ente.Photos

	err := repo.AddOTT(emailHash, app, ott, time.Microseconds()+60*1000000)
	if err != nil {
		t.Fatalf("failed to add ott: %v", err)
	}

	removed, err := repo.RemoveOTT(emailHash, ott, app)
	if err != nil {
		t.Fatalf("first remove returned error: %v", err)
	}
	if !removed {
		t.Fatal("first remove should consume the ott")
	}

	removed, err = repo.RemoveOTT(emailHash, ott, app)
	if err != nil {
		t.Fatalf("second remove returned error: %v", err)
	}
	if removed {
		t.Fatal("second remove should report that the ott was already consumed")
	}
}
