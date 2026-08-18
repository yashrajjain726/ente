package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/awa/go-iap/appstore"
	"github.com/ente/museum/ente"
)

func TestGetCurrentAppStoreEntitlementUsesLatestPurchase(t *testing.T) {
	controller := appStoreControllerWithPlans(
		ente.BillingPlan{IOSID: "small", Storage: 100},
		ente.BillingPlan{IOSID: "large", Storage: 1000},
	)

	entitlement, err := controller.getCurrentEntitlement([]appstore.InApp{
		appStoreReceipt("large", "old", "original", "100", "500", true, false),
		appStoreReceipt("small", "new", "original", "200", "400", false, false),
	})
	if err != nil {
		t.Fatal(err)
	}
	if entitlement.receiptInfo.ProductID != "small" {
		t.Fatalf("product ID = %q, want small", entitlement.receiptInfo.ProductID)
	}
	if entitlement.plan.Storage != 100 {
		t.Fatalf("storage = %d, want 100", entitlement.plan.Storage)
	}
	if entitlement.expiryTime != 400_000 {
		t.Fatalf("expiry time = %d, want 400000", entitlement.expiryTime)
	}
}

func TestGetCurrentAppStoreEntitlementRejectsInvalidCurrentPurchase(t *testing.T) {
	controller := appStoreControllerWithPlans(ente.BillingPlan{IOSID: "small", Storage: 100})

	tests := []struct {
		name     string
		receipts []appstore.InApp
	}{
		{name: "empty"},
		{
			name: "unknown product",
			receipts: []appstore.InApp{
				appStoreReceipt("small", "old", "original", "100", "500", false, false),
				appStoreReceipt("unknown", "new", "original", "200", "400", false, false),
			},
		},
		{
			name:     "upgraded",
			receipts: []appstore.InApp{appStoreReceipt("small", "new", "original", "200", "400", true, false)},
		},
		{
			name:     "invalid purchase time",
			receipts: []appstore.InApp{appStoreReceipt("small", "new", "original", "invalid", "400", false, false)},
		},
		{
			name:     "invalid expiry time",
			receipts: []appstore.InApp{appStoreReceipt("small", "new", "original", "200", "invalid", false, false)},
		},
		{
			name: "ambiguous purchase time",
			receipts: []appstore.InApp{
				appStoreReceipt("small", "first", "original", "200", "400", false, false),
				appStoreReceipt("small", "second", "original", "200", "400", false, false),
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := controller.getCurrentEntitlement(test.receipts); err == nil {
				t.Fatal("getCurrentEntitlement() succeeded, want error")
			}
		})
	}
}

func TestGetVerifiedAppStoreSubscriptionUsesReceiptProduct(t *testing.T) {
	controller, request := appStoreVerificationController(t,
		[]appstore.InApp{appStoreReceipt("small", "new", "original", "200", "400", false, false)},
		ente.BillingPlan{IOSID: "small", Storage: 100},
		ente.BillingPlan{IOSID: "large", Storage: 1000},
	)

	subscription, err := controller.GetVerifiedSubscription(1, "large", "receipt")
	if err != nil {
		t.Fatal(err)
	}
	if subscription.ProductID != "small" {
		t.Fatalf("product ID = %q, want small", subscription.ProductID)
	}
	if subscription.Storage != 100 {
		t.Fatalf("storage = %d, want 100", subscription.Storage)
	}
	if !request.ExcludeOldTransactions {
		t.Fatal("exclude-old-transactions = false, want true")
	}
}

func TestGetVerifiedAppStoreSubscriptionRejectsCancelledEntitlement(t *testing.T) {
	controller, _ := appStoreVerificationController(t,
		[]appstore.InApp{appStoreReceipt("small", "new", "original", "200", "400", false, true)},
		ente.BillingPlan{IOSID: "small", Storage: 100},
	)

	if _, err := controller.GetVerifiedSubscription(1, "small", "receipt"); err == nil {
		t.Fatal("GetVerifiedSubscription() succeeded, want error")
	}
}

func appStoreControllerWithPlans(plans ...ente.BillingPlan) *AppStoreController {
	return &AppStoreController{
		BillingPlansPerCountry: ente.BillingPlansPerCountry{"EU": plans},
	}
}

func appStoreVerificationController(t *testing.T, receipts []appstore.InApp, plans ...ente.BillingPlan) (*AppStoreController, *appstore.IAPRequest) {
	t.Helper()
	request := &appstore.IAPRequest{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(request); err != nil {
			t.Error(err)
		}
		if err := json.NewEncoder(w).Encode(map[string]any{
			"status":              0,
			"environment":         appstore.Production,
			"latest_receipt_info": receipts,
		}); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(server.Close)

	client := appstore.NewWithClient(server.Client())
	client.ProductionURL = server.URL
	client.SandboxURL = server.URL
	controller := appStoreControllerWithPlans(plans...)
	controller.AppStoreClient = *client
	return controller, request
}

func appStoreReceipt(
	productID string,
	transactionID string,
	originalTransactionID string,
	purchaseTime string,
	expiryTime string,
	isUpgraded bool,
	isCancelled bool,
) appstore.InApp {
	receipt := appstore.InApp{
		ProductID:             productID,
		TransactionID:         transactionID,
		OriginalTransactionID: originalTransactionID,
		PurchaseDate:          appstore.PurchaseDate{PurchaseDateMS: purchaseTime},
		ExpiresDate:           appstore.ExpiresDate{ExpiresDateMS: expiryTime},
	}
	if isUpgraded {
		receipt.IsUpgraded = "true"
	}
	if isCancelled {
		receipt.CancellationDateMS = "300"
	}
	return receipt
}
