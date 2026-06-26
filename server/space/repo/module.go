package repo

import (
	"database/sql"

	"github.com/ente-io/museum/pkg/utils/s3config"
)

type Module struct {
	Spaces     *SpacesRepository
	Posts      *PostsRepository
	Friends    *FriendsRepository
	Messages   *MessagesRepository
	Links      *LinksRepository
	Assets     *AssetsRepository
	Read       *ReadMarkersRepository
	Sessions   *SessionsRepository
	EntityKeys *EntityKeysRepository
}

type SpacesRepository struct {
	DB *sql.DB
}

type PostsRepository struct {
	DB *sql.DB
}

type FriendsRepository struct {
	DB *sql.DB
}

type MessagesRepository struct {
	DB *sql.DB
}

type LinksRepository struct {
	DB *sql.DB
}

type AssetsRepository struct {
	DB       *sql.DB
	S3Config *s3config.S3Config
}

type ReadMarkersRepository struct {
	DB *sql.DB
}

type SessionsRepository struct {
	DB *sql.DB
}

type EntityKeysRepository struct {
	DB *sql.DB
}

type SpaceRecord struct {
	SpaceID             string
	OwnerID             int64
	SpaceSlug           string
	RootWrappedSpaceKey []byte
	PublicKey           []byte
	EncryptedSecretKey  []byte
	EncryptedProfile    []byte
	CurrentVersion      int
	AvatarObjectID      sql.NullString
	AvatarBucketID      sql.NullString
	AvatarSize          sql.NullInt64
	CoverObjectID       sql.NullString
	CoverBucketID       sql.NullString
	CoverSize           sql.NullInt64
	CreatedAt           int64
	UpdatedAt           int64
}

type ProfileAssetUpdate struct {
	ObjectID string
	BucketID string
	Size     int64
}

type SpaceVersionRecord struct {
	SpaceID             string
	Version             int
	RootWrappedSpaceKey []byte
	EncryptedProfile    []byte
	WrappedPrevKey      []byte
	CreatedAt           int64
}

type SpacePostRecord struct {
	PostID           int64
	SpaceID          string
	SpaceSlug        string
	OwnerID          int64
	Author           SpaceActorRecord
	EncryptedPostKey []byte
	CaptionCipher    []byte
	KeyVersion       int
	CreatedAt        int64
	ViewerLiked      bool
}

type SpacePostAssetRecord struct {
	AssetID        int64
	PostID         int64
	ObjectKey      string
	BucketID       string
	Size           sql.NullInt64
	Position       int
	MetadataCipher []byte
	CreatedAt      int64
}

type SpaceTempObjectRecord struct {
	ObjectKey    string
	SpaceID      sql.NullString
	Purpose      string
	BucketID     string
	ExpectedSize int64
	ExpiresAt    int64
	CleanupAfter int64
	CreatedAt    int64
}

type SpacePostLikerRecord struct {
	Actor     SpaceActorRecord
	CreatedAt int64
}

type SpaceMessageRecord struct {
	MessageID           string
	Kind                string
	SenderID            int64
	SenderSpaceID       string
	RecipientID         int64
	RecipientSpaceID    string
	MessageCipher       []byte
	EncryptedMessageKey []byte
	ReplyPostID         sql.NullInt64
	ReplyMessageID      sql.NullString
	Liked               bool
	ViewerLiked         bool
	IsDeleted           bool
	Text                string
	Quote               *SpaceMessageQuoteRecord
	CreatedAt           int64
	UpdatedAt           int64
	Sender              SpaceActorRecord
	Recipient           SpaceActorRecord
}

type SpaceMessageQuoteRecord struct {
	PostID           int64
	SpaceID          string
	EncryptedPostKey []byte
	CaptionCipher    []byte
	KeyVersion       int
	ObjectKey        sql.NullString
}

type SpaceMessageConversationRecord struct {
	Friend             SpaceActorRecord
	LatestActivity     SpaceMessageConversationActivityRecord
	Unread             bool
	UnreadCount        int64
	NotificationUnread bool
	SortCreatedAt      int64
	SortID             string
}

