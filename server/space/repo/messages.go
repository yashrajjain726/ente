package repo

import (
	"context"
	"database/sql"
	"sort"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
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
	(SELECT COUNT(*) FROM space_message_likes ml WHERE ml.message_id = m.message_id) AS likes,
	EXISTS (SELECT 1 FROM space_message_likes ml WHERE ml.message_id = m.message_id AND ml.actor_space_id = %s) AS viewer_liked,
	m.is_deleted,
	m.created_at,
	m.updated_at,
	'' AS text,
	NULL::bigint AS quote_post_id,
	'' AS quote_space_id,
	'\x'::bytea AS quote_encrypted_post_key,
	'\x'::bytea AS quote_caption_cipher,
	0 AS quote_key_version,
	NULL::text AS quote_object_key,
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
	return r.GetMessage(ctx, messageID, input.SenderID, input.SenderSpaceID)
}

func (r *MessagesRepository) GetMessage(ctx context.Context, messageID string, viewerID int64, viewerSpaceID string) (*SpaceMessageRecord, error) {
	query := `
		SELECT ` + sprintfSpaceMessageColumns("$3") + `
		FROM space_messages m
		` + spaceMessageJoins + `
		WHERE m.message_id = $1
		  AND (m.sender_space_id = $3 OR m.recipient_space_id = $3)
		  AND (sender_space.owner_id = $2 OR recipient_space.owner_id = $2)
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
	  AND (sender_space.owner_id = $1 OR recipient_space.owner_id = $1)
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
	postLikes, err := r.listThreadPostLikes(ctx, viewerID, viewerSpaceID, otherSpaceID, cursor, limit+1)
	if err != nil {
		return nil, "", err
	}
	out = append(out, postLikes...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt != out[j].CreatedAt {
			return out[i].CreatedAt > out[j].CreatedAt
		}
		return out[i].MessageID > out[j].MessageID
	})
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatMessageCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *MessagesRepository) listThreadPostLikes(ctx context.Context, viewerID int64, viewerSpaceID string, otherSpaceID string, cursor string, limit int) ([]SpaceMessageRecord, error) {
	args := []any{viewerID, viewerSpaceID, otherSpaceID}
	query := `
		SELECT
			'post_like:' || p.post_id::text || ':' || pl.actor_space_id AS message_id,
			'post_like' AS kind,
			sender_space.owner_id AS sender_id,
			pl.actor_space_id AS sender_space_id,
			recipient_space.owner_id AS recipient_id,
			p.space_id AS recipient_space_id,
			'\x'::bytea AS message_cipher,
			'\x'::bytea AS encrypted_message_key,
			NULL::bigint AS reply_post_id,
			NULL::text AS reply_message_id,
			0 AS likes,
			FALSE AS viewer_liked,
			FALSE AS is_deleted,
			pl.created_at,
			pl.created_at AS updated_at,
			CASE WHEN pl.actor_space_id = $2 THEN 'You liked a post' ELSE 'Liked your post' END AS text,
			p.post_id AS quote_post_id,
			p.space_id AS quote_space_id,
			p.encrypted_post_key AS quote_encrypted_post_key,
			p.caption_cipher AS quote_caption_cipher,
			p.key_version AS quote_key_version,
			asset.object_key AS quote_object_key,
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
		FROM space_post_likes pl
		JOIN space_posts p ON p.post_id = pl.post_id
		JOIN spaces sender_space ON sender_space.space_id = pl.actor_space_id
		LEFT JOIN space_profile_assets sender_avatar ON sender_avatar.space_id = sender_space.space_id AND sender_avatar.asset_type = 'avatar'
		JOIN spaces recipient_space ON recipient_space.space_id = p.space_id
		LEFT JOIN space_profile_assets recipient_avatar ON recipient_avatar.space_id = recipient_space.space_id AND recipient_avatar.asset_type = 'avatar'
		LEFT JOIN LATERAL (
			SELECT object_key
			FROM space_post_assets
			WHERE post_id = p.post_id AND p.is_deleted = FALSE
			ORDER BY position ASC, asset_id ASC
			LIMIT 1
		) asset ON TRUE
		WHERE (
			(pl.actor_space_id = $2 AND p.space_id = $3)
			OR
			(pl.actor_space_id = $3 AND p.space_id = $2)
		)
		  AND (sender_space.owner_id = $1 OR recipient_space.owner_id = $1)
		  AND p.is_deleted = FALSE`
	if cursorCreatedAt, cursorMessageID, ok := parseMessageCursor(cursor); ok {
		args = append(args, cursorCreatedAt, cursorMessageID)
		query += ` AND (pl.created_at, 'post_like:' || p.post_id::text || ':' || pl.actor_space_id) < ($4, $5)`
	}
	args = append(args, limit)
	query += ` ORDER BY pl.created_at DESC, message_id DESC LIMIT $` + strconv.Itoa(len(args))
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]SpaceMessageRecord, 0, limit)
	for rows.Next() {
		rec, err := scanMessageRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	if err := rows.Err(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return out, nil
}

func (r *MessagesRepository) SetLike(ctx context.Context, messageID string, _ int64, actorSpaceID string, like bool) error {
	if like {
		_, err := r.DB.ExecContext(ctx, `INSERT INTO space_message_likes (message_id, actor_space_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, messageID, actorSpaceID)
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
	res, err := tx.ExecContext(ctx, `
		UPDATE space_messages m
		SET is_deleted = TRUE
		FROM spaces sender_space
		WHERE m.message_id = $1
		  AND m.sender_space_id = sender_space.space_id
		  AND sender_space.owner_id = $2
		  AND m.sender_space_id = $3
		  AND m.is_deleted = FALSE
	`, messageID, senderID, senderSpaceID)
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
				CASE WHEN m.kind = 'post_reply' THEN m.reply_post_id ELSE NULL::bigint END AS post_id,
				CASE WHEN m.recipient_space_id = $2 THEN m.created_at ELSE NULL::bigint END AS notification_created_at,
				FALSE AS is_outgoing
			FROM space_messages m
			WHERE (m.sender_space_id = $2 OR m.recipient_space_id = $2)
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
				ml.created_at AS notification_created_at,
				FALSE AS is_outgoing
			FROM space_message_likes ml
			JOIN space_messages m ON m.message_id = ml.message_id
			JOIN spaces liker_space ON liker_space.space_id = ml.actor_space_id
			WHERE m.sender_space_id = $2
			  AND m.recipient_space_id = ml.actor_space_id
			  AND ml.actor_space_id <> $2
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				'message_like' AS activity_type,
				'message_like:' || ml.message_id || ':' || ml.actor_space_id AS activity_id,
				ml.created_at AS activity_created_at,
				m.sender_space_id AS friend_space_id,
				m.message_id,
				NULL::bigint AS post_id,
				NULL::bigint AS notification_created_at,
				TRUE AS is_outgoing
			FROM space_message_likes ml
			JOIN space_messages m ON m.message_id = ml.message_id
			WHERE ml.actor_space_id = $2
			  AND m.recipient_space_id = $2
			  AND m.sender_space_id <> $2
			  AND m.is_deleted = FALSE
		),
		post_like_events AS (
			SELECT
				actor_space.space_id AS friend_space_id,
				p.post_id,
				MAX(pl.created_at) AS liked_at,
				MAX(pl.created_at) AS notification_created_at,
				FALSE AS is_outgoing
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			JOIN spaces actor_space ON actor_space.space_id = pl.actor_space_id
			WHERE p.space_id = $2
			  AND pl.actor_space_id <> $2
			  AND p.is_deleted = FALSE
			GROUP BY actor_space.space_id, p.post_id

			UNION ALL

			SELECT
				p.space_id AS friend_space_id,
				p.post_id,
				MAX(pl.created_at) AS liked_at,
				NULL::bigint AS notification_created_at,
				TRUE AS is_outgoing
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			WHERE pl.actor_space_id = $2
			  AND p.space_id <> $2
			  AND p.is_deleted = FALSE
			GROUP BY p.space_id, p.post_id
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
		post_like_candidates AS (
			SELECT
				'post_like' AS activity_type,
				'post_like:' || l.post_id::text || ':' || l.friend_space_id AS activity_id,
				l.liked_at AS activity_created_at,
				l.friend_space_id,
				NULL::text AS message_id,
				l.post_id,
				l.notification_created_at,
				l.is_outgoing
			FROM post_like_events l
		),
		post_reply_candidates AS (
			SELECT
				'post_reply' AS activity_type,
				'post_reply:' || r.message_id AS activity_id,
				r.replied_at AS activity_created_at,
				r.friend_space_id,
				r.message_id,
				r.post_id,
				r.replied_at AS notification_created_at,
				FALSE AS is_outgoing
			FROM post_reply_events r
		),
			active_friend_requests AS (
				SELECT
					fr.request_id,
					fr.created_at,
					fr.requester_space_id AS friend_space_id
				FROM space_friend_requests fr
				WHERE fr.target_space_id = $2
				  AND fr.is_deleted = FALSE
				  AND fr.resolved_at IS NULL
		),
		friend_request_candidates AS (
			SELECT
				'friend_request' AS activity_type,
				'friend_request:' || fr.request_id::text AS activity_id,
				fr.created_at AS activity_created_at,
				fr.friend_space_id,
				NULL::text AS message_id,
				NULL::bigint AS post_id,
				fr.created_at AS notification_created_at,
				FALSE AS is_outgoing
			FROM active_friend_requests fr
		),
		friend_candidates AS (
			SELECT
				CASE fe.event_type
					WHEN 'friend_remove' THEN 'friend_remove'
					ELSE 'friend_add'
				END AS activity_type,
				'friend_event:' || fe.event_id::text AS activity_id,
				fe.created_at AS activity_created_at,
				CASE WHEN fe.actor_space_id = $2 THEN fe.target_space_id ELSE fe.actor_space_id END AS friend_space_id,
				NULL::text AS message_id,
				NULL::bigint AS post_id,
				CASE WHEN fe.target_space_id = $2 THEN fe.created_at ELSE NULL::bigint END AS notification_created_at,
				fe.actor_space_id = $2 AS is_outgoing
			FROM space_friend_events fe
			WHERE (fe.target_space_id = $2 OR fe.actor_space_id = $2)
			  AND fe.actor_space_id <> fe.target_space_id
		),
		candidates AS (
			SELECT * FROM message_candidates
			UNION ALL
			SELECT * FROM post_like_candidates
			UNION ALL
			SELECT * FROM post_reply_candidates
			UNION ALL
			SELECT * FROM friend_request_candidates
			UNION ALL
			SELECT * FROM friend_candidates
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
			LEFT JOIN space_notification_read_markers nrm
			  ON nrm.viewer_space_id = $2
			 AND nrm.friend_space_id = ra.friend_space_id
			WHERE ra.readable_created_at > COALESCE(nrm.read_at, 0)
			GROUP BY ra.friend_space_id
		),
		post_like_unread_counts AS (
			SELECT
				actor_space.space_id AS friend_space_id,
				COUNT(*) AS unread_count
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			JOIN spaces actor_space ON actor_space.space_id = pl.actor_space_id
			LEFT JOIN space_notification_read_markers nrm
			  ON nrm.viewer_space_id = $2
			 AND nrm.friend_space_id = actor_space.space_id
			WHERE p.space_id = $2
			  AND pl.actor_space_id <> $2
			  AND p.is_deleted = FALSE
			  AND pl.created_at > COALESCE(nrm.read_at, 0)
			GROUP BY actor_space.space_id
		),
		friend_request_unread_counts AS (
			SELECT
				friend_space_id,
				COUNT(*) AS unread_count
			FROM active_friend_requests
			GROUP BY friend_space_id
		),
		latest_activities AS (
			SELECT DISTINCT ON (friend_space_id)
				friend_space_id,
				activity_created_at AS sort_created_at,
				activity_id AS sort_id
			FROM candidates
			ORDER BY friend_space_id, activity_created_at DESC, activity_id DESC
		),
		candidates_with_read_state AS (
			SELECT
				c.*,
				COALESCE(nrm.read_at, 0) AS read_at,
				COALESCE(ruc.unread_count, 0) AS unread_count,
				COALESCE(pluc.unread_count, 0) AS post_like_unread_count,
				COALESCE(fruc.unread_count, 0) AS friend_request_unread_count,
				la.sort_created_at,
				la.sort_id,
				(
					c.notification_created_at IS NOT NULL
					AND c.notification_created_at > COALESCE(nrm.read_at, 0)
				) AS notification_unread
			FROM candidates c
			JOIN latest_activities la ON la.friend_space_id = c.friend_space_id
			LEFT JOIN space_notification_read_markers nrm
			  ON nrm.viewer_space_id = $2
			 AND nrm.friend_space_id = c.friend_space_id
			LEFT JOIN readable_unread_counts ruc
			  ON ruc.friend_space_id = c.friend_space_id
			LEFT JOIN post_like_unread_counts pluc
			  ON pluc.friend_space_id = c.friend_space_id
			LEFT JOIN friend_request_unread_counts fruc
			  ON fruc.friend_space_id = c.friend_space_id
		),
		ranked AS (
			SELECT
				c.*,
				CASE
					WHEN c.unread_count = 0
					 AND c.post_like_unread_count = 1
					 AND c.friend_request_unread_count = 0
					 AND c.activity_type <> 'message_like' THEN 0
					ELSE c.unread_count + c.post_like_unread_count + c.friend_request_unread_count
				END AS conversation_unread_count,
				BOOL_OR(c.notification_unread) OVER (PARTITION BY c.friend_space_id) AS conversation_notification_unread,
				ROW_NUMBER() OVER (
					PARTITION BY c.friend_space_id
					ORDER BY c.activity_created_at DESC, c.activity_id DESC
				) AS rn
			FROM candidates_with_read_state c
		)
		SELECT
			c.activity_type,
			c.activity_id,
			c.activity_created_at,
			c.is_outgoing,
			(c.conversation_unread_count > 0) AS unread,
			c.conversation_unread_count AS unread_count,
			c.conversation_notification_unread AS notification_unread,
			c.sort_created_at,
			c.sort_id,
			friend_space.owner_id,
			friend_space.space_id,
			friend_space.space_slug,
			friend_space.public_key,
			friend_space.current_version,
			CASE WHEN c.activity_type = 'friend_request' THEN '\x'::bytea ELSE friend_space.encrypted_profile END AS friend_profile,
			CASE WHEN c.activity_type = 'friend_request' THEN NULL::text ELSE friend_avatar.object_id END AS friend_avatar_object_id,
			CASE WHEN c.activity_type = 'friend_request' THEN NULL::bigint ELSE friend_avatar.size END AS friend_avatar_size,
			friend_space.updated_at,
			CASE WHEN c.activity_type = 'friend_request' THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = friend_space.space_id) END AS friend_friends,
			CASE WHEN c.activity_type = 'friend_request' THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_posts fp WHERE fp.space_id = friend_space.space_id AND fp.is_deleted = FALSE) END AS friend_posts,
			COALESCE(m.message_id, '') AS message_id,
			COALESCE(m.kind, '') AS kind,
			COALESCE(sender_space.owner_id, 0) AS sender_id,
			COALESCE(m.sender_space_id, '') AS sender_space_id,
			COALESCE(recipient_space.owner_id, 0) AS recipient_id,
			COALESCE(m.recipient_space_id, '') AS recipient_space_id,
			COALESCE(m.message_cipher, '\x'::bytea) AS message_cipher,
			CASE
				WHEN m.message_id IS NULL THEN '\x'::bytea
				WHEN m.sender_space_id = $2 THEN COALESCE(m.sender_encrypted_message_key, '\x'::bytea)
				ELSE COALESCE(m.recipient_encrypted_message_key, '\x'::bytea)
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
			COALESCE(sender_space.public_key, '\x'::bytea) AS sender_public_key,
			COALESCE(sender_space.current_version, 0) AS sender_current_version,
			COALESCE(sender_space.encrypted_profile, '\x'::bytea) AS sender_profile,
			sender_avatar.object_id,
			sender_avatar.size,
			COALESCE(sender_space.updated_at, 0) AS sender_updated_at,
			CASE WHEN sender_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = sender_space.space_id) END AS sender_friends,
			CASE WHEN sender_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_posts sp WHERE sp.space_id = sender_space.space_id AND sp.is_deleted = FALSE) END AS sender_posts,
			COALESCE(recipient_space.owner_id, 0) AS recipient_owner_id,
			COALESCE(recipient_space.space_id, '') AS recipient_space_id,
			COALESCE(recipient_space.space_slug, '') AS recipient_space_slug,
			COALESCE(recipient_space.public_key, '\x'::bytea) AS recipient_public_key,
			COALESCE(recipient_space.current_version, 0) AS recipient_current_version,
			COALESCE(recipient_space.encrypted_profile, '\x'::bytea) AS recipient_profile,
			recipient_avatar.object_id,
			recipient_avatar.size,
			COALESCE(recipient_space.updated_at, 0) AS recipient_updated_at,
			CASE WHEN recipient_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_friend_shares fs WHERE fs.space_id = recipient_space.space_id) END AS recipient_friends,
			CASE WHEN recipient_space.space_id IS NULL THEN NULL::bigint ELSE (SELECT COUNT(*) FROM space_posts rp WHERE rp.space_id = recipient_space.space_id AND rp.is_deleted = FALSE) END AS recipient_posts,
			p.post_id,
			COALESCE(p.space_id, '') AS post_space_id,
			COALESCE(post_space.space_slug, '') AS post_space_slug,
			COALESCE(post_space.owner_id, 0) AS post_owner_id,
			COALESCE(p.is_deleted, FALSE) AS post_is_deleted,
			asset.object_key AS post_object_key,
			asset.size AS post_object_size,
			asset.position AS post_object_position,
			asset.metadata_cipher AS post_object_metadata_cipher
		FROM ranked c
		JOIN spaces friend_space ON friend_space.space_id = c.friend_space_id
		LEFT JOIN space_profile_assets friend_avatar ON friend_avatar.space_id = friend_space.space_id AND friend_avatar.asset_type = 'avatar'
		JOIN users friend_owner ON friend_owner.user_id = friend_space.owner_id AND friend_owner.encrypted_email IS NOT NULL
		LEFT JOIN space_messages m ON m.message_id = c.message_id
		LEFT JOIN spaces sender_space ON sender_space.space_id = m.sender_space_id
		LEFT JOIN space_profile_assets sender_avatar ON sender_avatar.space_id = sender_space.space_id AND sender_avatar.asset_type = 'avatar'
		LEFT JOIN spaces recipient_space ON recipient_space.space_id = m.recipient_space_id
		LEFT JOIN space_profile_assets recipient_avatar ON recipient_avatar.space_id = recipient_space.space_id AND recipient_avatar.asset_type = 'avatar'
		LEFT JOIN space_posts p ON p.post_id = c.post_id
		LEFT JOIN spaces post_space ON post_space.space_id = p.space_id
			LEFT JOIN LATERAL (
				SELECT object_key, size, position, metadata_cipher
				FROM space_post_assets
				WHERE post_id = p.post_id AND p.is_deleted = FALSE
				ORDER BY position ASC, asset_id ASC
				LIMIT 1
			) asset ON TRUE
			WHERE c.rn = 1
			  AND EXISTS (
			      SELECT 1 FROM spaces viewer_space
			      WHERE viewer_space.space_id = $2 AND viewer_space.owner_id = $1
			  )
			  AND ($3::bigint IS NULL OR (c.sort_created_at, c.sort_id) < ($3::bigint, $4::text))
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

