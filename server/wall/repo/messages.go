package repo

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
)

const wallMessageSelectColumns = `
	m.message_id,
	m.kind,
	m.sender_id,
	m.sender_wall_id,
	m.recipient_id,
	m.recipient_wall_id,
	COALESCE(m.message_cipher, ''),
	CASE
		WHEN m.sender_id = %s THEN COALESCE(m.sender_encrypted_message_key, '')
		ELSE COALESCE(m.recipient_encrypted_message_key, '')
	END AS encrypted_message_key,
	m.reply_post_id,
	m.reply_message_id,
	(SELECT COUNT(*) FROM wall_message_likes ml WHERE ml.message_id = m.message_id) AS likes,
	EXISTS (SELECT 1 FROM wall_message_likes ml WHERE ml.message_id = m.message_id AND ml.user_id = %s) AS viewer_liked,
	m.is_deleted,
	m.created_at,
	m.updated_at,
	sender_wall.owner_id,
	sender_wall.wall_id,
	sender_wall.wall_slug,
	sender_ka.public_key,
	sender_wall.current_version,
	sender_wall.encrypted_profile,
	sender_wall.avatar_object_key,
	sender_wall.avatar_size,
	sender_wall.updated_at,
	(SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = sender_wall.wall_id) AS sender_friends,
	(SELECT COUNT(*) FROM wall_posts sp WHERE sp.wall_id = sender_wall.wall_id AND sp.is_deleted = FALSE) AS sender_posts,
	recipient_wall.owner_id,
	recipient_wall.wall_id,
	recipient_wall.wall_slug,
	recipient_ka.public_key,
	recipient_wall.current_version,
	recipient_wall.encrypted_profile,
	recipient_wall.avatar_object_key,
	recipient_wall.avatar_size,
	recipient_wall.updated_at,
	(SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = recipient_wall.wall_id) AS recipient_friends,
	(SELECT COUNT(*) FROM wall_posts rp WHERE rp.wall_id = recipient_wall.wall_id AND rp.is_deleted = FALSE) AS recipient_posts
`

const wallMessageJoins = `
	JOIN walls sender_wall ON sender_wall.wall_id = m.sender_wall_id
	JOIN key_attributes sender_ka ON sender_ka.user_id = sender_wall.owner_id
	JOIN walls recipient_wall ON recipient_wall.wall_id = m.recipient_wall_id
	JOIN key_attributes recipient_ka ON recipient_ka.user_id = recipient_wall.owner_id
`

func (r *MessagesRepository) CreateMessage(ctx context.Context, input CreateWallMessageRecord) (*WallMessageRecord, error) {
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
		INSERT INTO wall_messages (
			message_id,
			sender_id,
			sender_wall_id,
			recipient_id,
			recipient_wall_id,
			kind,
			message_cipher,
			sender_encrypted_message_key,
			recipient_encrypted_message_key,
			reply_post_id,
			reply_message_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, messageID, input.SenderID, input.SenderWallID, input.RecipientID, input.RecipientWallID, input.Kind, input.MessageCipher, input.SenderEncryptedMessageKey, input.RecipientEncryptedMessageKey, replyPostID, replyMessageID); err != nil {
		return nil, wrapUnique(err, "message already exists")
	}
	return r.GetMessage(ctx, messageID, input.SenderID)
}

func (r *MessagesRepository) GetMessage(ctx context.Context, messageID string, viewerID int64) (*WallMessageRecord, error) {
	query := `
		SELECT ` + sprintfWallMessageColumns("$2") + `
		FROM wall_messages m
		` + wallMessageJoins + `
		WHERE m.message_id = $1
		  AND (m.sender_id = $2 OR m.recipient_id = $2)
	`
	return scanMessageRecord(r.DB.QueryRowContext(ctx, query, messageID, viewerID))
}

