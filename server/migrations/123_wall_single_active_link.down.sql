ALTER TABLE wall_links
    DROP CONSTRAINT IF EXISTS wall_links_pkey;

ALTER TABLE wall_links
    ADD PRIMARY KEY (wall_id, auth_key_hash);

CREATE INDEX IF NOT EXISTS idx_wall_links_wall_updated
    ON wall_links (wall_id, updated_at DESC);
