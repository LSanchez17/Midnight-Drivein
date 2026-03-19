# 0012 — Playback Timeline Resolver

## Status
Draft

## Summary
Specs 0009–0011 established the episode/slot data model, file scanning, and fuzzy
matching.  This spec does two things in one pass:

1. **Terminology cleanup** — the word _"segment"_ is replaced by _"commentary"_
   everywhere: JSON schema fields, database columns and value strings, Rust structs,
   TypeScript types, and user-facing UI labels.  `host_label` is also retired in favour
   of `commentary` as the field name for the reel display title.  This is a breaking
   rename across the full stack with a single focused migration.

2. **Playback timeline resolver** — given a fully-loaded `MovieSlot` (cuts + file
   matches already in memory), resolve it into a concrete, ordered list of
   `PlaybackEntry` objects: one per cut, each carrying the absolute file path, the raw
   `[startMs, endMs]` window, and the `[effectiveStartMs, effectiveEndMs]` window after
   applying any per-cut `userOffsetMs`.  The resolver is a pure deterministic function
   on the frontend and a mirrored Tauri command on the backend.

Season 1 Episode 3 (`s01e03`) — _Deathgasm_ + _The Changeling_ — is the reference
episode for all tests.  It is already the only episode in `episodes.json` with
populated `cuts` arrays and matching commentary reel names following the new
`"{movie title} commentary"` convention.

**Acceptance criteria:**
- After migration and reseed, the DB contains no `host_label` column, no
  `source_type = 'segment'` rows, no `file_type = 'segment'` rows, no
  `segments_folder` column, no `folder_root = 'segments'` rows, and no
  `segment_file_count` column
- `resolvePlaybackPlan(slot)` called with the `s01e03-a` slot (4 cuts, both files
  matched) returns `{ ok: true }` with 4 entries in sort-order, each carrying a
  non-empty `filePath`
- `resolvePlaybackPlan(slot)` for a slot with `cuts: []` returns
  `{ ok: false, error: { code: 'no_cuts' } }`
- `get_playback_plan('s01e03', 'a')` Tauri command returns the same 4 entries
- `cargo test -p app_lib` and `yarn run test` both pass
- Settings page shows "Commentary Folder" label; scan summary shows "Commentary files"

---

## Part 1 — Terminology rename

### Renamed concepts

| Old term | New term | Scope |
|---|---|---|
| `host_label` | `commentary` | JSON field, DB column, Rust struct field, TS interface field |
| `source: "segment"` | `source: "commentary"` | JSON cut source value |
| `source_type = 'segment'` | `source_type = 'commentary'` | DB `playback_cut` value |
| `SourceType 'segment'` | `SourceType 'commentary'` | TypeScript union type |
| `segmentMatch` | `commentaryMatch` | TypeScript `MovieSlot` interface |
| `segments_folder` | `commentary_folder` | DB column, Rust/TS field |
| `segmentsFolder` | `commentaryFolder` | Rust wire type, TypeScript types |
| `segment_file_count` | `commentary_file_count` | DB column, Rust/TS field |
| `segmentFileCount` | `commentaryFileCount` | TypeScript `ScanResult` |
| `folder_root = 'segments'` | `folder_root = 'commentary'` | DB value, Rust/TS constant |
| `file_type = 'segment'` | `file_type = 'commentary'` | DB `file_match` value, Rust validation, UI labels |

---

### Migration `0006_commentary_rename.sql`

Five distinct changes in one migration.  Run under `PRAGMA foreign_keys = OFF` because
the `media_file` table rebuild must not trigger FK checks mid-flight.

**1. `movie_slot` — rename column**

```sql
ALTER TABLE movie_slot RENAME COLUMN host_label TO commentary;
```

**2. `playback_cut` — update source_type values**

```sql
UPDATE playback_cut SET source_type = 'commentary' WHERE source_type = 'segment';
```

**3. `app_settings` — rename column**

```sql
ALTER TABLE app_settings RENAME COLUMN segments_folder TO commentary_folder;
```

**4. `scan_summary` — rename column**

```sql
ALTER TABLE scan_summary RENAME COLUMN segment_file_count TO commentary_file_count;
```

