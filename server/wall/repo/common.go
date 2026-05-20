package repo

import (
	"database/sql"
	"regexp"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/stacktrace"
)

const (
	minWallSlugLength = 3
	maxWallSlugLength = 30
)

var wallSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)

func normalizeSlug(input string) string {
	return strings.ToLower(strings.TrimSpace(input))
}

var reservedWallSlugs = map[string]struct{}{
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
	"wall":           {},
	"web":            {},
	"webmaster":      {},
	"www":            {},
	"xml":            {},
}

func validateWallSlug(input string) (string, error) {
	slug := normalizeSlug(input)
	if slug == "" {
		return "", ente.NewBadRequestWithMessage("wallSlug is required")
	}
	if len(slug) < minWallSlugLength || len(slug) > maxWallSlugLength {
		return "", ente.NewBadRequestWithMessage("wallSlug must be 3-30 characters")
	}
	if !wallSlugPattern.MatchString(slug) {
		return "", ente.NewBadRequestWithMessage("wallSlug can only contain lowercase letters, numbers, dots, dashes, or underscores, and must start with a letter or number")
	}
	if isReservedWallSlug(slug) {
		return "", ente.NewBadRequestWithMessage("wallSlug is reserved")
	}
	return slug, nil
}

func ValidateWallSlug(input string) (string, error) {
	return validateWallSlug(input)
}

func isReservedWallSlug(slug string) bool {
	if _, ok := reservedWallSlugs[slug]; ok {
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
