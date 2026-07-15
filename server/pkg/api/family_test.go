package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/ente/museum/ente"
	"github.com/ente/museum/internal/testutil"
	museumcontroller "github.com/ente/museum/pkg/controller"
	familycontroller "github.com/ente/museum/pkg/controller/family"
	"github.com/ente/museum/pkg/repo"
	storagebonusrepo "github.com/ente/museum/pkg/repo/storagebonus"
	"github.com/gin-gonic/gin"
)

func TestInviteMemberAllowsResendWhenFamilyIsFull(t *testing.T) {
	router, adminID, pendingEmail, overflowEmail := setupFullFamilyTest(t)

	if got := performInviteMemberRequest(t, router, adminID, overflowEmail).Code; got != http.StatusPreconditionFailed {
		t.Fatalf("new invite status = %d, want %d", got, http.StatusPreconditionFailed)
	}
	if got := performInviteMemberRequest(t, router, adminID, pendingEmail).Code; got != http.StatusOK {
		t.Fatalf("resend status = %d, want %d", got, http.StatusOK)
	}
}

func setupFullFamilyTest(t *testing.T) (http.Handler, int64, string, string) {
	t.Helper()
	testutil.WithServerRoot(t)

	db := testutil.RequireTestDB(t)
	testutil.ResetTables(t, db)
	t.Cleanup(func() { testutil.ResetTables(t, db) })

	userRepo := &repo.UserRepository{
		DB:                  db,
		SecretEncryptionKey: testutil.SecretEncryptionKey(),
		HashingKey:          testutil.HashingKey(),
	}
	familyRepo := &repo.FamilyRepository{DB: db}
	billingController := &museumcontroller.BillingController{
		BillingRepo:      &repo.BillingRepository{DB: db},
		UserRepo:         userRepo,
		StorageBonusRepo: &storagebonusrepo.Repository{DB: db},
	}

	adminID := testutil.InsertUser(t, db, testutil.UserFixture{
		UserID:       1,
		Email:        "family-admin@ente.com",
		CreationTime: 1,
	})
	testutil.InsertSubscription(t, db, testutil.SubscriptionFixture{
		UserID:     adminID,
		Storage:    100 * 1024 * 1024 * 1024,
		ExpiryTime: 4102444800000000,
		ProductID:  "family-test-paid",
	})
	if err := familyRepo.CreateFamily(context.Background(), adminID); err != nil {
		t.Fatalf("create family: %v", err)
	}

	var pendingEmail string
	for i := 1; i < 6; i++ {
		email := fmt.Sprintf("family-member-%d@ente.com", i)
		memberID := int64(i + 1)
		insertFreeFamilyTestUser(t, db, memberID, email)
		if _, err := familyRepo.AddMemberInvite(context.Background(), adminID, memberID, fmt.Sprintf("token-%d", i), nil); err != nil {
			t.Fatalf("add family invite: %v", err)
		}
		if i == 1 {
			pendingEmail = email
		}
	}

	overflowEmail := "family-overflow@ente.com"
	insertFreeFamilyTestUser(t, db, 7, overflowEmail)

	handler := &FamilyHandler{Controller: &familycontroller.Controller{
		BillingCtrl: billingController,
		UserLookup:  museumcontroller.NewUserLookupController(userRepo, nil),
		UserRepo:    userRepo,
		FamilyRepo:  familyRepo,
	}}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/family/add-member", handler.InviteMember)
	return router, adminID, pendingEmail, overflowEmail
}

func insertFreeFamilyTestUser(t *testing.T, db *sql.DB, userID int64, email string) {
	t.Helper()
	testutil.InsertUser(t, db, testutil.UserFixture{UserID: userID, Email: email, CreationTime: 1})
	testutil.InsertSubscription(t, db, testutil.SubscriptionFixture{
		UserID:     userID,
		Storage:    ente.FreePlanStorage,
		ExpiryTime: 4102444800000000,
		ProductID:  ente.FreePlanProductID,
	})
}

func performInviteMemberRequest(t *testing.T, router http.Handler, adminID int64, email string) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(ente.InviteMemberRequest{Email: email})
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/family/add-member", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Auth-User-ID", strconv.FormatInt(adminID, 10))

	router.ServeHTTP(recorder, request)
	return recorder
}