type SpaceMessageConversationActivityRecord struct {
	ID        string
	Type      string
	CreatedAt int64
	Outgoing  bool
	Message   *SpaceMessageRecord
	Post      *SpaceMessageConversationPostRecord
}

type SpaceMessageConversationPostRecord struct {
	PostID               int64
	SpaceID              string
	SpaceSlug            string
	OwnerID              int64
	IsDeleted            bool
	ObjectKey            sql.NullString
	ObjectSize           sql.NullInt64
	ObjectPosition       sql.NullInt64
	ObjectMetadataCipher []byte
}

type CreateSpaceMessageRecord struct {
	MessageID                    string
	Kind                         string
	SenderSpaceID                string
	RecipientSpaceID             string
	MessageCipher                []byte
	SenderEncryptedMessageKey    []byte
	RecipientEncryptedMessageKey []byte
	ReplyPostID                  sql.NullInt64
	ReplyMessageID               sql.NullString
}

type SpaceActorRecord struct {
	UserID           int64
	SpaceID          string
	SpaceSlug        string
	PublicKey        []byte
	KeyVersion       int
	EncryptedProfile []byte
	AvatarObjectID   sql.NullString
	AvatarSize       sql.NullInt64
	UpdatedAt        int64
	Friends          sql.NullInt64
	Posts            sql.NullInt64
}

type SpaceShareRecord struct {
	SpaceID              string
	FriendID             int64
	OwnerID              int64
	SpaceSlug            string
	FriendSealedSpaceKey []byte
	KeyVersion           int
	CreatedAt            int64
	PublicKey            []byte
}

type SpaceShareUpdateRecord struct {
	FriendSpaceID        string
	FriendSealedSpaceKey []byte
}

type SpaceFriendRecord struct {
	Friend          SpaceActorRecord
	ShareKeyVersion int
	CreatedAt       int64
}

type SpaceFriendRequestRecord struct {
	RequestID                     int64
	RequesterID                   int64
	RequesterSpaceID              string
	TargetID                      int64
	TargetSpaceID                 string
	RequesterFriendSealedSpaceKey []byte
	RequesterKeyVersion           int
	CreatedAt                     int64
	Requester                     SpaceActorRecord
}

type SpaceLinkRecord struct {
	SpaceID             string
	SpaceSlug           string
	OwnerID             int64
	OwnerSlug           string
	AuthKeyHash         []byte
	KeyVersion          int
	LinkWrappedSpaceKey []byte
	EncryptedAccessKey  []byte
	Active              bool
	CreatedAt           int64
	UpdatedAt           int64
}

type SpaceLinkSessionRecord struct {
	TokenHash           []byte
	SpaceID             string
	OwnerID             int64
	AuthKeyHash         []byte
	KeyVersion          int
	ExpiresAt           int64
	CreatedAt           int64
	SpaceSlug           string
	OwnerSlug           string
	LinkWrappedSpaceKey []byte
}

type SpaceBrowserSessionRecord struct {
	TokenHash      []byte
	UserID         int64
	SessionWrapKey string
	ExpiresAt      int64
	CreatedAt      int64
	UpdatedAt      int64
	LastUsedAt     int64
}

type SpaceEntityKeyRecord struct {
	UserID       int64
	KeyType      string
	EncryptedKey []byte
	CreatedAt    int64
}

func NewModule(db *sql.DB, s3Config *s3config.S3Config) *Module {
	return &Module{
		Spaces:     &SpacesRepository{DB: db},
		Posts:      &PostsRepository{DB: db},
		Friends:    &FriendsRepository{DB: db},
		Messages:   &MessagesRepository{DB: db},
		Links:      &LinksRepository{DB: db},
		Assets:     &AssetsRepository{DB: db, S3Config: s3Config},
		Read:       &ReadMarkersRepository{DB: db},
		Sessions:   &SessionsRepository{DB: db},
		EntityKeys: &EntityKeysRepository{DB: db},
	}
}
