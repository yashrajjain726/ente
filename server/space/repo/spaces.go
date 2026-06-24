package repo

import (
	"context"
	"database/sql"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
)

func (r *SpacesRepository) CreateSpace(ctx context.Context, ownerID int64, spaceSlug string, encryptedSpaceKey, publicKey, encryptedSecretKey, encryptedProfile []byte) (*SpaceRecord, error) {
	normalizedSpaceSlug, err := validateSpaceSlug(spaceSlug)
	if err != nil {
		return nil, err
	}
	spaceID := base.MustNewID("space")
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO spaces (space_id, owner_id, space_slug, encrypted_space_key, public_key, encrypted_secret_key, encrypted_profile, current_version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
	`, spaceID, ownerID, normalizedSpaceSlug, encryptedSpaceKey, publicKey, encryptedSecretKey, encryptedProfile); err != nil {
		return nil, wrapUnique(err, "space already exists")
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_key_versions (space_id, version, encrypted_space_key, encrypted_profile)
		VALUES ($1, 1, $2, $3)
	`, spaceID, encryptedSpaceKey, encryptedProfile); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.space_id = $1
	`, spaceID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *SpacesRepository) ListSpacesByOwner(ctx context.Context, ownerID int64) ([]SpaceRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.owner_id = $1
		ORDER BY s.created_at ASC
	`, ownerID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var spaces []SpaceRecord
	for rows.Next() {
		rec, err := scanSpaceRecord(rows)
		if err != nil {
			return nil, err
		}
		spaces = append(spaces, *rec)
	}
	return spaces, stacktrace.Propagate(rows.Err(), "")
}

func (r *SpacesRepository) GetDefaultSpaceByOwner(ctx context.Context, ownerID int64) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.owner_id = $1
		ORDER BY s.created_at ASC
		LIMIT 1
	`, ownerID))
}

func (r *SpacesRepository) GetSpaceByID(ctx context.Context, spaceID string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.space_id = $1
	`, spaceID))
}

func (r *SpacesRepository) GetSpaceBySlug(ctx context.Context, spaceSlug string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.space_slug = $1
	`, normalizeSlug(spaceSlug)))
}

func (r *SpacesRepository) GetActiveSpaceBySlug(ctx context.Context, spaceSlug string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		JOIN users u ON u.user_id = s.owner_id AND u.encrypted_email IS NOT NULL
		WHERE s.space_slug = $1
	`, normalizeSlug(spaceSlug)))
}

