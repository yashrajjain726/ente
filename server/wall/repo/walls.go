package repo

import (
	"context"
	"database/sql"
	"strings"

	"github.com/ente-io/museum/ente/base"
	"github.com/ente-io/stacktrace"
)

func (r *WallsRepository) CreateWall(ctx context.Context, ownerID int64, wallSlug, encryptedWallKey, encryptedProfile string) (*WallRecord, error) {
	normalizedWallSlug, err := validateWallSlug(wallSlug)
	if err != nil {
		return nil, err
	}
	wallID := base.MustNewID("wal")
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO walls (wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version)
		VALUES ($1, $2, $3, $4, $5, 1)
	`, wallID, ownerID, normalizedWallSlug, encryptedWallKey, encryptedProfile); err != nil {
		return nil, wrapUnique(err, "wall already exists")
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO wall_key_versions (wall_id, version, encrypted_wall_key, encrypted_profile)
		VALUES ($1, 1, $2, $3)
	`, wallID, encryptedWallKey, encryptedProfile); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanWallRecord(tx.QueryRowContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls WHERE wall_id = $1
	`, wallID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *WallsRepository) ListWallsByOwner(ctx context.Context, ownerID int64) ([]WallRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls
		WHERE owner_id = $1
		ORDER BY created_at ASC
	`, ownerID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var walls []WallRecord
	for rows.Next() {
		rec, err := scanWallRecord(rows)
		if err != nil {
			return nil, err
		}
		walls = append(walls, *rec)
	}
	return walls, stacktrace.Propagate(rows.Err(), "")
}

func (r *WallsRepository) GetDefaultWallByOwner(ctx context.Context, ownerID int64) (*WallRecord, error) {
	return scanWallRecord(r.DB.QueryRowContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls
		WHERE owner_id = $1
		ORDER BY created_at ASC
		LIMIT 1
	`, ownerID))
}

func (r *WallsRepository) GetWallByID(ctx context.Context, wallID string) (*WallRecord, error) {
	return scanWallRecord(r.DB.QueryRowContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls
		WHERE wall_id = $1
	`, wallID))
}

func (r *WallsRepository) GetWallBySlug(ctx context.Context, wallSlug string) (*WallRecord, error) {
	return scanWallRecord(r.DB.QueryRowContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls
		WHERE wall_slug = $1
	`, normalizeSlug(wallSlug)))
}

func (r *WallsRepository) GetOwnerPublicKey(ctx context.Context, ownerID int64) (string, error) {
	var publicKey string
	err := r.DB.QueryRowContext(ctx, `
		SELECT public_key
		FROM key_attributes
		WHERE user_id = $1
	`, ownerID).Scan(&publicKey)
	return publicKey, stacktrace.Propagate(err, "")
}

func (r *WallsRepository) UpdateProfile(ctx context.Context, ownerID int64, wallID, encryptedProfile string, avatar *struct {
	ObjectKey string
	BucketID  string
	Size      int64
}, removeAvatar bool) (*WallRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	previous, err := scanWallRecord(tx.QueryRowContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls
		WHERE owner_id = $1 AND wall_id = $2
		FOR UPDATE
	`, ownerID, wallID))
	if err != nil {
		return nil, err
	}
	query := `
		UPDATE walls
		SET encrypted_profile = $1,
		    avatar_object_key = CASE WHEN $2 THEN NULL ELSE COALESCE($3, avatar_object_key) END,
		    avatar_bucket_id = CASE WHEN $2 THEN NULL ELSE COALESCE($4, avatar_bucket_id) END,
		    avatar_size = CASE WHEN $2 THEN NULL ELSE COALESCE($5, avatar_size) END
		WHERE owner_id = $6 AND wall_id = $7
		RETURNING wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
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
	rec, err := scanWallRecord(tx.QueryRowContext(ctx, query, encryptedProfile, removeAvatar, objectKey, bucketID, size, ownerID, wallID))
	if err != nil {
		return nil, err
	}
	if avatar != nil {
		if err := ConsumeTempObjectTx(ctx, tx, ownerID, avatar.ObjectKey, TempObjectPurposeAvatar, &wallID); err != nil {
			return nil, stacktrace.Propagate(err, "failed to consume staged wall avatar upload")
		}
	}
	if previous.AvatarObjectKey.Valid && previous.AvatarBucketID.Valid && (removeAvatar || (avatar != nil && previous.AvatarObjectKey.String != avatar.ObjectKey)) {
		size := int64(1)
		if previous.AvatarSize.Valid && previous.AvatarSize.Int64 > 0 {
			size = previous.AvatarSize.Int64
		}
		if err := QueueObjectCleanupTx(ctx, tx, WallTempObjectRecord{
			ObjectKey:    previous.AvatarObjectKey.String,
			OwnerID:      ownerID,
			WallID:       sql.NullString{String: wallID, Valid: true},
			Purpose:      TempObjectPurposeAvatar,
			BucketID:     previous.AvatarBucketID.String,
			ExpectedSize: size,
		}); err != nil {
			return nil, err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE wall_key_versions
		SET encrypted_profile = $1
		WHERE wall_id = $2 AND version = $3
	`, encryptedProfile, wallID, rec.CurrentVersion); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *WallsRepository) UpdateSlug(ctx context.Context, ownerID int64, wallID, wallSlug string) (*WallRecord, error) {
	normalizedWallSlug, err := validateWallSlug(wallSlug)
	if err != nil {
		return nil, err
	}
	rec, err := scanWallRecord(r.DB.QueryRowContext(ctx, `
		UPDATE walls
		SET wall_slug = $1
		WHERE owner_id = $2 AND wall_id = $3
		RETURNING wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		          avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
	`, normalizedWallSlug, ownerID, wallID))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key value") {
			return nil, stacktrace.Propagate(err, "wall slug already exists")
		}
		return nil, err
	}
	return rec, nil
}

