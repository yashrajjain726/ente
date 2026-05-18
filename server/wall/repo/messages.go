package repo

import (
	"context"
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
			reply_post_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, messageID, input.SenderID, input.SenderWallID, input.RecipientID, input.RecipientWallID, input.Kind, input.MessageCipher, input.SenderEncryptedMessageKey, input.RecipientEncryptedMessageKey, replyPostID); err != nil {
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
		WITH ranked AS (
			SELECT
				m.*,
				ROW_NUMBER() OVER (
					PARTITION BY CASE WHEN m.sender_id = $1 THEN m.recipient_wall_id ELSE m.sender_wall_id END
					ORDER BY m.created_at DESC, m.message_id DESC
				) AS rn
			FROM wall_messages m
			WHERE (m.sender_id = $1 OR m.recipient_id = $1)
			  AND m.is_deleted = FALSE
		)
		SELECT `+sprintfWallMessageColumns("$1")+`
		FROM ranked m
		`+wallMessageJoins+`
		WHERE m.rn = 1
		  AND ($2::bigint IS NULL OR (m.created_at, m.message_id) < ($2::bigint, $3::text))
		ORDER BY m.created_at DESC, m.message_id DESC
		LIMIT $4
	`, viewerID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	out := make([]WallMessageConversationRecord, 0, limit+1)
	for rows.Next() {
		message, err := scanMessageRecord(rows)
		if err != nil {
			return nil, "", err
		}
		friend := message.Sender
		if message.SenderID == viewerID {
			friend = message.Recipient
		}
		out = append(out, WallMessageConversationRecord{
			Friend:      friend,
			LastMessage: *message,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	nextCursor := ""
	if len(out) > limit {
		nextCursor = formatMessageCursor(out[limit-1].LastMessage)
		out = out[:limit]
	}
	return out, nextCursor, nil
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