func (r *MessagesRepository) GetLatestConversationActivityAt(ctx context.Context, viewerID int64, viewerSpaceID string, friendSpaceID string) (int64, error) {
	var activityCreatedAt int64
	if err := r.DB.QueryRowContext(ctx, `
		WITH candidates AS (
			SELECT
				m.created_at AS activity_created_at,
				'message:' || m.message_id AS activity_id,
				CASE WHEN m.sender_space_id = $1 THEN m.recipient_space_id ELSE m.sender_space_id END AS friend_space_id
			FROM space_messages m
			WHERE (m.sender_space_id = $1 OR m.recipient_space_id = $1)
			  AND m.is_deleted = FALSE
			  AND NOT (m.kind = 'post_reply' AND m.recipient_space_id = $1)

			UNION ALL

			SELECT
				ml.created_at AS activity_created_at,
				'message_like:' || ml.message_id || ':' || ml.actor_space_id AS activity_id,
				liker_space.space_id AS friend_space_id
			FROM space_message_likes ml
			JOIN space_messages m ON m.message_id = ml.message_id
			JOIN spaces liker_space ON liker_space.space_id = ml.actor_space_id
			WHERE m.sender_space_id = $1
			  AND m.recipient_space_id = ml.actor_space_id
			  AND ml.actor_space_id <> $1
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				ml.created_at AS activity_created_at,
				'message_like:' || ml.message_id || ':' || ml.actor_space_id AS activity_id,
				m.sender_space_id AS friend_space_id
			FROM space_message_likes ml
			JOIN space_messages m ON m.message_id = ml.message_id
			WHERE ml.actor_space_id = $1
			  AND m.recipient_space_id = $1
			  AND m.sender_space_id <> $1
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				pl.created_at AS activity_created_at,
				'post_like:' || pl.post_id::text || ':' || pl.actor_space_id AS activity_id,
				actor_space.space_id AS friend_space_id
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			JOIN spaces actor_space ON actor_space.space_id = pl.actor_space_id
			WHERE p.space_id = $1
			  AND pl.actor_space_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				pl.created_at AS activity_created_at,
				'post_like:' || pl.post_id::text || ':' || p.space_id AS activity_id,
				p.space_id AS friend_space_id
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			WHERE pl.actor_space_id = $1
			  AND p.space_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				m.created_at AS activity_created_at,
				'post_reply:' || m.message_id AS activity_id,
				m.sender_space_id AS friend_space_id
			FROM space_messages m
			JOIN space_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_space_id = $1
			  AND m.sender_space_id <> $1
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.space_id = $1

			UNION ALL

			SELECT
				fe.created_at AS activity_created_at,
				'friend_event:' || fe.event_id::text AS activity_id,
				CASE WHEN fe.actor_space_id = $1 THEN fe.target_space_id ELSE fe.actor_space_id END AS friend_space_id
			FROM space_friend_events fe
			WHERE (fe.target_space_id = $1 OR fe.actor_space_id = $1)
			  AND fe.actor_space_id <> fe.target_space_id

			UNION ALL

			SELECT
				fr.created_at AS activity_created_at,
				'friend_request:' || fr.request_id::text AS activity_id,
				fr.requester_space_id AS friend_space_id
			FROM space_friend_requests fr
			WHERE fr.target_space_id = $1
			  AND fr.is_deleted = FALSE
			  AND fr.resolved_at IS NULL

		)
		SELECT c.activity_created_at
		FROM candidates c
		JOIN spaces friend_space ON friend_space.space_id = c.friend_space_id
		JOIN users friend_owner ON friend_owner.user_id = friend_space.owner_id AND friend_owner.encrypted_email IS NOT NULL
		WHERE c.friend_space_id = $2
		ORDER BY c.activity_created_at DESC, c.activity_id DESC
		LIMIT 1
	`, strings.TrimSpace(viewerSpaceID), strings.TrimSpace(friendSpaceID)).Scan(&activityCreatedAt); err != nil {
		return 0, stacktrace.Propagate(err, "")
	}
	return activityCreatedAt, nil
}

