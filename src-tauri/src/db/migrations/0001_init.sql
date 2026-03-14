-- 0001_init.sql
-- Schema from spec 0005 — Local Data Model

CREATE TABLE IF NOT EXISTS app_settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    movies_folder   TEXT,
    segments_folder TEXT,
    scan_on_startup INTEGER NOT NULL DEFAULT 0,
    theme           TEXT    NOT NULL DEFAULT 'dark',
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS episode (
    id          TEXT PRIMARY KEY,
    title       TEXT    NOT NULL,
    season      INTEGER,
    episode     INTEGER,
    is_special  INTEGER NOT NULL DEFAULT 0,
    air_date    TEXT,
    description TEXT,
    created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS media_file (
    id           TEXT PRIMARY KEY,
    filename     TEXT    NOT NULL,
    display_name TEXT,
    path         TEXT    NOT NULL,
    folder_root  TEXT    NOT NULL CHECK (folder_root IN ('movies', 'segments')),
    size_bytes   INTEGER,
    duration_ms  INTEGER,
    last_seen_at TEXT    NOT NULL,
    is_missing   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS file_match (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id         TEXT    NOT NULL REFERENCES episode (id),
    file_type          TEXT    NOT NULL CHECK (file_type IN ('movie', 'segment')),
    media_file_id      TEXT    REFERENCES media_file (id),
    match_status       TEXT    NOT NULL CHECK (match_status IN ('matched', 'low-confidence', 'missing')),
    confidence         REAL,
    is_user_overridden INTEGER NOT NULL DEFAULT 0,
    matched_at         TEXT,
    UNIQUE (episode_id, file_type)
);

CREATE TABLE IF NOT EXISTS playback_cut (
    id              TEXT    PRIMARY KEY,
    episode_id      TEXT    NOT NULL REFERENCES episode (id),
    sort_order      INTEGER NOT NULL,
    source_type     TEXT    NOT NULL CHECK (source_type IN ('movie', 'segment')),
    start_ms        INTEGER NOT NULL,
    end_ms          INTEGER NOT NULL,
    user_offset_ms  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (episode_id, sort_order)
);

CREATE TABLE IF NOT EXISTS playback_override (
    episode_id          TEXT PRIMARY KEY REFERENCES episode (id),
    flagged_for_timing  INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);
