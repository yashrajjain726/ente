package repo

import (
	"context"
	"database/sql"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
)

func (r *SpacesRepository) CreateSpace(ctx context.Context, ownerID int64, spaceSlug, encryptedSpaceKey, encryptedProfile string) (*SpaceRecord, error) {
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
		INSERT INTO spaces (space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version)
		VALUES ($1, $2, $3, $4, $5, 1)
	`, spaceID, ownerID, normalizedSpaceSlug, encryptedSpaceKey, encryptedProfile); err != nil {
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
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
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
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
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
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1
		ORDER BY created_at ASC
		LIMIT 1
	`, ownerID))
}

func (r *SpacesRepository) GetSpaceByID(ctx context.Context, spaceID string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM spaces
		WHERE space_id = $1
	`, spaceID))
}

func (r *SpacesRepository) GetSpaceBySlug(ctx context.Context, spaceSlug string) (*SpaceRecord, error) {
	return scanSpaceRecord(r.DB.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM spaces
		WHERE space_slug = $1
	`, normalizeSlug(spaceSlug)))
}

func (r *SpacesRepository) GetOwnerPublicKey(ctx context.Context, ownerID int64) (string, error) {
	var publicKey string
	err := r.DB.QueryRowContext(ctx, `
		SELECT public_key
		FROM key_attributes
		WHERE user_id = $1
	`, ownerID).Scan(&publicKey)
	return publicKey, stacktrace.Propagate(err, "")
}

func (r *SpacesRepository) UpdateProfile(ctx context.Context, ownerID int64, spaceID, encryptedProfile string, avatar *struct {
	ObjectKey string
	BucketID  string
	Size      int64
}, removeAvatar bool) (*SpaceRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	previous, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1 AND space_id = $2
		FOR UPDATE
	`, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	query := `
		UPDATE spaces
		SET encrypted_profile = $1,
		    avatar_object_key = CASE WHEN $2 THEN NULL ELSE COALESCE($3, avatar_object_key) END,
		    avatar_bucket_id = CASE WHEN $2 THEN NULL ELSE COALESCE($4, avatar_bucket_id) END,
		    avatar_size = CASE WHEN $2 THEN NULL ELSE COALESCE($5, avatar_size) END
		WHERE owner_id = $6 AND space_id = $7
		RETURNING space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		          avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
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
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, query, encryptedProfile, removeAvatar, objectKey, bucketID, size, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	if avatar != nil {
		if err := ConsumeTempObjectTx(ctx, tx, ownerID, avatar.ObjectKey, TempObjectPurposeAvatar, &spaceID); err != nil {
			return nil, stacktrace.Propagate(err, "failed to consume staged space avatar upload")
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
		          avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
	`, normalizedSpaceSlug, ownerID, spaceID))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key value") {
			return nil, wrapUnique(err, "space slug already exists")
		}
		return nil, err
	}
	return rec, nil
}

func (r *SpacesRepository) RotateKey(ctx context.Context, ownerID int64, spaceID, encryptedSpaceKey, wrappedPrevKey string, encryptedProfile *string) (*SpaceRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	current, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		SELECT space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM spaces
		WHERE owner_id = $1 AND space_id = $2
		FOR UPDATE
	`, ownerID, spaceID))
	if err != nil {
		return nil, err
	}
	newProfile := current.EncryptedProfile
	if encryptedProfile != nil {
		newProfile = *encryptedProfile
	}
	newVersion := current.CurrentVersion + 1
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO space_key_versions (space_id, version, encrypted_space_key, encrypted_profile, wrapped_prev_key)
		VALUES ($1, $2, $3, $4, $5)
	`, spaceID, newVersion, encryptedSpaceKey, newProfile, strings.TrimSpace(wrappedPrevKey)); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanSpaceRecord(tx.QueryRowContext(ctx, `
		UPDATE spaces
		SET encrypted_space_key = $1, encrypted_profile = $2, current_version = $3
		WHERE owner_id = $4 AND space_id = $5
		RETURNING space_id, owner_id, space_slug, encrypted_space_key, encrypted_profile, current_version,
		          avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
	`, encryptedSpaceKey, newProfile, newVersion, ownerID, spaceID))
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
		&rec.AvatarObjectKey,
		&rec.AvatarBucketID,
		&rec.AvatarSize,
		&rec.CreatedAt,
		&rec.UpdatedAt,
	); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}