**5. `media_file` — update values and rebuild table with updated CHECK constraint**

The existing `CHECK (folder_root IN ('movies', 'segments'))` cannot be altered
in-place in SQLite.  Rebuild the table to correct the constraint:

```sql
PRAGMA foreign_keys = OFF;

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
```

**6. `file_match` — update values and rebuild table with updated CHECK constraint**

The `CHECK (file_type IN ('movie', 'segment'))` constraint from migration `0003` must
also be rebuilt.  Append to the same migration (still within the `PRAGMA foreign_keys = OFF` block):

```sql
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
```

---

### Rust changes

#### `db/types.rs`

| Struct | Old field | New field |
|---|---|---|
| `AppSettings` | `pub segments_folder: Option<String>` | `pub commentary_folder: Option<String>` |
| `AppSettingsPatch` | `pub segments_folder: Option<Option<String>>` | `pub commentary_folder: Option<Option<String>>` |
| `ScanResult` | `pub segment_file_count: usize` | `pub commentary_file_count: usize` |
| `MovieSlotRow` | `pub host_label: Option<String>` | `pub commentary: Option<String>` |

New struct (see Part 2):

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEntryRow {
    pub order: i64,
    pub source: String,               // "movie" | "commentary"
    pub file_path: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub effective_start_ms: i64,
    pub effective_end_ms: Option<i64>,
    pub cut_id: String,
}
```

#### `db/seed.rs`

`SlotJson` deserialisation struct:
- `host_label: Option<String>` → `commentary: Option<String>`

SQL INSERT for `movie_slot`:
- Column name in query string: `host_label` → `commentary`

`CutJson.source` deserialization: no code change needed — values come from JSON (which
will now contain `"commentary"` instead of `"segment"`).

Test fixtures at the bottom of `seed.rs`:
- All occurrences of `"host_label"` → `"commentary"` in the inline JSON strings.

#### `db/episodes.rs`

Internal struct `SlotFileRow`:
- `host_label: Option<String>` → `commentary: Option<String>`
- `segment_file_type: Option<String>` → `commentary_file_type: Option<String>`

SQL in `get_episodes` / `get_episode_by_id` query:
- `ms.host_label` → `ms.commentary` in SELECT
- `fm_seg.file_type AS segment_file_type` → `fm_com.file_type AS commentary_file_type` in SELECT
- `LEFT JOIN file_match fm_seg ON fm_seg.slot_id = ms.id AND fm_seg.file_type = 'segment'`
  → `LEFT JOIN file_match fm_com ON fm_com.slot_id = ms.id AND fm_com.file_type = 'commentary'`
  (alias `fm_seg` → `fm_com` throughout that JOIN and its selected columns)

Assembly in `MovieSlotRow`:
- `host_label: row.host_label` → `commentary: row.commentary`
- `row.segment_file_type` → `row.commentary_file_type` in the `segment_match` assembly block

#### `db/scan.rs`

Internal `SlotMatchRow` struct:
- `host_label: Option<String>` → `commentary: Option<String>`

SQL in matching pass:
- `SELECT id, movie_title, movie_aliases_json, host_label FROM movie_slot`
  → `SELECT id, movie_title, movie_aliases_json, commentary FROM movie_slot`
- Struct mapping `host_label` → `commentary`

Matching logic (commentary target lookup):
- `slot.host_label` → `slot.commentary`

File-match INSERT for the commentary reel (written after matching passes):
- All SQL and Rust code that inserts/upserts a `file_match` row with
  `file_type = 'segment'` → `file_type = 'commentary'`

File-match read for existing commentary status (line 928 area):
- `file_type = 'segment'` → `file_type = 'commentary'`

Settings fetch SQL:
- `SELECT movies_folder, segments_folder FROM app_settings`
  → `SELECT movies_folder, commentary_folder FROM app_settings`

Variable names: `segments_folder` / `segments_folder_clone` → `commentary_folder` /
`commentary_folder_clone`

`walk_folder` call for the commentary folder:
- `walk_folder(commentary_folder_clone, "segments")` → `walk_folder(commentary_folder_clone, "commentary")`

`ScanResult` construction:
- `segment_file_count` → `commentary_file_count`

`scan_summary` UPSERT SQL:
- Column `segment_file_count` → `commentary_file_count`

Error string mentioning `segments_folder`:
- `"IO_ERROR: movies_folder and segments_folder must both be configured before scanning"`
  → `"IO_ERROR: movies_folder and commentary_folder must both be configured before scanning"`

`INSERT INTO app_settings` seed helper SQL:
- `segments_folder` → `commentary_folder`

#### `db/settings.rs`

All SQL and Rust field references: `segments_folder` → `commentary_folder`.

#### `db/playback.rs`

`remap_file` `file_type` validation guard:
- `if file_type != "movie" && file_type != "segment"`
  → `if file_type != "movie" && file_type != "commentary"`
- Error string: `"file_type must be 'movie' or 'segment'"` → `"file_type must be 'movie' or 'commentary'"`

`list_media_files` `folder_root` validation guard:
- `if folder_root != "movies" && folder_root != "segments"`
  → `if folder_root != "movies" && folder_root != "commentary"`
- Error string: `"'movies' or 'segments'"` → `"'movies' or 'commentary'"`

#### `test_support.rs`

`setup_media_file` / `setup_media_file_with_path` helper calls that pass `"segments"`:
- All occurrences → `"commentary"`

---

### TypeScript changes

#### `src/features/episodes/types.ts`

```ts
// Before
export type SourceType = 'movie' | 'segment'

