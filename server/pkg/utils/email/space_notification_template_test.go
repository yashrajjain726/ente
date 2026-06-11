package email

import (
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestSpaceNotificationTemplateCentersContent(t *testing.T) {
	testutil.WithServerRoot(t)

	body, err := getMailBody("space_notification.html", map[string]interface{}{
		"ActorLabel":        "@alice",
		"AppURL":            "https://ente.space/app",
		"IllustrationURL":   "https://email-assets.ente.com/space-new-post.png",
		"IllustrationWidth": 112,
		"Notification":      "just posted a new photo",
	})
	require.NoError(t, err)
	require.Contains(t, body, `<div class="card-gutter" style="padding: 0 20px;">`)
	require.Contains(t, body, `<div style="text-align: center;">`)
	require.Contains(t, body, "@alice")
	require.Contains(t, body, "just posted a new photo")
	require.Contains(t, body, `https://email-assets.ente.com/space-new-post.png`)
	require.Contains(t, body, `https://email-assets.ente.com/ente-2026-green.png`)
}
