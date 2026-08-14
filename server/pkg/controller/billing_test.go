package controller

import (
	"testing"

	"github.com/ente/museum/ente"
	"github.com/ente/museum/pkg/utils/billing"
)

func TestShouldSkipVerifiedSubscriptionReplacement(t *testing.T) {
	now := int64(10_000_000_000_000)
	appStoreGrace := billing.ProviderToExpiryGracePeriodMap[ente.AppStore]
	paid := func(provider ente.PaymentProvider, transactionID string, expiry int64) ente.Subscription {
		return ente.Subscription{
			ProductID:             "paid",
			PaymentProvider:       provider,
			OriginalTransactionID: transactionID,
			ExpiryTime:            expiry,
		}
	}

	tests := []struct {
		name     string
		current  ente.Subscription
		verified ente.Subscription
		want     bool
	}{
		{
			name:     "rejects receipt beyond provider grace",
			current:  paid(ente.Stripe, "stripe", now+15),
			verified: paid(ente.AppStore, "apple", now-appStoreGrace-1),
			want:     true,
		},
		{
			name:     "accepts receipt within provider grace for free account",
			current:  ente.Subscription{ProductID: ente.FreePlanProductID},
			verified: paid(ente.AppStore, "apple", now-appStoreGrace+1),
		},
		{
			name:     "accepts cross-provider switch within provider grace",
			current:  paid(ente.Stripe, "stripe", now+45),
			verified: paid(ente.AppStore, "apple", now-appStoreGrace+1),
		},
		{
			name:     "accepts active Play purchase with a new token",
			current:  paid(ente.PlayStore, "old-token", now+45),
			verified: paid(ente.PlayStore, "new-token", now+30),
		},
		{
			name:     "rejects older version of the same subscription",
			current:  paid(ente.AppStore, "apple", now+45),
			verified: paid(ente.AppStore, "apple", now+30),
			want:     true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := shouldSkipVerifiedSubscriptionReplacement(test.current, test.verified, now); got != test.want {
				t.Fatalf("shouldSkipVerifiedSubscriptionReplacement() = %t, want %t", got, test.want)
			}
		})
	}
}
