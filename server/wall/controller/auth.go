package controller

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"strings"

	"github.com/ente-io/museum/ente"
	baserepo "github.com/ente-io/museum/pkg/repo"
	"github.com/ente-io/museum/pkg/utils/auth"
	timeutil "github.com/ente-io/museum/pkg/utils/time"
	wallrepo "github.com/ente-io/museum/wall/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type viewerAuth struct {
	UserID int64
	Link   *wallrepo.WallLinkSessionRecord
}

type authDeps struct {
	UserAuthRepo *baserepo.UserAuthRepository
	LinksRepo    *wallrepo.LinksRepository
	WallsRepo    *wallrepo.WallsRepository
	FriendsRepo  *wallrepo.FriendsRepository
}

func (a authDeps) requireUser(c *gin.Context) (int64, error) {
	userID := auth.GetUserID(c.Request.Header)
	if userID <= 0 {
		return 0, ente.ErrAuthenticationRequired
	}
	return userID, nil
}

func (a authDeps) resolveViewer(c *gin.Context) (*viewerAuth, error) {
	token := auth.GetToken(c)
	if token == "" {
		return nil, ente.ErrAuthenticationRequired
	}
	if a.UserAuthRepo != nil {
		userID, expired, err := a.UserAuthRepo.GetUserIDWithToken(token, auth.GetApp(c))
		if err == nil && !expired && userID > 0 {
			return &viewerAuth{UserID: userID}, nil
		}
		if err != nil && !errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, err
		}
	}
	if a.LinksRepo == nil {
		return nil, ente.ErrAuthenticationRequired
	}
	sum := sha256.Sum256([]byte(token))
	session, err := a.LinksRepo.GetSession(c, sum[:])
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrAuthenticationRequired
		}
		return nil, err
	}
	if session.ExpiresAt <= timeutil.Microseconds() {
		_ = a.LinksRepo.DeleteSession(c, sum[:])
		return nil, ente.ErrAuthenticationRequired
	}
	return &viewerAuth{Link: session}, nil
}

func (a authDeps) requireWallOwner(ctx context.Context, ownerID int64, wallID string) (*wallrepo.WallRecord, error) {
	wall, err := a.WallsRepo.GetWallByID(ctx, wallID)
	if err != nil {
		return nil, err
	}
	if wall.OwnerID != ownerID {
		return nil, ente.ErrPermissionDenied
	}
	return wall, nil
}

func (a authDeps) requireLinkSession(ctx context.Context, token string) (*wallrepo.WallLinkSessionRecord, error) {
	token = strings.TrimSpace(token)
	if token == "" || a.LinksRepo == nil {
		return nil, ente.ErrAuthenticationRequired
	}
	sum := sha256.Sum256([]byte(token))
	session, err := a.LinksRepo.GetSession(ctx, sum[:])
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.ErrAuthenticationRequired
		}
		return nil, err
	}
	if session.ExpiresAt <= timeutil.Microseconds() {
		_ = a.LinksRepo.DeleteSession(ctx, sum[:])
		return nil, ente.ErrAuthenticationRequired
	}
	return session, nil
}

func (a authDeps) canViewWall(ctx context.Context, viewer *viewerAuth, wall *wallrepo.WallRecord) error {
	switch {
	case viewer == nil:
		return ente.ErrAuthenticationRequired
	case viewer.UserID > 0:
		if viewer.UserID == wall.OwnerID {
			return nil
		}
		_, err := a.FriendsRepo.GetShareForFriendAndWall(ctx, viewer.UserID, wall.WallID)
		if err != nil {
			if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
				return ente.ErrPermissionDenied
			}
			return err
		}
		return nil
	case viewer.Link != nil:
		if viewer.Link.WallID != wall.WallID {
			return ente.ErrPermissionDenied
		}
		return nil
	default:
		return ente.ErrAuthenticationRequired
	}
}
