package repo

import (
	"database/sql"

	"github.com/ente-io/museum/pkg/utils/s3config"
)

type Module struct {
	Walls         *WallsRepository
	Posts         *PostsRepository
	Friends       *FriendsRepository
	Messages      *MessagesRepository
	Notifications *NotificationsRepository
	Links         *LinksRepository
	Assets        *AssetsRepository
}

type WallsRepository struct {
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

type NotificationsRepository struct {
	DB *sql.DB
}

type LinksRepository struct {
	DB *sql.DB
}

type AssetsRepository struct {
	DB       *sql.DB
	S3Config *s3config.S3Config
}

type WallRecord struct {
	WallID           string
	OwnerID          int64
	WallSlug         string
	EncryptedWallKey string
	EncryptedProfile string
	CurrentVersion   int
	AvatarObjectKey  sql.NullString
	AvatarBucketID   sql.NullString
	AvatarSize       sql.NullInt64
	CreatedAt        int64
	UpdatedAt        int64
}

type WallVersionRecord struct {
	WallID           string
	Version          int
	EncryptedWallKey string
	EncryptedProfile string
	WrappedPrevKey   sql.NullString
	CreatedAt        int64
}

type WallPostRecord struct {
	PostID           int64
	WallID           string
	WallSlug         string
	OwnerID          int64
	Author           WallActorRecord
	EncryptedPostKey string
	CaptionCipher    string
	KeyVersion       int
	CreatedAt        int64
	Likes            int64
	ViewerLiked      bool
}

type WallPostAssetRecord struct {
	AssetID        int64
	PostID         int64
	ObjectKey      string
	BucketID       string
	Size           sql.NullInt64
	Position       int
	Variant        sql.NullString
	BlurHashCipher sql.NullString
	Width          sql.NullInt64
	Height         sql.NullInt64
	MediaType      sql.NullString
	CreatedAt      int64
}

type WallTempObjectRecord struct {
	ObjectKey    string
	OwnerID      int64
	WallID       sql.NullString
	Purpose      string
	BucketID     string
	ExpectedSize int64
	ExpiresAt    int64
	CreatedAt    int64
}

type WallPostLikerRecord struct {
	Actor     WallActorRecord
	CreatedAt int64
}

type WallMessageRecord struct {
	MessageID           string
	Kind                string
	SenderID            int64
	SenderWallID        string
	RecipientID         int64
	RecipientWallID     string
	MessageCipher       string
	EncryptedMessageKey string
	ReplyPostID         sql.NullInt64
	ReplyMessageID      sql.NullString
	Likes               int64
	ViewerLiked         bool
	IsDeleted           bool
	CreatedAt           int64
	UpdatedAt           int64
	Sender              WallActorRecord
	Recipient           WallActorRecord
}

type WallMessageConversationRecord struct {
	Friend         WallActorRecord
	LatestActivity WallMessageConversationActivityRecord
}

type WallMessageConversationActivityRecord struct {
	ID        string
	Type      string
	CreatedAt int64
	Message   *WallMessageRecord
	Post      *WallMessageConversationPostRecord
}

type WallMessageConversationPostRecord struct {
	PostID               int64
	WallID               string
	WallSlug             string
	OwnerID              int64
	ObjectKey            sql.NullString
	ObjectSize           sql.NullInt64
	ObjectPosition       sql.NullInt64
	ObjectVariant        sql.NullString
	ObjectBlurHashCipher sql.NullString
	ObjectWidth          sql.NullInt64
	ObjectHeight         sql.NullInt64
	ObjectMediaType      sql.NullString
}

type CreateWallMessageRecord struct {
	MessageID                    string
	Kind                         string
	SenderID                     int64
	SenderWallID                 string
	RecipientID                  int64
	RecipientWallID              string
	MessageCipher                string
	SenderEncryptedMessageKey    string
	RecipientEncryptedMessageKey string
	ReplyPostID                  sql.NullInt64
	ReplyMessageID               sql.NullString
}

type WallActorRecord struct {
	UserID           int64
	WallID           string
	WallSlug         string
	PublicKey        string
	KeyVersion       int
	EncryptedProfile string
	AvatarObjectKey  sql.NullString
	AvatarSize       sql.NullInt64
	UpdatedAt        int64
	Friends          sql.NullInt64
	Posts            sql.NullInt64
}

type WallShareRecord struct {
	WallID           string
	FriendID         int64
	OwnerID          int64
	WallSlug         string
	EncryptedWallKey string
	KeyVersion       int
	CreatedAt        int64
	PublicKey        string
}

type WallShareUpdateRecord struct {
	FriendID         int64
	EncryptedWallKey string
}

type WallFriendRecord struct {
	Friend          WallActorRecord
	ShareKeyVersion int
	CreatedAt       int64
}

type WallLinkRecord struct {
	WallID           string
	WallSlug         string
	OwnerID          int64
	OwnerSlug        string
	AuthKeyHash      []byte
	KeyVersion       int
	EncryptedWallKey string
	Active           bool
	CreatedAt        int64
	UpdatedAt        int64
}

type WallLinkSessionRecord struct {
	TokenHash        []byte
	WallID           string
	OwnerID          int64
	AuthKeyHash      []byte
	KeyVersion       int
	ExpiresAt        int64
	CreatedAt        int64
	WallSlug         string
	OwnerSlug        string
	EncryptedWallKey string
}

type WallNotificationRecord struct {
	ID                       string
	Type                     string
	CreatedAt                int64
	Actor                    WallActorRecord
	PostID                   sql.NullInt64
	PostWallID               sql.NullString
	PostWallSlug             sql.NullString
	PostOwnerID              sql.NullInt64
	PostAuthor               WallActorRecord
	PostObjectKey            sql.NullString
	PostObjectSize           sql.NullInt64
	PostObjectPosition       sql.NullInt64
	PostObjectVariant        sql.NullString
	PostObjectBlurHashCipher sql.NullString
	PostObjectWidth          sql.NullInt64
	PostObjectHeight         sql.NullInt64
	PostObjectMediaType      sql.NullString
}

func NewModule(db *sql.DB, s3Config *s3config.S3Config) *Module {
	return &Module{
		Walls:         &WallsRepository{DB: db},
		Posts:         &PostsRepository{DB: db},
		Friends:       &FriendsRepository{DB: db},
		Messages:      &MessagesRepository{DB: db},
		Notifications: &NotificationsRepository{DB: db},
		Links:         &LinksRepository{DB: db},
		Assets:        &AssetsRepository{DB: db, S3Config: s3Config},
	}
}
