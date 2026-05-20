package controller

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

const (
	spaceTempObjectCleanupBatchSize = 1000
	spaceTempObjectRetryDelay       = 24 * time.Hour
)

type CleanupController struct {
	AssetsRepo *spacerepo.AssetsRepository
}

func (c *CleanupController) StartRemovingUnreportedObjects() {
	workerCount := viper.GetInt("jobs.space-remove-unreported-objects.worker-count")
	if workerCount == 0 {
		workerCount = 1
	}

	log.Infof("Starting %d workers to space-remove-unreported-objects", workerCount)
	for i := 0; i < workerCount; i++ {
		go c.removeUnreportedObjectsWorker(i)
	}
}

func (c *CleanupController) removeUnreportedObjectsWorker(i int) {
	for {
		count := c.removeUnreportedObjects(context.Background())
		if count == 0 {
			time.Sleep(time.Duration(5+i) * time.Minute)
		} else {
			time.Sleep(time.Second)
		}
	}
}

func (c *CleanupController) removeUnreportedObjects(ctx context.Context) int {
	logger := log.WithField("task", "space-remove-unreported-objects")
	tx, tempObjects, err := c.AssetsRepo.GetAndLockExpiredTempObjects(ctx, timeutil.Microseconds(), spaceTempObjectCleanupBatchSize)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			logger.Error(err)
		}
		return 0
	}

	count := 0
	for _, tempObject := range tempObjects {
		if err := c.removeUnreportedObject(ctx, tx, tempObject); err != nil {
			continue
		}
		count++
	}
	if err := tx.Commit(); err != nil {
		logger.Error(stacktrace.Propagate(err, "failed to commit space temp object cleanup"))
		return count
	}
	if count > 0 {
		logger.Infof("Removed %d space temp objects", count)
	}
	return count
}

func (c *CleanupController) removeUnreportedObject(ctx context.Context, tx *sql.Tx, tempObject spacerepo.SpaceTempObjectRecord) error {
	logger := log.WithFields(log.Fields{
		"task":       "space-remove-unreported-objects",
		"object_key": tempObject.ObjectKey,
		"bucket_id":  tempObject.BucketID,
		"purpose":    tempObject.Purpose,
	})

	skip := func(err error) error {
		logger.Errorf("Clearing space temp object failed: %v", err)
		newExpiry := timeutil.Microseconds() + int64(spaceTempObjectRetryDelay/time.Microsecond)
		if serr := spacerepo.SetTempObjectExpiryTx(ctx, tx, tempObject.ObjectKey, newExpiry); serr != nil {
			logger.Errorf("Updating space temp object expiry failed: %v", serr)
		}
		return err
	}

	referenced, err := spacerepo.IsObjectReferencedTx(ctx, tx, tempObject.ObjectKey)
	if err != nil {
		return skip(stacktrace.Propagate(err, "failed to check space object reference"))
	}
	if !referenced {
		if err := c.deleteObject(tempObject); err != nil {
			return skip(err)
		}
	}
	if err := spacerepo.RemoveTempObjectTx(ctx, tx, tempObject.ObjectKey); err != nil {
		return skip(err)
	}
	return nil
}

func (c *CleanupController) deleteObject(tempObject spacerepo.SpaceTempObjectRecord) error {
	s3Client := c.AssetsRepo.S3Config.GetS3Client(tempObject.BucketID)
	_, err := s3Client.DeleteObject(&s3.DeleteObjectInput{
		Bucket: c.AssetsRepo.S3Config.GetBucket(tempObject.BucketID),
		Key:    aws.String(tempObject.ObjectKey),
	})
	return stacktrace.Propagate(err, "failed to delete space temp object from bucket %s", tempObject.BucketID)
}
