package repo

import (
	"context"
	"database/sql"

	"github.com/ente-io/stacktrace"
)

func (r *LinksRepository) UpsertLink(ctx context.Context, wallID string, authKeyHash []byte, keyVersion int, encryptedWallKey string) (*WallLinkRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM wall_link_sessions WHERE wall_id = $1`, wallID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	link, err := scanLinkRecord(tx.QueryRowContext(ctx, `
		INSERT INTO wall_links (wall_id, auth_key_hash, key_version, encrypted_wall_key, active)
		VALUES ($1, $2, $3, $4, TRUE)
		ON CONFLICT (wall_id) DO UPDATE
		SET auth_key_hash = EXCLUDED.auth_key_hash,
		    key_version = EXCLUDED.key_version,
		    encrypted_wall_key = EXCLUDED.encrypted_wall_key,
		    active = TRUE
		RETURNING wall_id, (SELECT wall_slug FROM walls WHERE wall_id = $1), (SELECT owner_id FROM walls WHERE wall_id = $1),
		          (SELECT wall_slug FROM walls WHERE wall_id = $1), auth_key_hash, key_version, encrypted_wall_key, active, created_at, updated_at
	`, wallID, authKeyHash, keyVersion, encryptedWallKey))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return link, nil
}

func (r *LinksRepository) GetLink(ctx context.Context, wallID string) (*WallLinkRecord, error) {
	return scanLinkRecord(r.DB.QueryRowContext(ctx, `
		SELECT l.wall_id, w.wall_slug, w.owner_id, w.wall_slug, l.auth_key_hash, l.key_version, l.encrypted_wall_key, l.active, l.created_at, l.updated_at
		FROM wall_links l
		JOIN walls w ON w.wall_id = l.wall_id
		WHERE l.wall_id = $1
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
	if _, err := tx.ExecContext(ctx, `DELETE FROM wall_links WHERE wall_id = $1`, wallID); err != nil {
		return stacktrace.Propagate(err, "")
	}
	return nil
}

func (r *LinksRepository) GetLinkByAuthHash(ctx context.Context, wallID string, authHash []byte) (*WallLinkRecord, error) {
	return scanLinkRecord(r.DB.QueryRowContext(ctx, `
		SELECT l.wall_id, w.wall_slug, w.owner_id, w.wall_slug, l.auth_key_hash, l.key_version, l.encrypted_wall_key, l.active, l.created_at, l.updated_at
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
		       w.wall_slug, owner_wall.wall_slug, l.encrypted_wall_key
		FROM wall_link_sessions s
		JOIN walls w ON w.wall_id = s.wall_id
		JOIN walls owner_wall ON owner_wall.owner_id = s.owner_id
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

func (r *LinksRepository) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM wall_link_sessions WHERE token_hash = $1`, tokenHash)
	return stacktrace.Propagate(err, "")
}

func scanLinkRecord(scanner interface{ Scan(dest ...any) error }) (*WallLinkRecord, error) {
	var rec WallLinkRecord
	if err := scanner.Scan(&rec.WallID, &rec.WallSlug, &rec.OwnerID, &rec.OwnerSlug, &rec.AuthKeyHash, &rec.KeyVersion, &rec.EncryptedWallKey, &rec.Active, &rec.CreatedAt, &rec.UpdatedAt); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
