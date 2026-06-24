package models

type AssetRedirectRequest struct {
	SpaceID   string `form:"spaceId" binding:"required"`
	ObjectKey string `form:"objectKey"`
	AssetType string `form:"assetType"`
	ObjectID  string `form:"objectID"`
}

type ListSpacesRequest struct{}

type SpaceBrowserSessionRequest struct {
	SessionWrapKey string `json:"sessionWrapKey" binding:"required"`
}

type SpaceBrowserSessionResponse struct {
	SessionToken string `json:"sessionToken"`
}

type SpaceBrowserSessionBootstrapResponse struct {
	SessionWrapKey string `json:"sessionWrapKey"`
}

type SpaceEntityKeyRequest struct {
	Type         string `json:"type" binding:"required"`
	EncryptedKey string `json:"encryptedKey" binding:"required"`
}

type GetSpaceEntityKeyRequest struct {
	Type string `form:"type" binding:"required"`
}

type SpaceEntityKeyResponse struct {
	Type         string `json:"type"`
	EncryptedKey string `json:"encryptedKey"`
}

type GetSpaceProfileRequest struct {
	SpaceID string `form:"spaceId" binding:"required"`
	Version *int   `form:"version"`
}

type ListPostsRequest struct {
	SpaceID string `form:"spaceId" binding:"required"`
	Cursor  string `form:"cursor"`
	Limit   int    `form:"limit"`
}

type ListFeedRequest struct {
	Cursor string `form:"cursor"`
	Limit  int    `form:"limit"`
}

type ListPostLikersRequest struct {
	Cursor string `form:"cursor"`
	Limit  int    `form:"limit"`
}

type ListMessagesRequest struct {
	Cursor string `form:"cursor"`
	Limit  int    `form:"limit"`
}

type ListMessageThreadRequest struct {
	Cursor string `form:"cursor"`
	Limit  int    `form:"limit"`
}

type ListSpaceFriendsRequest struct {
	SpaceID string `form:"spaceId"`
}

type FriendRelationshipRequest struct {
	TargetSpaceID string `form:"targetSpaceId" binding:"required"`
}

type SpaceKeyResponse struct {
	SpaceID            string `json:"spaceId"`
	SpaceSlug          string `json:"spaceSlug"`
	EncryptedSpaceKey  string `json:"encryptedSpaceKey"`
	PublicKey          string `json:"publicKey,omitempty"`
	EncryptedSecretKey string `json:"encryptedSecretKey,omitempty"`
	EncryptedProfile   string `json:"encryptedProfile,omitempty"`
	KeyVersion         int    `json:"keyVersion"`
}

type PresignUploadRequest struct {
	Size       int64   `json:"size" binding:"required"`
	ContentMD5 string  `json:"contentMD5" binding:"required"`
	Purpose    *string `json:"purpose,omitempty"`
	SpaceID    *string `json:"spaceId,omitempty"`
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
	ObjectID string `json:"objectID"`
	Size     int64  `json:"size,omitempty"`
}

