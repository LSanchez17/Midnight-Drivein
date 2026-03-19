# 0011 — Match and Index

## Status
Draft

## Summary
Spec 0010 answered _"What files exist?"_. This spec answers the follow-up questions:

> _"Which episode does this file belong to? What's matched, what's low-confidence,
> what's missing?"_

After every successful scan, the app runs a **matching pass** that normalises each
scanned filename and scores it against episode metadata — movie titles, aliases, and
segment host labels loaded from `episodes.json`. Results are written to `file_match`
rows (one per slot × file type). Every episode already reads from `file_match` via the
existing `get_episodes` query; this spec provides the data that query has been waiting
for.

The remap modal that exists as a placeholder in `EpisodeDetailPage` is wired up with a
real `RemapDialog` component backed by a new `list_media_files` command, letting users
correct or override any automatic match.

**Acceptance criteria:**
- After the first scan against a populated library, every `movie_slot` row has
  two `file_match` rows (`movie` and `segment`), each with a `match_status` of
  `matched`, `low-confidence`, or `missing`
- A file named `"Castle Freak (1995).mkv"` is matched to the slot with
  `movie_title = "Castle Freak"` with `confidence ≥ 0.85`
- A file named `"castle_freak_1995.mkv"` (underscores, no parenthesised year) is
  matched to the same slot with `confidence ≥ 0.85`
- An episode with one matched slot and one unmatched segment displays status
  `"Partial Match"` in the Library page card and detail header
- An episode with all files matched and no timing issues displays `"Ready"`
- Rescan after a manual remap does **not** overwrite the user's assignment
- Clicking Remap opens the `RemapDialog` listing all non-missing files for the
  correct folder root; selecting one updates the episode status immediately
- `ScanSummaryPanel` shows matched / low-confidence / missing counts after a scan
- `cargo test -p app_lib` and `yarn run test` both pass

---

## Normalisation

Two levels of normalisation are defined and kept separate. Both live in `scan.rs`.

### Level 1 — `normalize_filename` _(exists from spec 0010)_

Strips the extension and removes parenthesised year tags. Preserves casing.
Used to auto-populate `media_file.display_name`.

```
"The Slumber Party Massacre (1982).mkv"  →  "The Slumber Party Massacre"
"castle_freak_1995.mkv"                  →  "castle_freak_1995"
"C.H.U.D..mkv"                          →  "C.H.U.D."
```

### Level 2 — `normalize_for_match` _(new)_

Prepares a string for fuzzy comparison. Applies `normalize_filename` first (when the
input is a filename), then:

1. Lowercase
2. Replace each underscore `_` and period `.` with a space
3. Collapse all runs of whitespace to a single space
4. Trim leading / trailing spaces

Applied to **both** the candidate filename and the target string (title, alias, or host
label) before comparison.

```
"The Slumber Party Massacre (1982).mkv"  →  "the slumber party massacre"
"castle_freak_1995.mkv"                  →  "castle freak 1995"
"C.H.U.D..mkv"                          →  "c h u d"
"S01E01A Segments"                       →  "s01e01a segments"
```

`normalize_for_match` accepts either a raw filename or an already-normalised string
(idempotent for non-filename inputs).

---

## Matching algorithm

The matching pass is implemented as `match_media_files(pool)` in `scan.rs` and called
at the end of `scan_library_inner`, **after** all UPSERT and `mark_missing` steps.

### Inputs

- All `movie_slot` rows: `(id, movie_title, movie_aliases_json, host_label)`  
  — loaded once, not re-queried per file
- All `media_file` rows where `is_missing = 0`, partitioned into two sets:
  - `movie_files`: `folder_root = 'movies'`
  - `segment_files`: `folder_root = 'segments'`

### Scoring

For **movie file → slot** matching:

| Candidate string | Target string |
|---|---|
| `normalize_for_match(file.filename)` | `normalize_for_match(slot.movie_title)` |
| _(same)_ | `normalize_for_match(alias)` for each entry in `movie_aliases_json` |

