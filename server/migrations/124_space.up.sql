CREATE TABLE IF NOT EXISTS spaces (
    space_id              TEXT PRIMARY KEY,
    owner_id             BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    space_slug            TEXT   NOT NULL,
    encrypted_space_key   TEXT   NOT NULL,
    public_key            TEXT   NOT NULL,
    encrypted_secret_key  TEXT   NOT NULL,
    secret_key_decryption_nonce TEXT NOT NULL,
    encrypted_profile    TEXT   NOT NULL DEFAULT '',
    current_version      INTEGER NOT NULL DEFAULT 1,
    avatar_object_key    TEXT,
    avatar_bucket_id     TEXT,
    avatar_size          BIGINT,
    cover_object_key     TEXT,
    cover_bucket_id      TEXT,
    cover_size           BIGINT,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT uq_spaces_owner UNIQUE (owner_id),
    CONSTRAINT uq_spaces_slug UNIQUE (space_slug)
);

CREATE INDEX IF NOT EXISTS idx_spaces_owner_id ON spaces (owner_id);
CREATE INDEX IF NOT EXISTS idx_spaces_space_slug ON spaces (space_slug);

CREATE TRIGGER update_spaces_updated_at
    BEFORE UPDATE ON spaces
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_notification_read_markers (
    user_id        BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    viewer_space_id TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    friend_space_id TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    read_at        BIGINT NOT NULL DEFAULT 0,
    created_at     BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at     BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (viewer_space_id, friend_space_id)
);

CREATE INDEX IF NOT EXISTS idx_space_notification_read_markers_user
    ON space_notification_read_markers (user_id, read_at DESC);

