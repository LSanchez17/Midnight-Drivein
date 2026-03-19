-- 0007_end_ms_not_null.sql
-- end_ms is now always required; the NULL sentinel for "play to end of file" is removed.
-- Authors provide explicit end times; user offsets handle local file duration differences.

PRAGMA foreign_keys = OFF;

CREATE TABLE playback_cut_new (
    id              TEXT    PRIMARY KEY,
    slot_id         TEXT    NOT NULL REFERENCES movie_slot (id),
    sort_order      INTEGER NOT NULL,
    source_type     TEXT    NOT NULL CHECK (source_type IN ('movie', 'commentary')),
    start_ms        INTEGER NOT NULL,
    end_ms          INTEGER NOT NULL,
    user_offset_ms  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (slot_id, sort_order)
);

-- COALESCE converts any legacy NULL rows to 0 to prevent migration failure on existing DBs.
-- Rows with end_ms = 0 will produce zero-duration cuts; clear and reseed if that occurs.
INSERT INTO playback_cut_new
    SELECT id, slot_id, sort_order, source_type, start_ms, COALESCE(end_ms, 0), user_offset_ms
    FROM playback_cut;

DROP TABLE playback_cut;
ALTER TABLE playback_cut_new RENAME TO playback_cut;

PRAGMA foreign_keys = ON;