The score is the maximum `jaro_winkler` result across the title and all aliases.
If a normalised alias compares as an **exact string match** to the normalised filename,
its score is forced to `1.0` regardless of Jaro-Winkler — aliases are intentional.

For **segment file → slot** matching:

| Candidate string | Target string |
|---|---|
| `normalize_for_match(file.filename)` | `normalize_for_match(slot.host_label)` |

Slots where `host_label` is null are skipped for segment matching; their segment
`file_match` is written as `missing`.

### Confidence thresholds

| Score | `match_status` | `media_file_id` |
|---|---|---|
| ≥ 0.85 | `matched` | best candidate's id |
| 0.50 – 0.84 | `low-confidence` | best candidate's id |
| < 0.50 | `missing` | NULL |

These thresholds are unchanged from spec 0005.

### Best-match uniqueness

Every file is assigned to at most one slot. After scoring all (file, slot) pairs:

1. Sort candidates by score descending
2. For each candidate (highest score first): if neither the file nor the slot has
   already been claimed, assign them
3. Any slot that received no assignment generates a `missing` `file_match` row

This prevents the same physical file from being double-assigned when two slots share a
similar title.

### UPSERT behaviour

For each slot × file type outcome:

```sql
INSERT INTO file_match (slot_id, file_type, media_file_id, match_status, confidence,
                        is_user_overridden, matched_at)
VALUES (?, ?, ?, ?, ?, 0, ?)
ON CONFLICT(slot_id, file_type) DO UPDATE SET
    media_file_id      = excluded.media_file_id,
    match_status       = excluded.match_status,
    confidence         = excluded.confidence,
    matched_at         = excluded.matched_at
WHERE is_user_overridden = 0
```

The `WHERE is_user_overridden = 0` clause means any row that was set by
`remap_file` (see below) is **never overwritten** by an automatic rescan.

---

## Data model changes

### Migration `0005_match_summary.sql`

Adds three match-count columns to the `scan_summary` singleton so the stats panel can
hydrate from stored data without querying `file_match` at boot time.

```sql
-- 0005_match_summary.sql
-- Spec 0011 — Match and Index
-- Adds per-scan match quality counters to the scan_summary singleton.

ALTER TABLE scan_summary ADD COLUMN matched_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_summary ADD COLUMN low_confidence_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_summary ADD COLUMN missing_count        INTEGER NOT NULL DEFAULT 0;
```

### `display_name` population

In the `scan_library_inner` UPSERT, add `display_name` to the `ON CONFLICT DO UPDATE`
clause only when the column is currently null. This auto-sets a human-friendly label
for new files without overwriting any value the user has edited.

```sql
INSERT INTO media_file (id, filename, display_name, path, folder_root, size_bytes,
                        last_seen_at, is_missing)
VALUES (?, ?, ?, ?, ?, ?, ?, 0)
ON CONFLICT(path) DO UPDATE SET
    filename     = excluded.filename,
    display_name = COALESCE(media_file.display_name, excluded.display_name),
    size_bytes   = excluded.size_bytes,
    last_seen_at = excluded.last_seen_at,
    is_missing   = 0
```

The candidate `display_name` value passed in the `INSERT` clause is
`normalize_filename(row.filename)`.

---

## Rust implementation

### New Cargo dependency

```toml
# src-tauri/Cargo.toml
strsim = "0.11"
```

Provides `strsim::jaro_winkler(a: &str, b: &str) -> f64`.

### `MatchSummary` struct

Returned from `match_media_files` and embedded into `ScanResult`.

```rust
#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MatchSummary {
    pub matched:          usize,
    pub low_confidence:   usize,
    pub missing:          usize,
}
```

### `ScanResult` — updated struct

```rust
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub last_scan_at:        String,
    pub movie_file_count:    usize,
    pub segment_file_count:  usize,
    pub errors:              Vec<String>,
    pub missing_folders:     Vec<String>,
    pub match_summary:       MatchSummary,   // ← new
}
```

