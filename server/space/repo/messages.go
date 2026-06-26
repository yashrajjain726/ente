package repo

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
	"github.com/lib/pq"
)

const spaceMessageSelectColumns = `
	m.message_id,
	m.kind,
	sender_space.owner_id AS sender_id,
	m.sender_space_id,
	recipient_space.owner_id AS recipient_id,
	m.recipient_space_id,
	COALESCE(m.message_cipher, '\x'::bytea),
	CASE
		WHEN m.sender_space_id = %s THEN COALESCE(m.sender_encrypted_message_key, '\x'::bytea)
		ELSE COALESCE(m.recipient_encrypted_message_key, '\x'::bytea)
	END AS encrypted_message_key,
	m.reply_post_id,
	m.reply_message_id,
	(m.recipient_liked_at IS NOT NULL) AS liked,
	(m.recipient_liked_at IS NOT NULL AND m.recipient_space_id = %s) AS viewer_liked,
	m.is_deleted,
	m.created_at,
	m.updated_at,
	CASE
		WHEN m.kind = 'post_like' AND m.sender_space_id = %s THEN 'You liked a post'
		WHEN m.kind = 'post_like' THEN 'Liked your post'
		ELSE ''
	END AS text,
	quote_post.post_id AS quote_post_id,
	COALESCE(quote_post.space_id, '') AS quote_space_id,
	COALESCE(quote_post.encrypted_post_key, '\x'::bytea) AS quote_encrypted_post_key,
	COALESCE(quote_post.caption_cipher, '\x'::bytea) AS quote_caption_cipher,
	COALESCE(quote_post.key_version, 0) AS quote_key_version,
	quote_asset.object_key AS quote_object_key,
	sender_space.owner_id,
	sender_space.space_id,
	sender_space.space_slug,
	sender_space.public_key,
	sender_space.current_version,
	sender_space.encrypted_profile,
	sender_avatar.object_id,
	sender_avatar.size,
	sender_space.updated_at,
	(SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = sender_space.space_id) AS sender_friends,
	(SELECT COUNT(*) FROM space_posts sp WHERE sp.space_id = sender_space.space_id AND sp.is_deleted = FALSE) AS sender_posts,
	recipient_space.owner_id,
	recipient_space.space_id,
	recipient_space.space_slug,
	recipient_space.public_key,
	recipient_space.current_version,
	recipient_space.encrypted_profile,
	recipient_avatar.object_id,
	recipient_avatar.size,
	recipient_space.updated_at,
	(SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = recipient_space.space_id) AS recipient_friends,
	(SELECT COUNT(*) FROM space_posts rp WHERE rp.space_id = recipient_space.space_id AND rp.is_deleted = FALSE) AS recipient_posts
`

const spaceMessageJoins = `
	JOIN spaces sender_space ON sender_space.space_id = m.sender_space_id
	LEFT JOIN space_profile_assets sender_avatar ON sender_avatar.space_id = sender_space.space_id AND sender_avatar.asset_type = 'avatar'
	JOIN spaces recipient_space ON recipient_space.space_id = m.recipient_space_id
	LEFT JOIN space_profile_assets recipient_avatar ON recipient_avatar.space_id = recipient_space.space_id AND recipient_avatar.asset_type = 'avatar'
	LEFT JOIN space_posts quote_post ON quote_post.post_id = m.reply_post_id AND quote_post.is_deleted = FALSE
	LEFT JOIN LATERAL (
		SELECT object_key
		FROM space_post_assets
		WHERE post_id = quote_post.post_id
		ORDER BY position ASC, asset_id ASC
		LIMIT 1
	) quote_asset ON TRUE
`

