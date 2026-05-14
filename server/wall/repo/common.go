package repo

import (
	"database/sql"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/stacktrace"
)

func normalizeSlug(input string) string {
	return strings.ToLower(strings.TrimSpace(input))
}

func nullString(value string) sql.NullString {
	value = strings.TrimSpace(value)
	if value == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}

func optionalInt(limit int, fallback int) int {
	if limit <= 0 {
		return fallback
	}
	return limit
}

func wallActorScanDest(actor *WallActorRecord) []any {
	return []any{
		&actor.UserID,
		&actor.WallID,
		&actor.WallSlug,
		&actor.PublicKey,
		&actor.KeyVersion,
		&actor.EncryptedProfile,
		&actor.AvatarObjectKey,
		&actor.AvatarSize,
		&actor.UpdatedAt,
		&actor.Friends,
		&actor.Posts,
	}
}

func wrapUnique(err error, message string) error {
	if err == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(err.Error()), "duplicate key value") {
		return ente.NewAlreadyExistsError(message)
	}
	return stacktrace.Propagate(err, "")
}
