# 0009 — Movie Slot Model

## Status
Draft

## Summary
Real broadcast records reveal that a single episode (what the user calls "S01E01")
contains one to N movies, each paired with its own segment reel. Spec 0008 modelled
each movie as a separate top-level episode row, duplicating broadcast metadata (title,
air date, guests) across rows and breaking the user's mental model.

This spec introduces a `movie_slot` table as a child of `episode`. Each slot holds one
movie + one segment reel, with its own file matches, playback cuts, and timing override.
`episode` becomes the broadcast-level entity. `EpisodeStatus` is derived as
**worst-slot-wins** across all of the broadcast's slots.

**Supersedes:** The `host_label`, `movie_title`, `movie_year`, `movie_aliases_json`
columns added to `episode` in spec 0008 migration `0002` move to `movie_slot`.
`playback_cut.episode_id` and `file_match.episode_id` become `slot_id`.

**Acceptance criteria:**
- Library page shows one card per broadcast (not one per movie slot)
- Each card's status badge reflects worst-slot-wins across all slots
- Detail page shows all slots for a broadcast with independent cut timelines
- `cargo test -p app` and `yarn test` both pass
- Cold-start reseed from updated JSON populates episodes, slots, and cuts correctly

---

## JSON schema

**Location:** `src-tauri/resources/episodes.json` (same file, restructured shape)

```json
[
  {
    "id": "s01e01",
    "season": 1,
    "episode": 1,
    "is_special": false,
    "title": "Season 1 Episode 1",
    "description": "Week 1",
    "air_date": "2019-03-29",
    "guests": ["Barbara Crampton", "Felissa Rose"],
    "movies": [
      {
        "slot": "a",
        "host_label": "S01E01A Segments",
        "movie": { "title": "C.H.U.D.", "year": 1984, "aliases": [] },
        "cuts": [
          { "source": "segment", "start_ms": 0,      "end_ms": 185000  },
          { "source": "movie",   "start_ms": 0,      "end_ms": 4120000 },
          { "source": "segment", "start_ms": 185000, "end_ms": null    }
        ]
      },
      {
        "slot": "b",
        "host_label": "S01E01B Segments",
        "movie": { "title": "Castle Freak", "year": 1995, "aliases": [] },
        "cuts": []
      }
    ]
  }
]
```

### Episode-level field reference

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | No | Stable PK unique per broadcast: `s01e01`, `special-01` |
| `season` | integer | Yes | Null for specials |
| `episode` | integer | Yes | Broadcast number within the season |
| `is_special` | boolean | No | Drives query filters |
| `title` | string | No | Broadcast display title |
| `description` | string | Yes | Free-text notes; empty string treated as null on insert |
| `air_date` | string | Yes | ISO 8601 date `YYYY-MM-DD` |
| `guests` | string[] | No | Guest names; `[]` when none |
| `movies` | array | No | One entry per movie slot; minimum length 1 |

### Slot-level field reference (`movies[]`)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `slot` | string | No | Position within broadcast: `"a"`, `"b"`, `"c"`… |
| `host_label` | string | Yes | Display name for this slot's segment reel |
| `movie` | object | Yes | Omit for segment-only specials |
| `movie.title` | string | No | Used as scan hint for file matching |
| `movie.year` | integer | Yes | Secondary scan hint |
| `movie.aliases` | string[] | No | Alternate match strings; `[]` when none |
| `cuts` | array | No | Ordered playback sequence for this slot; `[]` while unknown |
| `cuts[].source` | `"segment" \| "movie"` | No | Which source file this cut draws from |
| `cuts[].start_ms` | integer | No | Start ms within source file; `0` as placeholder |
| `cuts[].end_ms` | integer | Yes | End ms; `null` = play to end of file |

### Invariants

- `id` is unique across all broadcast entries — one object per broadcast night.
- `(id, slot)` is unique — no two slots on the same broadcast share a key.
- Slot ordering for playback is alphabetical on `slot` (`"a"` before `"b"`).
- `user_offset_ms` is absent from JSON — defaults to `0` in DB, modified only by the user.
- Cuts with unknown timestamps use `"start_ms": 0, "end_ms": null` as placeholder.

---

## Schema changes (migration 0003)

Applied as `src-tauri/src/db/migrations/0003_movie_slot.sql`.

### New `movie_slot` table

```sql
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
```

### `episode` table — remove 0002 columns, add `guests`

Recreate to drop `host_label`, `movie_title`, `movie_year`, `movie_aliases_json`
(moved to `movie_slot`) and add `guests`. `air_date` already exists from `0001`.

