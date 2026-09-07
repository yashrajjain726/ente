package repo

import (
	"database/sql"

	"github.com/ente/museum/ente"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sirupsen/logrus"
)

var fileCountComparisons = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "museum_file_count_comparisons_total",
	Help: "Same-snapshot comparisons of source and initialized file counts.",
}, []string{"reader", "app", "result"})

// Read with the source count in one statement so concurrent writes cannot cause
// false mismatches. NULL counters are not initialized and must not be compared.
type fileCountSnapshot struct {
	photos  sql.NullInt64
	locker  sql.NullInt64
	version sql.NullInt64
}

func (counts fileCountSnapshot) observe(reader string, userID int64, app ente.App, sourceCount int64) {
	if !counts.photos.Valid || !counts.locker.Valid {
		return
	}
	var counter int64
	switch app {
	case ente.Photos:
		counter = counts.photos.Int64
	case ente.Locker:
		counter = counts.locker.Int64
	default:
		return
	}
	result := "match"
	if counter != sourceCount {
		result = "mismatch"
		logrus.WithFields(logrus.Fields{
			"user_id":                   userID,
			"reader":                    reader,
			"app":                       app,
			"source_count":              sourceCount,
			"counter_count":             counter,
			"file_count_source_version": counts.version.Int64,
		}).Warn("file count mismatch")
	}
	fileCountComparisons.WithLabelValues(reader, string(app), result).Inc()
}