func (r *MessagesRepository) HasUnreadNotifications(ctx context.Context, viewerID int64, viewerSpaceID string) (bool, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `
		WITH notification_candidates AS (
			SELECT
				m.sender_space_id AS friend_space_id,
				m.created_at AS notification_created_at
			FROM space_messages m
			WHERE m.recipient_space_id = $1
			  AND m.sender_space_id <> $1
			  AND m.kind = 'regular'
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				liker_space.space_id AS friend_space_id,
				ml.created_at AS notification_created_at
			FROM space_message_likes ml
			JOIN space_messages m ON m.message_id = ml.message_id
			JOIN spaces liker_space ON liker_space.space_id = ml.actor_space_id
			WHERE m.sender_space_id = $1
			  AND m.recipient_space_id = ml.actor_space_id
			  AND ml.actor_space_id <> $1
			  AND m.is_deleted = FALSE

			UNION ALL

			SELECT
				actor_space.space_id AS friend_space_id,
				pl.created_at AS notification_created_at
			FROM space_post_likes pl
			JOIN space_posts p ON p.post_id = pl.post_id
			JOIN spaces actor_space ON actor_space.space_id = pl.actor_space_id
			WHERE p.space_id = $1
			  AND pl.actor_space_id <> $1
			  AND p.is_deleted = FALSE

			UNION ALL

			SELECT
				m.sender_space_id AS friend_space_id,
				m.created_at AS notification_created_at
			FROM space_messages m
			JOIN space_posts p ON p.post_id = m.reply_post_id
			WHERE m.recipient_space_id = $1
			  AND m.sender_space_id <> $1
			  AND m.kind = 'post_reply'
			  AND m.is_deleted = FALSE
			  AND m.reply_post_id IS NOT NULL
			  AND p.space_id = $1

			UNION ALL

			SELECT
				fe.actor_space_id AS friend_space_id,
				fe.created_at AS notification_created_at
			FROM space_friend_events fe
			WHERE fe.target_space_id = $1
			  AND fe.actor_space_id <> fe.target_space_id
		)
		SELECT EXISTS (
			SELECT 1
			FROM notification_candidates c
			JOIN spaces friend_space ON friend_space.space_id = c.friend_space_id
			JOIN users friend_owner ON friend_owner.user_id = friend_space.owner_id AND friend_owner.encrypted_email IS NOT NULL
				LEFT JOIN space_notification_read_markers nrm
				  ON nrm.viewer_space_id = $1
				 AND nrm.friend_space_id = c.friend_space_id
				WHERE c.notification_created_at > COALESCE(nrm.read_at, 0)
				  AND EXISTS (
				      SELECT 1 FROM spaces viewer_space
				      WHERE viewer_space.space_id = $1 AND viewer_space.owner_id = $2
				  )
				LIMIT 1
			) OR EXISTS (
				SELECT 1
				FROM space_friend_requests fr
				JOIN spaces requester_space ON requester_space.space_id = fr.requester_space_id
				JOIN users requester_owner ON requester_owner.user_id = requester_space.owner_id AND requester_owner.encrypted_email IS NOT NULL
				WHERE fr.target_space_id = $1
				  AND EXISTS (
				      SELECT 1 FROM spaces viewer_space
				      WHERE viewer_space.space_id = $1 AND viewer_space.owner_id = $2
				  )
				  AND fr.is_deleted = FALSE
				  AND fr.resolved_at IS NULL
				LIMIT 1
			)
	`, strings.TrimSpace(viewerSpaceID), viewerID).Scan(&exists); err != nil {
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
		&rec.NotificationUnread,
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
	return strconv.FormatInt(conversation.LatestActivity.CreatedAt, 10) + ":" + conversation.LatestActivity.ID
}
