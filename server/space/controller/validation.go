package controller

import (
	"encoding/base64"
	"strings"

	"github.com/ente-io/museum/ente"
)

const (
	maxSpaceEncryptedProfileEncodedBytes = 32 * 1024
	maxSpaceEncryptedProfileDecodedBytes = 24 * 1024
	maxSpaceEncryptedKeyEncodedBytes     = 4 * 1024
	maxSpaceEncryptedKeyDecodedBytes     = 3 * 1024
	maxSpaceCaptionCipherEncodedBytes    = 16 * 1024
	maxSpaceCaptionCipherDecodedBytes    = 12 * 1024
	maxSpaceBlurHashCipherEncodedBytes   = 1024
	maxSpaceBlurHashCipherDecodedBytes   = 768
	maxSpacePostObjects                  = 10
	maxSpaceFriendSharesPerRefresh       = 500
	maxSpaceObjectKeyBytes               = 512
	maxSpaceVariantBytes                 = 64
	maxSpaceMediaTypeBytes               = 128
	maxSpaceLinkSessionTokenBytes        = 256
)

func validateEncodedSpaceField(field string, value string, maxEncodedBytes int, maxDecodedBytes int) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ente.NewBadRequestWithMessage(field + " is required")
	}
	return validateOptionalEncodedSpaceField(field, trimmed, maxEncodedBytes, maxDecodedBytes)
}

func validateOptionalEncodedSpaceField(field string, value string, maxEncodedBytes int, maxDecodedBytes int) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	if len(trimmed) > maxEncodedBytes {
		return ente.NewBadRequestWithMessage(field + " is too large")
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil || len(decoded) == 0 {
		return ente.NewBadRequestWithMessage(field + " must be valid base64")
	}
	if len(decoded) > maxDecodedBytes {
		return ente.NewBadRequestWithMessage(field + " is too large")
	}
	return nil
}

func validateOptionalEncodedSpacePointerField(field string, value *string, maxEncodedBytes int, maxDecodedBytes int) error {
	if value == nil {
		return nil
	}
	return validateOptionalEncodedSpaceField(field, *value, maxEncodedBytes, maxDecodedBytes)
}

func validateSpaceTextFieldBytes(field string, value string, maxBytes int) error {
	if len(strings.TrimSpace(value)) > maxBytes {
		return ente.NewBadRequestWithMessage(field + " is too large")
	}
	return nil
}
