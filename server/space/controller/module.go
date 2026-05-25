package controller

import (
	baserepo "github.com/ente-io/museum/pkg/repo"
	"github.com/ente-io/museum/space/repo"
)

type Module struct {
	Spaces   *SpacesController
	Posts    *PostsController
	Friends  *FriendsController
	Messages *MessagesController
	Links    *LinksController
	Assets   *AssetsController
	Read     *ReadMarkersController
	Cleanup  *CleanupController
	UserAuth *baserepo.UserAuthRepository
}

func NewModule(repos *repo.Module, userAuthRepo *baserepo.UserAuthRepository, emailNotifiers ...SpacePostEmailNotifier) *Module {
	var emailNotifier SpacePostEmailNotifier
	if len(emailNotifiers) > 0 {
		emailNotifier = emailNotifiers[0]
	}
	authDeps := authDeps{
		UserAuthRepo: userAuthRepo,
		LinksRepo:    repos.Links,
		SpacesRepo:   repos.Spaces,
		FriendsRepo:  repos.Friends,
	}
	return &Module{
		Spaces:   &SpacesController{SpacesRepo: repos.Spaces, AssetsRepo: repos.Assets, auth: authDeps},
		Posts:    &PostsController{PostsRepo: repos.Posts, SpacesRepo: repos.Spaces, FriendsRepo: repos.Friends, AssetsRepo: repos.Assets, ReadMarkersRepo: repos.Read, EmailNotifier: emailNotifier, auth: authDeps},
		Friends:  &FriendsController{FriendsRepo: repos.Friends, SpacesRepo: repos.Spaces, auth: authDeps},
		Messages: &MessagesController{MessagesRepo: repos.Messages, PostsRepo: repos.Posts, SpacesRepo: repos.Spaces, FriendsRepo: repos.Friends, ReadMarkersRepo: repos.Read, auth: authDeps},
		Links:    &LinksController{LinksRepo: repos.Links, SpacesRepo: repos.Spaces, auth: authDeps},
		Assets:   &AssetsController{AssetsRepo: repos.Assets, SpacesRepo: repos.Spaces, auth: authDeps},
		Read:     &ReadMarkersController{ReadMarkersRepo: repos.Read, PostsRepo: repos.Posts, MessagesRepo: repos.Messages, auth: authDeps},
		Cleanup:  &CleanupController{AssetsRepo: repos.Assets},
		UserAuth: userAuthRepo,
	}
}
