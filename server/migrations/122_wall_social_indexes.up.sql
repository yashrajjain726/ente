CREATE INDEX IF NOT EXISTS idx_wall_post_likes_post_created_user
    ON wall_post_likes (post_id, created_at DESC, user_id DESC);

CREATE INDEX IF NOT EXISTS idx_wall_post_comments_post_comment_desc
    ON wall_post_comments (post_id, comment_id DESC)
    WHERE is_deleted = FALSE;
