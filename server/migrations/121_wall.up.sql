CREATE TABLE IF NOT EXISTS walls (
    wall_id              TEXT PRIMARY KEY,
    owner_id             BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    wall_slug            TEXT   NOT NULL,
    encrypted_wall_key   TEXT   NOT NULL,
    encrypted_profile    TEXT   NOT NULL DEFAULT '',
    current_version      INTEGER NOT NULL DEFAULT 1,
    avatar_object_key    TEXT,
    avatar_bucket_id     TEXT,
    avatar_size          BIGINT,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT uq_walls_owner UNIQUE (owner_id),
    CONSTRAINT uq_walls_slug UNIQUE (wall_slug)
);

CREATE INDEX IF NOT EXISTS idx_walls_owner_id ON walls (owner_id);
CREATE INDEX IF NOT EXISTS idx_walls_wall_slug ON walls (wall_slug);

CREATE TRIGGER update_walls_updated_at
    BEFORE UPDATE ON walls
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_key_versions (
    wall_id             TEXT    NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    version             INTEGER NOT NULL,
    encrypted_wall_key  TEXT    NOT NULL,
    encrypted_profile   TEXT    NOT NULL DEFAULT '',
    wrapped_prev_key    TEXT,
    created_at          BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (wall_id, version)
);

CREATE INDEX IF NOT EXISTS idx_wall_key_versions_wall_created
    ON wall_key_versions (wall_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wall_posts (
    post_id              BIGSERIAL PRIMARY KEY,
    wall_id              TEXT    NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    owner_id             BIGINT  NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    encrypted_post_key   TEXT    NOT NULL,
    caption_cipher       TEXT    NOT NULL DEFAULT '',
    key_version          INTEGER NOT NULL DEFAULT 1,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_wall_posts_wall_created
    ON wall_posts (wall_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_wall_posts_owner_created
    ON wall_posts (owner_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE TRIGGER update_wall_posts_updated_at
    BEFORE UPDATE ON wall_posts
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_post_assets (
    asset_id             BIGSERIAL PRIMARY KEY,
    post_id              BIGINT NOT NULL REFERENCES wall_posts (post_id) ON DELETE CASCADE,
    object_key           TEXT   NOT NULL,
    bucket_id            TEXT   NOT NULL,
    size                 BIGINT,
    position             INTEGER NOT NULL DEFAULT 0,
    variant              TEXT,
    blur_hash_cipher     TEXT,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT uq_wall_post_assets_object_key UNIQUE (object_key),
    CONSTRAINT uq_wall_post_assets_position UNIQUE (post_id, position, variant)
);

CREATE INDEX IF NOT EXISTS idx_wall_post_assets_post_position
    ON wall_post_assets (post_id, position ASC, asset_id ASC);

CREATE TABLE IF NOT EXISTS wall_temp_objects (
    object_key      TEXT PRIMARY KEY,
    owner_id        BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    wall_id         TEXT REFERENCES walls (wall_id) ON DELETE CASCADE,
    purpose         TEXT NOT NULL,
    bucket_id       TEXT NOT NULL,
    expected_size   BIGINT NOT NULL,
    expires_at      BIGINT NOT NULL,
    created_at      BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_wall_temp_objects_purpose CHECK (purpose IN ('post', 'avatar')),
    CONSTRAINT chk_wall_temp_objects_expected_size CHECK (expected_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_wall_temp_objects_expires
    ON wall_temp_objects (expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_wall_temp_objects_owner_purpose
    ON wall_temp_objects (owner_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS wall_post_likes (
    post_id      BIGINT NOT NULL REFERENCES wall_posts (post_id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at   BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wall_post_likes_post_id
    ON wall_post_likes (post_id);

CREATE TABLE IF NOT EXISTS wall_post_comments (
    comment_id           BIGSERIAL PRIMARY KEY,
    post_id              BIGINT NOT NULL REFERENCES wall_posts (post_id) ON DELETE CASCADE,
    parent_comment_id    BIGINT REFERENCES wall_post_comments (comment_id) ON DELETE CASCADE,
    author_id            BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    comment_cipher       TEXT   NOT NULL,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_wall_post_comments_post_created
    ON wall_post_comments (post_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_wall_post_comments_parent
    ON wall_post_comments (parent_comment_id, created_at ASC)
    WHERE is_deleted = FALSE;

CREATE TRIGGER update_wall_post_comments_updated_at
    BEFORE UPDATE ON wall_post_comments
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_follow_requests (
    request_id        BIGSERIAL PRIMARY KEY,
    requester_id      BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    target_wall_id    TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    status            TEXT   NOT NULL DEFAULT 'pending',
    created_at        BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at        BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_wall_follow_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'unfollowed'))
);

CREATE INDEX IF NOT EXISTS idx_wall_follow_requests_target_status
    ON wall_follow_requests (target_wall_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wall_follow_requests_requester_status
    ON wall_follow_requests (requester_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wall_follow_requests_pending
    ON wall_follow_requests (requester_id, target_wall_id)
    WHERE status = 'pending';

CREATE TRIGGER update_wall_follow_requests_updated_at
    BEFORE UPDATE ON wall_follow_requests
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_follow_shares (
    wall_id              TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    follower_id          BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    encrypted_wall_key   TEXT   NOT NULL,
    key_version          INTEGER NOT NULL DEFAULT 1,
    created_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (wall_id, follower_id)
);

CREATE INDEX IF NOT EXISTS idx_wall_follow_shares_follower
    ON wall_follow_shares (follower_id, created_at DESC);

CREATE TRIGGER update_wall_follow_shares_updated_at
    BEFORE UPDATE ON wall_follow_shares
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_links (
    wall_id              TEXT PRIMARY KEY REFERENCES walls (wall_id) ON DELETE CASCADE,
    auth_key_hash        BYTEA   NOT NULL UNIQUE,
    key_version          INTEGER NOT NULL,
    encrypted_wall_key   TEXT    NOT NULL,
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_wall_links_active
    ON wall_links (active, updated_at DESC);

CREATE TRIGGER update_wall_links_updated_at
    BEFORE UPDATE ON wall_links
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_link_sessions (
    token_hash           BYTEA PRIMARY KEY,
    wall_id              TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    owner_id             BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    auth_key_hash        BYTEA   NOT NULL,
    key_version          INTEGER NOT NULL,
    expires_at           BIGINT NOT NULL,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_wall_link_sessions_wall
    ON wall_link_sessions (wall_id, expires_at DESC);
