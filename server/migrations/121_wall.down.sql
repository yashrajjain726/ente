DROP TABLE IF EXISTS wall_link_sessions;

DROP TRIGGER IF EXISTS update_wall_links_updated_at ON wall_links;
DROP TABLE IF EXISTS wall_links;

DROP TABLE IF EXISTS wall_friend_events;

DROP TRIGGER IF EXISTS update_wall_friend_shares_updated_at ON wall_friend_shares;
DROP TABLE IF EXISTS wall_friend_shares;

DROP TABLE IF EXISTS wall_comment_likes;

DROP TRIGGER IF EXISTS update_wall_post_comments_updated_at ON wall_post_comments;
DROP TABLE IF EXISTS wall_post_comments;

DROP TABLE IF EXISTS wall_post_likes;
DROP TABLE IF EXISTS wall_temp_objects;
DROP TABLE IF EXISTS wall_post_assets;

DROP TRIGGER IF EXISTS update_wall_posts_updated_at ON wall_posts;
DROP TABLE IF EXISTS wall_posts;

DROP TABLE IF EXISTS wall_key_versions;

DROP TRIGGER IF EXISTS update_walls_updated_at ON walls;
DROP TABLE IF EXISTS walls;
