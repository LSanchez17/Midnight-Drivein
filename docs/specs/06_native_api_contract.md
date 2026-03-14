# 0006 — Native API Contract

## Status
Draft

## Summary
This document is the single source of truth for every `invoke()` call the React frontend
makes to the Tauri Rust backend. It defines command names, argument shapes, response
envelopes, error codes, which fields are computed natively vs. derived on the client,
and where unit tests live on both sides of the boundary.

`src/api/_tauri.ts` implements this contract.  
`src/api/_mock.ts` must remain shape-compatible with it at all times.

**DB library:** `sqlx` with the `sqlite` feature and `runtime-tokio` async runtime.  
**Persistence target:** SQLite; schema defined in spec 0005.

---

## Conventions

| Topic | Rule |
|---|---|
| Rust command names | `snake_case` — e.g. `get_settings` |
| TypeScript `invoke` string | Matches Rust name exactly — e.g. `invoke('get_settings')` |
| All payloads | JSON-serializable; Rust structs use `#[derive(Serialize, Deserialize)]` |
| Wire field naming | `camelCase` via `#[serde(rename_all = "camelCase")]` on all structs |
| All commands | `async` on Rust side; returns `Promise` on TS side — no synchronous IPC |
| Null values | JSON `null` on the wire; `undefined` / optional on the TypeScript side |

---

## Response envelope

Every command returns one of two shapes. The TypeScript adapter unwraps the envelope
and throws a typed `ApiError` on failure — pages never see the raw envelope.

```ts
// Success
{ data: T }

// Failure
{ error: { code: ErrorCode; message: string } }
```

### `ApiError` and `ErrorCode`

Defined in `src/api/errors.ts` (new file, Phase 1):

```ts
export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'IO_ERROR'
  | 'DB_ERROR'
  | 'SCAN_IN_PROGRESS'
  | 'UNKNOWN'

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
```

---

## Native vs. client-derived state

| Field / Concept | Source | Reason |
|---|---|---|
| All persisted rows (`Episode`, `PlaybackCut`, `FileMatch`, `MediaFile`, `AppSettings`, `PlaybackOverride`) | **Native (Rust/SQLite)** | Authoritative persistent state |
| `EpisodeStatus` | **Client-derived** | Computed by `deriveEpisodeStatus()` in `src/lib/derive/episodeStatus.ts`; never returned by Rust |
| Library scan progress | **Native (Tauri events)** | Emitted as events, not command responses; typed shapes deferred to spec 0007 |
| `MediaFile.durationMs` | **Native** | Probed by Rust during scan |

---

## Phase 1 — Settings commands

These are the lowest-risk commands: single SQLite row, no file I/O, no scanning.

---

### `get_settings`

```
invoke('get_settings') → AppSettings
```

**Arguments:** none

**Returns:** the singleton `AppSettings` row. If no row exists yet, Rust inserts and
returns the defaults before responding.

```ts
interface AppSettings {
  moviesFolder: string | null
  segmentsFolder: string | null
  scanOnStartup: boolean   // default false
  theme: 'dark'            // default 'dark'
}
```

**Errors:** `DB_ERROR`

---

### `save_settings`

```
invoke('save_settings', { settings: AppSettingsPatch }) → void
```

**Arguments:**

```ts
interface AppSettingsPatch {
  moviesFolder?: string | null
  segmentsFolder?: string | null
  scanOnStartup?: boolean
  theme?: 'dark'
}
```

Partial update semantics — only provided fields are written. Missing fields are left
unchanged.

**Returns:** `void`

**Errors:** `INVALID_INPUT` (e.g. path traversal attempt), `DB_ERROR`

---

## Phase 1 — Unit tests

### Rust (`#[cfg(test)]`)

Location: `src-tauri/src/commands/settings.rs` (inline test module)

| Test | Assertion |
|---|---|
| `get_settings_returns_defaults` | When no row exists, returns `{ moviesFolder: null, segmentsFolder: null, scanOnStartup: false, theme: "dark" }` |
| `get_settings_returns_persisted` | After `save_settings`, `get_settings` reflects the saved values |
| `save_settings_partial_patch` | Saving only `moviesFolder` does not overwrite `scanOnStartup` |
| `save_settings_null_clears_folder` | Passing `moviesFolder: null` sets the column to `NULL` |

All Rust tests use an in-memory SQLite database (`sqlx::sqlite::SqlitePool` with
`sqlite::memory:`) — no disk files, no test isolation concerns.

### TypeScript (Vitest)

Location: `src/api/__tests__/settings.test.ts`

| Test | Assertion |
|---|---|
| `unwraps data envelope` | Adapter returns `AppSettings` when Rust returns `{ data: ... }` |
| `throws ApiError on error envelope` | Adapter throws `ApiError` with correct `code` when Rust returns `{ error: ... }` |
| `mock is shape-compatible` | `getSettings()` from `_mock.ts` satisfies the `AppSettings` interface |
| `saveSettings mock resolves void` | `saveSettings({})` from `_mock.ts` resolves without error |

---

## Phase 2 — Episode, Library & Playback commands

---

### `get_episodes`

```
invoke('get_episodes', { filters?: EpisodeFilters }) → EpisodeRow[]
```

**Arguments:** `EpisodeFilters` (from `src/api/types.ts` — `search`, `status`, `type`)

