-- 0006_commentary_rename.sql
-- Renames all "segment" terminology to "commentary" across the schema.
-- Includes table rebuilds for movie_slot (host_label → commentary),
-- media_file (CHECK constraint update), and file_match (CHECK constraint update).

PRAGMA foreign_keys = OFF;

-- 1. movie_slot: rename host_label column to commentary
ALTER TABLE movie_slot RENAME COLUMN host_label TO commentary;

-- 2. playback_cut: update source_type values and rebuild to fix CHECK constraint
UPDATE playback_cut SET source_type = 'commentary' WHERE source_type = 'segment';

CREATE TABLE playback_cut_new (
    id              TEXT    PRIMARY KEY,
    slot_id         TEXT    NOT NULL REFERENCES movie_slot (id),
    sort_order      INTEGER NOT NULL,
    source_type     TEXT    NOT NULL CHECK (source_type IN ('movie', 'commentary')),
    start_ms        INTEGER NOT NULL,
    end_ms          INTEGER,
    user_offset_ms  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (slot_id, sort_order)
);

INSERT INTO playback_cut_new
    SELECT id, slot_id, sort_order, source_type, start_ms, end_ms, user_offset_ms
    FROM playback_cut;

DROP TABLE playback_cut;
ALTER TABLE playback_cut_new RENAME TO playback_cut;

-- 3. file_match: update file_type values and rebuild to fix CHECK constraint
CREATE TABLE file_match_new (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id            TEXT    NOT NULL REFERENCES movie_slot(id),
    file_type          TEXT    NOT NULL CHECK (file_type IN ('movie', 'commentary')),
    media_file_id      TEXT    REFERENCES media_file(id),
    match_status       TEXT    NOT NULL DEFAULT 'missing'
                               CHECK (match_status IN ('matched', 'low-confidence', 'missing')),
    confidence         REAL,
    is_user_overridden INTEGER NOT NULL DEFAULT 0,
    matched_at         TEXT,
    UNIQUE (slot_id, file_type)
);

INSERT INTO file_match_new
    SELECT
        id,
        slot_id,
        CASE WHEN file_type = 'segment' THEN 'commentary' ELSE file_type END,
        media_file_id,
        match_status,
        confidence,
        is_user_overridden,
        matched_at
    FROM file_match;

DROP TABLE file_match;
ALTER TABLE file_match_new RENAME TO file_match;

-- 4. app_settings: rename segments_folder column
ALTER TABLE app_settings RENAME COLUMN segments_folder TO commentary_folder;

-- 5. scan_summary: rename segment_file_count column
ALTER TABLE scan_summary RENAME COLUMN segment_file_count TO commentary_file_count;

-- 6. media_file: update folder_root values and rebuild to fix CHECK constraint
CREATE TABLE media_file_new (
    id           TEXT    PRIMARY KEY,
    filename     TEXT    NOT NULL,
    display_name TEXT,
    path         TEXT    NOT NULL UNIQUE,
    folder_root  TEXT    NOT NULL CHECK (folder_root IN ('movies', 'commentary')),
    size_bytes   INTEGER,
    duration_ms  INTEGER,
    last_seen_at TEXT    NOT NULL,
    is_missing   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO media_file_new
    SELECT
        id,
        filename,
        display_name,
        path,
        CASE WHEN folder_root = 'segments' THEN 'commentary' ELSE folder_root END,
        size_bytes,
        duration_ms,
        last_seen_at,
        is_missing
    FROM media_file;

DROP TABLE media_file;
ALTER TABLE media_file_new RENAME TO media_file;
CREATE UNIQUE INDEX media_file_path_uq ON media_file (path);

PRAGMA foreign_keys = ON;
