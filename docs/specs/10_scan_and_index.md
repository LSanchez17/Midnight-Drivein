# 0010 — Scan and Index Local Media

## Status
Draft

## Summary
Given the two configured library folders (`movies_folder` and `segments_folder`),
recursively scan the file system and produce a normalised inventory of supported video
files. The resulting `media_file` rows are persisted to SQLite so the app boots from
stored data, rescans can detect missing files, and future phases can run matching
against the inventory without touching the disk again.

This phase does **not** associate files with episodes.  It just answers:
_"What files exist?"_

**Acceptance criteria:**
- "Rescan Library" in Settings walks both folders and inserts/updates `media_file` rows
- Only `.mp4`, `.mkv`, `.m4v`, `.mov` files are collected; all other file types are
  silently ignored
- Files at any nesting depth inside the root are found (e.g. `Movies/Folder/film.mkv`)
- Running a second scan on the same library is idempotent — row counts are unchanged
  and no duplicate rows appear
- A file deleted between scans has its `is_missing` flag set to `1` on the next scan
- Scan results are persisted and visible immediately after app restart — no re-scan
  needed to see the summary panel
- Pointing a folder at a path that does not exist produces a warning in the summary
  and does not crash the app
- `cargo test -p app_lib` and `yarn run test` both pass

---

## Supported extensions

v1 accepts video files with the following extensions (case-insensitive):

| Extension | container |
|---|---|
| `.mp4`  | MPEG-4 |
| `.mkv`  | Matroska |
| `.m4v`  | iTunes video |
| `.mov`  | QuickTime |

All other extensions — `.txt`, `.jpg`, `.nfo`, `.srt`, `.DS_Store`, etc. — are ignored
without warning.

---

## Data model changes

### Migration `0004_scan_index.sql`

Two additions to the existing schema:

**1. Unique index on `media_file.path`**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS media_file_path_uq ON media_file (path);
```

This turns `path` into an `ON CONFLICT` UPSERT target, allowing rescans to update
existing rows rather than inserting duplicates.

**2. `scan_summary` singleton table**

```sql
CREATE TABLE IF NOT EXISTS scan_summary (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    last_scan_at         TEXT    NOT NULL,
    movie_file_count     INTEGER NOT NULL DEFAULT 0,
    segment_file_count   INTEGER NOT NULL DEFAULT 0,
    errors_json          TEXT    NOT NULL DEFAULT '[]',
    missing_folders_json TEXT    NOT NULL DEFAULT '[]'
);
```

`errors_json` is a JSON array of human-readable warning strings (e.g. stat failures).
Error count is not stored as a dedicated column — it is always derived from
`errors_json.length` by the caller.
`missing_folders_json` is a JSON array of absolute folder paths that could not be
accessed at scan time.

The `media_file` table itself is unchanged from spec 0005:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4, assigned once at first scan of this path |
| `filename` | TEXT | Basename only: `"slumber_party_massacre.mkv"` |
| `display_name` | TEXT | Nullable; user-editable label. UI falls back to `filename` |
| `path` | TEXT UNIQUE | Absolute path at scan time |
| `folder_root` | TEXT | `'movies'` or `'segments'` |
| `size_bytes` | INTEGER | From `fs::metadata`; null if stat fails |
| `duration_ms` | INTEGER | Null — not probed in this phase |
| `last_seen_at` | TEXT | ISO 8601 timestamp, updated on every scan |
| `is_missing` | INTEGER | `1` if previously scanned, now absent; `0` otherwise |

---

## Rust implementation

### New Cargo dependencies

```toml
walkdir = "2"
uuid    = { version = "1", features = ["v4"] }
```

### `ScanResult` struct

Returned directly from the `scan_library` Tauri command and persisted to
`scan_summary`.  `serde::Serialize` is derived so Tauri can serialise it to the
frontend.

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub last_scan_at:        String,
    pub movie_file_count:    usize,
    pub segment_file_count:  usize,
    pub errors:              Vec<String>,
    pub missing_folders:     Vec<String>,
}
```

`errors.len()` is the warning count — there is no separate `error_count` field.

### `normalize_filename`

Pure function used only internally (groundwork for the matching phase).

```
normalize_filename("The Slumber Party Massacre (1982).mkv")
  → "The Slumber Party Massacre"

normalize_filename("sleepaway_camp_1983.mp4")
  → "sleepaway_camp_1983"

Steps:
1. Take the file stem (strip extension)
2. Strip parenthesised year tags: remove any occurrence of \s*\(\d{4}\)
3. Trim leading / trailing whitespace
```