func (r *MessagesRepository) ListThread(ctx context.Context, viewerID int64, otherWallID string, cursor string, limit int) ([]WallMessageRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	args := []any{viewerID, otherWallID}
	query := `
		SELECT ` + sprintfWallMessageColumns("$1") + `
		FROM wall_messages m
		` + wallMessageJoins + `
		WHERE (
			(m.sender_id = $1 AND m.recipient_wall_id = $2)
			OR
			(m.recipient_id = $1 AND m.sender_wall_id = $2)
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
	out := make([]WallMessageRecord, 0, limit+1)
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

func (r *MessagesRepository) SetLike(ctx context.Context, messageID string, userID int64, like bool) error {
	if like {
		_, err := r.DB.ExecContext(ctx, `INSERT INTO wall_message_likes (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, messageID, userID)
		return stacktrace.Propagate(err, "")
	}
	_, err := r.DB.ExecContext(ctx, `DELETE FROM wall_message_likes WHERE message_id = $1 AND user_id = $2`, messageID, userID)
	return stacktrace.Propagate(err, "")
}

func (r *MessagesRepository) DeleteMessage(ctx context.Context, messageID string, senderID int64) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `UPDATE wall_messages SET is_deleted = TRUE WHERE message_id = $1 AND sender_id = $2 AND is_deleted = FALSE`, messageID, senderID)
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
	if _, err := tx.ExecContext(ctx, `DELETE FROM wall_message_likes WHERE message_id = $1`, messageID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if err := tx.Commit(); err != nil {
		return stacktrace.Propagate(err, "")
	}
	return nil
}

