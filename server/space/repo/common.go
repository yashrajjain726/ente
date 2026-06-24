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

var spaceSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._]*$`)

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
	if isReservedSpaceSlug(slug) {
		return "", ente.NewBadRequestWithMessage("spaceSlug is reserved")
	}
	if !spaceSlugPattern.MatchString(slug) {
		return "", ente.NewBadRequestWithMessage("spaceSlug can only contain lowercase letters, numbers, dots, or underscores, and must start with a letter or number")
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

const spaceRecordSelectColumns = `
	s.space_id,
	s.owner_id,
	s.space_slug,
	s.root_wrapped_space_key,
	s.encrypted_profile,
	s.current_version,
	s.public_key,
	s.encrypted_secret_key,
	avatar.object_id AS avatar_object_id,
	avatar.bucket_id AS avatar_bucket_id,
	avatar.size AS avatar_size,
	cover.object_id AS cover_object_id,
	cover.bucket_id AS cover_bucket_id,
	cover.size AS cover_size,
	s.created_at,
	s.updated_at
`

const spaceRecordProfileAssetJoins = `
	LEFT JOIN space_profile_assets avatar
	  ON avatar.space_id = s.space_id
	 AND avatar.asset_type = 'avatar'
	LEFT JOIN space_profile_assets cover
	  ON cover.space_id = s.space_id
	 AND cover.asset_type = 'cover'
`

func spaceActorScanDest(actor *SpaceActorRecord) []any {
	return []any{
		&actor.UserID,
		&actor.SpaceID,
		&actor.SpaceSlug,
		&actor.PublicKey,
		&actor.KeyVersion,
		&actor.EncryptedProfile,
		&actor.AvatarObjectID,
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
