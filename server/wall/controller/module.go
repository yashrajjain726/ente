package controller

import (
	baserepo "github.com/ente-io/museum/pkg/repo"
	"github.com/ente-io/museum/wall/repo"
)

type Module struct {
	Walls    *WallsController
	Posts    *PostsController
	Friends  *FriendsController
	Messages *MessagesController
	Links    *LinksController
	Assets   *AssetsController
	Read     *ReadMarkersController
	Cleanup  *CleanupController
	UserAuth *baserepo.UserAuthRepository
}

func NewModule(repos *repo.Module, userAuthRepo *baserepo.UserAuthRepository) *Module {
	authDeps := authDeps{
		UserAuthRepo: userAuthRepo,
		LinksRepo:    repos.Links,
		WallsRepo:    repos.Walls,
		FriendsRepo:  repos.Friends,
	}
	return &Module{
		Walls:    &WallsController{WallsRepo: repos.Walls, AssetsRepo: repos.Assets, auth: authDeps},
		Posts:    &PostsController{PostsRepo: repos.Posts, WallsRepo: repos.Walls, AssetsRepo: repos.Assets, ReadMarkersRepo: repos.Read, auth: authDeps},
		Friends:  &FriendsController{FriendsRepo: repos.Friends, WallsRepo: repos.Walls, auth: authDeps},
		Messages: &MessagesController{MessagesRepo: repos.Messages, PostsRepo: repos.Posts, WallsRepo: repos.Walls, FriendsRepo: repos.Friends, ReadMarkersRepo: repos.Read, auth: authDeps},
		Links:    &LinksController{LinksRepo: repos.Links, WallsRepo: repos.Walls, auth: authDeps},
		Assets:   &AssetsController{AssetsRepo: repos.Assets, WallsRepo: repos.Walls, LinksRepo: repos.Links, auth: authDeps},
		Read:     &ReadMarkersController{ReadMarkersRepo: repos.Read, PostsRepo: repos.Posts, MessagesRepo: repos.Messages, auth: authDeps},
		Cleanup:  &CleanupController{AssetsRepo: repos.Assets},
		UserAuth: userAuthRepo,
	}
}