const latestPeerActivitySQL = `
SELECT *
FROM (
	SELECT
		CASE WHEN m.kind = 'post_like' THEN 'post_like' ELSE 'message' END AS activity_type,
		CASE WHEN m.kind = 'post_like' THEN m.message_id ELSE 'message:' || m.message_id END AS activity_id,
		m.created_at AS activity_created_at,
		CASE WHEN m.kind = 'post_like' THEN NULL::text ELSE m.message_id END AS message_id,
		CASE WHEN m.kind IN ('post_reply', 'post_like') THEN m.reply_post_id ELSE NULL::bigint END AS post_id,
		CASE
			WHEN m.kind = 'post_like' AND m.recipient_space_id = $1 THEN m.created_at
			WHEN m.kind <> 'post_like' AND m.recipient_space_id = $1 THEN m.created_at
			ELSE NULL::bigint
		END AS notification_created_at,
		(m.sender_space_id = $1) AS is_outgoing
	FROM space_messages m
	WHERE (
	    (m.sender_space_id = $1 AND m.recipient_space_id = cp.friend_space_id)
	    OR (m.sender_space_id = cp.friend_space_id AND m.recipient_space_id = $1)
	)
	  AND m.is_deleted = FALSE
	  AND NOT (m.kind = 'post_reply' AND m.recipient_space_id = $1)
	  AND (m.kind <> 'post_like' OR m.reply_post_id IS NOT NULL)

	UNION ALL

	SELECT
		'message_like' AS activity_type,
		'message_like:' || m.message_id || ':' || m.recipient_space_id AS activity_id,
		m.recipient_liked_at AS activity_created_at,
		m.message_id,
		NULL::bigint AS post_id,
		CASE WHEN m.sender_space_id = $1 THEN m.recipient_liked_at ELSE NULL::bigint END AS notification_created_at,
		(m.recipient_space_id = $1) AS is_outgoing
	FROM space_messages m
	WHERE (
	    (m.sender_space_id = $1 AND m.recipient_space_id = cp.friend_space_id)
	    OR (m.sender_space_id = cp.friend_space_id AND m.recipient_space_id = $1)
	)
	  AND m.kind <> 'post_like'
	  AND m.is_deleted = FALSE
	  AND m.recipient_liked_at IS NOT NULL

	UNION ALL

	SELECT
		'post_reply' AS activity_type,
		'post_reply:' || m.message_id AS activity_id,
		m.created_at AS activity_created_at,
		m.message_id,
		m.reply_post_id AS post_id,
		m.created_at AS notification_created_at,
		FALSE AS is_outgoing
	FROM space_messages m
	WHERE m.sender_space_id = cp.friend_space_id
	  AND m.recipient_space_id = $1
	  AND m.kind = 'post_reply'
	  AND m.is_deleted = FALSE
	  AND m.reply_post_id IS NOT NULL
) activity
ORDER BY activity_created_at DESC, activity_id DESC
LIMIT 1`

const peerUnreadCountSQL = `
SELECT COUNT(*) AS unread_count
FROM (
	SELECT m.created_at AS readable_created_at
	FROM space_messages m
	WHERE m.sender_space_id = cp.friend_space_id
	  AND m.recipient_space_id = $1
	  AND m.kind = 'regular'
	  AND m.is_deleted = FALSE

	UNION ALL

	SELECT m.created_at AS readable_created_at
	FROM space_messages m
	WHERE m.sender_space_id = cp.friend_space_id
	  AND m.recipient_space_id = $1
	  AND m.kind = 'post_reply'
	  AND m.is_deleted = FALSE
	  AND m.reply_post_id IS NOT NULL
) readable
WHERE readable.readable_created_at > COALESCE(nrm.read_at, 0)`