export interface MovieSlot {
    hostLabel?: string
    segmentMatch: FileMatch
    // ...
}

// After
export type SourceType = 'movie' | 'commentary'

export interface MovieSlot {
    commentary?: string
    commentaryMatch: FileMatch
    // ...
}
```

Add `PlaybackEntry` and related types (see Part 2).

#### `src/api/types.ts`

```ts
// AppSettings
segmentsFolder: string | null  →  commentaryFolder: string | null

// AppSettingsPatch
segmentsFolder?: string | null  →  commentaryFolder?: string | null

// ScanResult
segmentFileCount: number  →  commentaryFileCount: number
```

Add `PlaybackEntry` wire type (see Part 2).

#### `src/api/_tauri.ts`

Wire struct for `MovieSlotRow`:
- `hostLabel: string | null` → `commentary: string | null`
- `segmentMatch: FileMatchWire` → `commentaryMatch: FileMatchWire`

Mapping:
- `hostLabel: wire.hostLabel ?? undefined` → `commentary: wire.commentary ?? undefined`
- `segmentMatch: toFileMatch(wire.segmentMatch)` → `commentaryMatch: toFileMatch(wire.commentaryMatch)`

`AppSettings` wire field:
- `segmentsFolder` → `commentaryFolder`

Add `getPlaybackPlan` invoke (see Part 2).

#### `src/api/_mock.ts`

- `segmentsFolder: null` → `commentaryFolder: null`
- `segmentFileCount` → `commentaryFileCount`

Add `getPlaybackPlan` mock implementation (see Part 2).

#### `src/features/episodes/mocks.ts`

Helper `makeSlot(hostLabel, ...)` signature and body:
- Parameter `hostLabel: string` → `commentary: string`
- Property `hostLabel` → `commentary`
- `segmentMatch: FileMatch` parameter → `commentaryMatch: FileMatch`
- Property `segmentMatch` → `commentaryMatch`

#### `src/utils/EpisodeStatuses.ts`

- `slot.segmentMatch` → `slot.commentaryMatch`

#### `src/features/episodes/components/SlotSection.tsx`

- `slot.segmentMatch` → `slot.commentaryMatch`

#### `src/features/episodes/components/FileMapping.tsx`

- Display label: `match.fileType === 'movie' ? 'Movie File' : 'Segment File'`
  → `match.fileType === 'movie' ? 'Movie File' : 'Commentary File'`

#### `src/features/episodes/components/RemapDialog.tsx`

- Display label: `const label = fileType === 'movie' ? 'Movie File' : 'Segment File'`
  → `const label = fileType === 'movie' ? 'Movie File' : 'Commentary File'`

#### `src/pages/EpisodeDetailPage.tsx`

- `folderRoot` passed to `RemapDialog`:
  `remapTarget.fileType === 'movie' ? 'movies' : 'segments'`
  → `remapTarget.fileType === 'movie' ? 'movies' : 'commentary'`

#### `src/pages/SettingsPage.tsx`

State variable: `segmentsFolderError` → `commentaryFolderError`

`handleChooseFolder` parameter union: `'segmentsFolder'` → `'commentaryFolder'`

`bothFoldersSet` check: `settings?.segmentsFolder` → `settings?.commentaryFolder`

`FolderRow` props:
- `label="Segments Folder"` → `label="Commentary Folder"`
- `placeholder="e.g. /Users/you/NonMovieSegments"` → `placeholder="e.g. /Users/you/Commentary"`
- `ariaLabel="Segments folder path"` → `ariaLabel="Commentary folder path"`
- `value={settings?.segmentsFolder}` → `value={settings?.commentaryFolder}`
- `onChoose={() => handleChooseFolder('segmentsFolder')}` → `onChoose={() => handleChooseFolder('commentaryFolder')}`
- `error={segmentsFolderError}` → `error={commentaryFolderError}`

#### `src/components/ui/ScanSummaryPanel.tsx`

- `<Row label="Segment files" value={result.segmentFileCount} />`
  → `<Row label="Commentary files" value={result.commentaryFileCount} />`

#### Tests

All test files that reference the renamed fields follow the same pattern:
- `src/api/__tests__/settings.test.ts`: `segmentsFolder` → `commentaryFolder`
- `src/api/__tests__/scan.test.ts`: `segmentFileCount` → `commentaryFileCount`
- `src/api/__tests__/playback.test.ts`: both of the above; `'segment'` fixture values → `'commentary'`; error string `"file_type must be 'movie' or 'segment'"` → `"file_type must be 'movie' or 'commentary'"`
- `src/api/__tests__/episodes.test.ts`: `hostLabel` → `commentary`, `segmentMatch` → `commentaryMatch`

---

## Part 2 — Playback timeline resolver

### Concept

Given a `MovieSlot` already in memory (cuts populated, file matches resolved), the
resolver maps the `PlaybackCut[]` array into a flat, ordered `PlaybackEntry[]` where
every entry is self-contained: it knows _which file to open_, _where to seek_, and
_how long to play_.

The resolver is **read-only and deterministic** — it does not touch the DB, emit
events, or have side effects.  Any component or future native player can call it at
any time.

### `PlaybackEntry` type (TypeScript)

Added to `src/features/episodes/types.ts`:

```ts
export interface PlaybackEntry {
  /** 0-based index matching the cut's sortOrder */
  order: number
  /** Which file to open for this segment */
  source: SourceType
  /** Absolute path to the source file */
  filePath: string
  /** Raw start timestamp from the cut metadata (milliseconds) */
  startMs: number
  /** Raw end timestamp from the cut metadata; undefined = play to end of file */
  endMs: number | undefined
  /**
   * Actual seek target after applying userOffsetMs.
   * Clamped to ≥ 0.
   */
  effectiveStartMs: number
  /**
   * Actual end target after applying userOffsetMs.
   * undefined when endMs is undefined (play to end of file).
   */
  effectiveEndMs: number | undefined
  /** Stable cut identifier, e.g. "s01e03-a-c1" */
  cutId: string
}