type ProfileAvatarResponse struct {
	ObjectID  string `json:"objectID"`
	Size      int64  `json:"size,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type ProfileCoverPayload = ProfileAvatarPayload
type ProfileCoverResponse = ProfileAvatarResponse

type SpaceActorResponse struct {
	SpaceID          string                 `json:"spaceId,omitempty"`
	SpaceSlug        string                 `json:"spaceSlug"`
	PublicKey        string                 `json:"publicKey,omitempty"`
	KeyVersion       int                    `json:"keyVersion,omitempty"`
	EncryptedProfile string                 `json:"encryptedProfile,omitempty"`
	Avatar           *ProfileAvatarResponse `json:"avatar,omitempty"`
	Friends          *int64                 `json:"friends,omitempty"`
	Posts            *int64                 `json:"posts,omitempty"`
}

type SpaceLinkCreateRequest struct {
	SpaceID            string `json:"spaceId"`
	AuthKey            string `json:"authKey"`
	KeyVersion         int    `json:"keyVersion"`
	EncryptedSpaceKey  string `json:"encryptedSpaceKey"`
	EncryptedAccessKey string `json:"encryptedAccessKey"`
}

type SpaceLinkStatusResponse struct {
	SpaceID            string `json:"spaceId"`
	SpaceSlug          string `json:"spaceSlug"`
	KeyVersion         int    `json:"keyVersion"`
	Active             bool   `json:"active"`
	EncryptedAccessKey string `json:"encryptedAccessKey"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

type SpaceLinkLoginRequest struct {
	SpaceID string `json:"spaceId"`
	AuthKey string `json:"authKey"`
}

type SpaceLinkLoginResponse struct {
	SessionToken      string `json:"sessionToken"`
	SpaceID           string `json:"spaceId"`
	SpaceSlug         string `json:"spaceSlug"`
	Owner             string `json:"owner"`
	PublicKey         string `json:"publicKey,omitempty"`
	KeyVersion        int    `json:"keyVersion"`
	EncryptedSpaceKey string `json:"encryptedSpaceKey"`
}

type AddFriendPayload struct {
	TargetSpaceID              string `json:"targetSpaceId,omitempty"`
	TargetUsername             string `json:"targetUsername,omitempty"`
	RequesterSpaceID           string `json:"requesterSpaceId"`
	RequesterEncryptedSpaceKey string `json:"requesterEncryptedSpaceKey"`
	RequesterKeyVersion        int    `json:"requesterKeyVersion"`
}

type ConfirmFriendRequestPayload struct {
	TargetEncryptedSpaceKey string `json:"targetEncryptedSpaceKey"`
	TargetKeyVersion        int    `json:"targetKeyVersion"`
}

type FriendTargetPayload struct {
	TargetUsername *string `json:"targetUsername,omitempty"`
	TargetSpaceID  *string `json:"targetSpaceId,omitempty"`
}

type FriendShareResponse struct {
	Friend            string `json:"friend"`
	SpaceID           string `json:"spaceId"`
	SpaceSlug         string `json:"spaceSlug"`
	EncryptedSpaceKey string `json:"encryptedSpaceKey"`
	KeyVersion        int    `json:"keyVersion"`
}

type FriendStatusResponse struct {
	Status string `json:"status"`
}

type SpaceFriendRequestResponse struct {
	RequestID int64              `json:"requestId"`
	Requester SpaceActorResponse `json:"requester"`
	CreatedAt string             `json:"createdAt"`
}

type FriendRelationshipResponse struct {
	Relationship string `json:"relationship"`
}

type UpdateSpaceProfileRequest struct {
	SpaceID          string                `json:"spaceId"`
	KeyVersion       int                   `json:"keyVersion"`
	EncryptedProfile string                `json:"encryptedProfile"`
	Avatar           *ProfileAvatarPayload `json:"avatar,omitempty"`
	Cover            *ProfileCoverPayload  `json:"cover,omitempty"`
	RemoveAvatar     bool                  `json:"removeAvatar,omitempty"`
	RemoveCover      bool                  `json:"removeCover,omitempty"`
}

type UpdateSpaceProfileResponse struct {
	Status string                 `json:"status"`
	Avatar *ProfileAvatarResponse `json:"avatar,omitempty"`
	Cover  *ProfileCoverResponse  `json:"cover,omitempty"`
}

type CreateSpaceRequest struct {
	SpaceSlug          string `json:"spaceSlug"`
	EncryptedSpaceKey  string `json:"encryptedSpaceKey"`
	PublicKey          string `json:"publicKey"`
	EncryptedSecretKey string `json:"encryptedSecretKey"`
	EncryptedProfile   string `json:"encryptedProfile"`
}

type SpaceProfileResponse struct {
	SpaceID          string                 `json:"spaceId"`
	SpaceSlug        string                 `json:"spaceSlug"`
	Version          int                    `json:"version"`
	EncryptedProfile string                 `json:"encryptedProfile,omitempty"`
	UpdatedAt        string                 `json:"updatedAt,omitempty"`
	Avatar           *ProfileAvatarResponse `json:"avatar,omitempty"`
	Cover            *ProfileCoverResponse  `json:"cover,omitempty"`
	Friends          int64                  `json:"friends"`
}

type UpdateSpaceSlugRequest struct {
	SpaceSlug string `json:"spaceSlug"`
}

type SpaceLookupResponse struct {
	SpaceID   string `json:"spaceId"`
	SpaceSlug string `json:"spaceSlug"`
	Owner     string `json:"owner"`
	PublicKey string `json:"publicKey,omitempty"`
}

type SpaceSlugAvailabilityResponse struct {
	Available bool `json:"available"`
}

type RotateSpaceKeyRequest struct {
	SpaceID           string `json:"spaceId"`
	KeyVersion        int    `json:"keyVersion"`
	EncryptedSpaceKey string `json:"encryptedSpaceKey"`
	WrappedPrevKey    string `json:"wrappedPrevKey"`
	EncryptedProfile  string `json:"encryptedProfile"`
}

type SpaceKeyVersionResponse struct {
	Version        int    `json:"version"`
	WrappedPrevKey string `json:"wrappedPrevKey,omitempty"`
	CreatedAt      string `json:"createdAt"`
}

type SpaceFriendResponse struct {
	Friend          SpaceActorResponse `json:"friend"`
	ShareKeyVersion int                `json:"shareKeyVersion"`
	CreatedAt       string             `json:"createdAt"`
}

type RefreshFriendSharesRequest struct {
	SpaceID    string               `json:"spaceId"`
	KeyVersion int                  `json:"keyVersion"`
	Shares     []ShareUpdatePayload `json:"shares"`
}

type ShareUpdatePayload struct {
	FriendSpaceID     string `json:"friendSpaceId"`
	EncryptedSpaceKey string `json:"encryptedSpaceKey"`
}

type CreatePostRequest struct {
	SpaceID          string              `json:"spaceId"`
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

type ListPostLikersResponse struct {
	Likers     []PostLikerResponse `json:"likers"`
	NextCursor string              `json:"nextCursor,omitempty"`
}

type PostLikerResponse struct {
	Actor     SpaceActorResponse `json:"actor"`
	CreatedAt string             `json:"createdAt"`
}

type UpdatePostCaptionRequest struct {
	CaptionCipher *string `json:"captionCipher,omitempty"`
}

type CreateMessageRequest struct {
	MessageID                    string `json:"messageId,omitempty"`
	MessageCipher                string `json:"messageCipher"`
	SenderEncryptedMessageKey    string `json:"senderEncryptedMessageKey"`
	RecipientEncryptedMessageKey string `json:"recipientEncryptedMessageKey"`
	ReplyMessageID               string `json:"replyMessageId,omitempty"`
}

type LikeMessageRequest struct {
	Like bool `json:"like"`
}

type LikeMessageResponse struct {
	Liked bool `json:"liked"`
}

type MessageResponse struct {
	MessageID           string                `json:"messageId"`
	Kind                string                `json:"kind"`
	Sender              SpaceActorResponse    `json:"sender"`
	Recipient           SpaceActorResponse    `json:"recipient"`
	MessageCipher       string                `json:"messageCipher,omitempty"`
	EncryptedMessageKey string                `json:"encryptedMessageKey,omitempty"`
	Text                string                `json:"text,omitempty"`
	Quote               *MessageQuoteResponse `json:"quote,omitempty"`
	ReplyPostID         *int64                `json:"replyPostId,omitempty"`
	ReplyMessageID      *string               `json:"replyMessageId,omitempty"`
	Likes               int64                 `json:"likes"`
	ViewerLiked         bool                  `json:"viewerLiked"`
	IsDeleted           bool                  `json:"isDeleted"`
	CreatedAt           string                `json:"createdAt"`
	UpdatedAt           string                `json:"updatedAt"`
}

type MessageQuoteResponse struct {
	PostID           int64  `json:"postId"`
	SpaceID          string `json:"spaceId"`
	EncryptedPostKey string `json:"encryptedPostKey,omitempty"`
	CaptionCipher    string `json:"captionCipher,omitempty"`
	KeyVersion       int    `json:"keyVersion,omitempty"`
	ObjectKey        string `json:"objectKey,omitempty"`
}

type MessagePage struct {
	Items      []MessageResponse `json:"items"`
	NextCursor string            `json:"nextCursor,omitempty"`
}

type MessageConversationResponse struct {
	Friend             SpaceActorResponse                  `json:"friend"`
	LatestActivity     MessageConversationActivityResponse `json:"latestActivity"`
	Unread             bool                                `json:"unread"`
	UnreadCount        int64                               `json:"unreadCount"`
	NotificationUnread bool                                `json:"notificationUnread"`
}

type MessageConversationActivityResponse struct {
	ID        string                           `json:"id"`
	Type      string                           `json:"type"`
	CreatedAt string                           `json:"createdAt"`
	Outgoing  bool                             `json:"outgoing,omitempty"`
	Message   *MessageResponse                 `json:"message,omitempty"`
	Post      *MessageConversationPostResponse `json:"post,omitempty"`
}

type MessageConversationPostResponse struct {
	PostID    int64               `json:"postId"`
	SpaceID   string              `json:"spaceId"`
	SpaceSlug string              `json:"spaceSlug"`
	IsDeleted bool                `json:"isDeleted"`
	Objects   []PostObjectPayload `json:"objects,omitempty"`
}

type MessageConversationPage struct {
	Items      []MessageConversationResponse `json:"items"`
	NextCursor string                        `json:"nextCursor,omitempty"`
}

type PostObjectPayload struct {
	ObjectKey      string `json:"objectKey"`
	Size           int64  `json:"size,omitempty"`
	Position       int    `json:"position,omitempty"`
	MetadataCipher string `json:"metadataCipher,omitempty"`
}

type PostResponse struct {
	PostID           int64               `json:"postId"`
	SpaceID          string              `json:"spaceId"`
	SpaceSlug        string              `json:"spaceSlug"`
	Author           SpaceActorResponse  `json:"author"`
	EncryptedPostKey string              `json:"encryptedPostKey"`
	CaptionCipher    string              `json:"captionCipher,omitempty"`
	KeyVersion       int                 `json:"keyVersion"`
	Objects          []PostObjectPayload `json:"objects,omitempty"`
	CreatedAt        string              `json:"createdAt"`
	Likes            int64               `json:"likes"`
	ViewerLiked      bool                `json:"viewerLiked"`
}

type SpaceUnreadStatusResponse struct {
	NotificationsUnread bool `json:"notificationsUnread"`
}

type MarkNotificationsReadRequest struct {
	FriendSpaceID string `json:"friendSpaceId"`
}

type PostPage struct {
	Items      []PostResponse `json:"items"`
	NextCursor string         `json:"nextCursor,omitempty"`
}

type FeedPage struct {
	Items      []PostResponse `json:"items"`
	NextCursor string         `json:"nextCursor,omitempty"`
}

type UpdatedCountResponse struct {
	Updated int `json:"updated"`
}
