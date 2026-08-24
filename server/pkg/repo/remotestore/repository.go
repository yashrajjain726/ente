package remotestore

import (
	"context"
	"database/sql"
	"errors"

	"github.com/ente/museum/ente"
	"github.com/lib/pq"
	log "github.com/sirupsen/logrus"

	"github.com/ente/stacktrace"
)

type Repository struct {
	DB *sql.DB
}

func (r *Repository) InsertOrUpdate(ctx context.Context, userID int64, key string, value string) error {
	return r.insertOrUpdate(ctx, userID, key, value, nil)
}

func (r *Repository) InsertOrUpdateCustomDomain(ctx context.Context, userID int64, value string) error {
	canonicalDomain, err := ente.CanonicalDomain(value)
	if err != nil {
		return stacktrace.Propagate(err, "failed to canonicalize custom domain")
	}
	return r.insertOrUpdate(ctx, userID, string(ente.CustomDomain), value, &canonicalDomain)
}

func (r *Repository) BackfillCustomDomainCanonicalValues(ctx context.Context) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return stacktrace.Propagate(err, "failed to begin custom domain backfill")
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, `SELECT user_id, key_value, canonical_value FROM remote_store
		WHERE key_name = $1 AND left(key_value, 1) <> '_' FOR UPDATE`, ente.CustomDomain)
	if err != nil {
		return stacktrace.Propagate(err, "failed to fetch custom domains")
	}
	defer rows.Close()

	type domainRow struct {
		userID         int64
		value          string
		current        sql.NullString
		canonicalValue string
	}
	var domains []*domainRow
	domainsByCanonicalValue := make(map[string][]*domainRow)
	for rows.Next() {
		domain := &domainRow{}
		if err := rows.Scan(&domain.userID, &domain.value, &domain.current); err != nil {
			return stacktrace.Propagate(err, "failed to scan custom domain")
		}
		domains = append(domains, domain)
	}
	if err := rows.Err(); err != nil {
		return stacktrace.Propagate(err, "failed to read custom domains")
	}
	if err := rows.Close(); err != nil {
		return stacktrace.Propagate(err, "failed to close custom domain rows")
	}

	for _, domain := range domains {
		if err := ente.ValidatePublicCustomDomain(domain.value); err != nil {
			log.WithField("user_id", domain.userID).WithError(err).Warn("Skipping invalid custom domain during backfill")
			continue
		}
		canonicalDomain, err := ente.CanonicalDomain(domain.value)
		if err != nil {
			log.WithField("user_id", domain.userID).WithError(err).Warn("Skipping invalid custom domain during backfill")
			continue
		}
		domain.canonicalValue = canonicalDomain
		domainsByCanonicalValue[canonicalDomain] = append(domainsByCanonicalValue[canonicalDomain], domain)
	}
	for _, group := range domainsByCanonicalValue {
		if len(group) == 1 {
			continue
		}
		userIDs := make([]int64, len(group))
		for i, domain := range group {
			userIDs[i] = domain.userID
			domain.canonicalValue = ""
		}
		log.WithField("user_ids", userIDs).Warn("Skipping colliding custom domains during backfill")
	}

	for _, domain := range domains {
		if domain.current.Valid && domain.current.String != domain.canonicalValue {
			if _, err := tx.ExecContext(ctx, `UPDATE remote_store SET canonical_value = NULL
				WHERE user_id = $1 AND key_name = $2`, domain.userID, ente.CustomDomain); err != nil {
				return stacktrace.Propagate(err, "failed to clear stale custom domain")
			}
		}
	}
	for _, domain := range domains {
		if domain.canonicalValue == "" || domain.current.Valid && domain.current.String == domain.canonicalValue {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE remote_store SET canonical_value = $1
			WHERE user_id = $2 AND key_name = $3 AND canonical_value IS DISTINCT FROM $1`,
			domain.canonicalValue, domain.userID, ente.CustomDomain); err != nil {
			return stacktrace.Propagate(err, "failed to backfill custom domain")
		}
	}
	return stacktrace.Propagate(tx.Commit(), "failed to commit custom domain backfill")
}

func (r *Repository) insertOrUpdate(ctx context.Context, userID int64, key string, value string, canonicalValue *string) error {
	_, err := r.DB.ExecContext(ctx, `INSERT INTO remote_store(user_id, key_name, key_value, canonical_value) VALUES ($1,$2,$3,$4)
						 ON CONFLICT (user_id, key_name) DO UPDATE SET key_value = $3, canonical_value = $4;
						 `,
		userID,
		key,
		value,
		canonicalValue,
	)

	if err != nil {
		var pgErr *pq.Error
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if pgErr.Constraint == "remote_store_custom_domain_unique_idx" || pgErr.Constraint == "remote_store_custom_domain_canonical_unique_idx" {
				return ente.NewConflictError("custom domain already exists for another user")
			}
		}
		return stacktrace.Propagate(err, "failed to insert/update")
	}
	return nil
}

func (r *Repository) RemoveKey(ctx context.Context, userID int64, key string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM remote_store
		WHERE user_id = $1 AND key_name = $2`,
		userID,
		key,
	)
	return stacktrace.Propagate(err, "failed to remove key")
}

