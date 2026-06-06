package repo

import (
	"context"

	timeutil "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/stacktrace"
)

func (r *SessionsRepository) CreateBrowserSession(ctx context.Context, tokenHash []byte, userID int64, clientKey string, expiresAt int64) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_browser_sessions (token_hash, user_id, client_key, expires_at)
		VALUES ($1, $2, $3, $4)
	`, tokenHash, userID, clientKey, expiresAt)
	return stacktrace.Propagate(err, "")
}

func (r *SessionsRepository) GetBrowserSession(ctx context.Context, tokenHash []byte) (*SpaceBrowserSessionRecord, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT s.token_hash, s.user_id, s.client_key, s.expires_at, s.created_at, s.updated_at, s.last_used_at,
		       k.kek_salt, k.encrypted_key, k.key_decryption_nonce, k.public_key, k.encrypted_secret_key,
		       k.secret_key_decryption_nonce, k.mem_limit, k.ops_limit, k.master_key_encrypted_with_recovery_key,
		       k.master_key_decryption_nonce, k.recovery_key_encrypted_with_master_key, k.recovery_key_decryption_nonce
		FROM space_browser_sessions s
		JOIN key_attributes k ON k.user_id = s.user_id
		WHERE s.token_hash = $1
	`, tokenHash)
	rec := &SpaceBrowserSessionRecord{}
	err := row.Scan(
		&rec.TokenHash,
		&rec.UserID,
		&rec.ClientKey,
		&rec.ExpiresAt,
		&rec.CreatedAt,
		&rec.UpdatedAt,
		&rec.LastUsedAt,
		&rec.KeyAttributes.KEKSalt,
		&rec.KeyAttributes.EncryptedKey,
		&rec.KeyAttributes.KeyDecryptionNonce,
		&rec.KeyAttributes.PublicKey,
		&rec.KeyAttributes.EncryptedSecretKey,
		&rec.KeyAttributes.SecretKeyDecryptionNonce,
		&rec.KeyAttributes.MemLimit,
		&rec.KeyAttributes.OpsLimit,
		&rec.KeyAttributes.MasterKeyEncryptedWithRecoveryKey,
		&rec.KeyAttributes.MasterKeyDecryptionNonce,
		&rec.KeyAttributes.RecoveryKeyEncryptedWithMasterKey,
		&rec.KeyAttributes.RecoveryKeyDecryptionNonce,
	)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *SessionsRepository) TouchBrowserSession(ctx context.Context, tokenHash []byte) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE space_browser_sessions
		SET last_used_at = $1
		WHERE token_hash = $2
	`, timeutil.Microseconds(), tokenHash)
	return stacktrace.Propagate(err, "")
}

func (r *SessionsRepository) DeleteBrowserSession(ctx context.Context, tokenHash []byte) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM space_browser_sessions WHERE token_hash = $1`, tokenHash)
	return stacktrace.Propagate(err, "")
}