const peerNotificationUnreadSQL = `
SELECT EXISTS (
	SELECT 1
	FROM (
		SELECT m.created_at AS notification_created_at
		FROM space_messages m
		WHERE m.sender_space_id = cp.friend_space_id
		  AND m.recipient_space_id = $1
		  AND m.kind = 'regular'
		  AND m.is_deleted = FALSE

		UNION ALL

		SELECT m.recipient_liked_at AS notification_created_at
		FROM space_messages m
		WHERE m.sender_space_id = $1
		  AND m.recipient_space_id = cp.friend_space_id
		  AND m.kind <> 'post_like'
		  AND m.is_deleted = FALSE
		  AND m.recipient_liked_at IS NOT NULL

		UNION ALL

		SELECT m.created_at AS notification_created_at
		FROM space_messages m
		WHERE m.sender_space_id = cp.friend_space_id
		  AND m.recipient_space_id = $1
		  AND m.kind = 'post_like'
		  AND m.reply_post_id IS NOT NULL

		UNION ALL

		SELECT m.created_at AS notification_created_at
		FROM space_messages m
		WHERE m.sender_space_id = cp.friend_space_id
		  AND m.recipient_space_id = $1
		  AND m.kind = 'post_reply'
		  AND m.is_deleted = FALSE
		  AND m.reply_post_id IS NOT NULL
	) notification
	WHERE notification.notification_created_at > COALESCE(nrm.read_at, 0)
	LIMIT 1
) AS notification_unread`

const chatSummaryRowsSQL = `
WITH conversation_peers AS (
	SELECT DISTINCT input_friend.friend_space_id
	FROM unnest($2::text[]) AS input_friend(friend_space_id)
	WHERE input_friend.friend_space_id <> ''
),
conversation_rows AS (
	SELECT
		cp.friend_space_id,
		latest_activity.activity_type,
		latest_activity.activity_id,
		latest_activity.activity_created_at,
		latest_activity.message_id,
		latest_activity.post_id,
		latest_activity.notification_created_at,
		latest_activity.is_outgoing,
		COALESCE(unread_state.unread_count, 0) AS unread_count,
		COALESCE(notification_state.notification_unread, FALSE) AS notification_unread
	FROM conversation_peers cp
	LEFT JOIN space_notification_read_markers nrm
	  ON nrm.viewer_space_id = $1
	 AND nrm.friend_space_id = cp.friend_space_id
	LEFT JOIN LATERAL (
` + latestPeerActivitySQL + `
	) latest_activity ON TRUE
	LEFT JOIN LATERAL (
` + peerUnreadCountSQL + `
	) unread_state ON TRUE
	LEFT JOIN LATERAL (
` + peerNotificationUnreadSQL + `
	) notification_state ON TRUE
	WHERE latest_activity.activity_id IS NOT NULL
)`

const currentFriendSummaryRowsSQL = `
WITH conversation_peers AS (
	SELECT DISTINCT s.friend_space_id
	FROM space_friend_shares s
	JOIN spaces friend_space ON friend_space.space_id = s.friend_space_id
	JOIN users friend_owner ON friend_owner.user_id = friend_space.owner_id AND friend_owner.encrypted_email IS NOT NULL
	WHERE s.space_id = $1
),
conversation_rows AS (
	SELECT
		cp.friend_space_id,
		latest_activity.activity_type,
		latest_activity.activity_id,
		latest_activity.activity_created_at,
		latest_activity.message_id,
		latest_activity.post_id,
		latest_activity.notification_created_at,
		latest_activity.is_outgoing,
		COALESCE(unread_state.unread_count, 0) AS unread_count,
		COALESCE(notification_state.notification_unread, FALSE) AS notification_unread
	FROM conversation_peers cp
	LEFT JOIN space_notification_read_markers nrm
	  ON nrm.viewer_space_id = $1
	 AND nrm.friend_space_id = cp.friend_space_id
	LEFT JOIN LATERAL (
` + latestPeerActivitySQL + `
	) latest_activity ON TRUE
	LEFT JOIN LATERAL (
` + peerUnreadCountSQL + `
	) unread_state ON TRUE
	LEFT JOIN LATERAL (
` + peerNotificationUnreadSQL + `
	) notification_state ON TRUE
	WHERE latest_activity.activity_id IS NOT NULL
)`

