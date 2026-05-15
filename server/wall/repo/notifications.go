package repo

import (
	"context"
	"strconv"
	"strings"

	"github.com/ente-io/stacktrace"
)

const wallNotificationRows = `
	SELECT
		'post_like:' || pl.post_id::text || ':' || pl.user_id::text AS notification_id,
		'likedPost' AS notification_type,
		pl.created_at,
		actor_wall.owner_id, actor_wall.wall_id, actor_wall.wall_slug, actor_ka.public_key,
		actor_wall.current_version, actor_wall.encrypted_profile, actor_wall.avatar_object_key,
		actor_wall.avatar_size, actor_wall.updated_at,
		(SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = actor_wall.wall_id) AS actor_friends,
		(SELECT COUNT(*) FROM wall_posts ap WHERE ap.wall_id = actor_wall.wall_id AND ap.is_deleted = FALSE) AS actor_posts,
		p.post_id,
		p.wall_id AS post_wall_id,
		post_wall.wall_slug AS post_wall_slug,
		p.owner_id AS post_owner_id,
		owner_wall.owner_id, owner_wall.wall_id, owner_wall.wall_slug, owner_ka.public_key,
		owner_wall.current_version, owner_wall.encrypted_profile, owner_wall.avatar_object_key,
		owner_wall.avatar_size, owner_wall.updated_at,
		(SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = owner_wall.wall_id) AS post_author_friends,
		(SELECT COUNT(*) FROM wall_posts op WHERE op.wall_id = owner_wall.wall_id AND op.is_deleted = FALSE) AS post_author_posts,
		asset.object_key AS post_object_key,
		asset.size AS post_object_size,
		asset.position AS post_object_position,
		asset.variant AS post_object_variant,
		asset.blur_hash_cipher AS post_object_blur_hash_cipher,
		asset.width AS post_object_width,
		asset.height AS post_object_height,
		asset.media_type AS post_object_media_type
	FROM wall_post_likes pl
	JOIN wall_posts p ON p.post_id = pl.post_id
	JOIN walls actor_wall ON actor_wall.owner_id = pl.user_id
	JOIN key_attributes actor_ka ON actor_ka.user_id = pl.user_id
	JOIN walls post_wall ON post_wall.wall_id = p.wall_id
	JOIN walls owner_wall ON owner_wall.owner_id = p.owner_id
	JOIN key_attributes owner_ka ON owner_ka.user_id = p.owner_id
	LEFT JOIN LATERAL (
		SELECT object_key, size, position, variant, blur_hash_cipher, width, height, media_type
		FROM wall_post_assets
		WHERE post_id = p.post_id
		ORDER BY position ASC, asset_id ASC
		LIMIT 1
	) asset ON TRUE
	WHERE p.owner_id = $1
	  AND pl.user_id <> $1
	  AND p.is_deleted = FALSE

	UNION ALL

	SELECT
		CASE fe.event_type
			WHEN 'friend_remove' THEN 'friend_remove:'
			ELSE 'friend_add:'
		END || fe.event_id::text AS notification_id,
		CASE fe.event_type
			WHEN 'friend_remove' THEN 'removedYouAsFriend'
			ELSE 'addedYouAsFriend'
		END AS notification_type,
		fe.created_at,
		actor_wall.owner_id, actor_wall.wall_id, actor_wall.wall_slug, actor_ka.public_key,
		actor_wall.current_version, actor_wall.encrypted_profile, actor_wall.avatar_object_key,
		actor_wall.avatar_size, actor_wall.updated_at,
		(SELECT COUNT(*) FROM wall_friend_shares fs WHERE fs.wall_id = actor_wall.wall_id) AS actor_friends,
		(SELECT COUNT(*) FROM wall_posts ap WHERE ap.wall_id = actor_wall.wall_id AND ap.is_deleted = FALSE) AS actor_posts,
		NULL::bigint AS post_id,
		NULL::text AS post_wall_id,
		NULL::text AS post_wall_slug,
		NULL::bigint AS post_owner_id,
		0::bigint, ''::text, ''::text, ''::text, 0::integer, ''::text, NULL::text, NULL::bigint, 0::bigint, NULL::bigint, NULL::bigint,
		NULL::text AS post_object_key,
		NULL::bigint AS post_object_size,
		NULL::integer AS post_object_position,
		NULL::text AS post_object_variant,
		NULL::text AS post_object_blur_hash_cipher,
		NULL::integer AS post_object_width,
		NULL::integer AS post_object_height,
		NULL::text AS post_object_media_type
	FROM wall_friend_events fe
	JOIN walls actor_wall ON actor_wall.wall_id = fe.actor_wall_id
	JOIN key_attributes actor_ka ON actor_ka.user_id = actor_wall.owner_id
	WHERE fe.target_id = $1
	  AND fe.actor_id <> $1
`

func (r *NotificationsRepository) List(ctx context.Context, userID int64, cursor string, limit int) ([]WallNotificationRecord, string, error) {
	limit = optionalInt(limit, 50)
	if limit > 100 {
		limit = 100
	}
	var cursorCreatedAt any
	var cursorID any
	if createdAt, id, ok := parseNotificationCursor(cursor); ok {
		cursorCreatedAt = createdAt
		cursorID = id
	}
	rows, err := r.DB.QueryContext(ctx, `
		WITH notifications AS (`+wallNotificationRows+`)
		SELECT n.*
		FROM notifications n
		WHERE ($2::bigint IS NULL OR (n.created_at, n.notification_id) < ($2::bigint, $3::text))
		ORDER BY n.created_at DESC, n.notification_id DESC
		LIMIT $4
	`, userID, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", stacktrace.Propagate(err, "")
	}
	defer rows.Close()

	out := make([]WallNotificationRecord, 0, limit+1)
	for rows.Next() {
		rec, err := scanNotificationRecord(rows)
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
		nextCursor = formatNotificationCursor(out[limit-1])
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func scanNotificationRecord(scanner interface{ Scan(dest ...any) error }) (*WallNotificationRecord, error) {
	var rec WallNotificationRecord
	dest := []any{&rec.ID, &rec.Type, &rec.CreatedAt}
	dest = append(dest, wallActorScanDest(&rec.Actor)...)
	dest = append(dest, &rec.PostID, &rec.PostWallID, &rec.PostWallSlug, &rec.PostOwnerID)
	dest = append(dest, wallActorScanDest(&rec.PostAuthor)...)
	dest = append(dest, &rec.PostObjectKey, &rec.PostObjectSize, &rec.PostObjectPosition, &rec.PostObjectVariant, &rec.PostObjectBlurHashCipher, &rec.PostObjectWidth, &rec.PostObjectHeight, &rec.PostObjectMediaType)
	if err := scanner.Scan(dest...); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func parseNotificationCursor(cursor string) (int64, string, bool) {
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

func formatNotificationCursor(notification WallNotificationRecord) string {
	return strconv.FormatInt(notification.CreatedAt, 10) + ":" + notification.ID
}
