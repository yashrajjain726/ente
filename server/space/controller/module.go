package controller

import (
	baserepo "github.com/ente-io/museum/pkg/repo"
	"github.com/ente-io/museum/space/repo"
)

type Module struct {
	Spaces     *SpacesController
	Posts      *PostsController
	Friends    *FriendsController
	Messages   *MessagesController
	Links      *LinksController
	Assets     *AssetsController
	Read       *ReadMarkersController
	Sessions   *SessionsController
	EntityKeys *EntityKeysController
	Cleanup    *CleanupController
	UserAuth   *baserepo.UserAuthRepository
	UserTokens UserTokenTerminator
}

type UserTokenTerminator interface {
	TerminateSession(userID int64, token string) error
}

func NewModule(repos *repo.Module, userAuthRepo *baserepo.UserAuthRepository, emailNotifiers ...SpaceEmailNotifier) *Module {
	var emailNotifier SpaceEmailNotifier
	if len(emailNotifiers) > 0 {
		emailNotifier = emailNotifiers[0]
	}
	authDeps := authDeps{
		UserAuthRepo: userAuthRepo,
		LinksRepo:    repos.Links,
		SpacesRepo:   repos.Spaces,
		FriendsRepo:  repos.Friends,
		SessionsRepo: repos.Sessions,
	}
	return &Module{
		Spaces:     &SpacesController{SpacesRepo: repos.Spaces, AssetsRepo: repos.Assets, auth: authDeps},
		Posts:      &PostsController{PostsRepo: repos.Posts, SpacesRepo: repos.Spaces, FriendsRepo: repos.Friends, AssetsRepo: repos.Assets, EmailNotifier: emailNotifier, auth: authDeps},
		Friends:    &FriendsController{FriendsRepo: repos.Friends, SpacesRepo: repos.Spaces, EmailNotifier: emailNotifier, auth: authDeps},
		Messages:   &MessagesController{MessagesRepo: repos.Messages, PostsRepo: repos.Posts, SpacesRepo: repos.Spaces, FriendsRepo: repos.Friends, ReadMarkersRepo: repos.Read, EmailNotifier: emailNotifier, auth: authDeps},
		Links:      &LinksController{LinksRepo: repos.Links, SpacesRepo: repos.Spaces, auth: authDeps},
		Assets:     &AssetsController{AssetsRepo: repos.Assets, SpacesRepo: repos.Spaces, auth: authDeps},
		Read:       &ReadMarkersController{ReadMarkersRepo: repos.Read, MessagesRepo: repos.Messages, auth: authDeps},
		Sessions:   &SessionsController{SessionsRepo: repos.Sessions},
		EntityKeys: &EntityKeysController{EntityKeysRepo: repos.EntityKeys, auth: authDeps},
		Cleanup:    &CleanupController{AssetsRepo: repos.Assets},
		UserAuth:   userAuthRepo,
	}
}
