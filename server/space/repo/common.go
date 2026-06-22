package repo

import (
	"database/sql"
	"regexp"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/stacktrace"
)

const (
	minSpaceSlugLength = 3
	maxSpaceSlugLength = 30
)

var spaceSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)

func normalizeSlug(input string) string {
	return strings.ToLower(strings.TrimSpace(input))
}

var reservedSpaceSlugs = newReservedSpaceSlugSet()

func newReservedSpaceSlugSet() map[string]struct{} {
	slugs := make(map[string]struct{}, len(reservedSpaceSlugList))
	for _, slug := range reservedSpaceSlugList {
		slugs[slug] = struct{}{}
	}
	return slugs
}

func validateSpaceSlug(input string) (string, error) {
	slug := normalizeSlug(input)
	if slug == "" {
		return "", ente.NewBadRequestWithMessage("spaceSlug is required")
	}
	if len(slug) < minSpaceSlugLength || len(slug) > maxSpaceSlugLength {
		return "", ente.NewBadRequestWithMessage("spaceSlug must be 3-30 characters")
	}
	if !spaceSlugPattern.MatchString(slug) {
		return "", ente.NewBadRequestWithMessage("spaceSlug can only contain lowercase letters, numbers, dots, dashes, or underscores, and must start with a letter or number")
	}
	if isReservedSpaceSlug(slug) {
		return "", ente.NewBadRequestWithMessage("spaceSlug is reserved")
	}
	return slug, nil
}

func ValidateSpaceSlug(input string) (string, error) {
	return validateSpaceSlug(input)
}

func isReservedSpaceSlug(slug string) bool {
	if _, ok := reservedSpaceSlugs[slug]; ok {
		return true
	}
	if strings.HasPrefix(slug, "ente") {
		return true
	}
	return strings.HasSuffix(slug, ".ente") || strings.HasSuffix(slug, "-ente") || strings.HasSuffix(slug, "_ente")
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

func spaceActorScanDest(actor *SpaceActorRecord) []any {
	return []any{
		&actor.UserID,
		&actor.SpaceID,
		&actor.SpaceSlug,
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
