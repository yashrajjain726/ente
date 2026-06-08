package repo

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
)

const spaceMessageSelectColumns = `
	m.message_id,
	m.kind,
	m.sender_id,
	m.sender_space_id,
	m.recipient_id,
	m.recipient_space_id,
	COALESCE(m.message_cipher, ''),
	CASE
		WHEN m.sender_space_id = %s THEN COALESCE(m.sender_encrypted_message_key, '')
		ELSE COALESCE(m.recipient_encrypted_message_key, '')
	END AS encrypted_message_key,
	m.reply_post_id,
	m.reply_message_id,
	(SELECT COUNT(*) FROM space_message_likes ml WHERE ml.message_id = m.message_id) AS likes,
	EXISTS (SELECT 1 FROM space_message_likes ml WHERE ml.message_id = m.message_id AND ml.actor_space_id = %s) AS viewer_liked,
	m.is_deleted,
	m.created_at,
	m.updated_at,
	sender_space.owner_id,
	sender_space.space_id,
	sender_space.space_slug,
	sender_space.public_key,
	sender_space.current_version,
	sender_space.encrypted_profile,
	sender_space.avatar_object_key,
	sender_space.avatar_size,
	sender_space.updated_at,
	(SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = sender_space.space_id) AS sender_friends,
	(SELECT COUNT(*) FROM space_posts sp WHERE sp.space_id = sender_space.space_id AND sp.is_deleted = FALSE) AS sender_posts,
	recipient_space.owner_id,
	recipient_space.space_id,
	recipient_space.space_slug,
	recipient_space.public_key,
	recipient_space.current_version,
	recipient_space.encrypted_profile,
	recipient_space.avatar_object_key,
	recipient_space.avatar_size,
	recipient_space.updated_at,
	(SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = recipient_space.space_id) AS recipient_friends,
	(SELECT COUNT(*) FROM space_posts rp WHERE rp.space_id = recipient_space.space_id AND rp.is_deleted = FALSE) AS recipient_posts
`

const spaceMessageJoins = `
	JOIN spaces sender_space ON sender_space.space_id = m.sender_space_id
	JOIN spaces recipient_space ON recipient_space.space_id = m.recipient_space_id
`

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
			sender_id,
			sender_space_id,
			recipient_id,
			recipient_space_id,
			kind,
			message_cipher,
			sender_encrypted_message_key,
			recipient_encrypted_message_key,
			reply_post_id,
			reply_message_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, messageID, input.SenderID, input.SenderSpaceID, input.RecipientID, input.RecipientSpaceID, input.Kind, input.MessageCipher, input.SenderEncryptedMessageKey, input.RecipientEncryptedMessageKey, replyPostID, replyMessageID); err != nil {
		return nil, wrapUnique(err, "message already exists")
	}
	return r.GetMessage(ctx, messageID, input.SenderID, input.SenderSpaceID)
}

func (r *MessagesRepository) GetMessage(ctx context.Context, messageID string, viewerID int64, viewerSpaceID string) (*SpaceMessageRecord, error) {
	query := `
		SELECT ` + sprintfSpaceMessageColumns("$3") + `
		FROM space_messages m
		` + spaceMessageJoins + `
		WHERE m.message_id = $1
		  AND (m.sender_id = $2 OR m.recipient_id = $2)
		  AND (m.sender_space_id = $3 OR m.recipient_space_id = $3)
	`
	return scanMessageRecord(r.DB.QueryRowContext(ctx, query, messageID, viewerID, viewerSpaceID))
}

func (r *MessagesRepository) ListThread(ctx context.Context, viewerID int64, viewerSpaceID string, otherSpaceID string, cursor string, limit int) ([]SpaceMessageRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	args := []any{viewerID, viewerSpaceID, otherSpaceID}
	query := `
		SELECT ` + sprintfSpaceMessageColumns("$2") + `
		FROM space_messages m
		` + spaceMessageJoins + `
		WHERE (
			(m.sender_space_id = $2 AND m.recipient_space_id = $3)
			OR
			(m.recipient_space_id = $2 AND m.sender_space_id = $3)
		)
		  AND (m.sender_id = $1 OR m.recipient_id = $1)
		  AND m.is_deleted = FALSE`
	if cursorCreatedAt, cursorMessageID, ok := parseMessageCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorMessageID)
		query += ` AND (m.created_at, m.message_id) < ($4, $5)`
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

