package repo

import (
	"database/sql"

	"github.com/ente-io/museum/pkg/utils/s3config"
)

type Module struct {
	Spaces   *SpacesRepository
	Posts    *PostsRepository
	Friends  *FriendsRepository
	Messages *MessagesRepository
	Links    *LinksRepository
	Assets   *AssetsRepository
	Read     *ReadMarkersRepository
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

type SpaceRecord struct {
	SpaceID           string
	OwnerID           int64
	SpaceSlug         string
	EncryptedSpaceKey string
	EncryptedProfile  string
	CurrentVersion    int
	AvatarObjectKey   sql.NullString
	AvatarBucketID    sql.NullString
	AvatarSize        sql.NullInt64
	CoverObjectKey    sql.NullString
	CoverBucketID     sql.NullString
	CoverSize         sql.NullInt64
	CreatedAt         int64
	UpdatedAt         int64
}

type ProfileAssetUpdate struct {
	ObjectKey string
	BucketID  string
	Size      int64
}

type SpaceVersionRecord struct {
	SpaceID           string
	Version           int
	EncryptedSpaceKey string
	EncryptedProfile  string
	WrappedPrevKey    sql.NullString
	CreatedAt         int64
}

type SpacePostRecord struct {
	PostID           int64
	SpaceID          string
	SpaceSlug        string
	OwnerID          int64
	Author           SpaceActorRecord
	EncryptedPostKey string
	CaptionCipher    string
	KeyVersion       int
	CreatedAt        int64
	Likes            int64
	ViewerLiked      bool
	ViewerUnread     bool
}

type SpacePostAssetRecord struct {
	AssetID        int64
	PostID         int64
	ObjectKey      string
	BucketID       string
	Size           sql.NullInt64
	Position       int
	MetadataCipher string
	CreatedAt      int64
}

type SpaceTempObjectRecord struct {
	ObjectKey    string
	OwnerID      int64
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
	MessageCipher       string
	EncryptedMessageKey string
	ReplyPostID         sql.NullInt64
	ReplyMessageID      sql.NullString
	Likes               int64
	ViewerLiked         bool
	IsDeleted           bool
	CreatedAt           int64
	UpdatedAt           int64
	Sender              SpaceActorRecord
	Recipient           SpaceActorRecord
}

type SpaceMessageConversationRecord struct {
	Friend             SpaceActorRecord
	LatestActivity     SpaceMessageConversationActivityRecord
	Unread             bool
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
	ObjectMetadataCipher sql.NullString
}

type CreateSpaceMessageRecord struct {
	MessageID                    string
	Kind                         string
	SenderID                     int64
	SenderSpaceID                string
	RecipientID                  int64
	RecipientSpaceID             string
	MessageCipher                string
	SenderEncryptedMessageKey    string
	RecipientEncryptedMessageKey string
	ReplyPostID                  sql.NullInt64
	ReplyMessageID               sql.NullString
}

type SpaceActorRecord struct {
	UserID           int64
	SpaceID          string
	SpaceSlug        string
	PublicKey        string
	KeyVersion       int
	EncryptedProfile string
	AvatarObjectKey  sql.NullString
	AvatarSize       sql.NullInt64
	UpdatedAt        int64
	Friends          sql.NullInt64
	Posts            sql.NullInt64
}

type SpaceShareRecord struct {
	SpaceID           string
	FriendID          int64
	OwnerID           int64
	SpaceSlug         string
	EncryptedSpaceKey string
	KeyVersion        int
	CreatedAt         int64
	PublicKey         string
}

type SpaceShareUpdateRecord struct {
	FriendID          int64
	FriendSpaceID     string
	EncryptedSpaceKey string
}

type SpaceFriendRecord struct {
	Friend          SpaceActorRecord
	ShareKeyVersion int
	CreatedAt       int64
}

type SpaceLinkRecord struct {
	SpaceID            string
	SpaceSlug          string
	OwnerID            int64
	OwnerSlug          string
	AuthKeyHash        []byte
	KeyVersion         int
	EncryptedSpaceKey  string
	EncryptedAccessKey string
	Active             bool
	CreatedAt          int64
	UpdatedAt          int64
}

type SpaceLinkSessionRecord struct {
	TokenHash         []byte
	SpaceID           string
	OwnerID           int64
	AuthKeyHash       []byte
	KeyVersion        int
	ExpiresAt         int64
	CreatedAt         int64
	SpaceSlug         string
	OwnerSlug         string
	EncryptedSpaceKey string
}

type SpaceReadMarkerRecord struct {
	UserID            int64
	ViewerSpaceID     string
	FeedReadCreatedAt int64
	FeedReadPostID    int64
	CreatedAt         int64
	UpdatedAt         int64
}

func NewModule(db *sql.DB, s3Config *s3config.S3Config) *Module {
	return &Module{
		Spaces:   &SpacesRepository{DB: db},
		Posts:    &PostsRepository{DB: db},
		Friends:  &FriendsRepository{DB: db},
		Messages: &MessagesRepository{DB: db},
		Links:    &LinksRepository{DB: db},
		Assets:   &AssetsRepository{DB: db, S3Config: s3Config},
		Read:     &ReadMarkersRepository{DB: db},
	}
}