Original casing is preserved.  Underscores, hyphens, and other punctuation are left
intact — the matching phase will decide how to handle them.

This function is unit-tested but its output is **not stored** on `media_file` in this
phase.  The column will be added in the matching phase.

### `walk_folder`

```rust
fn walk_folder(root: &str, folder_root: &str) -> (Vec<MediaFileRow>, Vec<String>)
```

1. If `root` is not an accessible directory: return `([], [root.to_string()])` — the
   caller records it as a missing folder
2. Walk recursively with `walkdir::WalkDir::new(root)` (no depth limit)
3. For each entry:
   - Skip on `WalkDir` error, recording the error message as a warning
   - Skip if `!entry.file_type().is_file()`
   - Skip if the file extension (lowercased) is not in the supported set
4. For each kept file:
   - Generate a UUID v4 as the candidate `id` (used only if the row is new — the
     `ON CONFLICT(path) DO UPDATE` clause does **not** update `id`, so the original
     UUID is preserved for all subsequent scans of the same path)
   - Read `fs::metadata` for `size_bytes` (null on error; counts as a warning)
   - Set `last_seen_at` to the current UTC time as ISO 8601
   - Yield a `MediaFileRow`

### `scan_library_inner` — updated logic

The existing stub already handles (a) reading settings and (b) the `AtomicBool` guard.
Replace the TODO body with:

```
1. walk_folder(movies_folder, "movies")  → (movie_rows, movie_warnings)
2. walk_folder(segments_folder, "segments") → (segment_rows, segment_warnings)
3. For each row in movie_rows + segment_rows:
     INSERT INTO media_file (id, filename, path, folder_root, size_bytes, last_seen_at, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(path) DO UPDATE SET
       filename     = excluded.filename,
       size_bytes   = excluded.size_bytes,
       last_seen_at = excluded.last_seen_at,
       is_missing   = 0
4. Collect seen_movie_paths  (Set<String>) and seen_segment_paths (Set<String>)
5. For rows in media_file WHERE folder_root = 'movies'   AND path NOT IN seen_movie_paths:
     UPDATE media_file SET is_missing = 1 WHERE path = ?
6. Same for 'segments' / seen_segment_paths
   Note: if the user changes `movies_folder` or `segments_folder` to a different path,
   all rows from the old path will be marked `is_missing = 1` on the next scan.
   This is intentional — the old rows are preserved for diagnostic purposes and will
   be surfaced as missing rather than silently deleted.
7. Build ScanResult from counts + combined warnings
8. INSERT OR REPLACE INTO scan_summary (id, last_scan_at, movie_file_count, ...)
     VALUES (1, ?, ?, ?, ?, ?, ?)
9. scanning.store(false, Ordering::SeqCst)
10. return Ok(scan_result)
```

### Command signature change

```rust
// Before
pub async fn scan_library(...) -> Result<(), String>

// After
pub async fn scan_library(...) -> Result<ScanResult, String>
```

### New command: `get_scan_summary`

```rust
#[tauri::command]
pub async fn get_scan_summary(pool: State<'_, SqlitePool>) -> Result<Option<ScanResult>, String>
```

Reads the single row from `scan_summary` (id = 1) and returns `None` if no scan has
been run yet.  Follows the standard app-wide error-string convention: database
failures are returned as `"DB_ERROR: <message>"`.  All commands in this app follow
the `"ERROR_CODE: <message>"` prefix convention for recognisable error codes
(`IO_ERROR`, `DB_ERROR`, `SCAN_IN_PROGRESS`, `NOT_FOUND`, `INVALID_INPUT`).

### `lib.rs`

Add `commands::scan::get_scan_summary` to `invoke_handler!`.

---

## TypeScript API layer

### New type (`src/api/types.ts`)

```ts
export interface ScanResult {
    lastScanAt:       string
    movieFileCount:   number
    segmentFileCount: number
    errors:           string[]
    missingFolders:   string[]
}
```

Error count is derived as `errors.length` wherever needed — it is not a stored field.

### `_tauri.ts` changes

| Function | Before | After |
|---|---|---|
| `scanLibrary()` | `Promise<void>` | `Promise<ScanResult>` |
| `getScanSummary()` | _(new)_ | `Promise<ScanResult \| null>` |

`getScanSummary` invokes `'get_scan_summary'` and unwraps the standard
`{ data } / { error }` envelope, returning the inner value or `null`.

