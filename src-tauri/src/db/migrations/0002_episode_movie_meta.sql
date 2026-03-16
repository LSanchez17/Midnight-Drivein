-- 0002_episode_movie_meta.sql
-- Adds movie metadata hint columns to episode and makes playback_cut.end_ms nullable.

ALTER TABLE episode ADD COLUMN host_label         TEXT;
ALTER TABLE episode ADD COLUMN movie_title        TEXT;
ALTER TABLE episode ADD COLUMN movie_year         INTEGER;
ALTER TABLE episode ADD COLUMN movie_aliases_json TEXT;

-- SQLite does not support DROP NOT NULL on an existing column.
-- Recreate playback_cut with end_ms nullable (NULL = play to end of file).
CREATE TABLE playback_cut_new (
    id              TEXT    PRIMARY KEY,
    episode_id      TEXT    NOT NULL REFERENCES episode (id),
    sort_order      INTEGER NOT NULL,
    source_type     TEXT    NOT NULL CHECK (source_type IN ('movie', 'segment')),
    start_ms        INTEGER NOT NULL,
    end_ms          INTEGER,
    user_offset_ms  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (episode_id, sort_order)
);
INSERT INTO playback_cut_new SELECT * FROM playback_cut;
DROP TABLE playback_cut;
ALTER TABLE playback_cut_new RENAME TO playback_cut;
