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
	ErrActiveLinkAlreadyExists = errors.New("active wall link already exists")
	ErrLinkAuthKeyReused       = errors.New("wall link auth key has already been used")
)

func (r *LinksRepository) UpsertLink(ctx context.Context, wallID string, authKeyHash []byte, keyVersion int, encryptedWallKey string, encryptedAccessKey string) (*WallLinkRecord, error) {
	return r.writeLink(ctx, wallID, authKeyHash, keyVersion, encryptedWallKey, encryptedAccessKey, false)
}

func (r *LinksRepository) RotateLink(ctx context.Context, wallID string, authKeyHash []byte, keyVersion int, encryptedWallKey string, encryptedAccessKey string) (*WallLinkRecord, error) {
	return r.writeLink(ctx, wallID, authKeyHash, keyVersion, encryptedWallKey, encryptedAccessKey, true)
}

func (r *LinksRepository) writeLink(ctx context.Context, wallID string, authKeyHash []byte, keyVersion int, encryptedWallKey string, encryptedAccessKey string, rotate bool) (*WallLinkRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var ownerID int64
	var wallSlug string
	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT owner_id, wall_slug, current_version
		FROM walls
		WHERE wall_id = $1
		FOR UPDATE
	`, wallID).Scan(&ownerID, &wallSlug, &currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}

	var existingAuthKeyHash []byte
	var existingKeyVersion int
	err = tx.QueryRowContext(ctx, `
		SELECT auth_key_hash, key_version
		FROM wall_links
		WHERE wall_id = $1 AND active = TRUE
		FOR UPDATE
	`, wallID).Scan(&existingAuthKeyHash, &existingKeyVersion)
	if err == nil && bytes.Equal(existingAuthKeyHash, authKeyHash) && existingKeyVersion == keyVersion {
		if rotate {
			return nil, ErrLinkAuthKeyReused
		}
		return scanLinkRecord(tx.QueryRowContext(ctx, `
			SELECT l.wall_id, $2::text, $3::bigint, $2::text, l.auth_key_hash, l.key_version, l.encrypted_wall_key, l.encrypted_access_key, l.active, l.created_at, l.updated_at
			FROM wall_links l
			WHERE l.wall_id = $1 AND l.active = TRUE
		`, wallID, wallSlug, ownerID))
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, stacktrace.Propagate(err, "")
	}
	if err == nil {
		if !rotate {
			return nil, ErrActiveLinkAlreadyExists
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM wall_link_sessions WHERE wall_id = $1`, wallID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE wall_links
			SET active = FALSE
			WHERE wall_id = $1 AND active = TRUE
		`, wallID); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
	}

	var reusedAuthKeyHash []byte
	err = tx.QueryRowContext(ctx, `
		SELECT auth_key_hash
		FROM wall_links
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
		INSERT INTO wall_links (wall_id, auth_key_hash, key_version, encrypted_wall_key, encrypted_access_key, active)
		VALUES ($1, $2, $3, $4, $5, TRUE)
		RETURNING wall_id, $6::text, $7::bigint, $6::text, auth_key_hash, key_version, encrypted_wall_key, encrypted_access_key, active, created_at, updated_at
	`, wallID, authKeyHash, keyVersion, encryptedWallKey, encryptedAccessKey, wallSlug, ownerID))
	if err != nil {
		if isUniqueViolationFor(err, "uq_wall_links_active_wall") {
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

func (r *LinksRepository) GetLink(ctx context.Context, wallID string) (*WallLinkRecord, error) {
	return scanLinkRecord(r.DB.QueryRowContext(ctx, `
		SELECT l.wall_id, w.wall_slug, w.owner_id, w.wall_slug, l.auth_key_hash, l.key_version, l.encrypted_wall_key, l.encrypted_access_key, l.active, l.created_at, l.updated_at
		FROM wall_links l
		JOIN walls w ON w.wall_id = l.wall_id
		WHERE l.wall_id = $1 AND l.active = TRUE
	`, wallID))
}

func (r *LinksRepository) DeleteLink(ctx context.Context, wallID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	if err := deleteLinkTx(ctx, tx, wallID); err != nil {
		return err
	}
	return stacktrace.Propagate(tx.Commit(), "")
}

func deleteLinkTx(ctx context.Context, tx *sql.Tx, wallID string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM wall_link_sessions WHERE wall_id = $1`, wallID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE wall_links SET active = FALSE WHERE wall_id = $1 AND active = TRUE`, wallID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	return nil
}

func (r *LinksRepository) GetLinkByAuthHash(ctx context.Context, wallID string, authHash []byte) (*WallLinkRecord, error) {
	return scanLinkRecord(r.DB.QueryRowContext(ctx, `
		SELECT l.wall_id, w.wall_slug, w.owner_id, w.wall_slug, l.auth_key_hash, l.key_version, l.encrypted_wall_key, l.encrypted_access_key, l.active, l.created_at, l.updated_at
		FROM wall_links l
		JOIN walls w ON w.wall_id = l.wall_id
		WHERE l.wall_id = $1 AND l.auth_key_hash = $2 AND l.active = TRUE
	`, wallID, authHash))
}

func (r *LinksRepository) CreateSession(ctx context.Context, tokenHash []byte, wallID string, authKeyHash []byte, keyVersion int, expiresAt int64) error {
	res, err := r.DB.ExecContext(ctx, `
		INSERT INTO wall_link_sessions (token_hash, wall_id, owner_id, auth_key_hash, key_version, expires_at)
		SELECT $1, l.wall_id, w.owner_id, l.auth_key_hash, l.key_version, $5
		FROM wall_links l
		JOIN walls w ON w.wall_id = l.wall_id
		WHERE l.wall_id = $2
		  AND l.auth_key_hash = $3
		  AND l.key_version = $4
		  AND l.active = TRUE
	`, tokenHash, wallID, authKeyHash, keyVersion, expiresAt)
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

func (r *LinksRepository) GetSession(ctx context.Context, tokenHash []byte) (*WallLinkSessionRecord, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT s.token_hash, s.wall_id, s.owner_id, s.auth_key_hash, s.key_version, s.expires_at, s.created_at,
		       w.wall_slug, w.wall_slug, l.encrypted_wall_key
		FROM wall_link_sessions s
		JOIN walls w ON w.wall_id = s.wall_id
		JOIN wall_links l ON l.wall_id = s.wall_id
		                 AND l.auth_key_hash = s.auth_key_hash
		                 AND l.key_version = s.key_version
		WHERE s.token_hash = $1 AND l.active = TRUE
	`, tokenHash)
	var rec WallLinkSessionRecord
	if err := row.Scan(&rec.TokenHash, &rec.WallID, &rec.OwnerID, &rec.AuthKeyHash, &rec.KeyVersion, &rec.ExpiresAt, &rec.CreatedAt, &rec.WallSlug, &rec.OwnerSlug, &rec.EncryptedWallKey); err != nil {
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
	_, err := r.DB.ExecContext(ctx, `DELETE FROM wall_link_sessions WHERE token_hash = $1`, tokenHash)
	return stacktrace.Propagate(err, "")
}

func scanLinkRecord(scanner interface{ Scan(dest ...any) error }) (*WallLinkRecord, error) {
	var rec WallLinkRecord
	if err := scanner.Scan(&rec.WallID, &rec.WallSlug, &rec.OwnerID, &rec.OwnerSlug, &rec.AuthKeyHash, &rec.KeyVersion, &rec.EncryptedWallKey, &rec.EncryptedAccessKey, &rec.Active, &rec.CreatedAt, &rec.UpdatedAt); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
