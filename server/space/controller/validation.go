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
	maxSpaceAssetMetadataEncodedBytes    = 8 * 1024
	maxSpaceAssetMetadataDecodedBytes    = 6 * 1024
	maxSpacePostObjects                  = 10
	maxSpaceFriendSharesPerRefresh       = 500
	maxSpaceObjectKeyBytes               = 512
	maxSpaceLinkSessionTokenBytes        = 256
)

func validateEncodedSpaceField(field string, value string, maxEncodedBytes int, maxDecodedBytes int) error {
	_, err := decodeEncodedSpaceField(field, value, maxEncodedBytes, maxDecodedBytes)
	return err
}

func decodeEncodedSpaceField(field string, value string, maxEncodedBytes int, maxDecodedBytes int) ([]byte, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, ente.NewBadRequestWithMessage(field + " is required")
	}
	return decodeOptionalEncodedSpaceField(field, trimmed, maxEncodedBytes, maxDecodedBytes)
}

func validateOptionalEncodedSpaceField(field string, value string, maxEncodedBytes int, maxDecodedBytes int) error {
	_, err := decodeOptionalEncodedSpaceField(field, value, maxEncodedBytes, maxDecodedBytes)
	return err
}

func decodeOptionalEncodedSpaceField(field string, value string, maxEncodedBytes int, maxDecodedBytes int) ([]byte, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}
	if len(trimmed) > maxEncodedBytes {
		return nil, ente.NewBadRequestWithMessage(field + " is too large")
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil || len(decoded) == 0 {
		return nil, ente.NewBadRequestWithMessage(field + " must be valid base64")
	}
	if len(decoded) > maxDecodedBytes {
		return nil, ente.NewBadRequestWithMessage(field + " is too large")
	}
	return decoded, nil
}

func validateOptionalEncodedSpacePointerField(field string, value *string, maxEncodedBytes int, maxDecodedBytes int) error {
	if value == nil {
		return nil
	}
	return validateOptionalEncodedSpaceField(field, *value, maxEncodedBytes, maxDecodedBytes)
}

func decodeOptionalEncodedSpacePointerField(field string, value *string, maxEncodedBytes int, maxDecodedBytes int) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	return decodeOptionalEncodedSpaceField(field, *value, maxEncodedBytes, maxDecodedBytes)
}

func encodeSpaceField(value []byte) string {
	if len(value) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(value)
}

func validateSpaceTextFieldBytes(field string, value string, maxBytes int) error {
	if len(strings.TrimSpace(value)) > maxBytes {
		return ente.NewBadRequestWithMessage(field + " is too large")
	}
	return nil
}