func (r *MessagesRepository) SetLike(ctx context.Context, messageID string, userID int64, actorSpaceID string, like bool) error {
	if like {
		_, err := r.DB.ExecContext(ctx, `INSERT INTO space_message_likes (message_id, user_id, actor_space_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, messageID, userID, actorSpaceID)
		return stacktrace.Propagate(err, "")
	}
	_, err := r.DB.ExecContext(ctx, `DELETE FROM space_message_likes WHERE message_id = $1 AND actor_space_id = $2`, messageID, actorSpaceID)
	return stacktrace.Propagate(err, "")
}

func (r *MessagesRepository) DeleteMessage(ctx context.Context, messageID string, senderID int64, senderSpaceID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `UPDATE space_messages SET is_deleted = TRUE WHERE message_id = $1 AND sender_id = $2 AND sender_space_id = $3 AND is_deleted = FALSE`, messageID, senderID, senderSpaceID)
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
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_message_likes WHERE message_id = $1`, messageID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if err := tx.Commit(); err != nil {
		return stacktrace.Propagate(err, "")
	}
	return nil
}

func (r *MessagesRepository) ListConversations(ctx context.Context, viewerID int64, viewerSpaceID string, cursor string, limit int) ([]SpaceMessageConversationRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	var cursorCreatedAt any
	var cursorID any
	if createdAt, id, ok := parseMessageCursor(cursor); ok {
		cursorCreatedAt = createdAt
		cursorID = id
	}
	rows, err := r.DB.QueryContext(ctx, `
			WITH message_candidates AS (
				SELECT
					'message' AS activity_type,
					'message:' || m.message_id AS activity_id,
					m.created_at AS activity_created_at,
					CASE WHEN m.sender_space_id = $2 THEN m.recipient_space_id ELSE m.sender_space_id END AS friend_space_id,
					m.message_id,
					NULL::bigint AS post_id,
					m.sender_space_id = $2 AS is_outgoing
				FROM space_messages m
				WHERE (m.sender_space_id = $2 OR m.recipient_space_id = $2)
				  AND (m.sender_id = $1 OR m.recipient_id = $1)
				  AND m.is_deleted = FALSE
				  AND NOT (m.kind = 'post_reply' AND m.recipient_space_id = $2)

			UNION ALL

			SELECT
					'message_like' AS activity_type,
					'message_like:' || ml.message_id || ':' || ml.actor_space_id AS activity_id,
					ml.created_at AS activity_created_at,
					liker_space.space_id AS friend_space_id,
					m.message_id,
					NULL::bigint AS post_id,
					FALSE AS is_outgoing
				FROM space_message_likes ml
				JOIN space_messages m ON m.message_id = ml.message_id
				JOIN spaces liker_space ON liker_space.space_id = ml.actor_space_id
				WHERE m.sender_space_id = $2
			  AND m.recipient_space_id = ml.actor_space_id
			  AND ml.actor_space_id <> $2
			  AND m.is_deleted = FALSE
		),
		post_reply_events AS (
			SELECT DISTINCT ON (m.sender_space_id, m.reply_post_id)
				m.sender_space_id AS friend_space_id,
				m.reply_post_id AS post_id,
				m.message_id,
				m.created_at AS replied_at
			FROM space_messages m
			JOIN space_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_space_id = $2
			  AND m.sender_space_id <> $2
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.space_id = $2
			ORDER BY m.sender_space_id, m.reply_post_id, m.created_at DESC, m.message_id DESC
		),
			post_reply_candidates AS (
				SELECT
					'post_reply' AS activity_type,
					'post_reply:' || r.message_id AS activity_id,
					r.replied_at AS activity_created_at,
					r.friend_space_id,
					r.message_id,
					r.post_id,
					FALSE AS is_outgoing
				FROM post_reply_events r
			),
			candidates AS (
				SELECT * FROM message_candidates
				UNION ALL
				SELECT * FROM post_reply_candidates
			),
			current_friends AS (
				SELECT
					fs.friend_space_id,
					fs.created_at AS friendship_created_at
				FROM space_friend_shares fs
				WHERE fs.space_id = $2
			),
			conversation_friends AS (
				SELECT friend_space_id FROM candidates
				UNION
				SELECT friend_space_id FROM current_friends
			),
			readable_activities AS (
				SELECT
					m.sender_space_id AS friend_space_id,
					m.created_at AS readable_created_at
				FROM space_messages m
				WHERE m.recipient_space_id = $2
				  AND m.sender_space_id <> $2
				  AND m.kind = 'regular'
				  AND m.is_deleted = FALSE

				UNION ALL

				SELECT
					m.sender_space_id AS friend_space_id,
					m.created_at AS readable_created_at
				FROM space_messages m
				JOIN space_posts p ON p.post_id = m.reply_post_id
				WHERE m.recipient_space_id = $2
				  AND m.sender_space_id <> $2
				  AND m.kind = 'post_reply'
				  AND m.is_deleted = FALSE
				  AND m.reply_post_id IS NOT NULL
				  AND p.space_id = $2
			),
			readable_unread_counts AS (
				SELECT
					ra.friend_space_id,
					COUNT(*) AS unread_count
				FROM readable_activities ra
				LEFT JOIN space_read_markers nrm
				  ON nrm.viewer_space_id = $2
				 AND nrm.scope = 'message_thread'
				 AND nrm.friend_space_id = ra.friend_space_id
				WHERE ra.readable_created_at > COALESCE(nrm.read_at, 0)
				GROUP BY ra.friend_space_id
			),
			message_like_unread_counts AS (
				SELECT
					ml.actor_space_id AS friend_space_id,
					COUNT(*) AS unread_count
				FROM space_message_likes ml
				JOIN space_messages m ON m.message_id = ml.message_id
				LEFT JOIN space_read_markers nrm
				  ON nrm.viewer_space_id = $2
				 AND nrm.scope = 'message_likes'
				 AND nrm.friend_space_id = ''
				WHERE m.sender_space_id = $2
				  AND m.recipient_space_id = ml.actor_space_id
				  AND ml.actor_space_id <> $2
				  AND m.is_deleted = FALSE
				  AND ml.created_at > COALESCE(nrm.read_at, 0)
				GROUP BY ml.actor_space_id
			),
			latest_activities AS (
				SELECT DISTINCT ON (friend_space_id)
					friend_space_id,
					activity_type,
					activity_id,
					activity_created_at,
					message_id,
					post_id,
					is_outgoing
				FROM candidates
			ORDER BY friend_space_id, activity_created_at DESC, activity_id DESC
			),
			conversations AS (
				SELECT
					cf.friend_space_id,
					COALESCE(la.activity_type, '') AS activity_type,
					COALESCE(la.activity_id, '') AS activity_id,
					COALESCE(la.activity_created_at, 0) AS activity_created_at,
					la.message_id,
					la.post_id,
					COALESCE(la.is_outgoing, FALSE) AS is_outgoing,
					COALESCE(ruc.unread_count, 0) AS unread_count,
					COALESCE(mluc.unread_count, 0) AS message_like_unread_count,
					COALESCE(la.activity_created_at, current_friends.friendship_created_at, 0) AS sort_created_at,
					COALESCE(la.activity_id, 'friend:' || cf.friend_space_id) AS sort_id
				FROM conversation_friends cf
				LEFT JOIN current_friends
				  ON current_friends.friend_space_id = cf.friend_space_id
				LEFT JOIN latest_activities la
				  ON la.friend_space_id = cf.friend_space_id
				LEFT JOIN readable_unread_counts ruc
				  ON ruc.friend_space_id = cf.friend_space_id
				LEFT JOIN message_like_unread_counts mluc
				  ON mluc.friend_space_id = cf.friend_space_id
		)
		SELECT
			c.activity_type,
			c.activity_id,
				c.activity_created_at,
				c.is_outgoing,
				(c.unread_count > 0 OR c.message_like_unread_count > 0) AS unread,
				c.unread_count AS unread_count,
				c.sort_created_at,
			c.sort_id,
				friend_space.owner_id,
				friend_space.space_id,
				friend_space.space_slug,
			friend_space.public_key,
			friend_space.current_version,
			friend_space.encrypted_profile,
			friend_space.avatar_object_key,
			friend_space.avatar_size,
			friend_space.updated_at,
			(SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = friend_space.space_id) AS friend_friends,
			(SELECT COUNT(*) FROM space_posts fp WHERE fp.space_id = friend_space.space_id AND fp.is_deleted = FALSE) AS friend_posts,
			COALESCE(m.message_id, '') AS message_id,
			COALESCE(m.kind, '') AS kind,
			COALESCE(m.sender_id, 0) AS sender_id,
			COALESCE(m.sender_space_id, '') AS sender_space_id,
			COALESCE(m.recipient_id, 0) AS recipient_id,
			COALESCE(m.recipient_space_id, '') AS recipient_space_id,
			COALESCE(m.message_cipher, '') AS message_cipher,
			CASE
				WHEN m.message_id IS NULL THEN ''
				WHEN m.sender_space_id = $2 THEN COALESCE(m.sender_encrypted_message_key, '')
				ELSE COALESCE(m.recipient_encrypted_message_key, '')
			END AS encrypted_message_key,
			m.reply_post_id,
			m.reply_message_id,
			COALESCE((SELECT COUNT(*) FROM space_message_likes ml WHERE ml.message_id = m.message_id), 0) AS likes,
			COALESCE(EXISTS (SELECT 1 FROM space_message_likes ml WHERE ml.message_id = m.message_id AND ml.actor_space_id = $2), FALSE) AS viewer_liked,
			COALESCE(m.is_deleted, FALSE) AS is_deleted,
			COALESCE(m.created_at, 0) AS message_created_at,
			COALESCE(m.updated_at, 0) AS message_updated_at,
			COALESCE(sender_space.owner_id, 0) AS sender_owner_id,
			COALESCE(sender_space.space_id, '') AS sender_space_id,
			COALESCE(sender_space.space_slug, '') AS sender_space_slug,
			COALESCE(sender_space.public_key, '') AS sender_public_key,
			COALESCE(sender_space.current_version, 0) AS sender_current_version,
			COALESCE(sender_space.encrypted_profile, '') AS sender_profile,
			sender_space.avatar_object_key,
			sender_space.avatar_size,
			COALESCE(sender_space.updated_at, 0) AS sender_updated_at,
			CASE WHEN sender_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = sender_space.space_id) END AS sender_friends,
			CASE WHEN sender_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_posts sp WHERE sp.space_id = sender_space.space_id AND sp.is_deleted = FALSE) END AS sender_posts,
			COALESCE(recipient_space.owner_id, 0) AS recipient_owner_id,
			COALESCE(recipient_space.space_id, '') AS recipient_space_id,
			COALESCE(recipient_space.space_slug, '') AS recipient_space_slug,
			COALESCE(recipient_space.public_key, '') AS recipient_public_key,
			COALESCE(recipient_space.current_version, 0) AS recipient_current_version,
			COALESCE(recipient_space.encrypted_profile, '') AS recipient_profile,
			recipient_space.avatar_object_key,
			recipient_space.avatar_size,
			COALESCE(recipient_space.updated_at, 0) AS recipient_updated_at,
			CASE WHEN recipient_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = recipient_space.space_id) END AS recipient_friends,
			CASE WHEN recipient_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_posts rp WHERE rp.space_id = recipient_space.space_id AND rp.is_deleted = FALSE) END AS recipient_posts,
			p.post_id,
			COALESCE(p.space_id, '') AS post_space_id,
			COALESCE(post_space.space_slug, '') AS post_space_slug,
			COALESCE(p.owner_id, 0) AS post_owner_id,
			COALESCE(p.is_deleted, FALSE) AS post_is_deleted,
			asset.object_key AS post_object_key,
			asset.size AS post_object_size,
			asset.position AS post_object_position,
			asset.metadata_cipher AS post_object_metadata_cipher
		FROM conversations c
		JOIN spaces friend_space ON friend_space.space_id = c.friend_space_id
		LEFT JOIN space_messages m ON m.message_id = c.message_id
		LEFT JOIN spaces sender_space ON sender_space.space_id = m.sender_space_id
		LEFT JOIN spaces recipient_space ON recipient_space.space_id = m.recipient_space_id
		LEFT JOIN space_posts p ON p.post_id = c.post_id
		LEFT JOIN spaces post_space ON post_space.space_id = p.space_id
		LEFT JOIN LATERAL (
			SELECT object_key, size, position, metadata_cipher
			FROM space_post_assets
			WHERE post_id = p.post_id AND p.is_deleted = FALSE
			ORDER BY position ASC, asset_id ASC
			LIMIT 1
		) asset ON TRUE
		WHERE ($3::bigint IS NULL OR (c.sort_created_at, c.sort_id) < ($3::bigint, $4::text))
		ORDER BY c.sort_created_at DESC, c.sort_id DESC
		LIMIT $5
			`, viewerID, viewerSpaceID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]SpaceMessageConversationRecord, 0, limit+1)
	for rows.Next() {
		conversation, err := scanMessageConversationRecord(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, *conversation)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatMessageConversationCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *MessagesRepository) ListNotifications(ctx context.Context, viewerSpaceID string, cursor string, limit int) ([]SpaceNotificationRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	var cursorCreatedAt any
	var cursorID any
	if createdAt, id, ok := parseMessageCursor(cursor); ok {
		cursorCreatedAt = createdAt
		cursorID = id
	}
	rows, err := r.DB.QueryContext(ctx, `
		WITH notification_candidates AS (
			SELECT
				'post_like' AS activity_type,
				'post_like:' || pl.post_id::text || ':' || pl.actor_space_id AS activity_id,
				pl.created_at AS activity_created_at,
				pl.actor_space_id AS actor_space_id,
				pl.post_id
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			WHERE p.space_id = $1
			  AND pl.actor_space_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				CASE fe.event_type
					WHEN 'friend_remove' THEN 'friend_remove'
					ELSE 'friend_add'
				END AS activity_type,
				'friend_event:' || fe.event_id::text AS activity_id,
				fe.created_at AS activity_created_at,
				fe.actor_space_id AS actor_space_id,
				NULL::bigint AS post_id
			FROM space_friend_events fe
			WHERE fe.target_space_id = $1
			  AND fe.actor_space_id <> fe.target_space_id
		)
		SELECT
			n.activity_type,
			n.activity_id,
			n.activity_created_at,
			n.activity_created_at > COALESCE(nrm.read_at, 0) AS unread,
			n.activity_created_at AS sort_created_at,
			n.activity_id AS sort_id,
			actor_space.owner_id,
			actor_space.space_id,
			actor_space.space_slug,
			actor_space.public_key,
			actor_space.current_version,
			actor_space.encrypted_profile,
			actor_space.avatar_object_key,
			actor_space.avatar_size,
			actor_space.updated_at,
			(SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = actor_space.space_id) AS actor_friends,
			(SELECT COUNT(*) FROM space_posts ap WHERE ap.space_id = actor_space.space_id AND ap.is_deleted = FALSE) AS actor_posts,
			p.post_id,
			COALESCE(p.space_id, '') AS post_space_id,
			COALESCE(post_space.space_slug, '') AS post_space_slug,
			COALESCE(p.owner_id, 0) AS post_owner_id,
			COALESCE(p.is_deleted, FALSE) AS post_is_deleted,
			asset.object_key AS post_object_key,
			asset.size AS post_object_size,
			asset.position AS post_object_position,
			asset.metadata_cipher AS post_object_metadata_cipher
		FROM notification_candidates n
		JOIN spaces actor_space ON actor_space.space_id = n.actor_space_id
		LEFT JOIN space_read_markers nrm
		  ON nrm.viewer_space_id = $1
		 AND nrm.scope = 'notifications'
		 AND nrm.friend_space_id = ''
		LEFT JOIN space_posts p ON p.post_id = n.post_id
		LEFT JOIN spaces post_space ON post_space.space_id = p.space_id
		LEFT JOIN LATERAL (
			SELECT object_key, size, position, metadata_cipher
			FROM space_post_assets
			WHERE post_id = p.post_id AND p.is_deleted = FALSE
			ORDER BY position ASC, asset_id ASC
			LIMIT 1
		) asset ON TRUE
		WHERE ($2::bigint IS NULL OR (n.activity_created_at, n.activity_id) < ($2::bigint, $3::text))
		ORDER BY n.activity_created_at DESC, n.activity_id DESC
		LIMIT $4
	`, strings.TrimSpace(viewerSpaceID), cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]SpaceNotificationRecord, 0, limit+1)
	for rows.Next() {
		notification, err := scanSpaceNotificationRecord(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, *notification)
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatSpaceNotificationCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *MessagesRepository) GetLatestMessageThreadActivityAt(ctx context.Context, viewerID int64, viewerSpaceID string, friendSpaceID string) (int64, error) {
	var activityCreatedAt int64
	if err := r.DB.QueryRowContext(ctx, `
		WITH candidates AS (
			SELECT
				m.created_at AS activity_created_at,
				'message:' || m.message_id AS activity_id,
				CASE WHEN m.sender_space_id = $1 THEN m.recipient_space_id ELSE m.sender_space_id END AS friend_space_id
			FROM space_messages m
			WHERE (m.sender_space_id = $1 OR m.recipient_space_id = $1)
			  AND (m.sender_id = $3 OR m.recipient_id = $3)
			  AND m.is_deleted = FALSE
		)
		SELECT c.activity_created_at
		FROM candidates c
		WHERE c.friend_space_id = $2
		ORDER BY c.activity_created_at DESC, c.activity_id DESC
		LIMIT 1
	`, strings.TrimSpace(viewerSpaceID), strings.TrimSpace(friendSpaceID), viewerID).Scan(&activityCreatedAt); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return activityCreatedAt, nil
}

func (r *MessagesRepository) GetLatestNotificationActivityAt(ctx context.Context, viewerSpaceID string) (int64, error) {
	var activityCreatedAt int64
	if err := r.DB.QueryRowContext(ctx, `
		WITH notification_candidates AS (
			SELECT
				pl.created_at AS activity_created_at,
				'post_like:' || pl.post_id::text || ':' || pl.actor_space_id AS activity_id
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			WHERE p.space_id = $1
			  AND pl.actor_space_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				fe.created_at AS activity_created_at,
				'friend_event:' || fe.event_id::text AS activity_id
			FROM space_friend_events fe
			WHERE fe.target_space_id = $1
			  AND fe.actor_space_id <> fe.target_space_id
		)
		SELECT c.activity_created_at
		FROM notification_candidates c
		ORDER BY c.activity_created_at DESC, c.activity_id DESC
		LIMIT 1
	`, strings.TrimSpace(viewerSpaceID)).Scan(&activityCreatedAt); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return activityCreatedAt, nil
}

func (r *MessagesRepository) GetLatestMessageLikeActivityAt(ctx context.Context, viewerSpaceID string) (int64, error) {
	var activityCreatedAt int64
	if err := r.DB.QueryRowContext(ctx, `
		SELECT ml.created_at
		FROM space_message_likes ml
		JOIN space_messages m ON m.message_id = ml.message_id
		WHERE m.sender_space_id = $1
		  AND m.recipient_space_id = ml.actor_space_id
		  AND ml.actor_space_id <> $1
		  AND m.is_deleted = FALSE
		ORDER BY ml.created_at DESC, ml.message_id DESC, ml.actor_space_id DESC
		LIMIT 1
	`, strings.TrimSpace(viewerSpaceID)).Scan(&activityCreatedAt); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return activityCreatedAt, nil
}

func (r *MessagesRepository) HasUnreadNotifications(ctx context.Context, viewerSpaceID string) (bool, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `
		WITH notification_candidates AS (
			SELECT
				pl.created_at AS notification_created_at
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			WHERE p.space_id = $1
			  AND pl.actor_space_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				fe.created_at AS notification_created_at
			FROM space_friend_events fe
			WHERE fe.target_space_id = $1
			  AND fe.actor_space_id <> fe.target_space_id
		)
		SELECT EXISTS (
			SELECT 1
			FROM notification_candidates c
			LEFT JOIN space_read_markers nrm
			  ON nrm.viewer_space_id = $1
			 AND nrm.scope = 'notifications'
			 AND nrm.friend_space_id = ''
			WHERE c.notification_created_at > COALESCE(nrm.read_at, 0)
			LIMIT 1
		)
	`, strings.TrimSpace(viewerSpaceID)).Scan(&exists); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return exists, nil
}

func (r *MessagesRepository) HasUnreadMessageLikes(ctx context.Context, viewerSpaceID string) (bool, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM space_message_likes ml
			JOIN space_messages m ON m.message_id = ml.message_id
			LEFT JOIN space_read_markers nrm
			  ON nrm.viewer_space_id = $1
			 AND nrm.scope = 'message_likes'
			 AND nrm.friend_space_id = ''
			WHERE m.sender_space_id = $1
			  AND m.recipient_space_id = ml.actor_space_id
			  AND ml.actor_space_id <> $1
			  AND m.is_deleted = FALSE
			  AND ml.created_at > COALESCE(nrm.read_at, 0)
			LIMIT 1
		)
	`, strings.TrimSpace(viewerSpaceID)).Scan(&exists); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return exists, nil
}

func (r *MessagesRepository) HasUnreadMessages(ctx context.Context, viewerSpaceID string) (bool, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `
		WITH readable_activities AS (
			SELECT
				m.sender_space_id AS friend_space_id,
				m.created_at AS readable_created_at
			FROM space_messages m
			WHERE m.recipient_space_id = $1
			  AND m.sender_space_id <> $1
			  AND m.kind = 'regular'
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				m.sender_space_id AS friend_space_id,
				m.created_at AS readable_created_at
			FROM space_messages m
			JOIN space_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_space_id = $1
			  AND m.sender_space_id <> $1
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.space_id = $1
		)
		SELECT EXISTS (
			SELECT 1
			FROM readable_activities ra
			LEFT JOIN space_read_markers nrm
			  ON nrm.viewer_space_id = $1
			 AND nrm.scope = 'message_thread'
			 AND nrm.friend_space_id = ra.friend_space_id
			WHERE ra.readable_created_at > COALESCE(nrm.read_at, 0)
			LIMIT 1
		)
	`, strings.TrimSpace(viewerSpaceID)).Scan(&exists); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return exists, nil
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
		&rec.Likes,
		&rec.ViewerLiked,
		&rec.IsDeleted,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	}
	dest = append(dest, spaceActorScanDest(&rec.Sender)...)
	dest = append(dest, spaceActorScanDest(&rec.Recipient)...)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func scanMessageConversationRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceMessageConversationRecord, error) {
	var rec SpaceMessageConversationRecord
	var message SpaceMessageRecord
	var postID sql.NullInt64
	var post SpaceMessageConversationPostRecord
	dest := []any{
		&rec.LatestActivity.Type,
		&rec.LatestActivity.ID,
		&rec.LatestActivity.CreatedAt,
		&rec.LatestActivity.Outgoing,
		&rec.Unread,
		&rec.UnreadCount,
		&rec.SortCreatedAt,
		&rec.SortID,
	}
	dest = append(dest, spaceActorScanDest(&rec.Friend)...)
	dest = append(dest,
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
		&message.Likes,
		&message.ViewerLiked,
		&message.IsDeleted,
		&message.CreatedAt,
		&message.UpdatedAt,
	)
	dest = append(dest, spaceActorScanDest(&message.Sender)...)
	dest = append(dest, spaceActorScanDest(&message.Recipient)...)
	dest = append(dest,
		&postID,
		&post.SpaceID,
		&post.SpaceSlug,
		&post.OwnerID,
		&post.IsDeleted,
		&post.ObjectKey,
		&post.ObjectSize,
		&post.ObjectPosition,
		&post.ObjectMetadataCipher,
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

func scanSpaceNotificationRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceNotificationRecord, error) {
	var rec SpaceNotificationRecord
	var postID sql.NullInt64
	var post SpaceMessageConversationPostRecord
	dest := []any{
		&rec.Type,
		&rec.ID,
		&rec.CreatedAt,
		&rec.Unread,
		&rec.SortCreatedAt,
		&rec.SortID,
	}
	dest = append(dest, spaceActorScanDest(&rec.Actor)...)
	dest = append(dest,
		&postID,
		&post.SpaceID,
		&post.SpaceSlug,
		&post.OwnerID,
		&post.IsDeleted,
		&post.ObjectKey,
		&post.ObjectSize,
		&post.ObjectPosition,
		&post.ObjectMetadataCipher,
	)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if postID.Valid {
		post.PostID = postID.Int64
		rec.Post = &post
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

func formatMessageConversationCursor(conversation SpaceMessageConversationRecord) string {
	if conversation.SortCreatedAt > 0 && strings.TrimSpace(conversation.SortID) != "" {
		return strconv.FormatInt(conversation.SortCreatedAt, 10) + ":" + conversation.SortID
	}
	if conversation.LatestActivity.CreatedAt <= 0 || strings.TrimSpace(conversation.LatestActivity.ID) == "" {
		return ""
	}
	return strconv.FormatInt(conversation.LatestActivity.CreatedAt, 10) + ":" + conversation.LatestActivity.ID
}

func formatSpaceNotificationCursor(notification SpaceNotificationRecord) string {
	if notification.SortCreatedAt > 0 && strings.TrimSpace(notification.SortID) != "" {
		return strconv.FormatInt(notification.SortCreatedAt, 10) + ":" + notification.SortID
	}
	return strconv.FormatInt(notification.CreatedAt, 10) + ":" + notification.ID
}
