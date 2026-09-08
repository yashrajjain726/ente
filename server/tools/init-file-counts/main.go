package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ente/museum/pkg/repo"
	_ "github.com/lib/pq"
)

func main() {
	if err := run(); err != nil && !errors.Is(err, context.Canceled) {
		log.Fatal(err)
	}
}

func run() error {
	after := flag.Int64("after-user-id", 0, "exclusive lower user ID bound")
	before := flag.Int64("before-user-id", 0, "exclusive upper user ID bound (required)")
	timeout := flag.Duration("timeout", 10*time.Second, "maximum time per user")
	pause := flag.Duration("pause", time.Second, "pause between users")
	flag.Parse()
	if *after < 0 || *before <= *after || *timeout <= 0 || *pause < 0 || flag.NArg() != 0 {
		return fmt.Errorf("require 0 <= after-user-id < before-user-id, positive timeout and nonnegative pause")
	}
	if os.Getenv("PGDATABASE") == "" {
		return fmt.Errorf("PGDATABASE must identify the primary database; connection settings use PG* environment variables")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := sql.Open("postgres", "application_name=init-file-counts")
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	usageRepo := &repo.UsageRepository{DB: db}

	for lastUserID := *after; ; {
		attemptCtx, cancel := context.WithTimeout(ctx, *timeout)
		var userID int64
		err := db.QueryRowContext(attemptCtx, `SELECT user_id FROM usage
			WHERE user_id > $1 AND user_id < $2
				AND photos_file_count IS NULL AND locker_file_count IS NULL
			ORDER BY user_id LIMIT 1`, lastUserID, *before).Scan(&userID)
		if err != nil {
			cancel()
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		lastUserID = userID
		initialized, err := usageRepo.InitializeFileCounts(attemptCtx, userID)
		timedOut := errors.Is(attemptCtx.Err(), context.DeadlineExceeded)
		cancel()
		if err != nil {
			if !timedOut && !errors.Is(err, repo.ErrFileCountIneligible) {
				return fmt.Errorf("user %d: %w", userID, err)
			}
			log.Printf("user_id=%d skipped: %v", userID, err)
		} else {
			log.Printf("user_id=%d initialized=%t", userID, initialized)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(*pause):
		}
	}
}