export type PlaybackPlanErrorCode =
  | 'no_cuts'
  | 'missing_movie_file'
  | 'missing_commentary_file'

export interface PlaybackPlanError {
  code: PlaybackPlanErrorCode
}

export type PlaybackPlanResult =
  | { ok: true; entries: PlaybackEntry[] }
  | { ok: false; error: PlaybackPlanError }
```

### `resolvePlaybackPlan` (TypeScript)

**Location:** `src/features/episodes/resolvePlaybackPlan.ts`

```ts
import type { MovieSlot, PlaybackEntry, PlaybackPlanResult } from './types'

export function resolvePlaybackPlan(slot: MovieSlot): PlaybackPlanResult {
  if (slot.cuts.length === 0) {
    return { ok: false, error: { code: 'no_cuts' } }
  }

  const needsMovie      = slot.cuts.some(c => c.sourceType === 'movie')
  const needsCommentary = slot.cuts.some(c => c.sourceType === 'commentary')

  if (needsMovie && !slot.movieMatch.path) {
    return { ok: false, error: { code: 'missing_movie_file' } }
  }
  if (needsCommentary && !slot.commentaryMatch.path) {
    return { ok: false, error: { code: 'missing_commentary_file' } }
  }

  const entries: PlaybackEntry[] = slot.cuts.map(cut => {
    const filePath =
      cut.sourceType === 'movie'
        ? slot.movieMatch.path!
        : slot.commentaryMatch.path!

    const effectiveStartMs = Math.max(0, cut.startMs + cut.userOffsetMs)
    const effectiveEndMs =
      cut.endMs !== undefined
        ? Math.max(effectiveStartMs, cut.endMs + cut.userOffsetMs)
        : undefined

    return {
      order: cut.sortOrder,
      source: cut.sourceType,
      filePath,
      startMs: cut.startMs,
      endMs: cut.endMs,
      effectiveStartMs,
      effectiveEndMs,
      cutId: cut.id,
    }
  })

  return { ok: true, entries }
}
```

### `resolvePlaybackPlan` tests

**Location:** `src/features/episodes/__tests__/resolvePlaybackPlan.test.ts`

Uses the `s01e03` mock data (Deathgasm slot-a, The Changeling slot-b) and synthetic
edge-case slots.  Test cases:

| Case | Input | Expected |
|---|---|---|
| Happy path — slot a (4 cuts, both files matched) | `s01e03-a` mock slot | `ok: true`, 4 entries, alternating commentary/movie/commentary/movie, correct ms values |
| Happy path — slot b (4 cuts) | `s01e03-b` mock slot | `ok: true`, 4 entries |
| `no_cuts` | slot with `cuts: []` | `ok: false`, code `'no_cuts'` |
| `missing_movie_file` | cuts include a movie cut, `movieMatch.path` is undefined | `ok: false`, code `'missing_movie_file'` |
| `missing_commentary_file` | cuts include a commentary cut, `commentaryMatch.path` is undefined | `ok: false`, code `'missing_commentary_file'` |
| `userOffsetMs` applied | cut with `startMs: 1000, userOffsetMs: -500` | `effectiveStartMs: 500` |
| Negative clamp | cut with `startMs: 500, userOffsetMs: -1000` | `effectiveStartMs: 0` |
| Null `endMs` (play to end) | cut with `endMs: undefined` | `effectiveEndMs: undefined` |

---

### `PlaybackEntryRow` struct (Rust)

Added to `src-tauri/src/db/types.rs`:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEntryRow {
    pub order: i64,
    pub source: String,               // "movie" | "commentary"
    pub file_path: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub effective_start_ms: i64,
    pub effective_end_ms: Option<i64>,
    pub cut_id: String,
}
```

