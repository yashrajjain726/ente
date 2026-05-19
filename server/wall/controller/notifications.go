package controller

import (
	"fmt"
	"strings"

	baserepo "github.com/ente-io/museum/pkg/repo"
	emailutil "github.com/ente-io/museum/pkg/utils/email"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

const wallPostCreatedTemplate = "wall_post_created.html"

var sendWallPostCreatedEmail = emailutil.SendTemplatedEmail

type WallPostEmailNotifier interface {
	OnWallPostCreated(authorSlug string, recipientUserIDs []int64)
}

type WallEmailNotifier struct {
	UserRepo *baserepo.UserRepository
}

func (n *WallEmailNotifier) OnWallPostCreated(authorSlug string, recipientUserIDs []int64) {
	if n == nil || n.UserRepo == nil || len(recipientUserIDs) == 0 {
		return
	}
	authorSlug = strings.TrimSpace(authorSlug)
	if authorSlug == "" {
		authorSlug = "A friend"
	}
	recipientUserIDs = uniqueUserIDs(recipientUserIDs)
	if len(recipientUserIDs) == 0 {
		return
	}
	users, err := n.UserRepo.GetActiveUsersForIds(recipientUserIDs)
	if err != nil {
		log.WithError(err).Error("Error fetching users for wall post email")
		return
	}

	subject := fmt.Sprintf("%s has shared a new post", authorSlug)
	templateData := map[string]interface{}{
		"Author": authorSlug,
		"AppURL": socialAppURL(),
	}
	for _, userID := range recipientUserIDs {
		user := users[userID]
		if user == nil || strings.TrimSpace(user.Email) == "" {
			continue
		}
		if err := sendWallPostCreatedEmail(
			[]string{user.Email},
			"Ente",
			"team@ente.com",
			subject,
			wallPostCreatedTemplate,
			templateData,
			nil,
		); err != nil {
			log.WithFields(log.Fields{
				"user_id": userID,
				"email":   user.Email,
			}).WithError(err).Error("Error sending wall post email")
		}
	}
}

func uniqueUserIDs(userIDs []int64) []int64 {
	seen := make(map[int64]struct{}, len(userIDs))
	out := make([]int64, 0, len(userIDs))
	for _, userID := range userIDs {
		if userID <= 0 {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		out = append(out, userID)
	}
	return out
}

func socialAppURL() string {
	origin := strings.TrimRight(strings.TrimSpace(viper.GetString("apps.social")), "/")
	if origin == "" {
		origin = "https://ente.gg"
	}
	return origin + "/app"
}
