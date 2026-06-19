package email

import (
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestSpaceNotificationTemplateUsesEmailSafeLayout(t *testing.T) {
	testutil.WithServerRoot(t)

	body, err := getMailBody("space_notification.html", map[string]interface{}{
		"ActorLabel":        "@alice",
		"AppURL":            "https://ente.space/app",
		"IllustrationURL":   "https://email-assets.ente.com/space-new-post.png",
		"IllustrationWidth": 112,
		"Notification":      "just posted a new photo",
	})
	require.NoError(t, err)
	require.Contains(t, body, `<head>`)
	require.Contains(t, body, `role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f0f1f3"`)
	require.Contains(t, body, `bgcolor="#08C225"`)
	require.Contains(t, body, `style="background-color: #08C225; border-radius: 16px; color: #ffffff !important; display: block;`)
	require.Contains(t, body, "@alice")
	require.Contains(t, body, "just posted a new photo")
	require.Contains(t, body, `https://email-assets.ente.com/space-new-post.png`)
	require.Contains(t, body, `https://email-assets.ente.com/ente-2026-green.png`)
	require.Contains(t, body, `padding: 24px" title="Ente"`)
	require.Contains(t, body, `class="footer-icons" style="width: 24px; padding: 4px"`)
}
