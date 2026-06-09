package controller

import (
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"testing"
	"time"

	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/museum/space/models"
	"github.com/stretchr/testify/require"
)

type recordedSpaceEmail struct {
	event      string
	actorSlug  string
	recipients []int64
}

type recordingSpaceEmailNotifier struct {
	events chan recordedSpaceEmail
}

func newRecordingSpaceEmailNotifier() *recordingSpaceEmailNotifier {
	return &recordingSpaceEmailNotifier{events: make(chan recordedSpaceEmail, 8)}
}

func (n *recordingSpaceEmailNotifier) OnSpacePostCreated(actorSlug string, recipientUserIDs []int64) {
	n.events <- recordedSpaceEmail{event: "post_created", actorSlug: actorSlug, recipients: append([]int64(nil), recipientUserIDs...)}
}

func (n *recordingSpaceEmailNotifier) OnSpacePostLiked(actorSlug string, recipientUserID int64) {
	n.events <- recordedSpaceEmail{event: "post_liked", actorSlug: actorSlug, recipients: []int64{recipientUserID}}
}

func (n *recordingSpaceEmailNotifier) OnSpacePostReplied(actorSlug string, recipientUserID int64) {
	n.events <- recordedSpaceEmail{event: "post_replied", actorSlug: actorSlug, recipients: []int64{recipientUserID}}
}

func (n *recordingSpaceEmailNotifier) OnSpaceFriendAdded(actorSlug string, recipientUserID int64) {
	n.events <- recordedSpaceEmail{event: "friend_added", actorSlug: actorSlug, recipients: []int64{recipientUserID}}
}

func requireSpaceEmail(t *testing.T, notifier *recordingSpaceEmailNotifier) recordedSpaceEmail {
	t.Helper()
	select {
	case event := <-notifier.events:
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for space email")
		return recordedSpaceEmail{}
	}
}

