package repo

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateSpaceSlugMatchesClientRules(t *testing.T) {
	for _, tc := range []struct {
		name       string
		input      string
		normalized string
	}{
		{name: "letters", input: "alice", normalized: "alice"},
		{name: "four chars", input: "four", normalized: "four"},
		{name: "numbers", input: "user123", normalized: "user123"},
		{name: "allowed separators", input: "my.space_name1", normalized: "my.space_name1"},
		{name: "normalizes case and spaces", input: " Alice_123 ", normalized: "alice_123"},
		{name: "thirty chars", input: strings.Repeat("a", 30), normalized: strings.Repeat("a", 30)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			normalized, err := ValidateSpaceSlug(tc.input)
			require.NoError(t, err)
			require.Equal(t, tc.normalized, normalized)
		})
	}
}

func TestValidateSpaceSlugRejectsInvalidClientSlugs(t *testing.T) {
	for _, tc := range []struct {
		name    string
		input   string
		message string
	}{
		{name: "empty", input: " ", message: "spaceSlug is required"},
		{name: "too short", input: "abc", message: "spaceSlug must be 4-30 characters"},
		{name: "too long", input: strings.Repeat("a", 31), message: "spaceSlug must be 4-30 characters"},
		{name: "leading dot", input: ".alice", message: "spaceSlug can only contain"},
		{name: "leading dash", input: "-alice", message: "spaceSlug can only contain"},
		{name: "leading underscore", input: "_alice", message: "spaceSlug can only contain"},
		{name: "inner dash", input: "ali-ce", message: "spaceSlug can only contain"},
		{name: "space", input: "ali ce", message: "spaceSlug can only contain"},
		{name: "slash", input: "ali/ce", message: "spaceSlug can only contain"},
		{name: "control character", input: "ali\nce", message: "spaceSlug can only contain"},
		{name: "unicode confusable", input: "paypa\u217C", message: "spaceSlug can only contain"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidateSpaceSlug(tc.input)
			require.Error(t, err)
			require.Contains(t, err.Error(), tc.message)
		})
	}
}

func TestValidateSpaceSlugAllowReservedOnlyBypassesReservedCheck(t *testing.T) {
	normalized, err := ValidateSpaceSlugAllowReserved(" Ente ")
	require.NoError(t, err)
	require.Equal(t, "ente", normalized)

	_, err = ValidateSpaceSlugAllowReserved("ente-user")
	require.Error(t, err)
	require.Contains(t, err.Error(), "spaceSlug can only contain")

	_, err = ValidateSpaceSlugAllowReserved("ali/ce")
	require.Error(t, err)
	require.Contains(t, err.Error(), "spaceSlug can only contain")

	_, err = ValidateSpaceSlugAllowReserved("abc")
	require.Error(t, err)
	require.Contains(t, err.Error(), "spaceSlug must be 4-30 characters")
}

func TestReservedSpaceSlugListBuildsLookup(t *testing.T) {
	seen := make(map[string]struct{}, len(reservedSpaceSlugList))
	for _, slug := range reservedSpaceSlugList {
		require.Equal(t, slug, normalizeSlug(slug))

		_, ok := seen[slug]
		require.False(t, ok, "duplicate reserved space slug: %s", slug)
		seen[slug] = struct{}{}

		_, ok = reservedSpaceSlugs[slug]
		require.True(t, ok, "missing reserved space slug lookup: %s", slug)
	}
	require.Len(t, reservedSpaceSlugs, len(reservedSpaceSlugList))
}

func TestValidateSpaceSlugRejectsReservedFileSuffixes(t *testing.T) {
	for _, slug := range []string{
		"theme.css",
		"page.htm",
		"page.html",
		"script.js",
		"data.json",
		"source.map",
		"script.mjs",
		"robots.txt",
		"app.webmanifest",
		"feed.xml",
	} {
		t.Run(slug, func(t *testing.T) {
			_, err := ValidateSpaceSlug(slug)
			require.Error(t, err)
			require.Contains(t, err.Error(), "spaceSlug is reserved")
		})
	}
}