### `get_playback_plan_for_slot` (Rust)

**Location:** `src-tauri/src/db/episodes.rs`

```
pub async fn get_playback_plan_for_slot(
    pool: &SqlitePool,
    slot_id: &str,
) -> Result<Vec<PlaybackEntryRow>, String>
```

1. Fetch `playback_cut` rows `WHERE slot_id = ?` ordered by `sort_order ASC`
2. Fetch the movie file path:
   ```sql
   SELECT mf.path
   FROM file_match fm
   JOIN media_file mf ON fm.media_file_id = mf.id
   WHERE fm.slot_id = ? AND fm.file_type = 'movie' AND mf.is_missing = 0
   LIMIT 1
   ```
3. Fetch the commentary file path (same query, `file_type = 'commentary'`)
4. For each cut, compute `effective_start_ms = max(0, start_ms + user_offset_ms)` and
   `effective_end_ms = end_ms.map(|e| max(effective_start_ms, e + user_offset_ms))`
5. Return `Vec<PlaybackEntryRow>`; return `Err` only on DB failure (empty cuts → empty
   `Vec`, not an error)

Rust unit tests in `#[cfg(test)]` block using `setup_db` + `seed_episodes` +
`setup_media_file` from `test_support`:

| Case | Input | Expected |
|---|---|---|
| Happy path s01e03-a | seeded s01e03-a with both files matched | 4 entries, correct order, correct paths |
| No cuts | slot with empty cuts | empty `Vec`, no error |
| File not matched | slot with cuts, no `file_match` row | `Err(...)` or empty path — spec calls `Err` to match frontend `missing_*` semantics |