func (r *SpacesRepository) IsOwnerActive(ctx context.Context, ownerID int64) (bool, error) {
	var active bool
	err := r.DB.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE user_id = $1 AND encrypted_email IS NOT NULL
		)
	`, ownerID).Scan(&active)
	return active, stacktrace.Propagate(err, "")
}

func (r *SpacesRepository) GetOwnerPublicKey(ctx context.Context, ownerID int64) ([]byte, error) {
	var publicKey []byte
	err := r.DB.QueryRowContext(ctx, `
		SELECT public_key
		FROM spaces
		WHERE owner_id = $1
		ORDER BY created_at ASC
		LIMIT 1
	`, ownerID).Scan(&publicKey)
	return publicKey, stacktrace.Propagate(err, "")
}

func (r *SpacesRepository) UpdateProfile(ctx context.Context, ownerID int64, spaceID string, keyVersion int, encryptedProfile []byte, avatar *ProfileAssetUpdate, cover *ProfileAssetUpdate, removeAvatar bool, removeCover bool) (*SpaceRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var currentVersion int
	if err := tx.QueryRowContext(ctx, `
		SELECT current_version
		FROM spaces
		WHERE owner_id = $1 AND space_id = $2
		FOR UPDATE
	`, ownerID, spaceID).Scan(&currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if currentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}
	previousAssets, err := getProfileAssetsForUpdateTx(ctx, tx, spaceID)
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE spaces
		SET encrypted_profile = $1
		WHERE owner_id = $2 AND space_id = $3
	`, encryptedProfile, ownerID, spaceID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if err := updateProfileAssetTx(ctx, tx, ownerID, spaceID, ProfileAssetTypeAvatar, avatar, removeAvatar, previousAssets[ProfileAssetTypeAvatar]); err != nil {
		return nil, err
	}
	if err := updateProfileAssetTx(ctx, tx, ownerID, spaceID, ProfileAssetTypeCover, cover, removeCover, previousAssets[ProfileAssetTypeCover]); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE space_key_versions
		SET encrypted_profile = $1
		WHERE space_id = $2 AND version = $3
	`, encryptedProfile, spaceID, currentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.owner_id = $1 AND s.space_id = $2
	`, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *SpacesRepository) UpdateSlug(ctx context.Context, ownerID int64, spaceID, spaceSlug string) (*SpaceRecord, error) {
	normalizedSpaceSlug, err := validateSpaceSlug(spaceSlug)
	if err != nil {
		return nil, err
	}
	rec, err := scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		WITH updated AS (
			UPDATE spaces
			SET space_slug = $1
			WHERE owner_id = $2 AND space_id = $3
			RETURNING space_id
		)
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		JOIN updated u ON u.space_id = s.space_id
		`+spaceRecordProfileAssetJoins+`
	`, normalizedSpaceSlug, ownerID, spaceID))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key value") {
			return nil, wrapUnique(err, "space slug already exists")
		}
		return nil, err
	}
	return rec, nil
}

func (r *SpacesRepository) RotateKey(ctx context.Context, ownerID int64, spaceID string, keyVersion int, encryptedSpaceKey, wrappedPrevKey, encryptedProfile []byte) (*SpaceRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	var lockedSpaceID string
	if err := tx.QueryRowContext(ctx, `SELECT space_id FROM spaces WHERE owner_id = $1 AND space_id = $2 FOR UPDATE`, ownerID, spaceID).Scan(&lockedSpaceID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	current, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.owner_id = $1 AND s.space_id = $2
	`, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if current.CurrentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}
	newVersion := current.CurrentVersion + 1
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_key_versions (space_id, version, encrypted_space_key, encrypted_profile, wrapped_prev_key)
		VALUES ($1, $2, $3, $4, $5)
	`, spaceID, newVersion, encryptedSpaceKey, encryptedProfile, wrappedPrevKey); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE spaces
		SET encrypted_space_key = $1, encrypted_profile = $2, current_version = $3
		WHERE owner_id = $4 AND space_id = $5
	`, encryptedSpaceKey, encryptedProfile, newVersion, ownerID, spaceID); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if err := deleteLinkTx(ctx, tx, spaceID); err != nil {
		return nil, err
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT `+spaceRecordSelectColumns+`
		FROM spaces s
		`+spaceRecordProfileAssetJoins+`
		WHERE s.owner_id = $1 AND s.space_id = $2
	`, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *SpacesRepository) ListVersions(ctx context.Context, spaceID string) ([]SpaceVersionRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT space_id, version, encrypted_space_key, encrypted_profile, wrapped_prev_key, created_at
		FROM space_key_versions
		WHERE space_id = $1
		ORDER BY version DESC
	`, spaceID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var versions []SpaceVersionRecord
	for rows.Next() {
		var rec SpaceVersionRecord
		if err := rows.Scan(&rec.SpaceID, &rec.Version, &rec.EncryptedSpaceKey, &rec.EncryptedProfile, &rec.WrappedPrevKey, &rec.CreatedAt); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		versions = append(versions, rec)
	}
	return versions, stacktrace.Propagate(rows.Err(), "")
}

func (r *SpacesRepository) GetVersion(ctx context.Context, spaceID string, version int) (*SpaceVersionRecord, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT space_id, version, encrypted_space_key, encrypted_profile, wrapped_prev_key, created_at
		FROM space_key_versions
		WHERE space_id = $1 AND version = $2
	`, spaceID, version)
	var rec SpaceVersionRecord
	if err := row.Scan(&rec.SpaceID, &rec.Version, &rec.EncryptedSpaceKey, &rec.EncryptedProfile, &rec.WrappedPrevKey, &rec.CreatedAt); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func scanSpaceRecord(scanner interface{ Scan(dest ...any) error }) (*SpaceRecord, error) {
	var rec SpaceRecord
	if err := scanner.Scan(
		&rec.SpaceID,
		&rec.OwnerID,
		&rec.SpaceSlug,
		&rec.EncryptedSpaceKey,
		&rec.EncryptedProfile,
		&rec.CurrentVersion,
		&rec.PublicKey,
		&rec.EncryptedSecretKey,
		&rec.AvatarObjectID,
		&rec.AvatarBucketID,
		&rec.AvatarSize,
		&rec.CoverObjectID,
		&rec.CoverBucketID,
		&rec.CoverSize,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
