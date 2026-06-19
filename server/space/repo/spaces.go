package repo

import (
	"context"
	"database/sql"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
)

func (r *SpacesRepository) CreateSpace(ctx context.Context, ownerID int64, spaceSlug, encryptedSpaceKey, publicKey, encryptedSecretKey, secretKeyDecryptionNonce, encryptedProfile string) (*SpaceRecord, error) {
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
		INSERT INTO spaces (space_id, owner_id, space_slug, encrypted_space_key, public_key, encrypted_secret_key, secret_key_decryption_nonce, encrypted_profile, current_version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
	`, spaceID, ownerID, normalizedSpaceSlug, encryptedSpaceKey, publicKey, encryptedSecretKey, secretKeyDecryptionNonce, encryptedProfile); err != nil {
		return nil, wrapUnique(err, "space already exists")
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_key_versions (space_id, version, encrypted_space_key, encrypted_profile)
		VALUES ($1, 1, $2, $3)
	`, spaceID, encryptedSpaceKey, encryptedProfile); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces WHERE space_id = $1
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
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1
		ORDER BY created_at ASC
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
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1
		ORDER BY created_at ASC
		LIMIT 1
	`, ownerID))
}

func (r *SpacesRepository) GetSpaceByID(ctx context.Context, spaceID string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces
		WHERE space_id = $1
	`, spaceID))
}