func (r *MessagesRepository) CreateMessage(ctx context.Context, input CreateSpaceMessageRecord) (*SpaceMessageRecord, error) {
	messageID := strings.TrimSpace(input.MessageID)
	if messageID == "" {
		messageID = base.MustNewID("wmsg")
	}
	var replyPostID any
	if input.ReplyPostID.Valid {
		replyPostID = input.ReplyPostID.Int64
	}
	var replyMessageID any
	if input.ReplyMessageID.Valid {
		replyMessageID = input.ReplyMessageID.String
	}
	if _, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_messages (
			message_id,
			sender_space_id,
			recipient_space_id,
			kind,
			message_cipher,
			sender_encrypted_message_key,
			recipient_encrypted_message_key,
			reply_post_id,
			reply_message_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, messageID, input.SenderSpaceID, input.RecipientSpaceID, input.Kind, input.MessageCipher, input.SenderEncryptedMessageKey, input.RecipientEncryptedMessageKey, replyPostID, replyMessageID); err != nil {
		return nil, wrapUnique(err, "message already exists")
	}
	return r.GetMessage(ctx, messageID, input.SenderSpaceID)
}

func (r *MessagesRepository) GetMessage(ctx context.Context, messageID string, viewerSpaceID string) (*SpaceMessageRecord, error) {
	query := `
		SELECT ` + sprintfSpaceMessageColumns("$2") + `
		FROM space_messages m
		` + spaceMessageJoins + `
		WHERE m.message_id = $1
		  AND (m.sender_space_id = $2 OR m.recipient_space_id = $2)
	`
	return scanMessageRecord(r.DB.QueryRowContext(ctx, query, messageID, viewerSpaceID))
}

