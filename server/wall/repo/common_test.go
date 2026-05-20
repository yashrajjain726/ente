package repo

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateWallSlugMatchesClientRules(t *testing.T) {
	for _, tc := range []struct {
		name       string
		input      string
		normalized string
	}{
		{name: "letters", input: "alice", normalized: "alice"},
		{name: "numbers", input: "user123", normalized: "user123"},
		{name: "allowed separators", input: "my.wall-name_1", normalized: "my.wall-name_1"},
		{name: "normalizes case and spaces", input: " Alice_123 ", normalized: "alice_123"},
		{name: "thirty chars", input: strings.Repeat("a", 30), normalized: strings.Repeat("a", 30)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			normalized, err := ValidateWallSlug(tc.input)
			require.NoError(t, err)
			require.Equal(t, tc.normalized, normalized)
		})
	}
}

func TestValidateWallSlugRejectsInvalidClientSlugs(t *testing.T) {
	for _, tc := range []struct {
		name    string
		input   string
		message string
	}{
		{name: "empty", input: " ", message: "wallSlug is required"},
		{name: "too short", input: "ab", message: "wallSlug must be 3-30 characters"},
		{name: "too long", input: strings.Repeat("a", 31), message: "wallSlug must be 3-30 characters"},
		{name: "leading dot", input: ".alice", message: "wallSlug can only contain"},
		{name: "leading dash", input: "-alice", message: "wallSlug can only contain"},
		{name: "leading underscore", input: "_alice", message: "wallSlug can only contain"},
		{name: "space", input: "ali ce", message: "wallSlug can only contain"},
		{name: "slash", input: "ali/ce", message: "wallSlug can only contain"},
		{name: "control character", input: "ali\nce", message: "wallSlug can only contain"},
		{name: "unicode confusable", input: "paypa\u217C", message: "wallSlug can only contain"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidateWallSlug(tc.input)
			require.Error(t, err)
			require.Contains(t, err.Error(), tc.message)
		})
	}
}
