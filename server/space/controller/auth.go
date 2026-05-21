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
	spacerepo "github.com/ente-io/museum/space/repo"
	"github.com/ente-io/stacktrace"
	"github.com/gin-gonic/gin"
)

type viewerAuth struct {
	UserID  int64
	SpaceID string
	Link    *spacerepo.SpaceLinkSessionRecord
}

type authDeps struct {
	UserAuthRepo *baserepo.UserAuthRepository
	LinksRepo    *spacerepo.LinksRepository
	SpacesRepo   *spacerepo.SpacesRepository
	FriendsRepo  *spacerepo.FriendsRepository
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
			viewer := &viewerAuth{UserID: userID}
			if a.SpacesRepo != nil {
				space, err := a.SpacesRepo.GetDefaultSpaceByOwner(c.Request.Context(), userID)
				if err == nil {
					viewer.SpaceID = space.SpaceID
				} else if !errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
					return nil, err
				}
			}
			return viewer, nil
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

func (a authDeps) requireSpaceOwner(ctx context.Context, ownerID int64, spaceID string) (*spacerepo.SpaceRecord, error) {
	space, err := a.SpacesRepo.GetSpaceByID(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	if space.OwnerID != ownerID {
		return nil, ente.ErrPermissionDenied
	}
	return space, nil
}

func (a authDeps) requireDefaultSpace(ctx context.Context, ownerID int64) (*spacerepo.SpaceRecord, error) {
	space, err := a.SpacesRepo.GetDefaultSpaceByOwner(ctx, ownerID)
	if err != nil {
		if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
			return nil, ente.NewBadRequestWithMessage("space is missing")
		}
		return nil, err
	}
	return space, nil
}

func (a authDeps) requireLinkSession(ctx context.Context, token string) (*spacerepo.SpaceLinkSessionRecord, error) {
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

func (a authDeps) canViewSpace(ctx context.Context, viewer *viewerAuth, space *spacerepo.SpaceRecord) error {
	switch {
	case viewer == nil:
		return ente.ErrAuthenticationRequired
	case viewer.UserID > 0:
		if viewer.UserID == space.OwnerID {
			return nil
		}
		if strings.TrimSpace(viewer.SpaceID) == "" {
			return ente.ErrPermissionDenied
		}
		_, err := a.FriendsRepo.GetShareForFriendAndSpace(ctx, viewer.UserID, viewer.SpaceID, space.SpaceID)
		if err != nil {
			if errors.Is(stacktrace.RootCause(err), sql.ErrNoRows) {
				return ente.ErrPermissionDenied
			}
			return err
		}
		return nil
	case viewer.Link != nil:
		if viewer.Link.SpaceID != space.SpaceID {
			return ente.ErrPermissionDenied
		}
		return nil
	default:
		return ente.ErrAuthenticationRequired
	}
}
