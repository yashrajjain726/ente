package api

import "github.com/gin-gonic/gin"

func Register(privateAPI, publicAPI gin.IRouter, handlers *Handlers) {
	privateAPI.GET("/account/space", handlers.ListSpaces)
	privateAPI.POST("/account/space", handlers.CreateSpace)

	spaceAPI := privateAPI.Group("/spaces/:spaceID", handlers.RequireSelectedSpace())
	spaceAPI.POST("/profile", handlers.UpdateSpaceProfile)
	spaceAPI.PUT("/slug", handlers.UpdateSpaceSlug)
	spaceAPI.PATCH("/slug", handlers.UpdateSpaceSlug)
	spaceAPI.POST("/uploads/presign", handlers.PresignUpload)
	spaceAPI.GET("/unread", handlers.GetUnreadStatus)
	spaceAPI.POST("/posts", handlers.CreatePost)
	spaceAPI.GET("/feed", handlers.ListFeed)
	spaceAPI.POST("/posts/:postID/caption", handlers.UpdatePostCaption)
	spaceAPI.PATCH("/posts/:postID/caption", handlers.UpdatePostCaption)
	spaceAPI.POST("/posts/:postID/like", handlers.TogglePostLike)
	spaceAPI.POST("/posts/:postID/reply", handlers.ReplyToPost)
	spaceAPI.DELETE("/posts/:postID", handlers.DeletePost)
	spaceAPI.GET("/conversations", handlers.ListConversations)
	spaceAPI.POST("/messages/read", handlers.MarkNotificationsRead)
	spaceAPI.GET("/messages/:friendSpaceID", handlers.ListMessageThread)
	spaceAPI.POST("/messages/:friendSpaceID", handlers.CreateMessage)
	spaceAPI.POST("/message/:messageID/like", handlers.ToggleMessageLike)
	spaceAPI.DELETE("/message/:messageID", handlers.DeleteMessage)
	spaceAPI.POST("/friends/add", handlers.AddFriend)
	spaceAPI.GET("/friends/requests", handlers.ListFriendRequests)
	spaceAPI.POST("/friends/requests/:requestID/confirm", handlers.ConfirmFriendRequest)
	spaceAPI.DELETE("/friends/requests/:requestID", handlers.DeleteFriendRequest)
	spaceAPI.POST("/friends/unfriend", handlers.Unfriend)
	spaceAPI.GET("/friends", handlers.ListSpaceFriends)
	spaceAPI.GET("/friends/relationship", handlers.FriendRelationship)
	spaceAPI.POST("/friends/shares/refresh", handlers.RefreshFriendShares)
	spaceAPI.GET("/friends/shares", handlers.ListFriendShares)
	spaceAPI.POST("/rotate", handlers.RotateSpaceKey)
	spaceAPI.GET("/links", handlers.GetSpaceLink)
	spaceAPI.POST("/links", handlers.CreateSpaceLink)
	spaceAPI.POST("/links/rotate", handlers.RotateSpaceLink)
	spaceAPI.DELETE("/links", handlers.DeleteSpaceLink)

	publicAPI.GET("/space/profile", handlers.GetSpaceProfile)
	publicAPI.GET("/space/assets/redirect", handlers.AssetRedirect)
	publicAPI.GET("/space/posts", handlers.ListPosts)
	publicAPI.GET("/space/posts/:postID", handlers.GetPost)
	publicAPI.GET("/space/posts/:postID/likes", handlers.ListPostLikers)
	publicAPI.GET("/space/versions", handlers.ListSpaceKeyVersions)
	publicAPI.GET("/space/public/by-slug/:spaceSlug", handlers.LookupSpaceBySlug)
	publicAPI.GET("/space/public/slug-availability/:spaceSlug", handlers.SpaceSlugAvailability)
	publicAPI.POST("/space/links/session", handlers.SpaceLinkLogin)
	publicAPI.POST("/account/space/sessions/bootstrap", handlers.BootstrapBrowserSession)
	publicAPI.DELETE("/account/space/sessions/current", handlers.DeleteBrowserSession)
}

func RegisterTokenSessionRoutes(privateAPI gin.IRoutes, handlers *Handlers) {
	privateAPI.POST("/account/space/sessions", handlers.CreateBrowserSession)
}