### `normalize_for_match`

```rust
// Extends normalize_filename for fuzzy comparison.
// Accepts a filename (extension stripped + year tag removed) or any plain string.
// Input is assumed to not be a filename when it contains no dot; in that case
// normalize_filename is a no-op and only lowercase + space normalisation applies.
pub fn normalize_for_match(input: &str) -> String {
    // If it looks like a filename (has a supported extension), run level-1 first.
    let stem = if has_video_extension(input) {
        normalize_filename(input)
    } else {
        input.to_string()
    };
    // lowercase → underscores/dots → spaces → collapse whitespace
    stem.to_lowercase()
        .replace(['_', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn has_video_extension(s: &str) -> bool {
    Path::new(s)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}
```

### `match_media_files`

```rust
pub async fn match_media_files(
    pool: &SqlitePool,
) -> Result<MatchSummary, String>
```

**Step-by-step:**

1. `SELECT id, movie_title, movie_aliases_json, host_label FROM movie_slot`
2. `SELECT id, filename, folder_root FROM media_file WHERE is_missing = 0`
3. Partition media files by `folder_root`
4. Build a flat list of `(slot_id, file_type, best_media_file_id, score)` candidates:
   - For each `(movie_file, slot)` pair: compute score as described above → record best
   - For each `(segment_file, slot)` pair: same for `host_label`
5. Apply best-match uniqueness (sort desc → claim first unclaimed pair)
6. Remaining unmatched slots → `missing` entries (score 0.0, `media_file_id = NULL`)
7. Classify outcomes into `MatchSummary` counters (≥ 0.85 / 0.50–0.84 / < 0.50)
8. UPSERT each outcome to `file_match` using the `WHERE is_user_overridden = 0` guard

### `scan_library_inner` — call site

After the `mark_missing` calls and before persisting `scan_summary`:

```rust
// Run matching pass; non-fatal — errors are appended to the scan errors list.
let match_summary = match match_media_files(pool).await {
    Ok(s)  => s,
    Err(e) => {
        errors.push(e);
        MatchSummary::default()
    }
};
```

Include the three counters in the `INSERT OR REPLACE INTO scan_summary` query.

### New command: `remap_file`

```rust
#[tauri::command]
pub async fn remap_file(
    pool:         State<'_, SqlitePool>,
    slot_id:      String,
    file_type:    String,
    media_file_id: String,
) -> Result<(), String>
```

Validates that `file_type` is `"movie"` or `"segment"` (returns `INVALID_INPUT` error
if not). Verifies the `media_file_id` exists and is not missing (returns `NOT_FOUND`
if the row is absent or `is_missing = 1`). Then:

```sql
INSERT INTO file_match (slot_id, file_type, media_file_id, match_status,
                        confidence, is_user_overridden, matched_at)
VALUES (?, ?, ?, 'matched', 1.0, 1, ?)
ON CONFLICT(slot_id, file_type) DO UPDATE SET
    media_file_id      = excluded.media_file_id,
    match_status       = 'matched',
    confidence         = 1.0,
    is_user_overridden = 1,
    matched_at         = excluded.matched_at
```

`matched_at` is `Utc::now().to_rfc3339()`. Always sets `is_user_overridden = 1`,
protecting the assignment from future auto-scans.

### New command: `list_media_files`

```rust
#[tauri::command]
pub async fn list_media_files(
    pool:        State<'_, SqlitePool>,
    folder_root: String,
) -> Result<Vec<MediaFileListRow>, String>
```