func (r *MessagesRepository) ListThread(ctx context.Context, viewerSpaceID string, otherSpaceID string, cursor string, limit int) ([]SpaceMessageRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	args := []any{viewerSpaceID, otherSpaceID}
	query := `
		SELECT ` + sprintfSpaceMessageColumns("$1") + `
		FROM space_messages m
		` + spaceMessageJoins + `
		WHERE (
			(m.sender_space_id = $1 AND m.recipient_space_id = $2)
			OR
			(m.recipient_space_id = $1 AND m.sender_space_id = $2)
		)
	  AND m.is_deleted = FALSE`
	if cursorCreatedAt, cursorMessageID, ok := parseMessageCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorMessageID)
		query += ` AND (m.created_at, m.message_id) < ($3, $4)`
	}
	args = append(args, limit+1)
	query += ` ORDER BY m.created_at DESC, m.message_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]SpaceMessageRecord, 0, limit+1)
	for rows.Next() {
		rec, err := scanMessageRecord(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, *rec)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatMessageCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *MessagesRepository) SetLike(ctx context.Context, messageID string, actorSpaceID string, like bool) error {
	if like {
		_, err := r.DB.ExecContext(ctx, `
			UPDATE space_messages
			SET recipient_liked_at = COALESCE(recipient_liked_at, now_utc_micro_seconds())
			WHERE message_id = $1
			  AND recipient_space_id = $2
			  AND kind <> 'post_like'
			  AND is_deleted = FALSE
		`, messageID, actorSpaceID)
		return stacktrace.Propagate(err, "")
	}
	_, err := r.DB.ExecContext(ctx, `
		UPDATE space_messages
		SET recipient_liked_at = NULL
		WHERE message_id = $1
		  AND recipient_space_id = $2
		  AND kind <> 'post_like'
	`, messageID, actorSpaceID)
	return stacktrace.Propagate(err, "")
}

func (r *MessagesRepository) DeleteMessage(ctx context.Context, messageID string, senderSpaceID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `
		UPDATE space_messages
		SET is_deleted = TRUE
		WHERE message_id = $1
		  AND sender_space_id = $2
		  AND kind <> 'post_like'
		  AND is_deleted = FALSE
	`, messageID, senderSpaceID)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	if err := tx.Commit(); err != nil {
		return stacktrace.Propagate(err, "")
	}
	return nil
}

func (r *MessagesRepository) ListLatestChatSummaries(ctx context.Context, viewerSpaceID string, friendSpaceIDs []string) (map[string]SpaceConversationChatSummaryRecord, error) {
	cleanFriendSpaceIDs := make([]string, 0, len(friendSpaceIDs))
	for _, friendSpaceID := range friendSpaceIDs {
		friendSpaceID = strings.TrimSpace(friendSpaceID)
		if friendSpaceID != "" {
			cleanFriendSpaceIDs = append(cleanFriendSpaceIDs, friendSpaceID)
		}
	}
	out := make(map[string]SpaceConversationChatSummaryRecord, len(cleanFriendSpaceIDs))
	if len(cleanFriendSpaceIDs) == 0 {
		return out, nil
	}
	rows, err := r.DB.QueryContext(ctx, chatSummaryRowsSQL+`
		SELECT
			c.friend_space_id,
			c.activity_type,
			c.activity_id,
			c.activity_created_at,
			c.is_outgoing,
			(c.unread_count > 0) AS unread,
			c.unread_count,
			c.notification_unread,
			COALESCE(m.message_id, '') AS message_id,
			COALESCE(m.kind, '') AS kind,
			0 AS sender_id,
			COALESCE(m.sender_space_id, '') AS sender_space_id,
			0 AS recipient_id,
			COALESCE(m.recipient_space_id, '') AS recipient_space_id,
			COALESCE(m.message_cipher, '\x'::bytea) AS message_cipher,
			CASE
				WHEN m.message_id IS NULL THEN '\x'::bytea
				WHEN m.sender_space_id = $1 THEN COALESCE(m.sender_encrypted_message_key, '\x'::bytea)
				ELSE COALESCE(m.recipient_encrypted_message_key, '\x'::bytea)
			END AS encrypted_message_key,
			m.reply_post_id,
			m.reply_message_id,
			COALESCE(m.recipient_liked_at IS NOT NULL, FALSE) AS liked,
			COALESCE(m.recipient_liked_at IS NOT NULL AND m.recipient_space_id = $1, FALSE) AS viewer_liked,
			COALESCE(m.is_deleted, FALSE) AS is_deleted,
			COALESCE(m.created_at, 0) AS message_created_at,
			COALESCE(m.updated_at, 0) AS message_updated_at,
			0 AS sender_owner_id,
			COALESCE(m.sender_space_id, '') AS sender_space_id,
			'' AS sender_space_slug,
			'\x'::bytea AS sender_public_key,
			0 AS sender_current_version,
			'\x'::bytea AS sender_profile,
			NULL::text AS sender_avatar_object_id,
			NULL::bigint AS sender_avatar_size,
			0 AS sender_updated_at,
			NULL::bigint AS sender_friends,
			NULL::bigint AS sender_posts,
			0 AS recipient_owner_id,
			COALESCE(m.recipient_space_id, '') AS recipient_space_id,
			'' AS recipient_space_slug,
			'\x'::bytea AS recipient_public_key,
			0 AS recipient_current_version,
			'\x'::bytea AS recipient_profile,
			NULL::text AS recipient_avatar_object_id,
			NULL::bigint AS recipient_avatar_size,
			0 AS recipient_updated_at,
			NULL::bigint AS recipient_friends,
			NULL::bigint AS recipient_posts,
			c.post_id,
			CASE WHEN c.post_id IS NULL THEN '' ELSE COALESCE(post_message.recipient_space_id, '') END AS post_space_id,
			'' AS post_space_slug,
			0 AS post_owner_id,
			FALSE AS post_is_deleted
		FROM conversation_rows c
		LEFT JOIN space_messages m ON m.message_id = c.message_id
		LEFT JOIN space_messages post_message ON post_message.message_id = COALESCE(c.message_id, c.activity_id)
	`, strings.TrimSpace(viewerSpaceID), pq.Array(cleanFriendSpaceIDs))
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	for rows.Next() {
		summary, err := scanConversationChatSummaryRecord(rows)
		if err != nil {
			return nil, err
		}
		out[summary.FriendSpaceID] = *summary
	}
	return out, stacktrace.Propagate(rows.Err(), "")
}

func sprintfSpaceMessageColumns(viewerPlaceholder string) string {
	return strings.TrimSpace(strings.ReplaceAll(spaceMessageSelectColumns, "%s", viewerPlaceholder))
}

func scanMessageRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceMessageRecord, error) {
	var rec SpaceMessageRecord
	dest := []any{
		&rec.MessageID,
		&rec.Kind,
		&rec.SenderID,
		&rec.SenderSpaceID,
		&rec.RecipientID,
		&rec.RecipientSpaceID,
		&rec.MessageCipher,
		&rec.EncryptedMessageKey,
		&rec.ReplyPostID,
		&rec.ReplyMessageID,
		&rec.Liked,
		&rec.ViewerLiked,
		&rec.IsDeleted,
		&rec.CreatedAt,
		&rec.UpdatedAt,
		&rec.Text,
	}
	var quote SpaceMessageQuoteRecord
	var quotePostID sql.NullInt64
	dest = append(dest,
		&quotePostID,
		&quote.SpaceID,
		&quote.EncryptedPostKey,
		&quote.CaptionCipher,
		&quote.KeyVersion,
		&quote.ObjectKey,
	)
	dest = append(dest, spaceActorScanDest(&rec.Sender)...)
	dest = append(dest, spaceActorScanDest(&rec.Recipient)...)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if quotePostID.Valid {
		quote.PostID = quotePostID.Int64
		rec.Quote = &quote
	}
	return &rec, nil
}

func scanConversationChatSummaryRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceConversationChatSummaryRecord, error) {
	var rec SpaceConversationChatSummaryRecord
	var message SpaceMessageRecord
	var postID sql.NullInt64
	var post SpaceMessageConversationPostRecord
	dest := []any{
		&rec.FriendSpaceID,
		&rec.LatestActivity.Type,
		&rec.LatestActivity.ID,
		&rec.LatestActivity.CreatedAt,
		&rec.LatestActivity.Outgoing,
		&rec.Unread,
		&rec.UnreadCount,
		&rec.NotificationUnread,
		&message.MessageID,
		&message.Kind,
		&message.SenderID,
		&message.SenderSpaceID,
		&message.RecipientID,
		&message.RecipientSpaceID,
		&message.MessageCipher,
		&message.EncryptedMessageKey,
		&message.ReplyPostID,
		&message.ReplyMessageID,
		&message.Liked,
		&message.ViewerLiked,
		&message.IsDeleted,
		&message.CreatedAt,
		&message.UpdatedAt,
	}
	dest = append(dest, spaceActorScanDest(&message.Sender)...)
	dest = append(dest, spaceActorScanDest(&message.Recipient)...)
	dest = append(dest,
		&postID,
		&post.SpaceID,
		&post.SpaceSlug,
		&post.OwnerID,
		&post.IsDeleted,
	)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if message.MessageID != "" {
		rec.LatestActivity.Message = &message
	}
	if postID.Valid {
		post.PostID = postID.Int64
		rec.LatestActivity.Post = &post
	}
	return &rec, nil
}

func parseMessageCursor(cursor string) (int64, string, bool) {
	createdAtText, id, ok := strings.Cut(strings.TrimSpace(cursor), ":")
	if !ok || strings.TrimSpace(id) == "" {
		return 0, "", false
	}
	createdAt, err := strconv.ParseInt(createdAtText, 10, 64)
	if err != nil || createdAt <= 0 {
		return 0, "", false
	}
	return createdAt, id, true
}

func formatMessageCursor(message SpaceMessageRecord) string {
	return strconv.FormatInt(message.CreatedAt, 10) + ":" + message.MessageID
}
