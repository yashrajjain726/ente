package controller

import (
	"fmt"
	"strings"

	baserepo "github.com/ente-io/museum/pkg/repo"
	emailutil "github.com/ente-io/museum/pkg/utils/email"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

const spaceNotificationTemplate = "space_notification.html"

var sendSpaceNotificationEmail = emailutil.SendTemplatedEmailV2

type SpaceEmailNotifier interface {
	OnSpacePostCreated(authorSlug string, recipientUserIDs []int64)
	OnSpacePostLiked(actorSlug string, recipientUserID int64)
	OnSpacePostReplied(actorSlug string, recipientUserID int64)
	OnSpaceFriendAdded(actorSlug string, recipientUserID int64)
}

type SpaceEmailSender struct {
	UserRepo *baserepo.UserRepository
}

func (n *SpaceEmailSender) OnSpacePostCreated(authorSlug string, recipientUserIDs []int64) {
	n.send(authorSlug, "posted a new photo", "post_created", recipientUserIDs)
}

func (n *SpaceEmailSender) OnSpacePostLiked(actorSlug string, recipientUserID int64) {
	n.send(actorSlug, "liked your post", "post_liked", []int64{recipientUserID})
}

func (n *SpaceEmailSender) OnSpacePostReplied(actorSlug string, recipientUserID int64) {
	n.send(actorSlug, "replied to your post", "post_replied", []int64{recipientUserID})
}

func (n *SpaceEmailSender) OnSpaceFriendAdded(actorSlug string, recipientUserID int64) {
	n.send(actorSlug, "added you as a friend", "friend_added", []int64{recipientUserID})
}

func (n *SpaceEmailSender) send(actorSlug, action, event string, recipientUserIDs []int64) {
	if n == nil || n.UserRepo == nil || len(recipientUserIDs) == 0 {
		return
	}
	actorSlug = strings.TrimSpace(actorSlug)
	if actorSlug == "" {
		actorSlug = "A friend"
	}
	recipientUserIDs = uniqueUserIDs(recipientUserIDs)
	if len(recipientUserIDs) == 0 {
		return
	}
	users, err := n.UserRepo.GetActiveUsersForIds(recipientUserIDs)
	if err != nil {
		log.WithField("event", event).WithError(err).Error("Error fetching users for space email")
		return
	}

	subject := fmt.Sprintf("%s %s", actorSlug, action)
	templateData := map[string]interface{}{
		"Message": subject,
		"AppURL":  spaceAppURL(),
	}
	for _, userID := range recipientUserIDs {
		user := users[userID]
		if user == nil || strings.TrimSpace(user.Email) == "" {
			continue
		}
		if err := sendSpaceNotificationEmail(
			[]string{user.Email},
			"Ente",
			"team@ente.com",
			subject,
			"base.html",
			spaceNotificationTemplate,
			templateData,
			nil,
		); err != nil {
			log.WithFields(log.Fields{
				"user_id": userID,
				"email":   user.Email,
				"event":   event,
			}).WithError(err).Error("Error sending space email")
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