### `_mock.ts` changes

- `scanLibrary()` returns a mock `ScanResult` (`movieFileCount: 3, segmentFileCount: 2,
  errors: [], missingFolders: []`) so UI development does not require a real Tauri context
- `getScanSummary()` returns `null` (simulates "never scanned" initial state)

---

## UI

### `ScanSummaryPanel` component

New file: `src/components/ui/ScanSummaryPanel.tsx`

**Props:**
```ts
interface ScanSummaryPanelProps {
    result:     ScanResult | null
    isScanning: boolean
}
```

**Empty state** (`result === null && !isScanning`):
> "No scan has been run yet."

**Scanning state** (`isScanning === true`):
> Spinner / "Scanning…"

**Result state:**

| Label | Value |
|---|---|
| Last scan | Formatted `lastScanAt` (e.g. "March 16, 2026 at 2:14 PM") |
| Movie files | `movieFileCount` |
| Segment files | `segmentFileCount` |
| Warnings | `errors.length` warning strings — collapsed by default; expand on click if non-empty; each entry is a per-file or per-walk error message |
| Missing folders | Always shown as a **separate** section below warnings — not merged into the warnings list; each entry is one absolute folder path that could not be accessed at scan time; rendered in `#f87171` |

Styling follows existing conventions — `Panel` wrapper, Impact font for section
headers, `#f3ebd2` for primary text, `#b8b1a1` for secondary text, `#f87171` for
errors/warnings.  Component does not own its own data-fetching.

### `SettingsPage` changes

1. New state: `lastScan: ScanResult | null` (init: `null`), `isScanning: boolean`
   (init: `false`)
2. `useEffect([], ...)` on mount: call `getScanSummary()` → `setLastScan`
3. `handleScan()`:
   ```
   setIsScanning(true)
   try {
     const result = await scanLibrary()
     setLastScan(result)
   } catch (e) {
     // show error (existing error-state pattern)
   } finally {
     setIsScanning(false)
   }
   ```
4. "Rescan Library" button: `disabled={isScanning || !bothFoldersSet}`; `onClick={handleScan}`
5. Render `<ScanSummaryPanel result={lastScan} isScanning={isScanning} />` immediately
   below the "Rescan Library" button, still inside the "Library Root" `<Panel>`

---

## Tests

### Rust (`scan.rs`)

| Test | Verifies |
|---|---|
| `normalize_filename_strips_extension` | stem only, no dot |
| `normalize_filename_strips_year_tag` | `"Film (1982).mkv"` → `"Film"` |
| `normalize_filename_preserves_casing` | original casing unchanged |
| `normalize_filename_trims_whitespace` | no leading/trailing spaces after strip |
| `normalize_filename_no_year_unchanged` | filename without year tag passes through |
| `scan_library_indexes_video_files` | temp dir with `.mkv` + `.mp4` → both in DB |
| `scan_library_ignores_non_video_files` | `.txt` / `.nfo` → not inserted |
| `scan_library_is_idempotent` | second scan → same row count, no duplicates |
| `scan_library_marks_removed_file_missing` | delete file, rescan → `is_missing = 1` |
| `scan_library_handles_missing_folder` | non-existent path → warning, no panic |
| `get_scan_summary_returns_none_before_scan` | clean DB → `None` |
| `get_scan_summary_returns_result_after_scan` | scan then query → hydrated struct |

Existing tests (`scan_library_errors_when_folders_unset`,
`scan_library_succeeds_when_folders_set`, `scan_library_returns_scan_in_progress_on_double_call`)
are retained and updated for the new `ScanResult` return type.

### Frontend (`src/api/__tests__/`)

| Test | Verifies |
|---|---|
| `scanLibrary returns ScanResult on success` | unwraps data envelope to `ScanResult` |
| `scanLibrary throws ApiError on error envelope` | existing pattern, updated shape |
| `getScanSummary returns null when data is null` | `{ data: null }` → `null` |
| `getScanSummary returns ScanResult when data present` | unwraps correctly |

---

## Scope boundaries

The following are explicitly **out of scope** for this phase:

- Associating any `media_file` row with a `movie_slot` or `episode`
- Confidence scoring or fuzzy matching
- Probing `duration_ms` (column stays null until a future phase)
- Storing `normalized_name` on `media_file` (derived in memory only, not persisted)
- Background/streaming scan progress events
- Manual overrides or playback readiness checks
