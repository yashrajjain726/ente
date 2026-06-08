package repo

import (
	"context"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/stacktrace"
)

func (r *EntityKeysRepository) CreateKey(ctx context.Context, userID int64, keyType, encryptedKey, header string) error {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_entity_keys (user_id, key_type, encrypted_key, header)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, key_type) DO NOTHING
	`, userID, keyType, encryptedKey, header)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if rowsAffected == 1 {
		return nil
	}
	existing, err := r.GetKey(ctx, userID, keyType)
	if err != nil {
		return err
	}
	if existing.EncryptedKey == encryptedKey && existing.Header == header {
		return nil
	}
	return ente.NewAlreadyExistsError("key already exists")
}

func (r *EntityKeysRepository) EnsureKey(ctx context.Context, userID int64, keyType, encryptedKey, header string) (*SpaceEntityKeyRecord, error) {
	if _, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_entity_keys (user_id, key_type, encrypted_key, header)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, key_type) DO NOTHING
	`, userID, keyType, encryptedKey, header); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return r.GetKey(ctx, userID, keyType)
}

func (r *EntityKeysRepository) GetKey(ctx context.Context, userID int64, keyType string) (*SpaceEntityKeyRecord, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT user_id, key_type, encrypted_key, header, created_at
		FROM space_entity_keys
		WHERE user_id = $1 AND key_type = $2
	`, userID, keyType)
	rec := &SpaceEntityKeyRecord{}
	if err := row.Scan(&rec.UserID, &rec.KeyType, &rec.EncryptedKey, &rec.Header, &rec.CreatedAt); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}
