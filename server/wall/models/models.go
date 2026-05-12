package models

type AssetRedirectRequest struct {
	WallID    string `form:"wallId" binding:"required"`
	ObjectKey string `form:"objectKey" binding:"required"`
}

type ListWallsRequest struct {
	OwnerID *int64 `form:"ownerId"`
}

type GetWallProfileRequest struct {
	WallID  string `form:"wallId" binding:"required"`
	Version *int   `form:"version"`
}

type ListPostsRequest struct {
	WallID  string `form:"wallId" binding:"required"`
	Cursor  string `form:"cursor"`
	Limit   int    `form:"limit"`
	Include string `form:"include"`
}

type ListFeedRequest struct {
	Cursor string `form:"cursor"`
	Limit  int    `form:"limit"`
}

type ListNotificationsRequest struct {
	Cursor string `form:"cursor"`
	Limit  int    `form:"limit"`
}

type ListWallFriendsRequest struct {
	WallID string `form:"wallId"`
}

type WallKeyResponse struct {
	WallID           string `json:"wallId"`
	WallSlug         string `json:"wallSlug"`
	EncryptedWallKey string `json:"encryptedWallKey"`
	EncryptedProfile string `json:"encryptedProfile,omitempty"`
	KeyVersion       int    `json:"keyVersion"`
}

type PresignUploadRequest struct {
	Size    int64   `json:"size" binding:"required"`
	Purpose *string `json:"purpose,omitempty"`
	WallID  *string `json:"wallId,omitempty"`
}

type PresignUploadResponse struct {
	URL       string            `json:"url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	ObjectKey string            `json:"objectKey"`
	ExpiresIn int               `json:"expiresIn"`
}

type AssetDownloadResponse struct {
	URL       string `json:"url"`
	ExpiresIn int    `json:"expiresIn"`
}

type ProfileAvatarPayload struct {
	ObjectKey string `json:"objectKey"`
	Size      int64  `json:"size,omitempty"`
}

type ProfileAvatarResponse struct {
	ObjectKey string `json:"objectKey"`
	Size      int64  `json:"size,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type WallLinkCreateRequest struct {
	WallID           string `json:"wallId"`
	AuthKey          string `json:"authKey"`
	KeyVersion       int    `json:"keyVersion"`
	EncryptedWallKey string `json:"encryptedWallKey"`
}