func (r *WallsRepository) RotateKey(ctx context.Context, ownerID int64, wallID, encryptedWallKey, wrappedPrevKey string, encryptedProfile *string) (*WallRecord, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer tx.Rollback()
	current, err := scanWallRecord(tx.QueryRowContext(ctx, `
		SELECT wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		       avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
		FROM walls
		WHERE owner_id = $1 AND wall_id = $2
		FOR UPDATE
	`, ownerID, wallID))
	if err != nil {
		return nil, err
	}
	newProfile := current.EncryptedProfile
	if encryptedProfile != nil {
		newProfile = *encryptedProfile
	}
	newVersion := current.CurrentVersion + 1
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO wall_key_versions (wall_id, version, encrypted_wall_key, encrypted_profile, wrapped_prev_key)
		VALUES ($1, $2, $3, $4, $5)
	`, wallID, newVersion, encryptedWallKey, newProfile, strings.TrimSpace(wrappedPrevKey)); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	rec, err := scanWallRecord(tx.QueryRowContext(ctx, `
		UPDATE walls
		SET encrypted_wall_key = $1, encrypted_profile = $2, current_version = $3
		WHERE owner_id = $4 AND wall_id = $5
		RETURNING wall_id, owner_id, wall_slug, encrypted_wall_key, encrypted_profile, current_version,
		          avatar_object_key, avatar_bucket_id, avatar_size, created_at, updated_at
	`, encryptedWallKey, newProfile, newVersion, ownerID, wallID))
	if err != nil {
		return nil, err
	}
	if err := deleteLinkTx(ctx, tx, wallID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return rec, nil
}

func (r *WallsRepository) ListVersions(ctx context.Context, wallID string) ([]WallVersionRecord, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT wall_id, version, encrypted_wall_key, encrypted_profile, wrapped_prev_key, created_at
		FROM wall_key_versions
		WHERE wall_id = $1
		ORDER BY version DESC
	`, wallID)
	if err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	defer rows.Close()
	var versions []WallVersionRecord
	for rows.Next() {
		var rec WallVersionRecord
		if err := rows.Scan(&rec.WallID, &rec.Version, &rec.EncryptedWallKey, &rec.EncryptedProfile, &rec.WrappedPrevKey, &rec.CreatedAt); err != nil {
			return nil, stacktrace.Propagate(err, "")
		}
		versions = append(versions, rec)
	}
	return versions, stacktrace.Propagate(rows.Err(), "")
}

func (r *WallsRepository) GetVersion(ctx context.Context, wallID string, version int) (*WallVersionRecord, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT wall_id, version, encrypted_wall_key, encrypted_profile, wrapped_prev_key, created_at
		FROM wall_key_versions
		WHERE wall_id = $1 AND version = $2
	`, wallID, version)
	var rec WallVersionRecord
	if err := row.Scan(&rec.WallID, &rec.Version, &rec.EncryptedWallKey, &rec.EncryptedProfile, &rec.WrappedPrevKey, &rec.CreatedAt); err != nil {
		return nil, stacktrace.Propagate(err, "")
	}
	return &rec, nil
}

func scanWallRecord(scanner interface{ Scan(dest ...any) error }) (*WallRecord, error) {
	var rec WallRecord
	if err := scanner.Scan(
		&rec.WallID,
		&rec.OwnerID,
		&rec.WallSlug,
		&rec.EncryptedWallKey,
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
