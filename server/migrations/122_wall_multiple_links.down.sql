DELETE FROM wall_link_sessions;

DELETE FROM wall_links existing
USING wall_links newer
WHERE existing.wall_id = newer.wall_id
  AND (
    existing.updated_at < newer.updated_at
    OR (existing.updated_at = newer.updated_at AND existing.auth_key_hash < newer.auth_key_hash)
  );

DROP INDEX IF EXISTS idx_wall_links_wall_updated;

ALTER TABLE wall_links
    DROP CONSTRAINT IF EXISTS wall_links_pkey;

ALTER TABLE wall_links
    ADD PRIMARY KEY (wall_id);
