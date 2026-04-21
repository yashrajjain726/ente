package repo

import (
	"database/sql"

	"github.com/ente-io/museum/pkg/utils/s3config"
)

type Module struct {
	Walls  *WallsRepository
	Posts  *PostsRepository
	Follow *FollowRepository
	Links  *LinksRepository
	Assets *AssetsRepository
}

type WallsRepository struct {
	DB *sql.DB
}

type PostsRepository struct {
	DB *sql.DB
}

type FollowRepository struct {
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
	Author           string
	EncryptedPostKey string
	CaptionCipher    string
	KeyVersion       int
	CreatedAt        int64
	Likes            int64
	ViewerLiked      bool
	Comments         int64
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

type WallCommentRecord struct {
	CommentID       int64
	PostID          int64
	AuthorID        int64
	Author          string
	CommentCipher   string
	ParentCommentID sql.NullInt64
	CreatedAt       int64
	ViewerCanDelete bool
}

type WallFollowRequestRecord struct {
	RequestID     int64
	RequesterID   int64
	TargetWallID  string
	Status        string
	CreatedAt     int64
	UpdatedAt     int64
	RequesterSlug string
	RequesterKey  string
	TargetSlug    string
}

type WallShareRecord struct {
	WallID           string
	FollowerID       int64
	FolloweeID       int64
	FolloweeSlug     string
	EncryptedWallKey string
	KeyVersion       int
	CreatedAt        int64
	PublicKey        string
}

type WallShareUpdateRecord struct {
	FollowerID       int64
	EncryptedWallKey string
}

type WallFollowerRecord struct {
	FollowerID int64
	Username   string
	PublicKey  string
	KeyVersion int
	CreatedAt  int64
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

type CommunityRecord struct {
	Username     string
	WallID       string
	WallSlug     string
	Followers    int64
	Following    int64
	Posts        int64
	Relationship string
	Bio          string
}

func NewModule(db *sql.DB, s3Config *s3config.S3Config) *Module {
	return &Module{
		Walls:  &WallsRepository{DB: db},
		Posts:  &PostsRepository{DB: db},
		Follow: &FollowRepository{DB: db},
		Links:  &LinksRepository{DB: db},
		Assets: &AssetsRepository{DB: db, S3Config: s3Config},
	}
}
