package controller

import (
	baserepo "github.com/ente-io/museum/pkg/repo"
	"github.com/ente-io/museum/wall/repo"
)

type Module struct {
	Walls    *WallsController
	Posts    *PostsController
	Follow   *FollowController
	Links    *LinksController
	Assets   *AssetsController
	Cleanup  *CleanupController
	UserAuth *baserepo.UserAuthRepository
}

func NewModule(repos *repo.Module, userAuthRepo *baserepo.UserAuthRepository) *Module {
	authDeps := authDeps{
		UserAuthRepo: userAuthRepo,
		LinksRepo:    repos.Links,
		WallsRepo:    repos.Walls,
		FollowRepo:   repos.Follow,
	}
	return &Module{
		Walls:    &WallsController{WallsRepo: repos.Walls, AssetsRepo: repos.Assets, auth: authDeps},
		Posts:    &PostsController{PostsRepo: repos.Posts, WallsRepo: repos.Walls, FollowRepo: repos.Follow, AssetsRepo: repos.Assets, auth: authDeps},
		Follow:   &FollowController{FollowRepo: repos.Follow, WallsRepo: repos.Walls, auth: authDeps},
		Links:    &LinksController{LinksRepo: repos.Links, WallsRepo: repos.Walls, auth: authDeps},
		Assets:   &AssetsController{AssetsRepo: repos.Assets, WallsRepo: repos.Walls, FollowRepo: repos.Follow, LinksRepo: repos.Links, auth: authDeps},
		Cleanup:  &CleanupController{AssetsRepo: repos.Assets},
		UserAuth: userAuthRepo,
	}
}