### Tauri command

**Location:** `src-tauri/src/commands/playback.rs`

```rust
#[tauri::command]
pub async fn get_playback_plan(
    pool: tauri::State<'_, SqlitePool>,
    episode_id: String,
    slot: String,
) -> Result<Vec<PlaybackEntryRow>, String> {
    let slot_id = format!("{}-{}", episode_id, slot);
    db_episodes::get_playback_plan_for_slot(pool.inner(), &slot_id).await
}
```

Register in `src-tauri/src/lib.rs` alongside the existing playback commands.

---

## Part 3 — API layer

### `PlaybackEntry` type (`src/api/types.ts`)

```ts
export interface PlaybackEntry {
  order: number
  source: 'movie' | 'commentary'
  filePath: string
  startMs: number
  endMs: number | null
  effectiveStartMs: number
  effectiveEndMs: number | null
  cutId: string
}
```

Note: the wire type uses `null` for the absent `end_ms` (SQLite / Tauri serialises
`Option<i64>` as `null`).  The frontend `PlaybackEntry` in `features/episodes/types.ts`
uses `undefined` to match TypeScript idioms; the Tauri adapter layer (`_tauri.ts`)
converts `null → undefined`.

### `getPlaybackPlan` function

**`src/api/index.ts`** — re-exports from the active backend:

```ts
export const getPlaybackPlan: (episodeId: string, slot: string) => Promise<PlaybackEntry[]>
```

**Mock (`src/api/_mock.ts`):**

Import `resolvePlaybackPlan` from `../../features/episodes/resolvePlaybackPlan` and the
mock episode list.  Find the matching `MovieSlot` by `episode_id` + `slot`, call the
resolver, and map the result:
- If `ok: false` → `return Promise.resolve([])`
- If `ok: true` → convert `undefined endMs / effectiveEndMs` back to `null` for the
  wire format, then `return Promise.resolve(entries)`

**Tauri (`src/api/_tauri.ts`):**

```ts
export async function getPlaybackPlan(
  episodeId: string,
  slot: string,
): Promise<PlaybackEntry[]> {
  return invoke<PlaybackEntry[]>('get_playback_plan', { episodeId, slot })
}
```

### `src/api/__tests__/playback.test.ts`

Extend existing tests or add new `describe('getPlaybackPlan')` block:

| Case | Assertion |
|---|---|
| Returns array | `Array.isArray(result)` |
| s01e03 slot a | returns 4 entries |
| Each entry shape | has `order`, `source`, `filePath`, `startMs`, `endMs`, `effectiveStartMs`, `effectiveEndMs`, `cutId` |
| Unknown slot | returns `[]` (mock) |

---

## File checklist

**Modified**

