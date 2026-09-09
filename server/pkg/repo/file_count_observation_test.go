package repo

import (
	"fmt"
	"testing"

	"github.com/ente/museum/ente"
	"github.com/ente/museum/internal/testutil"
	promtest "github.com/prometheus/client_golang/prometheus/testutil"
)

func TestGetFileCountForUserObservesCounts(t *testing.T) {
	for _, app := range []ente.App{ente.Photos, ente.Locker} {
		for _, tt := range []struct {
			name         string
			counter      any
			sourceCount  int64
			missingUsage bool
			matches      float64
			mismatches   float64
		}{
			{name: "legacy", sourceCount: 1},
			{name: "match", counter: 1, sourceCount: 1, matches: 1},
			{name: "mismatch", counter: 9, sourceCount: 1, mismatches: 1},
			{name: "empty_mismatch", counter: 2, mismatches: 1},
			{name: "missing_usage", sourceCount: 1, missingUsage: true},
		} {
			t.Run(string(app)+"/"+tt.name, func(t *testing.T) {
				db := setupFileUsageTest(t)
				userID := testutil.InsertUser(t, db, testutil.UserFixture{Email: "count@ente.io", CreationTime: 1})
				if !tt.missingUsage {
					var photos, locker any
					if tt.counter != nil {
						photos, locker = tt.counter, 0
						if app == ente.Locker {
							photos, locker = 0, tt.counter
						}
					}
					if _, err := db.Exec(`INSERT INTO usage(user_id, storage_consumed, photos_file_count, locker_file_count)
						VALUES ($1, 0, $2, $3)`, userID, photos, locker); err != nil {
						t.Fatal(err)
					}
				}
				if tt.sourceCount > 0 {
					fileID := insertObjectTestFile(t, db, userID)
					for range 2 {
						collectionID := insertObjectTestCollection(t, db, userID)
						if _, err := db.Exec(`UPDATE collections SET app = $2 WHERE collection_id = $1`, collectionID, app); err != nil {
							t.Fatal(err)
						}
						linkObjectTestFileToCollection(t, db, collectionID, fileID, userID)
					}
				}
				fileCountComparisons.Reset()
				count, err := (&FileRepository{DB: db}).GetFileCountForUser(userID, app)
				if err != nil || count != tt.sourceCount {
					t.Fatalf("GetFileCountForUser() = (%d, %v), want %d", count, err, tt.sourceCount)
				}
				assertFileCountComparisons(t, "file_count", app, tt.matches, tt.mismatches)
			})
		}
	}
}

func TestGetLockerUsageObservesMixedFamily(t *testing.T) {
	db := setupFileUsageTest(t)
	userIDs := make([]int64, 4)
	for i := range userIDs {
		userID := testutil.InsertUser(t, db, testutil.UserFixture{Email: fmt.Sprintf("member-%d@ente.io", i), CreationTime: 1})
		userIDs[i] = userID
		if i < 3 {
			testutil.InsertUsage(t, db, userID, 0)
		}
		if i == 0 {
			setReadyFileCounts(t, db, userID, 0, 0)
			continue
		}
		if i == 1 {
			setReadyFileCounts(t, db, userID, 0, 9)
		}
		fileID := insertObjectTestFile(t, db, userID)
		collectionID := insertObjectTestCollection(t, db, userID)
		if _, err := db.Exec(`UPDATE collections SET app = 'locker' WHERE collection_id = $1`, collectionID); err != nil {
			t.Fatal(err)
		}
		linkObjectTestFileToCollection(t, db, collectionID, fileID, userID)
		insertObjectTestKey(t, db, fileID, ente.FILE, fmt.Sprintf("object-%d", i), 100, []string{"b2-eu-cen"})
	}
	fileCountComparisons.Reset()
	usage, err := (&UsageRepository{DB: db}).GetLockerUsage(t.Context(), userIDs)
	if err != nil {
		t.Fatal(err)
	}
	if usage.TotalFileCount != 3 || usage.TotalUsage != 300 || len(usage.Users) != 4 {
		t.Fatalf("unexpected family usage: %+v", usage)
	}
	for i, user := range usage.Users {
		wantCount := int64(1)
		if i == 0 {
			wantCount = 0
		}
		if user.UserID != userIDs[i] || user.FileCount != wantCount || user.Usage != wantCount*100 {
			t.Fatalf("unexpected member usage: %+v", user)
		}
	}
	assertFileCountComparisons(t, "locker_usage", ente.Locker, 1, 1)
}

func assertFileCountComparisons(t *testing.T, reader string, app ente.App, matches, mismatches float64) {
	t.Helper()
	for result, want := range map[string]float64{"match": matches, "mismatch": mismatches} {
		got := promtest.ToFloat64(fileCountComparisons.WithLabelValues(reader, string(app), result))
		if got != want {
			t.Errorf("%s/%s/%s comparisons = %g, want %g", reader, app, result, got, want)
		}
	}
}
