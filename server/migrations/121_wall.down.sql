DROP TABLE IF EXISTS wall_link_sessions;

DROP TRIGGER IF EXISTS update_wall_links_updated_at ON wall_links;
DROP TABLE IF EXISTS wall_links;

DROP TRIGGER IF EXISTS update_wall_follow_shares_updated_at ON wall_follow_shares;
DROP TABLE IF EXISTS wall_follow_shares;

DROP TRIGGER IF EXISTS update_wall_follow_requests_updated_at ON wall_follow_requests;
DROP TABLE IF EXISTS wall_follow_requests;

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