func (r *Repository) DomainOwner(ctx context.Context, domain string) (*int64, error) {
	canonicalDomain, err := ente.CanonicalDomain(domain)
	if err != nil {
		return nil, stacktrace.Propagate(err, "failed to canonicalize custom domain")
	}
	rows := r.DB.QueryRowContext(ctx, `SELECT user_id FROM remote_store
	   WHERE key_name = $1 AND (canonical_value = $2 OR lower(key_value) = lower($3))`,
		ente.CustomDomain,
		canonicalDomain,
		domain,
	)
	var userID int64
	err = rows.Scan(&userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, stacktrace.Propagate(&ente.ErrNotFoundError, "")
		}
		return nil, stacktrace.Propagate(err, "failed to fetch domain owner")
	}
	return &userID, nil
}

func (r *Repository) GetDomain(ctx context.Context, userID int64) (*string, error) {
	rows := r.DB.QueryRowContext(ctx, `SELECT key_value FROM remote_store
	   WHERE user_id = $1 AND key_name = $2`,
		userID,
		ente.CustomDomain,
	)
	var domain string
	err := rows.Scan(&domain)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, stacktrace.Propagate(err, "failed to fetch custom domain")
	}
	return &domain, nil

}

func (r *Repository) GetEffectiveDomain(ctx context.Context, userID int64) (*string, error) {
	domain, err := r.GetDomain(ctx, userID)
	if err != nil || domain == nil || *domain == "" {
		return domain, err
	}
	resolved, resolveErr := ente.ResolveCustomDomainValue(*domain)
	if resolveErr != nil {
		return nil, stacktrace.Propagate(resolveErr, "failed to resolve custom domain")
	}
	return &resolved, nil
}

func (r *Repository) GetValue(ctx context.Context, userID int64, key string) (string, error) {
	rows := r.DB.QueryRowContext(ctx, `SELECT key_value FROM remote_store
	   WHERE user_id = $1
	   and key_name = $2`,
		userID,
		key,
	)
	var keyValue string
	err := rows.Scan(&keyValue)
	if err != nil {
		return keyValue, stacktrace.Propagate(err, "reading value failed")
	}
	return keyValue, nil
}

func (r *Repository) GetAllValues(ctx context.Context, userID int64) (map[string]string, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT key_name, key_value FROM remote_store
	   WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, stacktrace.Propagate(err, "reading value failed")
	}
	defer rows.Close()
	values := make(map[string]string)
	for rows.Next() {
		var key, value string
		err := rows.Scan(&key, &value)
		if err != nil {
			return nil, stacktrace.Propagate(err, "reading value failed")
		}
		values[key] = value
	}
	return values, nil
}
