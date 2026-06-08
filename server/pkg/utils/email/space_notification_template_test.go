package email

import (
	"testing"

	"github.com/ente-io/museum/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestSpaceNotificationTemplateCentersContent(t *testing.T) {
	testutil.WithServerRoot(t)

	body, err := getMailBodyWithBase("base.html", "space_notification.html", map[string]interface{}{
		"Message": "@alice liked your post",
		"AppURL":  "https://ente.space/app",
	})
	require.NoError(t, err)
	require.Contains(t, body, `<div style="text-align: center;">`)
	require.Contains(t, body, "@alice liked your post.")
}