```sql
CREATE TABLE episode_new (
    id          TEXT PRIMARY KEY,
    title       TEXT    NOT NULL,
    season      INTEGER,
    episode     INTEGER,
    is_special  INTEGER NOT NULL DEFAULT 0,
    air_date    TEXT,
    description TEXT,
    guests_json  TEXT    NOT NULL DEFAULT '[]',
    created_at  TEXT    NOT NULL
);
INSERT INTO episode_new
    SELECT id, title, season, episode, is_special,
           air_date, description, '[]', created_at
    FROM episode;
DROP TABLE episode;
ALTER TABLE episode_new RENAME TO episode;
```

### `file_match` — `episode_id` → `slot_id`

```sql
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
```

### `playback_cut` — `episode_id` → `slot_id`

```sql
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
```

### `playback_override` — `episode_id` → `slot_id`

Timing flags are per-slot (timing of that movie's specific cuts, not the whole broadcast):

```sql
CREATE TABLE playback_override_new (
    slot_id            TEXT PRIMARY KEY REFERENCES movie_slot (id),
    flagged_for_timing INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
);
DROP TABLE playback_override;
ALTER TABLE playback_override_new RENAME TO playback_override;
```

---

## Rust seeder (`src-tauri/src/db/seed.rs`)

### Updated deserialise structs

```rust
struct EpisodeJson {
    id: String,
    season: Option<i64>,
    episode: Option<i64>,
    is_special: bool,
    title: String,
    description: Option<String>,
    air_date: Option<String>,
    guests: Vec<String>,
    movies: Vec<SlotJson>,
}

struct SlotJson {
    slot: String,
    host_label: Option<String>,
    movie: Option<MovieJson>,
    cuts: Vec<CutJson>,
}

// MovieJson and CutJson unchanged from spec 0008
```

### Updated seed logic

For each broadcast episode:

1. `INSERT OR IGNORE INTO episode (id, title, season, episode, is_special,
   description, air_date, guests, created_at)`
2. For each slot in `movies`:
   - `slot_id = "{episode_id}-{slot}"` — e.g. `"s01e01-a"`
   - `INSERT OR IGNORE INTO movie_slot (id, episode_id, slot, host_label,
     movie_title, movie_year, movie_aliases_json)`
   - For each cut (1-based index → `sort_order`):
     - `cut_id = "{slot_id}-c{sort_order}"` — e.g. `"s01e01-a-c1"`
     - `INSERT OR IGNORE INTO playback_cut (id, slot_id, sort_order, source_type,
       start_ms, end_ms, user_offset_ms)`

---

## Rust command layer (`src-tauri/src/commands/episodes.rs`)

### New wire type `MovieSlotRow`

```rust
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MovieSlotRow {
    pub id: String,
    pub slot: String,
    pub host_label: Option<String>,
    pub movie_title: Option<String>,
    pub movie_year: Option<i64>,
    pub movie_match: FileMatchRow,
    pub segment_match: FileMatchRow,
    pub cuts: Vec<PlaybackCutRow>,
    pub flagged_for_timing: bool,
}
```

### Updated `EpisodeRow`

Remove: `movie_match`, `segment_match`, `cuts`, `host_label`, `movie_title`,
`movie_year`, `flagged_for_timing`.

Add:

```rust
pub guests: Option<String>,
pub slots: Vec<MovieSlotRow>,
```

### Query restructure in `get_episodes_inner`

Two-phase fetch:

1. Fetch all `episode` rows (plain SELECT, no joins — broadcast data is flat)
2. For the batch of episode IDs, fetch all `movie_slot` rows with LEFT JOINs on
   `file_match` / `media_file` / `playback_override` keyed on `slot_id`
   (same JOIN pattern as current query, just anchored to `movie_slot` not `episode`)
3. Fetch all `playback_cut` rows by `slot_id IN (...)`, group by `slot_id`
4. Assemble `MovieSlotRow` per slot, then `EpisodeRow { ..., slots }`

### `playback.rs` — argument renames

| Command | Before | After | Reason |
|---|---|---|---|
| `save_cut_offset` | `cut_id` | unchanged | cut PK is already slot-scoped |
| `save_playback_override` | `episode_id` | `slot_id` | flag is per-slot |
| `remap_file` | `episode_id` | `slot_id` | match is per-slot |

---

## TypeScript changes

### New `MovieSlot` type (`src/features/episodes/types.ts`)

```ts
export interface MovieSlot {
    id: string
    slot: string
    hostLabel?: string
    movieTitle?: string
    movieYear?: number
    movieMatch: FileMatch
    segmentMatch: FileMatch
    cuts: PlaybackCut[]
    flaggedForTiming: boolean
}
```

### Updated `Episode` type

Remove: `movieMatch`, `segmentMatch`, `cuts`, `hostLabel`, `movieTitle`, `movieYear`,
`flaggedForTiming`.

Add:

```ts
guests: string[]
slots: MovieSlot[]
```

### `deriveEpisodeStatus` — worst-slot-wins (`src/lib/derive/episodeStatus.ts`)

```ts
export function deriveEpisodeStatus(episode: Episode): EpisodeStatus {
    if (episode.slots.length === 0) return 'Missing Files'

    const statuses = episode.slots.map(deriveSlotStatus)
    if (statuses.some(s => s === 'Missing Files'))    return 'Missing Files'
    if (statuses.some(s => s === 'Partial Match'))    return 'Partial Match'
    if (statuses.some(s => s === 'Needs Timing Fix')) return 'Needs Timing Fix'
    return 'Ready'
}

function deriveSlotStatus(slot: MovieSlot): EpisodeStatus {
    const matches = [slot.movieMatch, slot.segmentMatch]
    if (matches.some(m => m.status === 'missing'))        return 'Missing Files'
    if (matches.some(m => m.status === 'low-confidence')) return 'Partial Match'
    const hasOffset = slot.cuts.some(c => c.userOffsetMs !== 0)
    if (hasOffset || slot.flaggedForTiming)               return 'Needs Timing Fix'
    return 'Ready'
}
```

### `_tauri.ts` wire types

New `MovieSlotWire` mirrors `MovieSlotRow`. `EpisodeRowWire` replaces its per-episode
match/cut fields with `slots: MovieSlotWire[]` and adds `guests: string[] | null`.
`toEpisode()` maps `slots` through a new `toSlot()` adapter; null `guests` maps to `[]`.

### `_tauri.ts` — callers

`savePlaybackOverride(episodeId, flagged)` → `savePlaybackOverride(slotId, flagged)`.
`remapFile(episodeId, fileType, mediaFileId)` → `remapFile(slotId, fileType, mediaFileId)`.

### `_mock.ts`

`savePlaybackOverride` and `remapFile` parameter names updated to `slotId`.

### `mocks.ts`

Each mock `Episode` gets a `slots: [{ ... }]` array wrapping the current
`movieMatch`, `segmentMatch`, `cuts`, and `flaggedForTiming` into a single slot
(`slot: "a"`). `hostLabel`, `movieTitle`, `movieYear` move inside the slot object.
`movieMatch` and `segmentMatch` removed from the top-level episode object.

### Test fixture (`src/api/__tests__/episodes.test.ts`)

`makeRow()` updated: remove top-level match fields, add `slots: []` (empty slots
tests the zero-slot → Missing Files path). Add a `makeSlotRow()` helper for tests
that need a slot with matches.

---

## Native vs. client-derived (addendum to spec 0006 and 0008)

| Field | Source | Reason |
|---|---|---|
| `movie_slot` rows | Native (seeded from JSON) | One row per movie per broadcast |
| `guests` | Native (seeded from JSON) | String array stored as JSON; enables future guest filtering |
| `air_date` | Native (seeded from JSON) | Was deferred in 0008; populated here |
| `EpisodeStatus` | Client-derived | Worst-slot-wins across all `MovieSlot` statuses |
| Per-slot status | Client-derived | `deriveSlotStatus()` available for detail page UI |

---

## What is not in scope

- Per-slot status badges on the Library card (episode-level badge only for now)
- Guest filtering / search UI (array stored as JSON; structured querying is a future spec)
- `air_date` display on Library card (data present; UI placement deferred)
- Scan command changes — `scan.rs` still references episode-level folder config;
  slot-aware scan hints (`movie_title`, `movie_year`) are a future spec (0010)

---

## Verification

| # | Check | How |
|---|---|---|
| 1 | Migration applies cleanly | `cargo build` — no sqlx compile errors |
| 2 | Existing Rust tests pass | `cargo test -p app` |
| 3 | Seeder creates slot rows | New Rust test: 1-episode / 2-slot fixture → `COUNT(*) FROM movie_slot = 2` |
| 4 | Cuts reference slots not episodes | Assert `playback_cut.slot_id` matches `movie_slot.id` in seeder test |
| 5 | Seeder idempotent | Call twice; all counts unchanged |
| 6 | TypeScript tests pass | `yarn test` |
| 7 | Worst-slot status | TS unit test: episode with one Ready slot + one Missing Files slot → `'Missing Files'` |
| 8 | Library shows one card per broadcast | `yarn tauri dev` → s01e01 appears once |
| 9 | Detail page shows all slots | Navigate to s01e01; two film sections visible |