func (r *SpacesRepository) GetSpaceBySlug(ctx context.Context, spaceSlug string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces
		WHERE space_slug = $1
	`, normalizeSlug(spaceSlug)))
}

func (r *SpacesRepository) GetActiveSpaceBySlug(ctx context.Context, spaceSlug string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT w.space_id, w.owner_id, w.space_slug, w.encrypted_space_key, w.encrypted_profile, w.current_version,
		       w.public_key, w.encrypted_secret_key, w.secret_key_decryption_nonce,
		       w.avatar_object_key, w.avatar_bucket_id, w.avatar_size, w.cover_object_key, w.cover_bucket_id, w.cover_size, w.created_at, w.updated_at
		FROM spaces w
		JOIN users u ON u.user_id = w.owner_id AND u.encrypted_email IS NOT NULL
		WHERE w.space_slug = $1
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

func (r *SpacesRepository) GetOwnerPublicKey(ctx context.Context, ownerID int64) (string, error) {
	var publicKey string
	err := r.DB.QueryRowContext(ctx, `
		SELECT public_key
		FROM spaces
		WHERE owner_id = $1
		ORDER BY created_at ASC
		LIMIT 1
	`, ownerID).Scan(&publicKey)
	return publicKey, stacktrace.Propagate(err, "")
}

func (r *SpacesRepository) UpdateProfile(ctx context.Context, ownerID int64, spaceID string, keyVersion int, encryptedProfile string, avatar *ProfileAssetUpdate, cover *ProfileAssetUpdate, removeAvatar bool, removeCover bool) (*SpaceRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	previous, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1 AND space_id = $2
		FOR UPDATE
	`, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if previous.CurrentVersion != keyVersion {
		return nil, sql.ErrNoRows
	}
	query := `
		UPDATE spaces
		SET encrypted_profile = $1,
		    avatar_object_key = CASE WHEN $2 THEN NULL ELSE COALESCE($3, avatar_object_key) END,
		    avatar_bucket_id = CASE WHEN $2 THEN NULL ELSE COALESCE($4, avatar_bucket_id) END,
		    avatar_size = CASE WHEN $2 THEN NULL ELSE COALESCE($5, avatar_size) END,
		    cover_object_key = CASE WHEN $6 THEN NULL ELSE COALESCE($7, cover_object_key) END,
		    cover_bucket_id = CASE WHEN $6 THEN NULL ELSE COALESCE($8, cover_bucket_id) END,
		    cover_size = CASE WHEN $6 THEN NULL ELSE COALESCE($9, cover_size) END
		WHERE owner_id = $10 AND space_id = $11
		RETURNING space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		          public_key, encrypted_secret_key, secret_key_decryption_nonce,
		          avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
	`
	var objectKey, bucketID sql.NullString
	var size sql.NullInt64
	if avatar != nil {
		objectKey = nullString(avatar.ObjectKey)
		bucketID = nullString(avatar.BucketID)
		if avatar.Size > 0 {
			size = sql.NullInt64{Int64: avatar.Size, Valid: true}
		}
	}
	var coverObjectKey, coverBucketID sql.NullString
	var coverSize sql.NullInt64
	if cover != nil {
		coverObjectKey = nullString(cover.ObjectKey)
		coverBucketID = nullString(cover.BucketID)
		if cover.Size > 0 {
			coverSize = sql.NullInt64{Int64: cover.Size, Valid: true}
		}
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, query, encryptedProfile, removeAvatar, objectKey, bucketID, size, removeCover, coverObjectKey, coverBucketID, coverSize, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if avatar != nil {
		if err := ConsumeTempObjectTx(ctx, tx, ownerID, avatar.ObjectKey, TempObjectPurposeAvatar, &spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "failed to consume staged space avatar upload")
		}
	}
	if cover != nil {
		if err := ConsumeTempObjectTx(ctx, tx, ownerID, cover.ObjectKey, TempObjectPurposeCover, &spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "failed to consume staged space cover upload")
		}
	}
	if previous.AvatarObjectKey.Valid && previous.AvatarBucketID.Valid && (removeAvatar || (avatar != nil && previous.AvatarObjectKey.String != avatar.ObjectKey)) {
		size := int64(1)
		if previous.AvatarSize.Valid && previous.AvatarSize.Int64 > 0 {
			size = previous.AvatarSize.Int64
		}
		if err := QueueObjectCleanupTx(ctx, tx, SpaceTempObjectRecord{
			ObjectKey:    previous.AvatarObjectKey.String,
			OwnerID:      ownerID,
			SpaceID:      sql.NullString{String: spaceID, Valid: true},
			Purpose:      TempObjectPurposeAvatar,
			BucketID:     previous.AvatarBucketID.String,
			ExpectedSize: size,
		}); err != nil {
			return nil, err
		}
	}
	if previous.CoverObjectKey.Valid && previous.CoverBucketID.Valid && (removeCover || (cover != nil && previous.CoverObjectKey.String != cover.ObjectKey)) {
		size := int64(1)
		if previous.CoverSize.Valid && previous.CoverSize.Int64 > 0 {
			size = previous.CoverSize.Int64
		}
		if err := QueueObjectCleanupTx(ctx, tx, SpaceTempObjectRecord{
			ObjectKey:    previous.CoverObjectKey.String,
			OwnerID:      ownerID,
			SpaceID:      sql.NullString{String: spaceID, Valid: true},
			Purpose:      TempObjectPurposeCover,
			BucketID:     previous.CoverBucketID.String,
			ExpectedSize: size,
		}); err != nil {
			return nil, err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE space_key_versions
		SET encrypted_profile = $1
		WHERE space_id = $2 AND version = $3
	`, encryptedProfile, spaceID, rec.CurrentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
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
		UPDATE spaces
		SET space_slug = $1
		WHERE owner_id = $2 AND space_id = $3
		RETURNING space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		          public_key, encrypted_secret_key, secret_key_decryption_nonce,
		          avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
	`, normalizedSpaceSlug, ownerID, spaceID))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key value") {
			return nil, wrapUnique(err, "space slug already exists")
		}
		return nil, err
	}
	return rec, nil
}

func (r *SpacesRepository) RotateKey(ctx context.Context, ownerID int64, spaceID string, keyVersion int, encryptedSpaceKey, wrappedPrevKey, encryptedProfile string) (*SpaceRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	current, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       public_key, encrypted_secret_key, secret_key_decryption_nonce,
		       avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1 AND space_id = $2
		FOR UPDATE
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
	`, spaceID, newVersion, encryptedSpaceKey, encryptedProfile, strings.TrimSpace(wrappedPrevKey)); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		UPDATE spaces
		SET encrypted_space_key = $1, encrypted_profile = $2, current_version = $3
		WHERE owner_id = $4 AND space_id = $5
		RETURNING space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		          public_key, encrypted_secret_key, secret_key_decryption_nonce,
		          avatar_object_key, avatar_bucket_id, avatar_size, cover_object_key, cover_bucket_id, cover_size, created_at, updated_at
	`, encryptedSpaceKey, encryptedProfile, newVersion, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if err := deleteLinkTx(ctx, tx, spaceID); err != nil {
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
		&rec.SecretKeyDecryptionNonce,
		&rec.AvatarObjectKey,
		&rec.AvatarBucketID,
		&rec.AvatarSize,
		&rec.CoverObjectKey,
		&rec.CoverBucketID,
		&rec.CoverSize,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
