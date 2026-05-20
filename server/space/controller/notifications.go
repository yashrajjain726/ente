package controller

import (
	"fmt"
	"strings"

	baserepo "github.com/ente-io/museum/pkg/repo"
	emailutil "github.com/ente-io/museum/pkg/utils/email"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

const spacePostCreatedTemplate = "space_post_created.html"

var sendSpacePostCreatedEmail = emailutil.SendTemplatedEmail

type SpacePostEmailNotifier interface {
	OnSpacePostCreated(authorSlug string, recipientUserIDs []int64)
}

type SpaceEmailNotifier struct {
	UserRepo *baserepo.UserRepository
}

func (n *SpaceEmailNotifier) OnSpacePostCreated(authorSlug string, recipientUserIDs []int64) {
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
		log.WithError(err).Error("Error fetching users for space post email")
		return
	}

	subject := fmt.Sprintf("%s has shared a new post", authorSlug)
	templateData := map[string]interface{}{
		"Author": authorSlug,
		"AppURL": spaceAppURL(),
	}
	for _, userID := range recipientUserIDs {
		user := users[userID]
		if user == nil || strings.TrimSpace(user.Email) == "" {
			continue
		}
		if err := sendSpacePostCreatedEmail(
			[]string{user.Email},
			"Ente",
			"team@ente.com",
			subject,
			spacePostCreatedTemplate,
			templateData,
			nil,
		); err != nil {
			log.WithFields(log.Fields{
				"user_id": userID,
				"email":   user.Email,
			}).WithError(err).Error("Error sending space post email")
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

func spaceAppURL() string {
	origin := strings.TrimRight(strings.TrimSpace(viper.GetString("apps.space")), "/")
	if origin == "" {
		origin = "https://ente.space"
	}
	return origin + "/app"
}
