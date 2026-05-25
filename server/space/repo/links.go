package repo

import (
	"bytes"
	"context"
	"database/sql"
	"errors"

	"github.com/ente-io/stacktrace"
	"github.com/lib/pq"
)

var (
	ErrActiveLinkAlreadyExists = errors.New("active space link already exists")
	ErrLinkAuthKeyReused       = errors.New("space link auth key has already been used")
)

func (r *LinksRepository) UpsertLink(ctx context.Context, spaceID string, authKeyHash []byte, keyVersion int, encryptedSpaceKey string, encryptedAccessKey string) (*SpaceLinkRecord, error) {
	return r.writeLink(ctx, spaceID, authKeyHash, keyVersion, encryptedSpaceKey, encryptedAccessKey, false)
}

func (r *LinksRepository) RotateLink(ctx context.Context, spaceID string, authKeyHash []byte, keyVersion int, encryptedSpaceKey string, encryptedAccessKey string) (*SpaceLinkRecord, error) {
	return r.writeLink(ctx, spaceID, authKeyHash, keyVersion, encryptedSpaceKey, encryptedAccessKey, true)
}

func (r *LinksRepository) writeLink(ctx context.Context, spaceID string, authKeyHash []byte, keyVersion int, encryptedSpaceKey string, encryptedAccessKey string, rotate bool) (*SpaceLinkRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var ownerID int64
	var spaceSlug string
	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, space_slug, current_version
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, spaceID).Scan(&ownerID, &spaceSlug, &currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}

	var existingAuthKeyHash []byte
	var existingKeyVersion int
	err = tx.QueryRowContext(ctx, `
		SELECT auth_key_hash, key_version
		FROM space_links
		WHERE space_id = $1 AND active = TRUE
		FOR UPDATE
	`, spaceID).Scan(&existingAuthKeyHash, &existingKeyVersion)
	if err == nil && bytes.Equal(existingAuthKeyHash, authKeyHash) && existingKeyVersion == keyVersion {
		if rotate {
			return nil, ErrLinkAuthKeyReused
		}
		return scanLinkRecord(tx.QueryRowContext(ctx, `
			SELECT l.space_id, $2::text, $3::bigint, $2::text, l.auth_key_hash, l.key_version, l.encrypted_space_key, l.encrypted_access_key, l.active, l.created_at, l.updated_at
			FROM space_links l
			WHERE l.space_id = $1 AND l.active = TRUE
		`, spaceID, spaceSlug, ownerID))
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, stacktrace.Propagate(err, "")
	}
	if err == nil {
		if !rotate {
			return nil, ErrActiveLinkAlreadyExists
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM space_link_sessions WHERE space_id = $1`, spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE space_links
			SET active = FALSE
			WHERE space_id = $1 AND active = TRUE
		`, spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
	}

	var reusedAuthKeyHash []byte
	err = tx.QueryRowContext(ctx, `
		SELECT auth_key_hash
		FROM space_links
		WHERE auth_key_hash = $1
		FOR UPDATE
	`, authKeyHash).Scan(&reusedAuthKeyHash)
	if err == nil {
		return nil, ErrLinkAuthKeyReused
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, stacktrace.Propagate(err, "")
	}

	link, err := scanLinkRecord(tx.QueryRowContext(ctx, `
		INSERT INTO space_links (space_id, auth_key_hash, key_version, encrypted_space_key, encrypted_access_key, active)
		VALUES ($1, $2, $3, $4, $5, TRUE)
		RETURNING space_id, $6::text, $7::bigint, $6::text, auth_key_hash, key_version, encrypted_space_key, encrypted_access_key, active, created_at, updated_at
	`, spaceID, authKeyHash, keyVersion, encryptedSpaceKey, encryptedAccessKey, spaceSlug, ownerID))
	if err != nil {
		if isUniqueViolationFor(err, "uq_space_links_active_space") {
			return nil, ErrActiveLinkAlreadyExists
		}
		if isUniqueViolation(err) {
			return nil, ErrLinkAuthKeyReused
		}
		return nil, stacktrace.Propagate(err, "")
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return link, nil
}

func (r *LinksRepository) GetLink(ctx context.Context, spaceID string) (*SpaceLinkRecord, error) {
	return scanLinkRecord(r.DB.QueryRowContext(ctx, `
		SELECT l.space_id, w.space_slug, w.owner_id, w.space_slug, l.auth_key_hash, l.key_version, l.encrypted_space_key, l.encrypted_access_key, l.active, l.created_at, l.updated_at
		FROM space_links l
		JOIN spaces w ON w.space_id = l.space_id
		WHERE l.space_id = $1 AND l.active = TRUE
	`, spaceID))
}

func (r *LinksRepository) DeleteLink(ctx context.Context, spaceID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	if err := deleteLinkTx(ctx, tx, spaceID); err != nil {
		return err
	}
	return stacktrace.Propagate(tx.Commit(), "")
}

func deleteLinkTx(ctx context.Context, tx *sql.Tx, spaceID string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM space_link_sessions WHERE space_id = $1`, spaceID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE space_links SET active = FALSE WHERE space_id = $1 AND active = TRUE`, spaceID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	return nil
}

func (r *LinksRepository) GetLinkByAuthHash(ctx context.Context, spaceID string, authHash []byte) (*SpaceLinkRecord, error) {
	return scanLinkRecord(r.DB.QueryRowContext(ctx, `
		SELECT l.space_id, w.space_slug, w.owner_id, w.space_slug, l.auth_key_hash, l.key_version, l.encrypted_space_key, l.encrypted_access_key, l.active, l.created_at, l.updated_at
		FROM space_links l
		JOIN spaces w ON w.space_id = l.space_id
		WHERE l.space_id = $1 AND l.auth_key_hash = $2 AND l.active = TRUE
	`, spaceID, authHash))
}

func (r *LinksRepository) CreateSession(ctx context.Context, tokenHash []byte, spaceID string, authKeyHash []byte, keyVersion int, expiresAt int64) error {
	res, err := r.DB.ExecContext(ctx, `
		INSERT INTO space_link_sessions (token_hash, space_id, owner_id, auth_key_hash, key_version, expires_at)
		SELECT $1, l.space_id, w.owner_id, l.auth_key_hash, l.key_version, $5
		FROM space_links l
		JOIN spaces w ON w.space_id = l.space_id
		WHERE l.space_id = $2
		  AND l.auth_key_hash = $3
		  AND l.key_version = $4
		  AND l.active = TRUE
	`, tokenHash, spaceID, authKeyHash, keyVersion, expiresAt)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *LinksRepository) GetSession(ctx context.Context, tokenHash []byte) (*SpaceLinkSessionRecord, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT s.token_hash, s.space_id, s.owner_id, s.auth_key_hash, s.key_version, s.expires_at, s.created_at,
		       w.space_slug, w.space_slug, l.encrypted_space_key
		FROM space_link_sessions s
		JOIN spaces w ON w.space_id = s.space_id
		JOIN space_links l ON l.space_id = s.space_id
		                 AND l.auth_key_hash = s.auth_key_hash
		                 AND l.key_version = s.key_version
		WHERE s.token_hash = $1 AND l.active = TRUE
	`, tokenHash)
	var rec SpaceLinkSessionRecord
	if err := row.Scan(&rec.TokenHash, &rec.SpaceID, &rec.OwnerID, &rec.AuthKeyHash, &rec.KeyVersion, &rec.ExpiresAt, &rec.CreatedAt, &rec.SpaceSlug, &rec.OwnerSlug, &rec.EncryptedSpaceKey); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

func isUniqueViolationFor(err error, constraint string) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505" && pqErr.Constraint == constraint
}

func (r *LinksRepository) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM space_link_sessions WHERE token_hash = $1`, tokenHash)
	return stacktrace.Propagate(err, "")
}

func scanLinkRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceLinkRecord, error) {
	var rec SpaceLinkRecord
	if err := scanner.Scan(&rec.SpaceID, &rec.SpaceSlug, &rec.OwnerID, &rec.OwnerSlug, &rec.AuthKeyHash, &rec.KeyVersion, &rec.EncryptedSpaceKey, &rec.EncryptedAccessKey, &rec.Active, &rec.CreatedAt, &rec.UpdatedAt); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