`folder_root` must be `"movies"` or `"segments"` (returns `INVALID_INPUT` otherwise).

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFileListRow {
    pub id:           String,
    pub filename:     String,
    pub display_name: Option<String>,
    pub path:         String,
    pub size_bytes:   Option<i64>,
    pub last_seen_at: String,
}
```

```sql
SELECT id, filename, display_name, path, size_bytes, last_seen_at
FROM media_file
WHERE folder_root = ? AND is_missing = 0
ORDER BY filename ASC
```

Used exclusively by the remap dialog. Does not paginate — libraries are expected to
have hundreds of files, not millions.

### `lib.rs` and `commands/mod.rs`

Register `remap_file` and `list_media_files` in the `invoke_handler!` macro and
re-export from `commands/mod.rs`.

---

## TypeScript API layer

### `src/api/types.ts` additions

```ts
export interface MatchSummary {
    matched:         number
    lowConfidence:   number
    missing:         number
}

// Extend existing ScanResult
export interface ScanResult {
    lastScanAt:       string
    movieFileCount:   number
    segmentFileCount: number
    errors:           string[]
    missingFolders:   string[]
    matchSummary:     MatchSummary    // ← new
}

export interface MediaFileSummary {
    id:          string
    filename:    string
    displayName: string | undefined
    path:        string
    sizeBytes:   number | undefined
    lastSeenAt:  string
}
```

### `_tauri.ts` additions

```ts
export async function listMediaFiles(
    folderRoot: 'movies' | 'segments',
): Promise<MediaFileSummary[]> {
    try {
        const rows = await invoke<MediaFileSummary[]>('list_media_files', { folderRoot })
        return rows.map(r => ({
            ...r,
            displayName: r.displayName ?? undefined,
            sizeBytes:   r.sizeBytes   ?? undefined,
        }))
    } catch (e) {
        throw parseError(e)
    }
}
```

`remapFile` already exists in `_tauri.ts` as a stub — no body changes needed beyond
confirming the command name is `'remap_file'`.

Wire type for `ScanResult` from Rust already uses `camelCase` serialisation so no
additional conversion is needed for `matchSummary`.

### `_mock.ts` additions

```ts
export function listMediaFiles(
    _folderRoot: 'movies' | 'segments',
): Promise<MediaFileSummary[]> {
    return Promise.resolve([])
}
```

`scanLibrary()` mock should include `matchSummary: { matched: 0, lowConfidence: 0, missing: 0 }`.

### `api/index.ts`

Re-export `listMediaFiles` alongside the existing exports.

---

## UI

### `ScanSummaryPanel` — match stats

Extend the existing result state to show a "Match Results" row group below the file
counts:

| Label | Value |
|---|---|
| Matched | `matchSummary.matched` (green `#4ade80`) |
| Low Confidence | `matchSummary.lowConfidence` (amber `#fdba74`) |
| Missing | `matchSummary.missing` (red `#f87171`) |

All three rows are shown even when zero — silence is ambiguous after a scan.

`ScanSummaryPanelProps` is unchanged (the new fields arrive inside `ScanResult`).

### `RemapDialog` component

New file: `src/features/episodes/components/RemapDialog.tsx`

Replaces the placeholder modal in `EpisodeDetailPage`. The existing `remapTarget`
state and overlay structure stay in place; only the modal content is replaced.

**Props:**

```ts
interface RemapDialogProps {
    slotId:     string
    fileType:   SourceType
    folderRoot: 'movies' | 'segments'
    onClose:    () => void
    onConfirmed: () => void   // called after successful remap; triggers episode re-fetch
}
```

**Behaviour:**

1. On mount: call `listMediaFiles(folderRoot)` → store in local state. Show a loading
   spinner while in-flight; show an inline error message on failure.
2. Render a search `<TextInput>` that filters `filename` and `displayName` by the
   typed query (case-insensitive, client-side).
3. Render a scrollable list (max height `320px`, overflow-y scroll) of matching files.
   Each row shows:
   - Display name (or filename fallback) — primary text `#f3ebd2`
   - Full path — secondary text `#b8b1a1`, truncated
   - File size (human-readable: KB / MB / GB) — secondary text
4. Clicking a row selects it (highlighted state, `background: #1e1e28`). No immediate
   action.
