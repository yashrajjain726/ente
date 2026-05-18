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
    width                INTEGER,
    height               INTEGER,
    media_type           TEXT,
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

CREATE INDEX IF NOT EXISTS idx_wall_post_likes_post_created_user
    ON wall_post_likes (post_id, created_at DESC, user_id DESC);

CREATE TABLE IF NOT EXISTS wall_friend_shares (
    wall_id              TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    friend_id            BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    encrypted_wall_key   TEXT   NOT NULL,
    key_version          INTEGER NOT NULL DEFAULT 1,
    created_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at           BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (wall_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_wall_friend_shares_friend
    ON wall_friend_shares (friend_id, created_at DESC);

CREATE TRIGGER update_wall_friend_shares_updated_at
    BEFORE UPDATE ON wall_friend_shares
    FOR EACH ROW
EXECUTE PROCEDURE trigger_updated_at_microseconds_column();

CREATE TABLE IF NOT EXISTS wall_friend_events (
    event_id        BIGSERIAL PRIMARY KEY,
    event_type      TEXT   NOT NULL DEFAULT 'friend_add',
    actor_id        BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    actor_wall_id   TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    target_id       BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    target_wall_id  TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    created_at      BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_wall_friend_events_distinct_users CHECK (actor_id <> target_id),
    CONSTRAINT chk_wall_friend_events_type CHECK (event_type IN ('friend_add', 'friend_remove'))
);

CREATE INDEX IF NOT EXISTS idx_wall_friend_events_target_created
    ON wall_friend_events (target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wall_friend_events_target_type_created
    ON wall_friend_events (target_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION tg_wall_messages_null_cipher_on_delete() RETURNS trigger AS $$
BEGIN
    IF NEW.is_deleted THEN
        NEW.message_cipher := NULL;
        NEW.sender_encrypted_message_key := NULL;
        NEW.recipient_encrypted_message_key := NULL;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS wall_messages (
    message_id                      TEXT PRIMARY KEY,
    sender_id                       BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    sender_wall_id                  TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    recipient_id                    BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    recipient_wall_id               TEXT   NOT NULL REFERENCES walls (wall_id) ON DELETE CASCADE,
    thread_key                      TEXT GENERATED ALWAYS AS (
        CASE
            WHEN sender_wall_id < recipient_wall_id
                THEN sender_wall_id || ':' || recipient_wall_id
            ELSE recipient_wall_id || ':' || sender_wall_id
        END
    ) STORED,
    kind                            TEXT   NOT NULL,
    message_cipher                  TEXT,
    sender_encrypted_message_key    TEXT,
    recipient_encrypted_message_key TEXT,
    reply_post_id                   BIGINT REFERENCES wall_posts (post_id) ON DELETE SET NULL,
    reply_message_id                TEXT REFERENCES wall_messages (message_id) ON DELETE SET NULL,
    is_deleted                      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                      BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    updated_at                      BIGINT  NOT NULL DEFAULT now_utc_micro_seconds(),
    CONSTRAINT chk_wall_messages_distinct_users CHECK (sender_id <> recipient_id),
    CONSTRAINT chk_wall_messages_kind CHECK (kind IN ('regular', 'post_reply')),
    CONSTRAINT chk_wall_messages_regular_shape CHECK (kind <> 'regular' OR reply_post_id IS NULL),
    CONSTRAINT chk_wall_messages_single_reply_target CHECK (reply_post_id IS NULL OR reply_message_id IS NULL),
    CONSTRAINT chk_wall_messages_cipher_on_delete CHECK (
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

CREATE INDEX IF NOT EXISTS idx_wall_messages_sender_updated
    ON wall_messages (sender_id, updated_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_wall_messages_recipient_updated
    ON wall_messages (recipient_id, updated_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_wall_messages_thread_created
    ON wall_messages (thread_key, created_at DESC, message_id DESC);

CREATE INDEX IF NOT EXISTS idx_wall_messages_reply_post
    ON wall_messages (reply_post_id)
    WHERE reply_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wall_messages_reply_message
    ON wall_messages (reply_message_id)
    WHERE reply_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wall_message_likes (
    message_id  TEXT   NOT NULL REFERENCES wall_messages (message_id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at  BIGINT NOT NULL DEFAULT now_utc_micro_seconds(),
    PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wall_message_likes_user_created
    ON wall_message_likes (user_id, created_at DESC, message_id DESC);

CREATE TRIGGER wall_messages_null_cipher_on_delete
    BEFORE INSERT OR UPDATE ON wall_messages
    FOR EACH ROW
EXECUTE PROCEDURE tg_wall_messages_null_cipher_on_delete();

CREATE TRIGGER update_wall_messages_updated_at
    BEFORE UPDATE ON wall_messages
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
