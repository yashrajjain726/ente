package repo

import (
	"fmt"
	"testing"

	"github.com/ente/museum/ente"
	"github.com/ente/museum/internal/testutil"
)

func TestGetLockerUsageUsesStoredAndLegacyCountsPerUser(t *testing.T) {
	db := setupFileUsageTest(t)
	readyUserID := testutil.InsertUser(t, db, testutil.UserFixture{Email: "ready@ente.io", CreationTime: 1})
	legacyUserID := testutil.InsertUser(t, db, testutil.UserFixture{Email: "legacy@ente.io", CreationTime: 1})
	testutil.InsertUsage(t, db, readyUserID, 0)
	testutil.InsertUsage(t, db, legacyUserID, 0)
	setReadyFileCounts(t, db, readyUserID, 0, 9)

	for _, userID := range []int64{readyUserID, legacyUserID} {
		fileID := insertObjectTestFile(t, db, userID)
		collectionID := insertObjectTestCollection(t, db, userID)
		if _, err := db.Exec(`UPDATE collections SET app = 'locker' WHERE collection_id = $1`, collectionID); err != nil {
			t.Fatal(err)
		}
		linkObjectTestFileToCollection(t, db, collectionID, fileID, userID)
		insertObjectTestKey(t, db, fileID, ente.FILE, fmt.Sprintf("object-%d", userID), 100, []string{"b2-eu-cen"})
	}

	var queued []int64
	usage, err := (&UsageRepository{
		DB:                           db,
		QueueFileCountInitialization: func(userID int64) { queued = append(queued, userID) },
	}).GetLockerUsage(t.Context(), []int64{readyUserID, legacyUserID})
	if err != nil {
		t.Fatal(err)
	}
	if usage.TotalFileCount != 10 || usage.TotalUsage != 200 {
		t.Fatalf("family usage = %+v, want 10 files and 200 bytes", usage)
	}
	if len(usage.Users) != 2 || usage.Users[0].FileCount != 9 || usage.Users[1].FileCount != 1 {
		t.Fatalf("member usage = %+v, want stored then legacy count", usage.Users)
	}
	if len(queued) != 1 || queued[0] != legacyUserID {
		t.Fatalf("queued users = %v, want [%d]", queued, legacyUserID)
	}
}
