-- 0004_scan_index.sql
-- Spec 0010 — Scan and Index Local Media

-- Enable UPSERT by path on media_file.
-- Rescans update existing rows rather than inserting duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS media_file_path_uq ON media_file (path);

-- Singleton table that persists the last scan summary so the UI can hydrate
-- immediately on boot without requiring a rescan.
-- id is always 1; INSERT OR REPLACE is used to update it.
CREATE TABLE IF NOT EXISTS scan_summary (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    last_scan_at         TEXT    NOT NULL,
    movie_file_count     INTEGER NOT NULL DEFAULT 0,
    segment_file_count   INTEGER NOT NULL DEFAULT 0,
    errors_json          TEXT    NOT NULL DEFAULT '[]',
    missing_folders_json TEXT    NOT NULL DEFAULT '[]'
);