CREATE TRIGGER update_space_notification_read_markers_updated_at
    BEFORE UPDATE ON space_notification_read_markers
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_browser_sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    client_key TEXT   NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    last_used_at BIGINT NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_space_browser_sessions_user
    ON space_browser_sessions (user_id, last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_space_browser_sessions_expires
    ON space_browser_sessions (expires_at ASC);

CREATE TRIGGER update_space_browser_sessions_updated_at
    BEFORE UPDATE ON space_browser_sessions
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_entity_keys (
    user_id       BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    key_type      TEXT   NOT NULL,
    encrypted_key TEXT   NOT NULL,
    header        TEXT   NOT NULL,
    created_at    BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at    BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (user_id, key_type)
);

CREATE TRIGGER update_space_entity_keys_updated_at
    BEFORE UPDATE ON space_entity_keys
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_key_versions (
    space_id             TEXT    NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    version             INTEGER NOT NULL,
    encrypted_space_key  TEXT    NOT NULL,
    encrypted_profile   TEXT    NOT NULL DEFAULT '',
    wrapped_prev_key    TEXT,
    created_at          BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (space_id, version)
);

CREATE INDEX IF NOT EXISTS idx_space_key_versions_space_created
    ON space_key_versions (space_id, created_at DESC);

CREATE TABLE IF NOT EXISTS space_posts (
    post_id              BIGSERIAL PRIMARY KEY,
    space_id              TEXT    NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    owner_id             BIGINT  NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    encrypted_post_key   TEXT    NOT NULL,
    caption_cipher       TEXT    NOT NULL DEFAULT '',
    key_version          INTEGER NOT NULL DEFAULT 1,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_space_posts_space_created
    ON space_posts (space_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_space_posts_owner_created
    ON space_posts (owner_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE TRIGGER update_space_posts_updated_at
    BEFORE UPDATE ON space_posts
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_post_assets (
    asset_id             BIGSERIAL PRIMARY KEY,
    post_id              BIGINT NOT NULL REFERENCES space_posts (post_id) ON DELETE CASCADE,
    object_key           TEXT   NOT NULL,
    bucket_id            TEXT   NOT NULL,
    size                 BIGINT,
    position             INTEGER NOT NULL DEFAULT 0,
    metadata_cipher      TEXT   NOT NULL,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT uq_space_post_assets_object_key UNIQUE (object_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_space_post_assets_position
    ON space_post_assets (post_id, position);

CREATE INDEX IF NOT EXISTS idx_space_post_assets_post_position
    ON space_post_assets (post_id, position ASC, asset_id ASC);

CREATE TABLE IF NOT EXISTS space_temp_objects (
    object_key      TEXT PRIMARY KEY,
    owner_id        BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    space_id         TEXT REFERENCES spaces (space_id) ON DELETE CASCADE,
    purpose         TEXT NOT NULL,
    bucket_id       TEXT NOT NULL,
    expected_size   BIGINT NOT NULL,
    expires_at      BIGINT NOT NULL,
    cleanup_after   BIGINT NOT NULL,
    created_at      BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_space_temp_objects_purpose CHECK (purpose IN ('post', 'avatar', 'cover')),
    CONSTRAINT chk_space_temp_objects_expected_size CHECK (expected_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_space_temp_objects_expires
    ON space_temp_objects (cleanup_after ASC);

CREATE INDEX IF NOT EXISTS idx_space_temp_objects_owner_purpose
    ON space_temp_objects (owner_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS space_post_likes (
    post_id      BIGINT NOT NULL REFERENCES space_posts (post_id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    actor_space_id TEXT  NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    created_at   BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (post_id, actor_space_id)
);

CREATE INDEX IF NOT EXISTS idx_space_post_likes_post_id
    ON space_post_likes (post_id);

CREATE INDEX IF NOT EXISTS idx_space_post_likes_post_created_user
    ON space_post_likes (post_id, created_at DESC, actor_space_id DESC);

CREATE INDEX IF NOT EXISTS idx_space_post_likes_user_created
    ON space_post_likes (user_id, created_at DESC, post_id DESC);

CREATE TABLE IF NOT EXISTS space_friend_shares (
    space_id              TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    friend_id            BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    friend_space_id       TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    encrypted_space_key   TEXT   NOT NULL,
    key_version          INTEGER NOT NULL DEFAULT 1,
    created_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (space_id, friend_space_id)
);

CREATE INDEX IF NOT EXISTS idx_space_friend_shares_friend
    ON space_friend_shares (friend_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_space_friend_shares_friend_space
    ON space_friend_shares (friend_space_id, created_at DESC);

CREATE TRIGGER update_space_friend_shares_updated_at
    BEFORE UPDATE ON space_friend_shares
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_friend_events (
    event_id        BIGSERIAL PRIMARY KEY,
    event_type      TEXT   NOT NULL DEFAULT 'friend_add',
    actor_id        BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    actor_space_id   TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    target_id       BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    target_space_id  TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    created_at      BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_space_friend_events_distinct_users CHECK (actor_id <> target_id),
    CONSTRAINT chk_space_friend_events_type CHECK (event_type IN ('friend_add', 'friend_remove'))
);

CREATE INDEX IF NOT EXISTS idx_space_friend_events_target_created
    ON space_friend_events (target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_space_friend_events_target_type_created
    ON space_friend_events (target_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_space_friend_events_target_space_created
    ON space_friend_events (target_space_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_space_friend_events_target_space_type_created
    ON space_friend_events (target_space_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION tg_space_messages_null_cipher_on_delete() RETURNS trigger AS $$
BEGIN
    IF NEW.is_deleted THEN
        NEW.message_cipher := NULL;
        NEW.sender_encrypted_message_key := NULL;
        NEW.recipient_encrypted_message_key := NULL;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS space_messages (
    message_id                      TEXT PRIMARY KEY,
    sender_id                       BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    sender_space_id                  TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    recipient_id                    BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    recipient_space_id               TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    thread_key                      TEXT GENERATED ALWAYS AS (
        CASE
            WHEN sender_space_id < recipient_space_id
                THEN sender_space_id || ':' || recipient_space_id
            ELSE recipient_space_id || ':' || sender_space_id
        END
    ) STORED,
    kind                            TEXT   NOT NULL,
    message_cipher                  TEXT,
    sender_encrypted_message_key    TEXT,
    recipient_encrypted_message_key TEXT,
    reply_post_id                   BIGINT REFERENCES space_posts (post_id) ON DELETE SET NULL,
    reply_message_id                TEXT REFERENCES space_messages (message_id) ON DELETE SET NULL,
    is_deleted                      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                      BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at                      BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_space_messages_distinct_users CHECK (sender_id <> recipient_id),
    CONSTRAINT chk_space_messages_kind CHECK (kind IN ('regular', 'post_reply')),
    CONSTRAINT chk_space_messages_regular_shape CHECK (kind <> 'regular' OR reply_post_id IS NULL),
    CONSTRAINT chk_space_messages_single_reply_target CHECK (reply_post_id IS NULL OR reply_message_id IS NULL),
    CONSTRAINT chk_space_messages_cipher_on_delete CHECK (
        (
            is_deleted = FALSE
            AND message_cipher IS NOT NULL
            AND sender_encrypted_message_key IS NOT NULL
            AND recipient_encrypted_message_key IS NOT NULL
        ) OR (
            is_deleted = TRUE
            AND message_cipher IS NULL
            AND sender_encrypted_message_key IS NULL
            AND recipient_encrypted_message_key IS NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_space_messages_sender_updated
    ON space_messages (sender_id, updated_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_space_messages_recipient_updated
    ON space_messages (recipient_id, updated_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_space_messages_sender_space_created
    ON space_messages (sender_space_id, created_at DESC, message_id DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_space_messages_recipient_space_created
    ON space_messages (recipient_space_id, created_at DESC, message_id DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_space_messages_thread_created
    ON space_messages (thread_key, created_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_space_messages_reply_post
    ON space_messages (reply_post_id)
    WHERE reply_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_space_messages_reply_message
    ON space_messages (reply_message_id)
    WHERE reply_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS space_message_likes (
    message_id  TEXT   NOT NULL REFERENCES space_messages (message_id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    actor_space_id TEXT NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    created_at  BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (message_id, actor_space_id)
);

CREATE INDEX IF NOT EXISTS idx_space_message_likes_user_created
    ON space_message_likes (user_id, created_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_space_message_likes_actor_created
    ON space_message_likes (actor_space_id, created_at DESC, message_id DESC);

CREATE TRIGGER space_messages_null_cipher_on_delete
    BEFORE INSERT OR UPDATE ON space_messages
    FOR EACH ROW
EXECUTE PROCEDURE tg_space_messages_null_cipher_on_delete();

CREATE TRIGGER update_space_messages_updated_at
    BEFORE UPDATE ON space_messages
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_links (
    space_id                TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    auth_key_hash          BYTEA   NOT NULL UNIQUE,
    key_version            INTEGER NOT NULL,
    encrypted_space_key     TEXT    NOT NULL,
    encrypted_access_key   TEXT    NOT NULL,
    active                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at             BIGINT  NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_space_links_active
    ON space_links (active, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_space_links_active_space
    ON space_links (space_id)
    WHERE active = TRUE;

CREATE TRIGGER update_space_links_updated_at
    BEFORE UPDATE ON space_links
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS space_link_sessions (
    token_hash           BYTEA PRIMARY KEY,
    space_id              TEXT   NOT NULL REFERENCES spaces (space_id) ON DELETE CASCADE,
    owner_id             BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    auth_key_hash        BYTEA   NOT NULL,
    key_version          INTEGER NOT NULL,
    expires_at           BIGINT NOT NULL,
    created_at           BIGINT NOT NULL DEFAULT now_utc_micro_seconds()
);

CREATE INDEX IF NOT EXISTS idx_space_link_sessions_space
    ON space_link_sessions (space_id, expires_at DESC);
