-- 0003_movie_slot.sql
-- Introduces movie_slot as a child of episode.
-- Moves host_label/movie_*/cuts FKs from episode_id → slot_id.
-- Adds guests_json to episode.

-- ── New table ──────────────────────────────────────────────────────────────

CREATE TABLE movie_slot (
    id                  TEXT    PRIMARY KEY,
    -- Deterministic ID: "{episode_id}-{slot}", e.g. "s01e01-a"
    episode_id          TEXT    NOT NULL REFERENCES episode (id),
    slot                TEXT    NOT NULL,
    host_label          TEXT,
    movie_title         TEXT,
    movie_year          INTEGER,
    movie_aliases_json  TEXT,
    UNIQUE (episode_id, slot)
);

-- ── Recreate episode ────────────────────────────────────────────────────────
-- Drops 0002 hint columns (host_label, movie_title, movie_year, movie_aliases_json)
-- and adds guests_json. air_date already exists from 0001.

CREATE TABLE episode_new (
    id          TEXT    PRIMARY KEY,
    title       TEXT    NOT NULL,
    season      INTEGER,
    episode     INTEGER,
    is_special  INTEGER NOT NULL DEFAULT 0,
    air_date    TEXT,
    description TEXT,
    guests_json TEXT    NOT NULL DEFAULT '[]',
    created_at  TEXT    NOT NULL
);
INSERT INTO episode_new (id, title, season, episode, is_special, air_date, description, guests_json, created_at)
    SELECT id, title, season, episode, is_special, air_date, description, '[]', created_at
    FROM episode;
DROP TABLE episode;
ALTER TABLE episode_new RENAME TO episode;

-- ── Recreate file_match ─────────────────────────────────────────────────────
-- episode_id FK replaced by slot_id → movie_slot (id)

CREATE TABLE file_match_new (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id            TEXT    NOT NULL REFERENCES movie_slot (id),
    file_type          TEXT    NOT NULL CHECK (file_type IN ('movie', 'segment')),
    media_file_id      TEXT    REFERENCES media_file (id),
    match_status       TEXT    NOT NULL CHECK (match_status IN ('matched', 'low-confidence', 'missing')),
    confidence         REAL,
    is_user_overridden INTEGER NOT NULL DEFAULT 0,
    matched_at         TEXT,
    UNIQUE (slot_id, file_type)
);
-- No existing rows expected in fresh installs; prior data is abandoned.
DROP TABLE file_match;
ALTER TABLE file_match_new RENAME TO file_match;

-- ── Recreate playback_cut ───────────────────────────────────────────────────
-- episode_id FK replaced by slot_id → movie_slot (id)

CREATE TABLE playback_cut_new (
    id              TEXT    PRIMARY KEY,
    slot_id         TEXT    NOT NULL REFERENCES movie_slot (id),
    sort_order      INTEGER NOT NULL,
    source_type     TEXT    NOT NULL CHECK (source_type IN ('movie', 'segment')),
    start_ms        INTEGER NOT NULL,
    end_ms          INTEGER,
    user_offset_ms  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (slot_id, sort_order)
);
DROP TABLE playback_cut;
ALTER TABLE playback_cut_new RENAME TO playback_cut;

-- ── Recreate playback_override ──────────────────────────────────────────────
-- Timing flags are per-slot (not per-broadcast).

CREATE TABLE playback_override_new (
    slot_id            TEXT    PRIMARY KEY REFERENCES movie_slot (id),
    flagged_for_timing INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
);
DROP TABLE playback_override;
ALTER TABLE playback_override_new RENAME TO playback_override;
