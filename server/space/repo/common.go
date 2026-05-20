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

var reservedSpaceSlugs = map[string]struct{}{
	"about":          {},
	"abuse":          {},
	"account":        {},
	"accounts":       {},
	"add":            {},
	"admin":          {},
	"administrator":  {},
	"admins":         {},
	"all":            {},
	"anonymous":      {},
	"api":            {},
	"app":            {},
	"apps":           {},
	"asset":          {},
	"assets":         {},
	"auth":           {},
	"authentication": {},
	"avatar":         {},
	"blog":           {},
	"cdn":            {},
	"contact":        {},
	"create":         {},
	"css":            {},
	"dashboard":      {},
	"delete":         {},
	"deleted":        {},
	"dev":            {},
	"developer":      {},
	"developers":     {},
	"docs":           {},
	"edit":           {},
	"email":          {},
	"faq":            {},
	"favicon":        {},
	"feed":           {},
	"feedback":       {},
	"friend":         {},
	"friends":        {},
	"ftp":            {},
	"guest":          {},
	"help":           {},
	"home":           {},
	"hostmaster":     {},
	"html":           {},
	"image":          {},
	"images":         {},
	"imap":           {},
	"img":            {},
	"invite":         {},
	"join":           {},
	"js":             {},
	"json":           {},
	"legal":          {},
	"like":           {},
	"likes":          {},
	"link":           {},
	"links":          {},
	"login":          {},
	"logout":         {},
	"mail":           {},
	"mailer":         {},
	"me":             {},
	"mod":            {},
	"moderator":      {},
	"museum":         {},
	"new":            {},
	"no-reply":       {},
	"no_reply":       {},
	"noreply":        {},
	"notifications":  {},
	"null":           {},
	"official":       {},
	"owner":          {},
	"passkeys":       {},
	"pop":            {},
	"post":           {},
	"postmaster":     {},
	"posts":          {},
	"privacy":        {},
	"private":        {},
	"profile":        {},
	"public":         {},
	"recover":        {},
	"register":       {},
	"registration":   {},
	"remove":         {},
	"robots":         {},
	"root":           {},
	"search":         {},
	"security":       {},
	"self":           {},
	"settings":       {},
	"setup-profile":  {},
	"setup_profile":  {},
	"share":          {},
	"shares":         {},
	"signin":         {},
	"signout":        {},
	"signup":         {},
	"sitemap":        {},
	"smtp":           {},
	"ssh":            {},
	"staff":          {},
	"static":         {},
	"status":         {},
	"support":        {},
	"system":         {},
	"team":           {},
	"terms":          {},
	"tos":            {},
	"two-factor":     {},
	"two_factor":     {},
	"undefined":      {},
	"unknown":        {},
	"update":         {},
	"upload":         {},
	"uploads":        {},
	"user":           {},
	"username":       {},
	"users":          {},
	"verify":         {},
	"view":           {},
	"space":          {},
	"web":            {},
	"webmaster":      {},
	"www":            {},
	"xml":            {},
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
	return strings.HasPrefix(slug, "ente")
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
