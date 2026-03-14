# 0008 — Episode Metadata Loading

## Status
Draft

## Summary
This spec introduces the canonical episode metadata source: a human-editable
`episodes.json` file bundled with the app. On first cold-start the Rust backend reads
the file and seeds the SQLite `episode` and `playback_cut` tables. Subsequent starts
skip the seed (idempotent). The Tauri `get_episodes` / `get_episode_by_id` commands
(already implemented per spec 0006) then serve live data to the existing UI pages —
replacing the TypeScript mock array as the runtime source of truth.

**Acceptance criteria:**
- `yarn tauri dev` → Library page shows real episode records loaded from JSON (not empty,
  not mock data)
- Detail page navigates to a real episode and renders cuts
- Deleting the DB and restarting re-seeds from JSON with no data loss
- Restarting with the DB intact skips the seed (log line confirms)
- `cargo test -p app` and `yarn test` both pass

---

## JSON schema

**Location:** `src-tauri/resources/episodes.json`
**Bundled via:** `bundle.resources` in `tauri.conf.json` (see _Tauri wiring_ below)
**Owner:** human-editable; the only place episode structure and movie metadata live

```json
[
  {
    "id": "s01e01",
    "season": 1,
    "episode": 1,
    "is_special": false,
    "title": "Season 1 Episode 1",
    "description": "",
    "host_label": "S01E01 Segments",
    "movie": {
      "title": "Tourist Trap",
      "year": 1979,
      "aliases": ["Tourist Trap 1979"]
    },
    "cuts": [
      { "source": "segment", "start_ms": 0,       "end_ms": 185000  },
      { "source": "movie",   "start_ms": 0,       "end_ms": 4120000 },
      { "source": "segment", "start_ms": 185000,  "end_ms": 352000  },
      { "source": "movie",   "start_ms": 4120000, "end_ms": null    },
      { "source": "segment", "start_ms": 352000,  "end_ms": null    }
    ]
  }
]
```

### Field reference

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | string | No | Stable human-readable PK: `s01e01`, `special-01`, etc. Used directly as SQLite PK |
| `season` | integer | Yes | Null for specials |
| `episode` | integer | Yes | Present for regular episodes and specials; null only if genuinely unknown |
| `is_special` | boolean | No | Drives query filters |
| `title` | string | No | Display title |
| `description` | string | Yes | Free-text description / host quote; empty string treated as null on insert |
| `host_label` | string | Yes | Display name for the segment reel (shown in file-match UI) |
| `movie` | object | Yes | Omit entirely for pure segment-only specials |
| `movie.title` | string | No | Used as scan hint for automatic file matching |
| `movie.year` | integer | Yes | Secondary scan hint |
| `movie.aliases` | string[] | No | Additional match strings for fuzzy scan; `[]` when none |
| `cuts[].source` | `"segment" \| "movie"` | No | Which of the two source files this cut draws from |
| `cuts[].start_ms` | integer | No | Start position within the source file in milliseconds |
| `cuts[].end_ms` | integer | Yes | End position in milliseconds; `null` = play to end of file |

### Invariants

- Each episode has **at most one movie** and **one segment reel**. No multi-movie entries.
- `cuts[].source` only ever contains `"segment"` or `"movie"` — no other values.
- Cut order in the array is the canonical playback order. `sort_order` is assigned
  1-based from the array index during seeding.
- `user_offset_ms` is not present in JSON — it defaults to `0` in the DB and is
  modified only by the user at runtime.
- `air_date` is not in JSON for this milestone (unknown for many entries). The DB column
  remains nullable and defaults to `NULL`.
- `movie` may be omitted for pure segment-only specials (commentary-only episodes with
  no paired film). All `movie.*` columns default to `NULL` in that case.

---

## Schema changes (migration 0002)

Applied as `src-tauri/src/db/migrations/0002_episode_movie_meta.sql`, run automatically
by `sqlx::migrate!` on startup after `0001_init.sql`.

### `episode` table

| Change | Detail |
| Add `host_label TEXT` | Nullable display name for the segment reel |
| Add `movie_title TEXT` | Nullable scan hint — movie title from JSON |
| Add `movie_year INTEGER` | Nullable scan hint — release year |
| Add `movie_aliases_json TEXT` | JSON array string; `'[]'` when empty, NULL when no movie |

### `playback_cut` table

| Change | Detail |
|---|---|
| `end_ms` becomes nullable | `NULL` = play to end of file |

SQLite does not support `ALTER COLUMN … DROP NOT NULL`, so `playback_cut` is recreated.

```sql
-- 0002_episode_movie_meta.sql

ALTER TABLE episode ADD COLUMN host_label          TEXT;
ALTER TABLE episode ADD COLUMN movie_title         TEXT;
ALTER TABLE episode ADD COLUMN movie_year          INTEGER;
ALTER TABLE episode ADD COLUMN movie_aliases_json  TEXT;

-- Recreate playback_cut to make end_ms nullable
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
```

No other tables are modified. `file_match`, `media_file`, `playback_override`, and
`app_settings` are unchanged. The `CHECK (source_type IN ('movie', 'segment'))` and
`CHECK (file_type IN ('movie', 'segment'))` constraints stay as-is.

---

## Rust seeder

### New file: `src-tauri/src/db/seed.rs`

**Deserialize structs** (private, derived from JSON shape):

```rust
#[derive(Deserialize)]
struct EpisodeJson {
    id: String,
    season: Option<i64>,
    episode: Option<i64>,
    is_special: bool,
    title: String,
    description: Option<String>,
    host_label: Option<String>,
    movie: Option<MovieJson>,
    cuts: Vec<CutJson>,
}

#[derive(Deserialize)]
struct MovieJson {
    title: String,
    year: Option<i64>,
    aliases: Vec<String>,
}

#[derive(Deserialize)]
struct CutJson {
    source: String,      // "segment" | "movie"
    start_ms: i64,
    end_ms: Option<i64>, // null = play to end of file
}
```