5. **Confirm** button (variant `"primary"`, disabled if nothing selected):
   - Calls `remapFile(slotId, fileType, selectedId)`
   - On success: calls `onConfirmed()`, then `onClose()`
   - On error: shows an inline error banner inside the dialog (do not close)
6. **Cancel** button (variant `"ghost"`): calls `onClose()`.

**Integration in `EpisodeDetailPage`:**

- Derive `folderRoot` from `remapTarget.fileType`:
  `fileType === 'movie' ? 'movies' : 'segments'`
- Replace the placeholder modal body with `<RemapDialog ... />` passing the props
  above
- `onConfirmed`: call `getEpisodeById(episodeId)` and refresh the `episode` state

---

## Tests

### Rust (`src-tauri/src/commands/scan.rs`)

| Test | Verifies |
|---|---|
| `normalize_for_match_lowercases` | `"Castle Freak"` → `"castle freak"` |
| `normalize_for_match_replaces_underscores` | `"castle_freak_1995.mkv"` → `"castle freak 1995"` |
| `normalize_for_match_replaces_dots` | `"C.H.U.D..mkv"` → `"c h u d"` |
| `normalize_for_match_collapses_whitespace` | multiple spaces → single space |
| `normalize_for_match_strips_year_and_lowercases` | `"Film (1982).mkv"` → `"film"` |
| `match_media_files_exact_title` | in-memory DB: slot `"Castle Freak"` + file `"Castle Freak (1995).mkv"` → `matched`, confidence `1.0` |
| `match_media_files_underscore_title` | file `"castle_freak_1995.mkv"` → same slot, `matched` |
| `match_media_files_alias_exact` | alias `"Castle Freak '95"` matches normalised → score forced `1.0` |
| `match_media_files_low_confidence` | deliberately poor name → `low-confidence` |
| `match_media_files_no_match_is_missing` | no files → all slots `missing` |
| `match_media_files_uniqueness` | two slots, one file → highest-score slot wins; other slot `missing` |
| `match_media_files_respects_user_override` | pre-existing `is_user_overridden = 1` row → not updated after scan |
| `remap_file_sets_override_flag` | in-memory DB: call `remap_file_inner` → row has `is_user_overridden = 1`, `confidence = 1.0` |
| `remap_file_rejects_invalid_file_type` | `file_type = "unknown"` → `INVALID_INPUT` error |
| `remap_file_rejects_missing_media_file` | `is_missing = 1` file → `NOT_FOUND` error |
| `list_media_files_returns_non_missing` | two files, one missing → returns only non-missing |
| `list_media_files_rejects_invalid_root` | `folder_root = "other"` → `INVALID_INPUT` error |

All existing scan tests retain unchanged behaviour.

### Frontend (`src/api/__tests__/`)

New file or additions to existing `scan.test.ts`:

| Test | Verifies |
|---|---|
| `listMediaFiles invokes list_media_files with folderRoot` | invoke called with correct args |
| `listMediaFiles returns MediaFileSummary array` | null coercion to undefined applied |
| `listMediaFiles throws ApiError with INVALID_INPUT` | error prefix parsed correctly |
| `remapFile invokes remap_file with correct args` | slotId, fileType, mediaFileId forwarded |
| `remapFile throws ApiError with NOT_FOUND` | parsed correctly |
| `mock listMediaFiles resolves to empty array` | shape compatibility |
| `ScanResult matchSummary shape` | mock `scanLibrary` includes all three counter fields |

---

## Scope boundaries

The following are explicitly **out of scope** for this phase:

- Probing `duration_ms` on `media_file` (stays null)
- Fuzzy matching on segment filename patterns beyond `host_label` (e.g. season/episode
  codes in the filename)
- Bulk remap or batch correction tools
- Pagination in `list_media_files`
- Any UI for viewing raw `media_file` rows outside of the remap dialog
- Background / streaming rescan progress events
