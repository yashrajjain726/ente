package controller

import (
	"context"
	"errors"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/ente/museum/pkg/controller/lock"
	"github.com/ente/museum/pkg/repo"
	timeUtil "github.com/ente/museum/pkg/utils/time"
	log "github.com/sirupsen/logrus"
)

type FileCountInitializer struct {
	UsageRepo      *repo.UsageRepository
	TrashRepo      *repo.TrashRepository
	LockController *lock.LockController
	afterUserID    int64
	resumeAt       time.Time
	running        atomic.Bool
}

const (
	fileCountInitializationBatchSize = 50
	fileCountInitializationLock      = "file_count_initialization"
)

func (c *FileCountInitializer) ProcessBatch() {
	if !c.running.CompareAndSwap(false, true) {
		return
	}
	defer c.running.Store(false)
	if time.Now().Before(c.resumeAt) {
		return
	}

	ctx := context.Background()
	userIDs, err := c.UsageRepo.GetFileCountInitializationCandidates(ctx, c.afterUserID, fileCountInitializationBatchSize)
	if err != nil {
		log.WithError(err).Error("Failed to fetch file count initialization candidates")
		return
	}
	if len(userIDs) == 0 {
		c.afterUserID = 0
		c.resumeAt = time.Now().Add(24 * time.Hour)
		return
	}

	initialized, deferred, ineligible, contended := 0, 0, 0, 0
	var retryAfterUserID int64
	for _, userID := range userIDs {
		previousUserID := c.afterUserID
		c.afterUserID = userID
		lockID := fileCountInitializationLock + ":" + strconv.FormatInt(userID, 10)
		if !c.LockController.TryLock(lockID, timeUtil.MicrosecondsAfterHours(3)) {
			if contended == 0 {
				retryAfterUserID = previousUserID
			}
			contended++
			continue
		}
		updated, err := func() (bool, error) {
			defer c.LockController.ReleaseLock(lockID)
			updated, err := c.UsageRepo.InitializeFileCounts(ctx, userID)
			var ineligibleErr *repo.FileCountIneligibleError
			if errors.As(err, &ineligibleErr) && ineligibleErr.StaleDeletedFileID != 0 {
				cleanupErr := c.TrashRepo.CleanUpDeletedFilesFromCollection(ctx, []int64{ineligibleErr.StaleDeletedFileID}, userID)
				if cleanupErr != nil {
					log.WithError(cleanupErr).WithFields(log.Fields{
						"user_id": userID,
						"file_id": ineligibleErr.StaleDeletedFileID,
					}).Error("Failed to clean stale deleted file membership")
				}
			}
			return updated, err
		}()
		if errors.Is(err, repo.ErrFileCountIneligible) {
			ineligible++
			log.WithError(err).WithField("user_id", userID).Warn("File count initialization ineligible")
			continue
		}
		if err != nil {
			log.WithError(err).WithField("user_id", userID).Error("Failed to initialize file counts")
			if contended > 0 {
				c.afterUserID = retryAfterUserID
			}
			return
		}
		if updated {
			initialized++
		} else {
			deferred++
		}
	}
	if contended > 0 {
		c.afterUserID = retryAfterUserID
	} else if len(userIDs) < fileCountInitializationBatchSize {
		c.afterUserID = 0
		c.resumeAt = time.Now().Add(24 * time.Hour)
	}
	log.WithFields(log.Fields{
		"attempted":    len(userIDs),
		"initialized":  initialized,
		"deferred":     deferred,
		"ineligible":   ineligible,
		"contended":    contended,
		"last_user_id": userIDs[len(userIDs)-1],
	}).Info("Processed file count initialization batch")
}