**Returns:** raw DB rows. The client attaches `status` by calling `deriveEpisodeStatus()`
on each row after receiving the response.

```ts
// Returned by Rust — no 'status' field
interface EpisodeRow {
  id: string
  title: string
  season: number | null
  episode: number | null
  isSpecial: boolean
  airDate: string | null
  description: string | null
  movieMatch: FileMatchRow
  segmentMatch: FileMatchRow
  cuts: PlaybackCutRow[]
  flaggedForTiming: boolean
}

interface FileMatchRow {
  fileType: 'movie' | 'segment'
  filename: string | null
  displayName: string | null
  path: string | null
  confidence: number | null
  status: 'matched' | 'low-confidence' | 'missing'
  isUserOverridden: boolean
  matchedAt: string | null
}

interface PlaybackCutRow {
  id: string
  sortOrder: number
  sourceType: 'movie' | 'segment'
  startMs: number
  endMs: number
  userOffsetMs: number
}
```

**Errors:** `DB_ERROR`

---

### `get_episode_by_id`

```
invoke('get_episode_by_id', { id: string }) → EpisodeRow | null
```

Returns `null` (not an error) when the episode does not exist.

**Errors:** `DB_ERROR`

---

### `scan_library`

```
invoke('scan_library') → void
```

Returns immediately once the scan job is enqueued. Progress and completion are reported
via Tauri events — typed shapes deferred to spec 0007.

**Errors:**
- `SCAN_IN_PROGRESS` — a scan is already running
- `IO_ERROR` — `moviesFolder` or `segmentsFolder` is null/unconfigured

---

### `save_cut_offset`

```
invoke('save_cut_offset', { cutId: string, offsetMs: number }) → void
```

Updates `PlaybackCut.user_offset_ms`. Acceptable range: `−3_600_000` to `3_600_000` ms
(±1 hour).

**Errors:** `NOT_FOUND` (bad `cutId`), `INVALID_INPUT` (out-of-range offset)

---

### `save_playback_override`

```
invoke('save_playback_override', { episodeId: string, flaggedForTiming: boolean }) → void
```

Upserts the `PlaybackOverride` row for the episode.

**Errors:** `NOT_FOUND` (bad `episodeId`)

---

### `remap_file`

```
invoke('remap_file', { episodeId: string, fileType: 'movie' | 'segment', mediaFileId: string }) → void
```

Updates the matching `FileMatch` row; sets `is_user_overridden = true` and recalculates
`match_status` based on confidence. `mediaFileId` must already exist in the `MediaFile`
inventory (populated by a scan).

**Errors:** `NOT_FOUND` (bad `episodeId` or `mediaFileId`)

---

## Phase 2 — Unit tests

### Rust (`#[cfg(test)]`)

| File | Tests |
|---|---|
| `src-tauri/src/commands/episodes.rs` | `get_episodes_returns_seeded_rows`; `get_episodes_filters_by_status`; `get_episode_by_id_returns_null_for_unknown` |
| `src-tauri/src/commands/scan.rs` | `scan_library_returns_scan_in_progress_on_double_call`; `scan_library_errors_when_folders_unset` |
| `src-tauri/src/commands/playback.rs` | `save_cut_offset_persists`; `save_cut_offset_not_found`; `save_cut_offset_rejects_out_of_range`; `save_playback_override_upserts`; `remap_file_sets_user_overridden` |

All use in-memory SQLite.

### TypeScript (Vitest)

| File | Tests |
|---|---|
| `src/api/__tests__/episodes.test.ts` | Adapter returns `Episode[]` (with `status`) from `EpisodeRow[]`; `EpisodeStatus` is derived client-side, never passed through; `deriveEpisodeStatus` covers all 4 status branches |
| `src/api/__tests__/playback.test.ts` | `saveCutOffset` resolves; throws `ApiError('NOT_FOUND')` on mocked error envelope |

---

## File structure (to be created during implementation)

```
src-tauri/src/
  commands/
    mod.rs          ← re-exports + tauri::generate_handler! registration
    settings.rs     ← Phase 1
    episodes.rs     ← Phase 2
    scan.rs         ← Phase 2
    playback.rs     ← Phase 2
  db/
    mod.rs          ← sqlx pool setup, connection string
    migrations/
      0001_init.sql ← schema from spec 0005

src/api/
  errors.ts         ← ApiError, ErrorCode   (Phase 1, new)
  _tauri.ts         ← invoke wrappers       (Phase 2, replaces stub)
  _mock.ts          ← unchanged; shape-compatible
  __tests__/
    settings.test.ts
    episodes.test.ts
    playback.test.ts
```

---

## Summary of key design decisions

| Question | Decision |
|---|---|
| DB library | `sqlx` with `sqlite` + `runtime-tokio` features |
| `EpisodeStatus` on the wire? | No — client-derived always |
| Scan progress delivery | Tauri events (not command response); shapes in spec 0007 |
| Partial settings update | PATCH semantics — only provided fields written |
| `remap_file` takes ID not path | File must be in inventory first; prevents orphan `FileMatch` rows |
| Null folder handling | `scan_library` returns `IO_ERROR` if either folder is null |
| Offset valid range | ±1 hour (±3 600 000 ms); enforced by Rust before DB write |
| Test DB | In-memory SQLite for all Rust tests — no disk, no cleanup needed |