func requireNoSpaceEmail(t *testing.T, notifier *recordingSpaceEmailNotifier) {
	t.Helper()
	select {
	case event := <-notifier.events:
		t.Fatalf("unexpected space email: %+v", event)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestSpaceEmailSubjectPrefixesUsernameWithAt(t *testing.T) {
	require.Equal(t, "@alice liked your post", spaceEmailSubject("alice", "liked your post"))
	require.Equal(t, "@alice posted a new photo", spaceEmailSubject(" alice ", "posted a new photo"))
	require.Equal(t, "A friend liked your post", spaceEmailSubject(" ", "liked your post"))
}

func TestSpaceEmailTemplateData(t *testing.T) {
	require.Equal(t, "@alice", spaceEmailActorLabel(" alice "))
	require.Equal(t, "A friend", spaceEmailActorLabel(" "))
	require.Equal(t, "just posted a new photo", spaceEmailNotificationText(spaceNotificationPostCreated, "posted a new photo"))
	require.Equal(t, "just liked your post", spaceEmailNotificationText(spaceNotificationPostLiked, "liked your post"))
	require.Equal(t, "just replied to your post", spaceEmailNotificationText(spaceNotificationPostReplied, "replied to your post"))
	require.Equal(t, "is now your friend", spaceEmailNotificationText(spaceNotificationFriendAdded, "is now your friend"))
	require.Equal(t, spaceNewPostIllustrationURL, spaceEmailIllustrationURL(spaceNotificationPostCreated))
	require.Equal(t, spaceNewPostLikeIllustrationURL, spaceEmailIllustrationURL(spaceNotificationPostLiked))
	require.Equal(t, spaceNewPostReplyIllustrationURL, spaceEmailIllustrationURL(spaceNotificationPostReplied))
	require.Equal(t, spaceNewFriendIllustrationURL, spaceEmailIllustrationURL(spaceNotificationFriendAdded))
	require.Equal(t, spaceNewPostIllustrationWidth, spaceEmailIllustrationWidth(spaceNotificationPostCreated))
	require.Equal(t, spaceNewPostLikeIllustrationWidth, spaceEmailIllustrationWidth(spaceNotificationPostLiked))
	require.Equal(t, spaceNewPostReplyIllustrationWidth, spaceEmailIllustrationWidth(spaceNotificationPostReplied))
	require.Equal(t, spaceNewFriendIllustrationWidth, spaceEmailIllustrationWidth(spaceNotificationFriendAdded))
}

func TestPostLikeSendsEmailOnce(t *testing.T) {
	_, repos, ctx := setupPostsControllerTest(t)
	notifier := newRecordingSpaceEmailNotifier()
	posts := NewModule(repos, nil, notifier).Posts
	aliceID := insertSpaceControllerUser(t, repos, "alice-post-like-email@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob-post-like-email@example.com", "bob-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-post-like-email", "alice-space-key", "alice-post-like-email-public", "alice-post-like-email-secret", "alice-post-like-email-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := repos.Spaces.CreateSpace(ctx, bobID, "bob-post-like-email", "bob-space-key", "bob-post-like-email-public", "bob-post-like-email-secret", "bob-post-like-email-secret-nonce", "bob-profile")
	require.NoError(t, err)
	require.NoError(t, repos.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	postID, err := repos.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	resp, err := posts.ToggleLike(newSpaceControllerContext(bobID), base10(postID), models.LikePostRequest{Like: true})
	require.NoError(t, err)
	require.True(t, resp.Liked)
	email := requireSpaceEmail(t, notifier)
	require.Equal(t, recordedSpaceEmail{event: "post_liked", actorSlug: bobSpace.SpaceSlug, recipients: []int64{aliceID}}, email)

	_, err = posts.ToggleLike(newSpaceControllerContext(bobID), base10(postID), models.LikePostRequest{Like: true})
	require.NoError(t, err)
	requireNoSpaceEmail(t, notifier)
}

func TestPostReplySendsEmail(t *testing.T) {
	_, repos, ctx := setupMessagesControllerTest(t)
	notifier := newRecordingSpaceEmailNotifier()
	messages := NewModule(repos, nil, notifier).Messages
	aliceID, aliceSpace := createMessageControllerUserAndSpace(t, repos, "alice-post-reply-email", "alice-public")
	bobID, bobSpace := createMessageControllerUserAndSpace(t, repos, "bob-post-reply-email", "bob-public")
	require.NoError(t, repos.Friends.AddFriend(ctx, bobID, bobSpace.SpaceID, aliceSpace.SpaceID, "alice-share-key", aliceSpace.CurrentVersion, "bob-share-key", bobSpace.CurrentVersion))
	postID, err := repos.Posts.CreatePost(ctx, aliceID, aliceSpace.SpaceID, "post-key", nil, aliceSpace.CurrentVersion, nil)
	require.NoError(t, err)

	_, err = messages.ReplyToPost(newSpaceControllerContext(bobID), base10(postID), models.CreateMessageRequest{
		MessageCipher:                spaceTestB64("reply-cipher"),
		SenderEncryptedMessageKey:    spaceTestB64("reply-sender-key"),
		RecipientEncryptedMessageKey: spaceTestB64("reply-recipient-key"),
	})
	require.NoError(t, err)
	email := requireSpaceEmail(t, notifier)
	require.Equal(t, recordedSpaceEmail{event: "post_replied", actorSlug: bobSpace.SpaceSlug, recipients: []int64{aliceID}}, email)
}

func TestAddFriendSendsEmailOnce(t *testing.T) {
	_, repos, ctx := setupFriendsControllerTest(t)
	notifier := newRecordingSpaceEmailNotifier()
	friends := NewModule(repos, nil, notifier).Friends
	aliceID := insertSpaceControllerUser(t, repos, "alice-friend-email@example.com", "alice-public")
	bobID := insertSpaceControllerUser(t, repos, "bob-friend-email@example.com", "bob-public")
	aliceSpace, err := repos.Spaces.CreateSpace(ctx, aliceID, "alice-friend-email", "alice-space-key", "alice-friend-email-public", "alice-friend-email-secret", "alice-friend-email-secret-nonce", "alice-profile")
	require.NoError(t, err)
	bobSpace, err := repos.Spaces.CreateSpace(ctx, bobID, "bob-friend-email", "bob-space-key", "bob-friend-email-public", "bob-friend-email-secret", "bob-friend-email-secret-nonce", "bob-profile")
	require.NoError(t, err)
	authHash := sha256.Sum256([]byte("alice-friend-email-auth-key"))
	link, err := repos.Links.UpsertLink(ctx, aliceSpace.SpaceID, authHash[:], aliceSpace.CurrentVersion, "alice-link-key", "alice-link-secret")
	require.NoError(t, err)
	sessionHash := sha256.Sum256([]byte("alice-friend-email-session-token"))
	require.NoError(t, repos.Links.CreateSession(ctx, sessionHash[:], link.SpaceID, link.AuthKeyHash, link.KeyVersion, timeutil.MicrosecondsAfterMinutes(5)))
	req := models.AddFriendPayload{
		TargetSpaceID:              aliceSpace.SpaceID,
		LinkSessionToken:           "alice-friend-email-session-token",
		RequesterSpaceID:           bobSpace.SpaceID,
		TargetEncryptedSpaceKey:    base64.StdEncoding.EncodeToString([]byte("alice-target-key")),
		TargetKeyVersion:           aliceSpace.CurrentVersion,
		RequesterEncryptedSpaceKey: base64.StdEncoding.EncodeToString([]byte("bob-requester-key")),
		RequesterKeyVersion:        bobSpace.CurrentVersion,
	}

	resp, err := friends.Add(newSpaceControllerContext(bobID), req)
	require.NoError(t, err)
	require.Equal(t, "friend", resp.Status)
	email := requireSpaceEmail(t, notifier)
	require.Equal(t, recordedSpaceEmail{event: "friend_added", actorSlug: bobSpace.SpaceSlug, recipients: []int64{aliceID}}, email)

	_, err = friends.Add(newSpaceControllerContext(bobID), req)
	require.NoError(t, err)
	requireNoSpaceEmail(t, notifier)
}

func base10(id int64) string {
	return strconv.FormatInt(id, 10)
}