**Public function:**

```rust
pub async fn seed_episodes_if_empty(pool: &SqlitePool, json_path: &Path)
    -> Result<(), Box<dyn std::error::Error>>
```

Behaviour:

1. `SELECT COUNT(*) FROM episode` — return early (no-op + log `"seed skipped"`) if > 0
2. Read `json_path` to string; parse as `Vec<EpisodeJson>`
3. Open a single transaction
4. For each episode:
   - `INSERT OR IGNORE INTO episode (id, title, season, episode, is_special, description,
     host_label, movie_title, movie_year, movie_aliases_json, created_at)`
   - `description`: store `NULL` when empty string
   - `movie_aliases_json`: `serde_json::to_string(&aliases)` or `NULL` when no movie
5. For each cut (1-based index → `sort_order`):
   - `INSERT OR IGNORE INTO playback_cut (id, episode_id, sort_order, source_type,
     start_ms, end_ms, user_offset_ms)`
   - `id`: `"{episode_id}-c{sort_order}"` — deterministic, matches mock convention
   - `end_ms`: stored as `NULL` when `None`
6. Commit; log `"seeded {N} episodes"` at INFO level

`INSERT OR IGNORE` makes the seeder safe to call even if a partial previous seed left
rows behind.

### `src-tauri/src/db/mod.rs`

Add `pub mod seed;` declaration.

---

## Tauri wiring

### `src-tauri/tauri.conf.json`

Add to the `bundle` object:

```json
"resources": ["resources/episodes.json"]
```

Makes the file available at runtime via `app.path().resource_dir()`.

### `src-tauri/src/lib.rs`

After `app.manage(pool)`, before `Ok(())`:

```rust
let json_path = app
    .path()
    .resource_dir()
    .expect("resource dir unavailable")
    .join("episodes.json");

tauri::async_runtime::block_on(
    db::seed::seed_episodes_if_empty(&pool, &json_path),
)
.expect("episode seed failed");
```

---

## Rust command changes

`src-tauri/src/commands/episodes.rs` needs four additions to surface the new columns.

### `EpisodeFileRow` (flat DB query struct)

Add fields:

```rust
host_label: Option<String>,
movie_title: Option<String>,
movie_year: Option<i64>,
```

### `EpisodeRow` (wire type returned to TypeScript)

Add fields:

```rust
pub host_label: Option<String>,
pub movie_title: Option<String>,
pub movie_year: Option<i64>,
```

### `PlaybackCutRow`

```rust
pub end_ms: Option<i64>,  // was i64
```

### `get_episodes_inner` SELECT

Add the four new `episode` columns to the SELECT list. The `end_ms` column is already
selected; its type change in the DB is reflected automatically by `sqlx`.

No changes to command signatures, no new Tauri commands.

---

## TypeScript type changes

### `src/features/episodes/types.ts`

```ts
// Episode
description?: string  // unchanged
hostLabel?: string    // new
movieTitle?: string   // new
movieYear?: number    // new

// PlaybackCut
endMs: number | undefined  // was: number (undefined = play to end of file)
```

### `src/api/_tauri.ts`

**`PlaybackCutWire`:**
```ts
endMs: number | null   // was: number
```

**`EpisodeRowWire`** — add three new nullable fields (`description` already exists):
```ts
hostLabel: string | null
movieTitle: string | null
movieYear: number | null
```

**`toCut()`:** `endMs: w.endMs ?? undefined`

**`toEpisode()`:** map new fields with `?? undefined`.

### `src/api/_mock.ts` and `src/features/episodes/mocks.ts`

- `description` field unchanged on all mock episode objects
- Add `hostLabel` to each mock episode
- All mock `PlaybackCut.endMs` values remain non-null (mocks represent fully-known
  data; no behaviour change)

---

## Native vs. client-derived (addendum to spec 0006)

| Field | Source | Reason |
|---|---|---|
| `movie_title`, `movie_year`, `movie_aliases_json` | Native (seeded from JSON) | Used by scan logic as match hints (spec 0009) |
| `host_label` | Native (seeded from JSON) | Displayed in file-match row UI |
| `EpisodeStatus` | Client-derived | Unchanged — computed from `FileMatch` state |

---

## What is not in scope

- Reseeding / hot-reloading JSON at runtime (no `reload_metadata` command)
- A UI button to trigger reseed
- Merging JSON edits with existing user-set offsets (`user_offset_ms` is never
  overwritten by the seeder)
- Scan logic using `movie_title` / `movie_year` as hints (spec 0009)
- `air_date` in the JSON (deferred; column remains nullable in DB)

---

## Verification

| # | Check | How |
|---|---|---|
| 1 | Migration applies cleanly | `cargo build` — no sqlx compile errors |
| 2 | Existing Rust tests pass | `cargo test -p app` |
| 3 | Seeder inserts correct rows | New Rust unit test: in-memory DB, call `seed_episodes_if_empty` with one-episode fixture JSON, assert `COUNT(*) FROM episode = 1` and one `playback_cut` row has `end_ms IS NULL` |
| 4 | Seeder is idempotent | Call it twice in same test; assert count unchanged |
| 5 | TypeScript tests pass | `yarn test` |
| 6 | Library page shows real data | `yarn tauri dev` → Library renders episode cards from DB |
| 7 | Detail page renders cuts | Navigate to episode; cuts timeline and offset controls visible |
| 8 | Cold-start reseed | Delete `midnight-drivein.db`; restart; data returns |
