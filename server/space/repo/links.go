package repo

import (
	"context"
	"database/sql"
	"errors"

	"github.com/ente/stacktrace"
	"github.com/lib/pq"
)

var (
	ErrSpaceLinkSecretReused = errors.New("space link secret reused")
)

func isSpaceLinkUniqueViolation(err error, constraint string) bool {
	var pgErr *pq.Error
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.Constraint == constraint
}

func scanSpaceLink(scanner interface{ Scan(dest ...any) error }) (*SpaceLinkRecord, error) {
	var rec SpaceLinkRecord
	if err := scanner.Scan(
		&rec.LinkID,
		&rec.SpaceID,
		&rec.SpaceSlug,
		&rec.AuthKeyHash,
		&rec.KDFSalt,
		&rec.KDFMemLimit,
		&rec.KDFOpsLimit,
		&rec.KeyVersion,
		&rec.EncryptedSpaceKey,
		&rec.EncryptedAccessKey,
		&rec.Active,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

const spaceLinkSelect = `
	SELECT l.link_id, l.space_id, s.space_slug, l.auth_key_hash,
	       l.kdf_salt, l.kdf_mem_limit, l.kdf_ops_limit, l.key_version,
	       l.encrypted_space_key, l.encrypted_access_key, l.active,
	       l.created_at, l.updated_at
	FROM space_links l
	JOIN spaces s ON s.space_id = l.space_id
`

func (r *LinksRepository) GetActive(ctx context.Context, spaceID string) (*SpaceLinkRecord, error) {
	return scanSpaceLink(r.DB.QueryRowContext(ctx, spaceLinkSelect+`
		WHERE l.space_id = $1 AND l.active = TRUE
	`, spaceID))
}

func (r *LinksRepository) GetActiveBySlugAndAuthHash(ctx context.Context, slug string, authKeyHash []byte) (*SpaceLinkRecord, error) {
	return scanSpaceLink(r.DB.QueryRowContext(ctx, spaceLinkSelect+`
		JOIN users u ON u.user_id = s.owner_id AND u.encrypted_email IS NOT NULL
		WHERE s.space_slug = LOWER($1)
		  AND l.auth_key_hash = $2
		  AND l.active = TRUE
	`, slug, authKeyHash))
}

func (r *LinksRepository) GetActiveBootstrap(ctx context.Context, slug string) (*SpaceLinkRecord, error) {
	return scanSpaceLink(r.DB.QueryRowContext(ctx, spaceLinkSelect+`
		JOIN users u ON u.user_id = s.owner_id AND u.encrypted_email IS NOT NULL
		WHERE s.space_slug = LOWER($1) AND l.active = TRUE
	`, slug))
}

func (r *LinksRepository) Create(
	ctx context.Context,
	spaceID string,
	authKeyHash, kdfSalt []byte,
	kdfMemLimit, kdfOpsLimit int64,
	keyVersion int,
	encryptedSpaceKey, encryptedAccessKey []byte,
) (*SpaceLinkRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, spaceID).Scan(&currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}
	if existing, err := scanSpaceLink(tx.QueryRowContext(ctx, spaceLinkSelect+`
		WHERE l.space_id = $1 AND l.active = TRUE
	`, spaceID)); err == nil {
		return existing, nil
	} else if !errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
		return nil, err
	}

	var linkID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO space_links (
			space_id, auth_key_hash, kdf_salt, kdf_mem_limit, kdf_ops_limit,
			key_version, encrypted_space_key, encrypted_access_key
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING link_id
	`, spaceID, authKeyHash, kdfSalt, kdfMemLimit, kdfOpsLimit, keyVersion, encryptedSpaceKey, encryptedAccessKey).Scan(&linkID)
	if err != nil {
		if isSpaceLinkUniqueViolation(err, "space_links_auth_key_hash_key") {
			return nil, ErrSpaceLinkSecretReused
		}
		return nil, stacktrace.Propagate(err, "")
	}
	link, err := scanSpaceLink(tx.QueryRowContext(ctx, spaceLinkSelect+`
		WHERE l.link_id = $1
	`, linkID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return link, nil
}

func (r *LinksRepository) Rotate(
	ctx context.Context,
	spaceID string,
	authKeyHash, kdfSalt []byte,
	kdfMemLimit, kdfOpsLimit int64,
	keyVersion int,
	encryptedSpaceKey, encryptedAccessKey []byte,
) (*SpaceLinkRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM spaces
		WHERE space_id = $1
		FOR UPDATE
	`, spaceID).Scan(&currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE space_links
		SET active = FALSE
		WHERE space_id = $1 AND active = TRUE
	`, spaceID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	var linkID int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO space_links (
			space_id, auth_key_hash, kdf_salt, kdf_mem_limit, kdf_ops_limit,
			key_version, encrypted_space_key, encrypted_access_key
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING link_id
	`, spaceID, authKeyHash, kdfSalt, kdfMemLimit, kdfOpsLimit, keyVersion, encryptedSpaceKey, encryptedAccessKey).Scan(&linkID)
	if err != nil {
		if isSpaceLinkUniqueViolation(err, "space_links_auth_key_hash_key") {
			return nil, ErrSpaceLinkSecretReused
		}
		return nil, stacktrace.Propagate(err, "")
	}
	link, err := scanSpaceLink(tx.QueryRowContext(ctx, spaceLinkSelect+`
		WHERE l.link_id = $1
	`, linkID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return link, nil
}