type WallLinkStatusResponse struct {
	WallID     string `json:"wallId"`
	WallSlug   string `json:"wallSlug"`
	KeyVersion int    `json:"keyVersion"`
	Active     bool   `json:"active"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type WallLinkLoginRequest struct {
	WallID  string `json:"wallId"`
	AuthKey string `json:"authKey"`
}

type WallLinkLoginResponse struct {
	SessionToken     string `json:"sessionToken"`
	WallID           string `json:"wallId"`
	WallSlug         string `json:"wallSlug"`
	Owner            string `json:"owner"`
	PublicKey        string `json:"publicKey,omitempty"`
	KeyVersion       int    `json:"keyVersion"`
	EncryptedWallKey string `json:"encryptedWallKey"`
}

type AddFriendPayload struct {
	TargetWallID              string `json:"targetWallId"`
	LinkSessionToken          string `json:"linkSessionToken"`
	RequesterWallID           string `json:"requesterWallId"`
	TargetEncryptedWallKey    string `json:"targetEncryptedWallKey"`
	TargetKeyVersion          int    `json:"targetKeyVersion"`
	RequesterEncryptedWallKey string `json:"requesterEncryptedWallKey"`
	RequesterKeyVersion       int    `json:"requesterKeyVersion"`
}

type FriendTargetPayload struct {
	TargetUsername *string `json:"targetUsername,omitempty"`
	TargetWallID   *string `json:"targetWallId,omitempty"`
}

type FriendShareResponse struct {
	Friend           string `json:"friend"`
	WallID           string `json:"wallId"`
	WallSlug         string `json:"wallSlug"`
	EncryptedWallKey string `json:"encryptedWallKey"`
	KeyVersion       int    `json:"keyVersion"`
}

type FriendStatusResponse struct {
	Status string `json:"status"`
}

type UpdateWallProfileRequest struct {
	WallID           string                `json:"wallId"`
	EncryptedProfile string                `json:"encryptedProfile"`
	Avatar           *ProfileAvatarPayload `json:"avatar,omitempty"`
	RemoveAvatar     bool                  `json:"removeAvatar,omitempty"`
}

type UpdateWallProfileResponse struct {
	Status string                 `json:"status"`
	Avatar *ProfileAvatarResponse `json:"avatar,omitempty"`
}

type CreateWallRequest struct {
	WallSlug         string `json:"wallSlug"`
	EncryptedWallKey string `json:"encryptedWallKey"`
	EncryptedProfile string `json:"encryptedProfile"`
}

type WallProfileResponse struct {
	WallID           string                 `json:"wallId"`
	WallSlug         string                 `json:"wallSlug"`
	Version          int                    `json:"version"`
	EncryptedProfile string                 `json:"encryptedProfile,omitempty"`
	UpdatedAt        string                 `json:"updatedAt,omitempty"`
	Avatar           *ProfileAvatarResponse `json:"avatar,omitempty"`
}

type UpdateWallSlugRequest struct {
	WallSlug string `json:"wallSlug"`
}

type WallLookupResponse struct {
	WallID    string `json:"wallId"`
	WallSlug  string `json:"wallSlug"`
	Owner     string `json:"owner"`
	PublicKey string `json:"publicKey,omitempty"`
}

type RotateWallKeyRequest struct {
	WallID           string  `json:"wallId"`
	EncryptedWallKey string  `json:"encryptedWallKey"`
	WrappedPrevKey   string  `json:"wrappedPrevKey"`
	EncryptedProfile *string `json:"encryptedProfile,omitempty"`
}

type WallKeyVersionResponse struct {
	Version        int    `json:"version"`
	WrappedPrevKey string `json:"wrappedPrevKey,omitempty"`
	CreatedAt      string `json:"createdAt"`
}

type WallFriendResponse struct {
	FriendID         int64                  `json:"friendId"`
	WallID           string                 `json:"wallId"`
	Username         string                 `json:"username"`
	PublicKey        string                 `json:"publicKey"`
	KeyVersion       int                    `json:"keyVersion"`
	EncryptedProfile string                 `json:"encryptedProfile,omitempty"`
	Avatar           *ProfileAvatarResponse `json:"avatar,omitempty"`
	Friends          int64                  `json:"friends"`
	Posts            int64                  `json:"posts"`
	CreatedAt        string                 `json:"createdAt"`
}

type RefreshFriendSharesRequest struct {
	WallID     string               `json:"wallId"`
	KeyVersion int                  `json:"keyVersion"`
	Shares     []ShareUpdatePayload `json:"shares"`
}

type ShareUpdatePayload struct {
	FriendID         int64  `json:"friendId"`
	EncryptedWallKey string `json:"encryptedWallKey"`
}

type CreatePostRequest struct {
	WallID           string              `json:"wallId"`
	EncryptedPostKey string              `json:"encryptedPostKey"`
	KeyVersion       int                 `json:"keyVersion"`
	CaptionCipher    *string             `json:"captionCipher,omitempty"`
	Objects          []PostObjectPayload `json:"objects"`
}

type CreatePostResponse struct {
	PostID int64 `json:"postId"`
}

type LikePostRequest struct {
	Like bool `json:"like"`
}

type LikePostResponse struct {
	Liked bool `json:"liked"`
}

type LikeCommentRequest struct {
	Like bool `json:"like"`
}

type LikeCommentResponse struct {
	Liked bool `json:"liked"`
}

type UpdatePostCaptionRequest struct {
	CaptionCipher *string `json:"captionCipher,omitempty"`
}

type PostObjectPayload struct {
	ObjectKey      string `json:"objectKey"`
	Size           int64  `json:"size,omitempty"`
	Position       int    `json:"position,omitempty"`
	Variant        string `json:"variant,omitempty"`
	BlurHashCipher string `json:"blurHashCipher,omitempty"`
	Width          int    `json:"width,omitempty"`
	Height         int    `json:"height,omitempty"`
	MediaType      string `json:"mediaType,omitempty"`
}

type PostResponse struct {
	PostID           int64               `json:"postId"`
	WallID           string              `json:"wallId"`
	WallSlug         string              `json:"wallSlug"`
	OwnerUserID      int64               `json:"ownerUserId"`
	Author           string              `json:"author"`
	EncryptedPostKey string              `json:"encryptedPostKey"`
	CaptionCipher    string              `json:"captionCipher,omitempty"`
	KeyVersion       int                 `json:"keyVersion"`
	Objects          []PostObjectPayload `json:"objects,omitempty"`
	CreatedAt        string              `json:"createdAt"`
	Likes            int64               `json:"likes"`
	ViewerLiked      bool                `json:"viewerLiked"`
	Comments         int64               `json:"comments"`
}

type PostPage struct {
	Items      []PostResponse `json:"items"`
	NextCursor string         `json:"nextCursor,omitempty"`
}

type FeedPage struct {
	Items      []PostResponse `json:"items"`
	NextCursor string         `json:"nextCursor,omitempty"`
}

type CommentResponse struct {
	CommentID       int64  `json:"commentId"`
	AuthorID        int64  `json:"authorId"`
	Author          string `json:"author"`
	CommentCipher   string `json:"commentCipher"`
	CreatedAt       string `json:"createdAt"`
	Likes           int64  `json:"likes"`
	ViewerLiked     bool   `json:"viewerLiked"`
	ViewerCanDelete bool   `json:"viewerCanDelete"`
	ParentCommentID *int64 `json:"parentCommentId,omitempty"`
}

type ListCommentsResponse struct {
	Comments   []CommentResponse `json:"comments"`
	NextCursor string            `json:"nextCursor,omitempty"`
}

type CreateCommentRequest struct {
	CommentCipher   string `json:"commentCipher"`
	ParentCommentID *int64 `json:"parentCommentId,omitempty"`
}

type NotificationActorResponse struct {
	UserID   int64  `json:"userId"`
	Username string `json:"username"`
	WallID   string `json:"wallId"`
	WallSlug string `json:"wallSlug"`
}

type NotificationPostResponse struct {
	PostID      int64               `json:"postId"`
	WallID      string              `json:"wallId"`
	WallSlug    string              `json:"wallSlug"`
	OwnerUserID int64               `json:"ownerUserId"`
	Author      string              `json:"author"`
	Objects     []PostObjectPayload `json:"objects,omitempty"`
}

type NotificationCommentResponse struct {
	CommentID       int64  `json:"commentId"`
	AuthorID        int64  `json:"authorId,omitempty"`
	Author          string `json:"author,omitempty"`
	CommentCipher   string `json:"commentCipher,omitempty"`
	CreatedAt       string `json:"createdAt,omitempty"`
	ParentCommentID *int64 `json:"parentCommentId,omitempty"`
}

type NotificationResponse struct {
	ID        string                       `json:"id"`
	Type      string                       `json:"type"`
	CreatedAt string                       `json:"createdAt"`
	Actor     NotificationActorResponse    `json:"actor"`
	Post      *NotificationPostResponse    `json:"post,omitempty"`
	Comment   *NotificationCommentResponse `json:"comment,omitempty"`
}

type NotificationPage struct {
	Items      []NotificationResponse `json:"items"`
	NextCursor string                 `json:"nextCursor,omitempty"`
}

type UpdatedCountResponse struct {
	Updated int `json:"updated"`
}