func (r *MessagesRepository) ListConversations(ctx context.Context, viewerID int64, cursor string, limit int) ([]WallMessageConversationRecord, string, error) {
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
				CASE WHEN m.sender_id = $1 THEN m.recipient_wall_id ELSE m.sender_wall_id END AS friend_wall_id,
				m.message_id,
				NULL::bigint AS post_id,
				CASE WHEN m.recipient_id = $1 THEN m.created_at ELSE NULL::bigint END AS unread_created_at
			FROM wall_messages m
			WHERE (m.sender_id = $1 OR m.recipient_id = $1)
			  AND m.is_deleted = FALSE
			  AND NOT (m.kind = 'post_reply' AND m.recipient_id = $1)

			UNION ALL

			SELECT
				'message_like' AS activity_type,
				'message_like:' || ml.message_id || ':' || ml.user_id::text AS activity_id,
				ml.created_at AS activity_created_at,
				liker_wall.wall_id AS friend_wall_id,
				m.message_id,
				NULL::bigint AS post_id,
				ml.created_at AS unread_created_at
			FROM wall_message_likes ml
			JOIN wall_messages m ON m.message_id = ml.message_id
			JOIN walls liker_wall ON liker_wall.owner_id = ml.user_id
			WHERE m.sender_id = $1
			  AND m.recipient_id = ml.user_id
			  AND ml.user_id <> $1
			  AND m.is_deleted = FALSE
		),
		post_like_events AS (
			SELECT
				actor_wall.wall_id AS friend_wall_id,
				p.post_id,
				MAX(pl.created_at) AS liked_at
			FROM wall_post_likes pl
			JOIN wall_posts p ON p.post_id = pl.post_id
			JOIN walls actor_wall ON actor_wall.owner_id = pl.user_id
			WHERE p.owner_id = $1
			  AND pl.user_id <> $1
			  AND p.is_deleted = FALSE
			GROUP BY actor_wall.wall_id, p.post_id
		),
		post_reply_events AS (
			SELECT DISTINCT ON (m.sender_wall_id, m.reply_post_id)
				m.sender_wall_id AS friend_wall_id,
				m.reply_post_id AS post_id,
				m.message_id,
				m.created_at AS replied_at
			FROM wall_messages m
			JOIN wall_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_id = $1
			  AND m.sender_id <> $1
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.owner_id = $1
			  AND p.is_deleted = FALSE
			ORDER BY m.sender_wall_id, m.reply_post_id, m.created_at DESC, m.message_id DESC
		),
		post_candidates AS (
			SELECT
				CASE
					WHEN l.liked_at IS NOT NULL AND r.replied_at IS NOT NULL THEN 'post_like_and_reply'
					WHEN r.replied_at IS NOT NULL THEN 'post_reply'
					ELSE 'post_like'
				END AS activity_type,
				'post_activity:' || COALESCE(l.post_id, r.post_id)::text || ':' || COALESCE(l.friend_wall_id, r.friend_wall_id) AS activity_id,
				GREATEST(COALESCE(l.liked_at, 0), COALESCE(r.replied_at, 0)) AS activity_created_at,
				COALESCE(l.friend_wall_id, r.friend_wall_id) AS friend_wall_id,
				r.message_id,
				COALESCE(l.post_id, r.post_id) AS post_id,
				GREATEST(COALESCE(l.liked_at, 0), COALESCE(r.replied_at, 0)) AS unread_created_at
			FROM post_like_events l
			FULL OUTER JOIN post_reply_events r
			  ON r.friend_wall_id = l.friend_wall_id
			 AND r.post_id = l.post_id
		),
		friend_candidates AS (
			SELECT
				CASE fe.event_type
					WHEN 'friend_remove' THEN 'friend_remove'
					ELSE 'friend_add'
				END AS activity_type,
				'friend_event:' || fe.event_id::text AS activity_id,
				fe.created_at AS activity_created_at,
				fe.actor_wall_id AS friend_wall_id,
				NULL::text AS message_id,
				NULL::bigint AS post_id,
				fe.created_at AS unread_created_at
			FROM wall_friend_events fe
			WHERE fe.target_id = $1
			  AND fe.actor_id <> $1
		),
		candidates AS (
			SELECT * FROM message_candidates
			UNION ALL
			SELECT * FROM post_candidates
			UNION ALL
			SELECT * FROM friend_candidates
		),
		ranked AS (
			SELECT
				c.*,
				ROW_NUMBER() OVER (
					PARTITION BY c.friend_wall_id
					ORDER BY c.activity_created_at DESC, c.activity_id DESC
				) AS rn
			FROM candidates c
		)
		SELECT
				c.activity_type,
				c.activity_id,
				c.activity_created_at,
				(c.unread_created_at IS NOT NULL AND c.unread_created_at > COALESCE(nrm.read_at, 0)) AS unread,
			friend_wall.owner_id,
			friend_wall.wall_id,
			friend_wall.wall_slug,
			friend_ka.public_key,
			friend_wall.current_version,
			friend_wall.encrypted_profile,
			friend_wall.avatar_object_key,
			friend_wall.avatar_size,
			friend_wall.updated_at,
			(SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = friend_wall.wall_id) AS friend_friends,
			(SELECT COUNT(*) FROM wall_posts fp WHERE fp.wall_id = friend_wall.wall_id AND fp.is_deleted = FALSE) AS friend_posts,
			COALESCE(m.message_id, '') AS message_id,
			COALESCE(m.kind, '') AS kind,
			COALESCE(m.sender_id, 0) AS sender_id,
			COALESCE(m.sender_wall_id, '') AS sender_wall_id,
			COALESCE(m.recipient_id, 0) AS recipient_id,
			COALESCE(m.recipient_wall_id, '') AS recipient_wall_id,
			COALESCE(m.message_cipher, '') AS message_cipher,
			CASE
				WHEN m.message_id IS NULL THEN ''
				WHEN m.sender_id = $1 THEN COALESCE(m.sender_encrypted_message_key, '')
				ELSE COALESCE(m.recipient_encrypted_message_key, '')
			END AS encrypted_message_key,
			m.reply_post_id,
			m.reply_message_id,
			COALESCE((SELECT COUNT(*) FROM wall_message_likes ml WHERE ml.message_id = m.message_id), 0) AS likes,
			COALESCE(EXISTS (SELECT 1 FROM wall_message_likes ml WHERE ml.message_id = m.message_id AND ml.user_id = $1), FALSE) AS viewer_liked,
			COALESCE(m.is_deleted, FALSE) AS is_deleted,
			COALESCE(m.created_at, 0) AS message_created_at,
			COALESCE(m.updated_at, 0) AS message_updated_at,
			COALESCE(sender_wall.owner_id, 0) AS sender_owner_id,
			COALESCE(sender_wall.wall_id, '') AS sender_wall_id,
			COALESCE(sender_wall.wall_slug, '') AS sender_wall_slug,
			COALESCE(sender_ka.public_key, '') AS sender_public_key,
			COALESCE(sender_wall.current_version, 0) AS sender_current_version,
			COALESCE(sender_wall.encrypted_profile, '') AS sender_profile,
			sender_wall.avatar_object_key,
			sender_wall.avatar_size,
			COALESCE(sender_wall.updated_at, 0) AS sender_updated_at,
			CASE WHEN sender_wall.wall_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = sender_wall.wall_id) END AS sender_friends,
			CASE WHEN sender_wall.wall_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM wall_posts sp WHERE sp.wall_id = sender_wall.wall_id AND sp.is_deleted = FALSE) END AS sender_posts,
			COALESCE(recipient_wall.owner_id, 0) AS recipient_owner_id,
			COALESCE(recipient_wall.wall_id, '') AS recipient_wall_id,
			COALESCE(recipient_wall.wall_slug, '') AS recipient_wall_slug,
			COALESCE(recipient_ka.public_key, '') AS recipient_public_key,
			COALESCE(recipient_wall.current_version, 0) AS recipient_current_version,
			COALESCE(recipient_wall.encrypted_profile, '') AS recipient_profile,
			recipient_wall.avatar_object_key,
			recipient_wall.avatar_size,
			COALESCE(recipient_wall.updated_at, 0) AS recipient_updated_at,
			CASE WHEN recipient_wall.wall_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = recipient_wall.wall_id) END AS recipient_friends,
			CASE WHEN recipient_wall.wall_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM wall_posts rp WHERE rp.wall_id = recipient_wall.wall_id AND rp.is_deleted = FALSE) END AS recipient_posts,
			p.post_id,
			COALESCE(p.wall_id, '') AS post_wall_id,
			COALESCE(post_wall.wall_slug, '') AS post_wall_slug,
			COALESCE(p.owner_id, 0) AS post_owner_id,
			asset.object_key AS post_object_key,
			asset.size AS post_object_size,
			asset.position AS post_object_position,
			asset.variant AS post_object_variant,
			asset.blur_hash_cipher AS post_object_blur_hash_cipher,
			asset.width AS post_object_width,
			asset.height AS post_object_height,
			asset.media_type AS post_object_media_type
			FROM ranked c
			LEFT JOIN wall_notification_read_markers nrm
			  ON nrm.user_id = $1
			 AND nrm.friend_wall_id = c.friend_wall_id
			JOIN walls friend_wall ON friend_wall.wall_id = c.friend_wall_id
		JOIN key_attributes friend_ka ON friend_ka.user_id = friend_wall.owner_id
		LEFT JOIN wall_messages m ON m.message_id = c.message_id
		LEFT JOIN walls sender_wall ON sender_wall.wall_id = m.sender_wall_id
		LEFT JOIN key_attributes sender_ka ON sender_ka.user_id = sender_wall.owner_id
		LEFT JOIN walls recipient_wall ON recipient_wall.wall_id = m.recipient_wall_id
		LEFT JOIN key_attributes recipient_ka ON recipient_ka.user_id = recipient_wall.owner_id
		LEFT JOIN wall_posts p ON p.post_id = c.post_id AND p.is_deleted = FALSE
		LEFT JOIN walls post_wall ON post_wall.wall_id = p.wall_id
		LEFT JOIN LATERAL (
			SELECT object_key, size, position, variant, blur_hash_cipher, width, height, media_type
			FROM wall_post_assets
			WHERE post_id = p.post_id
			ORDER BY position ASC, asset_id ASC
			LIMIT 1
		) asset ON TRUE
			WHERE c.rn = 1
			  AND ($2::bigint IS NULL OR (c.activity_created_at, c.activity_id) < ($2::bigint, $3::text))
			ORDER BY c.activity_created_at DESC, c.activity_id DESC
			LIMIT $4
		`, viewerID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]WallMessageConversationRecord, 0, limit+1)
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

func (r *MessagesRepository) GetLatestConversationActivityAt(ctx context.Context, viewerID int64, friendWallID string) (int64, error) {
	var activityCreatedAt int64
	if err := r.DB.QueryRowContext(ctx, `
		WITH candidates AS (
			SELECT
				m.created_at AS activity_created_at,
				'message:' || m.message_id AS activity_id,
				CASE WHEN m.sender_id = $1 THEN m.recipient_wall_id ELSE m.sender_wall_id END AS friend_wall_id
			FROM wall_messages m
			WHERE (m.sender_id = $1 OR m.recipient_id = $1)
			  AND m.is_deleted = FALSE
			  AND NOT (m.kind = 'post_reply' AND m.recipient_id = $1)

			UNION ALL

			SELECT
				ml.created_at AS activity_created_at,
				'message_like:' || ml.message_id || ':' || ml.user_id::text AS activity_id,
				liker_wall.wall_id AS friend_wall_id
			FROM wall_message_likes ml
			JOIN wall_messages m ON m.message_id = ml.message_id
			JOIN walls liker_wall ON liker_wall.owner_id = ml.user_id
			WHERE m.sender_id = $1
			  AND m.recipient_id = ml.user_id
			  AND ml.user_id <> $1
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				pl.created_at AS activity_created_at,
				'post_like:' || pl.post_id::text || ':' || pl.user_id::text AS activity_id,
				actor_wall.wall_id AS friend_wall_id
			FROM wall_post_likes pl
			JOIN wall_posts p ON p.post_id = pl.post_id
			JOIN walls actor_wall ON actor_wall.owner_id = pl.user_id
			WHERE p.owner_id = $1
			  AND pl.user_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				m.created_at AS activity_created_at,
				'post_reply:' || m.message_id AS activity_id,
				m.sender_wall_id AS friend_wall_id
			FROM wall_messages m
			JOIN wall_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_id = $1
			  AND m.sender_id <> $1
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.owner_id = $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				fe.created_at AS activity_created_at,
				'friend_event:' || fe.event_id::text AS activity_id,
				fe.actor_wall_id AS friend_wall_id
			FROM wall_friend_events fe
			WHERE fe.target_id = $1
			  AND fe.actor_id <> $1
		)
		SELECT c.activity_created_at
		FROM candidates c
		WHERE c.friend_wall_id = $2
		ORDER BY c.activity_created_at DESC, c.activity_id DESC
		LIMIT 1
	`, viewerID, strings.TrimSpace(friendWallID)).Scan(&activityCreatedAt); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return activityCreatedAt, nil
}

func (r *MessagesRepository) HasUnreadNotifications(ctx context.Context, viewerID int64) (bool, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `
		WITH message_candidates AS (
			SELECT
				m.created_at AS activity_created_at,
				'message:' || m.message_id AS activity_id,
				CASE WHEN m.sender_id = $1 THEN m.recipient_wall_id ELSE m.sender_wall_id END AS friend_wall_id,
				CASE WHEN m.recipient_id = $1 THEN m.created_at ELSE NULL::bigint END AS unread_created_at
			FROM wall_messages m
			WHERE (m.sender_id = $1 OR m.recipient_id = $1)
			  AND m.is_deleted = FALSE
			  AND NOT (m.kind = 'post_reply' AND m.recipient_id = $1)

			UNION ALL

			SELECT
				ml.created_at AS activity_created_at,
				'message_like:' || ml.message_id || ':' || ml.user_id::text AS activity_id,
				liker_wall.wall_id AS friend_wall_id,
				ml.created_at AS unread_created_at
			FROM wall_message_likes ml
			JOIN wall_messages m ON m.message_id = ml.message_id
			JOIN walls liker_wall ON liker_wall.owner_id = ml.user_id
			WHERE m.sender_id = $1
			  AND m.recipient_id = ml.user_id
			  AND ml.user_id <> $1
			  AND m.is_deleted = FALSE
		),
		post_like_events AS (
			SELECT
				actor_wall.wall_id AS friend_wall_id,
				p.post_id,
				MAX(pl.created_at) AS liked_at
			FROM wall_post_likes pl
			JOIN wall_posts p ON p.post_id = pl.post_id
			JOIN walls actor_wall ON actor_wall.owner_id = pl.user_id
			WHERE p.owner_id = $1
			  AND pl.user_id <> $1
			  AND p.is_deleted = FALSE
			GROUP BY actor_wall.wall_id, p.post_id
		),
		post_reply_events AS (
			SELECT DISTINCT ON (m.sender_wall_id, m.reply_post_id)
				m.sender_wall_id AS friend_wall_id,
				m.reply_post_id AS post_id,
				m.created_at AS replied_at
			FROM wall_messages m
			JOIN wall_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_id = $1
			  AND m.sender_id <> $1
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.owner_id = $1
			  AND p.is_deleted = FALSE
			ORDER BY m.sender_wall_id, m.reply_post_id, m.created_at DESC, m.message_id DESC
		),
		post_candidates AS (
			SELECT
				GREATEST(COALESCE(l.liked_at, 0), COALESCE(r.replied_at, 0)) AS activity_created_at,
				'post_activity:' || COALESCE(l.post_id, r.post_id)::text || ':' || COALESCE(l.friend_wall_id, r.friend_wall_id) AS activity_id,
				COALESCE(l.friend_wall_id, r.friend_wall_id) AS friend_wall_id,
				GREATEST(COALESCE(l.liked_at, 0), COALESCE(r.replied_at, 0)) AS unread_created_at
			FROM post_like_events l
			FULL OUTER JOIN post_reply_events r
			  ON r.friend_wall_id = l.friend_wall_id
			 AND r.post_id = l.post_id
		),
		friend_candidates AS (
			SELECT
				fe.created_at AS activity_created_at,
				'friend_event:' || fe.event_id::text AS activity_id,
				fe.actor_wall_id AS friend_wall_id,
				fe.created_at AS unread_created_at
			FROM wall_friend_events fe
			WHERE fe.target_id = $1
			  AND fe.actor_id <> $1
		),
		candidates AS (
			SELECT * FROM message_candidates
			UNION ALL
			SELECT * FROM post_candidates
			UNION ALL
			SELECT * FROM friend_candidates
		),
		ranked AS (
			SELECT
				c.*,
				ROW_NUMBER() OVER (
					PARTITION BY c.friend_wall_id
					ORDER BY c.activity_created_at DESC, c.activity_id DESC
				) AS rn
			FROM candidates c
		)
		SELECT EXISTS (
			SELECT 1
			FROM ranked c
			LEFT JOIN wall_notification_read_markers nrm
			  ON nrm.user_id = $1
			 AND nrm.friend_wall_id = c.friend_wall_id
			WHERE c.rn = 1
			  AND c.unread_created_at IS NOT NULL
			  AND c.unread_created_at > COALESCE(nrm.read_at, 0)
			LIMIT 1
		)
	`, viewerID).Scan(&exists); err != nil {
		return false, stacktrace.Propagate(err, "")
	}
	return exists, nil
}

func sprintfWallMessageColumns(viewerPlaceholder string) string {
	return strings.TrimSpace(strings.ReplaceAll(wallMessageSelectColumns, "%s", viewerPlaceholder))
}

func scanMessageRecord(scanner interface{ Scan(dest ...any) error }) (*WallMessageRecord, error) {
	var rec WallMessageRecord
	dest := []any{
		&rec.MessageID,
		&rec.Kind,
		&rec.SenderID,
		&rec.SenderWallID,
		&rec.RecipientID,
		&rec.RecipientWallID,
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
	dest = append(dest, wallActorScanDest(&rec.Sender)...)
	dest = append(dest, wallActorScanDest(&rec.Recipient)...)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func scanMessageConversationRecord(scanner interface{ Scan(dest ...any) error }) (*WallMessageConversationRecord, error) {
	var rec WallMessageConversationRecord
	var message WallMessageRecord
	var postID sql.NullInt64
	var post WallMessageConversationPostRecord
	dest := []any{
		&rec.LatestActivity.Type,
		&rec.LatestActivity.ID,
		&rec.LatestActivity.CreatedAt,
		&rec.Unread,
	}
	dest = append(dest, wallActorScanDest(&rec.Friend)...)
	dest = append(dest,
		&message.MessageID,
		&message.Kind,
		&message.SenderID,
		&message.SenderWallID,
		&message.RecipientID,
		&message.RecipientWallID,
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
	dest = append(dest, wallActorScanDest(&message.Sender)...)
	dest = append(dest, wallActorScanDest(&message.Recipient)...)
	dest = append(dest,
		&postID,
		&post.WallID,
		&post.WallSlug,
		&post.OwnerID,
		&post.ObjectKey,
		&post.ObjectSize,
		&post.ObjectPosition,
		&post.ObjectVariant,
		&post.ObjectBlurHashCipher,
		&post.ObjectWidth,
		&post.ObjectHeight,
		&post.ObjectMediaType,
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

func formatMessageCursor(message WallMessageRecord) string {
	return strconv.FormatInt(message.CreatedAt, 10) + ":" + message.MessageID
}

func formatMessageConversationCursor(conversation WallMessageConversationRecord) string {
	return strconv.FormatInt(conversation.LatestActivity.CreatedAt, 10) + ":" + conversation.LatestActivity.ID
}