| File | Change |
|---|---|
| `src-tauri/resources/episodes.json` | `host_label` → `commentary`; `"source": "segment"` → `"source": "commentary"` |
| `src-tauri/src/db/types.rs` | Field renames + new `PlaybackEntryRow` struct |
| `src-tauri/src/db/episodes.rs` | SQL column/value renames + new `get_playback_plan_for_slot` fn |
| `src-tauri/src/db/seed.rs` | `SlotJson` field + SQL column renames |
| `src-tauri/src/db/scan.rs` | `SlotMatchRow` + all `segments` references renamed |
| `src-tauri/src/db/settings.rs` | `segments_folder` → `commentary_folder` throughout |
| `src-tauri/src/db/playback.rs` | `file_type` and `folder_root` validations: `"segment"`/`"segments"` → `"commentary"` |
| `src-tauri/src/test_support.rs` | `"segments"` → `"commentary"` in fixture helpers |
| `src-tauri/src/commands/playback.rs` | New `get_playback_plan` command |
| `src-tauri/src/lib.rs` | Register new command |
| `src/features/episodes/types.ts` | Renames + new `PlaybackEntry` / `PlaybackPlanResult` types |
| `src/features/episodes/mocks.ts` | `hostLabel` → `commentary`, `segmentMatch` → `commentaryMatch` |
| `src/utils/EpisodeStatuses.ts` | `segmentMatch` → `commentaryMatch` |
| `src/features/episodes/components/SlotSection.tsx` | `segmentMatch` → `commentaryMatch` |
| `src/features/episodes/components/FileMapping.tsx` | `'Segment File'` label → `'Commentary File'` |
| `src/features/episodes/components/RemapDialog.tsx` | `'Segment File'` label → `'Commentary File'` |
| `src/pages/EpisodeDetailPage.tsx` | `folderRoot` remap value `'segments'` → `'commentary'` |
| `src/pages/SettingsPage.tsx` | All `segments` references → `commentary`; UI label |
| `src/components/ui/ScanSummaryPanel.tsx` | Label + field name |
| `src/api/types.ts` | Field renames + new `PlaybackEntry` wire type |
| `src/api/_tauri.ts` | Field renames + new `getPlaybackPlan` |
| `src/api/_mock.ts` | Field renames + new `getPlaybackPlan` |
| `src/api/index.ts` | Export new `getPlaybackPlan` |
| `src/api/__tests__/settings.test.ts` | `segmentsFolder` → `commentaryFolder` |
| `src/api/__tests__/scan.test.ts` | `segmentFileCount` → `commentaryFileCount` |
| `src/api/__tests__/playback.test.ts` | Field renames + new plan tests |
| `src/api/__tests__/episodes.test.ts` | `hostLabel` → `commentary`, `segmentMatch` → `commentaryMatch` |

**Created**

| File | Purpose |
|---|---|
| `src-tauri/src/db/migrations/0006_commentary_rename.sql` | Full rename migration |
| `src/features/episodes/resolvePlaybackPlan.ts` | Pure TS resolver |
| `src/features/episodes/__tests__/resolvePlaybackPlan.test.ts` | Resolver unit tests |

---

## Verification

1. `cargo test -p app_lib` — Rust unit tests pass including new `get_playback_plan_for_slot` tests
2. `yarn run test` — All TS tests pass including new resolver tests and updated field references
3. Cold reseed: delete DB, run `yarn tauri dev`, confirm Library page loads with no console errors
4. DB inspection after reseed:
   - `SELECT DISTINCT source_type FROM playback_cut` → only `'movie'` and `'commentary'`
   - `SELECT DISTINCT folder_root FROM media_file` → `'movies'` and `'commentary'` (if files scanned)
   - `SELECT DISTINCT file_type FROM file_match` → only `'movie'` and `'commentary'`, no `'segment'`
   - `PRAGMA table_info(movie_slot)` → column name `commentary`, no `host_label`
   - `PRAGMA table_info(app_settings)` → `commentary_folder`, no `segments_folder`
5. Settings page UI shows "Commentary Folder" label
6. `getPlaybackPlan('s01e03', 'a')` (via dev console or test) returns 4 entries

---

## Decisions

- `commentary` is both the field name for the reel title (replacing `host_label`) and
  the cut source value (replacing `'segment'`).  One word, two uses — consistent intent.
- `file_match.file_type` is renamed from `'segment'` → `'commentary'` explicitly in migration `0006` via an UPDATE + full table rebuild (required to change the `CHECK` constraint).  The Rust `remap_file` validation, the episodes JOIN alias (`fm_seg` → `fm_com`), and the scan.rs commentary-match insert are all updated to match.
- The frontend `PlaybackPlanResult` uses `undefined` for absent end timestamps;
  the Tauri wire type uses `null`.  The adapter in `_tauri.ts` handles the conversion.
- `get_playback_plan_for_slot` returning an empty `Vec` for a slot with no cuts (rather
  than an error) keeps the Rust side dumb — error semantics live in the TS resolver.
- `resolvePlaybackPlan` is not async — it operates on already-fetched data.  No
  additional DB round-trips are needed on the frontend.
