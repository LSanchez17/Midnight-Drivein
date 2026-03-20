# 0013 — Playback Engine

## Status
Draft

## Summary
Spec 0012 produced a fully-resolved `PlaybackEntry[]` for any matched slot — every
entry carries a file path, per-file seek window, and offset-adjusted effective window.
This spec builds the runtime that actually plays those entries.

The engine is responsible for three things:

1. **Global timeline** — extend `PlaybackEntryRow` / `PlaybackEntry` with pre-computed
   `globalStartMs` / `globalEndMs` fields so the entire slot plays on a single,
   seekable timeline instead of per-file coordinates.

2. **New setting: `autoAdvanceSlots`** — a persistent boolean (default `true`) that
   controls whether the player automatically transitions to the next slot (Movie B after
   Movie A) when the last cut ends.

3. **Playback runtime** — a `resolveSeek` pure helper, a `usePlayback` React hook, and
   a `VideoPlayer` UI component that together deliver play/pause, progress-bar seeking,
   automatic cut transitions, and slot auto-advance.

Season 1 Episode 3 (`s01e03`) — _Deathgasm_ (slot a, 5 cuts) and _The Changeling_
(slot b, 5 cuts) — remains the reference episode for all tests.

**Acceptance criteria:**
- `get_playback_plan` returns `globalStartMs` / `globalEndMs` for every entry; for
  the s01e03-a slot the first entry has `globalStartMs: 0` and the values accumulate
  correctly across all 5 cuts
- `resolveSeek(entries, globalMs)` returns the correct `{ entryIndex, fileSeekMs }`
  for all cases listed in the test table
- `usePlayback` transitions between cuts with known `effectiveEndMs` automatically at
  the boundary without double-firing `timeupdate`
- When `autoAdvanceSlots: true` the player loads slot b after slot a ends, without user
  interaction
- When `autoAdvanceSlots: false` playback stops after slot a ends
- `cargo test -p app_lib` and `yarn run test` both pass
- The EpisodeDetailPage "Player Shell — Mocked" panel is replaced by the live player

---

## Part 1 — Global timeline fields

### Problem with the current cut format

The stored `start_ms` / `end_ms` values are **per-file-relative**: a cut with
`{ source: "commentary", start_ms: 30000, end_ms: 60000 }` means "seek the commentary
file to 0:30 and play 30 seconds".  It says nothing about _when_ that cut occurs in
the combined playback.  Without a global position a progress bar, a seek click, or a
`timeupdate` handler cannot know which entry is active.

### Solution

Keep the stored format unchanged (per-file-relative is author-friendly).  Extend
`PlaybackEntryRow` (Rust) and `PlaybackEntry` (TypeScript) with two read-only fields
computed at query time:

| Field | Type | Meaning |
|---|---|---|
| `globalStartMs` | `i64` / `number` | Milliseconds from the start of the slot at which this entry begins |
| `globalEndMs` | `i64` / `number` | Milliseconds from the start of the slot at which this entry ends |

### Computation (Rust)

In `get_playback_plan_for_slot` (`src-tauri/src/db/episodes.rs`), after the existing
offset clamping, accumulate a `cursor: i64` starting at `0`:

```
for each cut (in sort_order ASC):
  global_start_ms = cursor
  duration        = effective_end_ms - effective_start_ms
  global_end_ms   = cursor + duration
  cursor         += duration
```

For s01e03-a (no offsets applied, 5 cuts) the result is:

| order | source      | effectiveStartMs | effectiveEndMs | globalStartMs | globalEndMs |
|-------|-------------|------------------|----------------|---------------|-------------|
| 1     | commentary  | 0                | 30 000         | 0             | 30 000      |
| 2     | movie       | 0                | 300 000        | 30 000        | 330 000     |
| 3     | commentary  | 30 000           | 60 000         | 330 000       | 360 000     |
| 4     | movie       | 300 000          | 550 000        | 360 000       | 610 000     |
| 5     | commentary  | 60 000           | 86 000         | 610 000       | 636 000     |

For s01e03-b (_The Changeling_, 5 cuts, last two open-ended):

| order | source      | effectiveStartMs | effectiveEndMs | globalStartMs | globalEndMs |
|-------|-------------|------------------|----------------|---------------|-------------|
| 1     | commentary  | 0                | 20 000         | 0             | 20 000      |
| 2     | movie       | 0                | 150 000        | 20 000        | 170 000     |
| 3     | commentary  | 20 000           | 40 000         | 170 000       | 190 000     |
| 4     | movie       | 150 000          | 275 000        | 190 000       | 315 000     |
| 5     | commentary  | 30 000           | 46 500         | 315 000       | 331 500     |

### Rust struct change

`src-tauri/src/db/types.rs` — extend `PlaybackEntryRow`:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEntryRow {
    pub order: i64,
    pub source: String,
    pub file_path: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub effective_start_ms: i64,
    pub effective_end_ms: Option<i64>,
    pub cut_id: String,
    // new
    pub global_start_ms: i64,
    pub global_end_ms: i64,
}
```

### TypeScript type change

`src/features/episodes/types.ts` and `src/api/types.ts` — extend `PlaybackEntry`:

```ts
export interface PlaybackEntry {
  order: number
  source: SourceType
  filePath: string
  startMs: number
  endMs: number | undefined
  effectiveStartMs: number
  effectiveEndMs: number | undefined
  cutId: string
  // new
  globalStartMs: number
  globalEndMs: number
}
```

### `_tauri.ts` wire mapping

In the `getPlaybackPlan` array-map:
```ts
globalStartMs: row.globalStartMs,
globalEndMs:   row.globalEndMs,
```

### `resolvePlaybackPlan.ts` change

The pure TS resolver must produce the same fields so mock paths stay consistent.
After assembling all entries, accumulate a `cursor` and assign `globalStartMs` /
`globalEndMs` using the same algorithm described above.

### Rust tests (additions to `db/episodes.rs` test block)

| Case | Assertion |
|---|---|
| s01e03-a happy path | entry 0 `global_start_ms == 0`, entry 1 `global_start_ms == 30_000`, entry 2 `global_start_ms == 330_000`, entry 3 `global_start_ms == 360_000` |
| s01e03-a happy path | entry 3 (movie) `global_end_ms == 610_000`; entry 4 (commentary) `global_start_ms == 610_000`, `global_end_ms == 636_000` |
| s01e03-b happy path | entry 3 `global_start_ms == 190_000`, `global_end_ms == 315_000` |
| s01e03-b happy path | entry 4 `global_start_ms == 315_000`, `global_end_ms == 331_500` |
| Positive offset on cut 1 | `userOffsetMs = +5000` on the first cut shrinks its window; cursor advances by the adjusted duration |

---

## Part 2 — `autoAdvanceSlots` setting

### Migration `0007_auto_advance_slots.sql`

```sql
ALTER TABLE app_settings ADD COLUMN auto_advance_slots INTEGER NOT NULL DEFAULT 1;
```

### Rust struct change

`src-tauri/src/db/types.rs`:

```rust
pub struct AppSettings {
    pub movies_folder: Option<String>,
    pub commentary_folder: Option<String>,
    pub scan_on_startup: bool,
    pub theme: String,
    pub auto_advance_slots: bool,   // new
}

pub struct AppSettingsPatch {
    pub movies_folder: Option<Option<String>>,
    pub commentary_folder: Option<Option<String>>,
    pub scan_on_startup: Option<bool>,
    pub theme: Option<String>,
    pub auto_advance_slots: Option<bool>,   // new
}
```

### `db/settings.rs` change

Extend the `SELECT` in `get_settings`:
```sql
SELECT movies_folder, commentary_folder, scan_on_startup, theme, auto_advance_slots
FROM app_settings WHERE id = 1
```

Add a fragment in `save_settings`:
```rust
if settings.auto_advance_slots.is_some() {
    fragments.push("auto_advance_slots = ?");
}
```
Bind in the same order.

### TypeScript type changes

`src/api/types.ts`:
```ts
export interface AppSettings {
  moviesFolder: string | null
  commentaryFolder: string | null
  scanOnStartup: boolean
  theme: 'dark'
  autoAdvanceSlots: boolean   // new
}

export interface AppSettingsPatch {
  moviesFolder?: string | null
  commentaryFolder?: string | null
  scanOnStartup?: boolean
  theme?: 'dark'
  autoAdvanceSlots?: boolean   // new
}
```

Mock default in `src/api/_mock.ts`: `autoAdvanceSlots: true`.

### Settings page UI

Add a new panel beneath "Scan Preferences" in `src/pages/SettingsPage.tsx`:

```
Panel title: "Playback"

  [x] Automatically advance to the next movie when playback ends
      (persists as autoAdvanceSlots)
```

Behaviour mirrors the existing `scanOnStartup` checkbox pattern:
- `onChange` → `saveSettings({ autoAdvanceSlots: checked })` → `reloadSettings()`
- Inline error below the checkbox on failure

---

## Part 3 — `resolveSeek` pure helper

### Purpose

Given the enriched `PlaybackEntry[]` and a global seek target `globalMs`, resolve
which entry to play and where to seek the file.

### Signature

**Location:** `src/features/episodes/resolveSeek.ts`

```ts
export interface SeekResult {
  entryIndex: number   // index into the entries array
  fileSeekMs: number   // seek position within the source file, ≥ 0
}

export function resolveSeek(
  entries: PlaybackEntry[],
  globalMs: number,
): SeekResult
```

### Algorithm

```
if entries is empty → return { entryIndex: 0, fileSeekMs: 0 }

for i from 0 to entries.length - 1:
  entry = entries[i]

  inRange = globalMs >= entry.globalStartMs
            AND (entry.globalEndMs === undefined OR globalMs < entry.globalEndMs)

  if inRange:
    fileSeekMs = entry.effectiveStartMs + (globalMs - entry.globalStartMs)
    return { entryIndex: i, fileSeekMs: max(0, fileSeekMs) }

// past all known ends → clamp to last entry's end
last = entries[entries.length - 1]
return {
  entryIndex: entries.length - 1,
  fileSeekMs: last.effectiveEndMs,
}
```

### Test cases

**Location:** `src/features/episodes/__tests__/resolveSeek.test.ts`

Uses the s01e03-a plan (globalStartMs values from Part 1):

| Test group | Input | Expected |
|---|---|---|
| **Core flow** | | |
| Seek to 0 ms | `globalMs: 0` | `entryIndex: 0`, `fileSeekMs: 0` (commentary at 0) |
| Seek into cut 2 | `globalMs: 130_000` (100 s into the movie cut) | `entryIndex: 1`, `fileSeekMs: 100_000` |
| Seek to exact cut boundary | `globalMs: 330_000` | `entryIndex: 2`, starts commentary cut 3 |
| Seek into cut 4 (second movie segment, s01e03-a) | `globalMs: 500_000` | `entryIndex: 3` (movie), `fileSeekMs: 440_000` |
| Seek into cut 4 (second movie segment, s01e03-b) | `globalMs: 250_000` | `entryIndex: 3` (movie), `fileSeekMs: 210_000` |
| Seek into cut 5 (final commentary, s01e03-b) | `globalMs: 320_000` | `entryIndex: 4` (commentary), `fileSeekMs: 35_000` |
| **Offset flow** | | |
| Positive offset (+5 000 ms on cut 1) | plan with `effectiveStartMs: 5_000` | `fileSeekMs` includes offset |
| Negative offset (−5 000 ms on cut 1, clamps) | produces `effectiveStartMs: 0` | `fileSeekMs: 0`, no negative result |
| Offset doesn't produce negative seek | seek target that would yield `< 0` before clamp | `fileSeekMs: 0` |
| **Failure flow** | | |
| Empty entries array | `entries: []` | returns `{ entryIndex: 0, fileSeekMs: 0 }`, no throw |
| Seek past total end | `globalMs` beyond all `globalEndMs` | clamped to last entry, no throw |

---

## Part 4 — `usePlayback` hook

### Purpose

Manages all playback state and the cut-transition loop.  All timing logic lives here;
no timing decisions are made in the component layer.

### Location

`src/features/episodes/usePlayback.ts`

### Interface

```ts
export interface UsePlaybackOptions {
  onSlotEnd?: () => void
}

export interface UsePlaybackResult {
  movieVideoRef: React.RefObject<HTMLVideoElement>
  commentaryVideoRef: React.RefObject<HTMLVideoElement>
  activeSource: SourceType | null   // which video element is currently visible
  plan: PlaybackEntry[] | null
  loadingPlan: boolean
  playing: boolean
  globalTimeMs: number
  totalDurationMs: number
  activeEntryIndex: number
  error: string | null
  loadPlan: (episodeId: string, slot: string) => Promise<void>
  play: () => void
  pause: () => void
  seek: (globalMs: number) => void
}

export function usePlayback(options?: UsePlaybackOptions): UsePlaybackResult
```

### State and refs

| Name | Kind | Purpose |
|---|---|---|
| `plan` | state | The resolved `PlaybackEntry[]` for the active slot |
| `activeEntryIndex` | state | Index of the currently-playing entry |
| `playing` | state | Whether the active video is playing |
| `globalTimeMs` | state | Live global playback position, updated from `timeupdate` |
| `loadingPlan` | state | True while `getPlaybackPlan` is in-flight |
| `error` | state | Human-readable error string, or `null` |
| `movieVideoRef` | ref | `<video>` element for movie files |
| `commentaryVideoRef` | ref | `<video>` element for commentary files |
| `transitionInFlightRef` | ref (bool) | Double-fire guard; set before swapping, cleared after |

### `loadPlan(episodeId, slot)`

1. Set `loadingPlan: true`, clear `error`
2. Call `getPlaybackPlan(episodeId, slot)` → on error, set `error` message and return
3. Set `plan`, `activeEntryIndex: 0`, `globalTimeMs: 0`, `totalDurationMs: plan[plan.length - 1].globalEndMs`
4. Assign `movieVideoEl.src = convertFileSrc(movieFilePath)` and
   `commentaryVideoEl.src = convertFileSrc(commentaryFilePath)`; once each element fires
   `loadedmetadata`, seek it to the first cut's `effectiveStartMs` for that source
5. Set `loadingPlan: false`

### `play()` / `pause()`

Delegate to the active video element (determined by `entries[activeEntryIndex].source`).
Update `playing` state.

### `seek(globalMs)`

1. Call `resolveSeek(plan, globalMs)`
2. If `entryIndex !== activeEntryIndex`, update `activeEntryIndex`
3. Seek the correct video element to `fileSeekMs`
4. Pre-seek the inactive video element to the _next_ entry's `effectiveStartMs` if one
   exists (readies it for the upcoming transition)
5. Do **not** set `transitionInFlightRef` — seek is user-initiated, not a boundary
   transition

### `handleTimeUpdate` (attached to both video elements' `timeupdate` event)

Only the currently-active video's events are acted on.

```
entry = plan[activeEntryIndex]
currentFileMs = activeVideo.currentTime * 1000
globalMs      = entry.globalStartMs + (currentFileMs - entry.effectiveStartMs)
set globalTimeMs = globalMs

if transitionInFlightRef.current: return   // guard against double-fire

nextEntry = plan[activeEntryIndex + 1]
if nextEntry exists:
    if globalMs >= entry.globalEndMs - 50:   // ~3 frames at 60 fps
        transitionInFlightRef.current = true
        inactiveVideo.currentTime = nextEntry.effectiveStartMs / 1000
        swap visible/hidden
        set activeEntryIndex = activeEntryIndex + 1
        transitionInFlightRef.current = false
else:
    if globalMs >= entry.globalEndMs - 50:
        activeVideo.pause()
        set playing = false
        options.onSlotEnd?.()
```

The guard is a **mutable ref** (`useRef<boolean>(false)`) — not state — so setting it
does not trigger a re-render and the guarded block runs synchronously within the same
event handler invocation, preventing the double-fire scenario.

### `handleEnded` (attached to both video elements' `ended` event)

Fires when a video file plays to its natural end.  Only the currently-active video's
event is acted on.

```
if transitionInFlightRef.current: return   // shared guard with handleTimeUpdate

nextEntry = plan[activeEntryIndex + 1]
if nextEntry exists:
    transitionInFlightRef.current = true
    inactiveVideo.currentTime = nextEntry.effectiveStartMs / 1000
    swap visible/hidden
    set activeEntryIndex = activeEntryIndex + 1
    transitionInFlightRef.current = false
else:
    set playing = false
    options.onSlotEnd?.()
```

Both `handleTimeUpdate` and `handleEnded` are active for every entry.  In normal
playback `handleTimeUpdate` fires first (at `−50 ms`), pauses or transitions, and
suppresses the `ended` event.  `handleEnded` acts as a precision fallback if
`timeupdate` is sparse (e.g., very short media).  `transitionInFlightRef` prevents
double-transitions if both fire near the same boundary.

### `totalDurationMs`

Computed in `loadPlan` as `plan[plan.length - 1].globalEndMs` — the **complete
combined runtime** of the slot.  Available immediately after the plan is fetched.

Exposed as `number` in `UsePlaybackResult`.

---

## Part 5 — `VideoPlayer` component

### Location

`src/features/episodes/components/VideoPlayer.tsx`

### Props

```ts
interface VideoPlayerProps {
  episode: Episode
  autoAdvanceSlots: boolean
}
```

### Structure

```
<div> (player container)
  ─── slot selector tabs  (only rendered when episode.slots.length > 1)
  ─── two <video> elements
      movieVideo      ref={movieVideoRef}      hidden when activeSource === 'commentary'
      commentaryVideo ref={commentaryVideoRef} hidden when activeSource === 'movie'
  ─── error banner  (rendered when error !== null)
  ─── loading skeleton  (rendered when loadingPlan)
  ─── progress bar  (seekable; width = globalTimeMs / totalDurationMs)
  ─── controls: ⏮  play/pause  ⏭
</div>
```

### Slot selector tabs

Rendered only when `episode.slots.length > 1`.  Each tab shows the movie title
(`slot.movieTitle ?? slot.commentaryMatch.displayName ?? slot.slot.toUpperCase()`).
Clicking a tab calls `loadPlan(episode.id, slot.slot)`.

### Two-video binding

Both `<video>` elements are always present in the DOM.  Visibility is toggled via
inline style (`display: none` / `display: block`).  Their `src` attributes are set via
`convertFileSrc(path)` from `@tauri-apps/api/core`, which converts a local filesystem
path to a `tauri://localhost/…` URL.

When `usePlayback` returns `activeSource: null` (plan not yet loaded), both video
elements are hidden.

### Scrubber (custom progress bar)

The native `<video>` `controls` attribute is **omitted**.  A custom scrubber element
sits below the video area and represents the **complete combined runtime**
`[0, totalDurationMs]` — the complete combined runtime of all cuts.

- Width: `(globalTimeMs / totalDurationMs) * 100`%
- Click / drag handler: `seek((clickX / barWidth) * totalDurationMs)` — any position
  in the full timeline is reachable
- A small label showing the current source (`MOVIE` / `COMMENTARY`) can optionally
  sit beside the timestamp to indicate which file is active

### Controls

| Button | Action |
|---|---|
| ⏮ | `seek(0)` |
| ▶ / ⏸ | `play()` or `pause()` based on `playing` |
| ⏭ | advance to next slot tab (user-controlled) |

### Slot auto-advance

`onSlotEnd` callback passed to `usePlayback`:

```ts
const currentSlotIndex = episode.slots.findIndex(s => s.slot === activeSlot)
if (autoAdvanceSlots && currentSlotIndex < episode.slots.length - 1) {
    const nextSlot = episode.slots[currentSlotIndex + 1]
    loadPlan(episode.id, nextSlot.slot)
}
```

### Error banner

Rendered beneath the video area when `error !== null`:

```
⚠ {error}  ·  Check Library Settings
```

Uses the existing danger colour (`#f87171`).

---

## Part 6 — EpisodeDetailPage and Tauri asset protocol

### `EpisodeDetailPage.tsx`

Replace the mocked "Player Shell" panel:

```tsx
// Before: <Panel title="Playback"> ... mocked UI ... </Panel>
// After:
<VideoPlayer
    episode={episode}
    autoAdvanceSlots={settings?.autoAdvanceSlots ?? true}
/>
```

`useSettings()` is already consumed on this page for the `settings` object.

### Tauri capabilities

Add to `src-tauri/capabilities/default.json` so the WebView can load local video files
via the asset protocol:

```json
"permissions": [
    "core:default",
    "dialog:default",
    "core:asset:allow"
]
```

This permits `convertFileSrc` paths to resolve.  All local file reads go through the
Tauri asset protocol — no new Rust command is needed.

---

## Part 7 — Test matrix

### `resolveSeek.test.ts` (new)

All cases from the table in Part 3.  Pure unit test, no mocks, no DOM.

### `resolvePlaybackPlan.test.ts` (updated)

Add assertions for `globalStartMs` and `globalEndMs` on all existing happy-path
cases, using the values from the table in Part 1.

### `usePlayback.test.ts` (new)

Uses `@testing-library/react` + `vitest` + fake timers.  Mock `getPlaybackPlan` via
`vi.mock('../../../api')`.

| Test | What is exercised |
|---|---|
| `loadPlan` sets initial state | `loadingPlan` → false, `plan` length, `activeEntryIndex: 0` |
| `play` / `pause` | delegates to the active video element |
| Transition at cut boundary | fire `timeupdate` at `effectiveEndMs - 10` ms → `activeEntryIndex` becomes 1 |
| `transitionInFlightRef` guard | fire `timeupdate` twice in the same event loop tick → `activeEntryIndex` advances only once |
| `seek` mid-cut | `seek(130_000)` on s01e03-a → `activeEntryIndex: 1`, correct `currentTime` on movie element |
| Auto-advance slot | `onSlotEnd` fires on last entry end; `loadPlan` is called with next slot |
| `autoAdvanceSlots: false` | `onSlotEnd` fires; no second `loadPlan` call |
| `ended` as precision fallback | fire `ended` on movie element while on entry 3 of s01e03-b (entry 4 is commentary) | `activeEntryIndex` becomes 4 |
| Double-fire guard on `ended` | fire `ended` twice on same active element → `activeEntryIndex` advances only once |
| `ended` on final commentary | fire `ended` on commentary element at last entry → `onSlotEnd` fires, `playing` becomes `false` |
| Missing movie file | `getPlaybackPlan` rejects → `error` is non-null |
| Invalid range | `seek(-1)` → clamps to 0, no throw |
| Seek into cut 5 (final commentary, s01e03-b) | `seek(320_000)` on s01e03-b → `entryIndex: 4`, correct `currentTime` on commentary element |

### Rust tests (additions to `db/episodes.rs` `#[cfg(test)]` block)

All cases from the table in Part 1.

### `settings.test.ts` (updated)

- `get_settings` default includes `auto_advance_slots: true`
- `save_settings` patch with `autoAdvanceSlots: false` persists correctly

### `playback.test.ts` (updated — API layer)

- `getPlaybackPlan` returns entries with `globalStartMs` and `globalEndMs` fields
- Mock `getPlaybackPlan` returns entries built from `resolvePlaybackPlan` which now
  produces global fields

---

## File inventory

| File | Status | Change |
|---|---|---|
| `src-tauri/src/db/types.rs` | modify | `PlaybackEntryRow` global fields; `AppSettings` / `AppSettingsPatch` `auto_advance_slots` |
| `src-tauri/src/db/episodes.rs` | modify | Cursor accumulation in `get_playback_plan_for_slot`; new Rust tests |
| `src-tauri/src/db/settings.rs` | modify | SELECT + fragment for `auto_advance_slots` |
| `src-tauri/src/db/migrations/0007_auto_advance_slots.sql` | new | `ALTER TABLE` |
| `src-tauri/capabilities/default.json` | modify | `core:asset:allow` |
| `src/features/episodes/types.ts` | modify | `globalStartMs` / `globalEndMs` on `PlaybackEntry` |
| `src/api/types.ts` | modify | Same fields on wire `PlaybackEntry`; `autoAdvanceSlots` on settings |
| `src/api/_tauri.ts` | modify | Wire mapping for global fields; `autoAdvanceSlots` |
| `src/api/_mock.ts` | modify | Mock default `autoAdvanceSlots: true` |
| `src/features/episodes/resolvePlaybackPlan.ts` | modify | Compute `globalStartMs` / `globalEndMs` |
| `src/features/episodes/resolveSeek.ts` | new | `resolveSeek` pure function |
| `src/features/episodes/usePlayback.ts` | new | Playback hook |
| `src/features/episodes/components/VideoPlayer.tsx` | new | Player component |
| `src/pages/EpisodeDetailPage.tsx` | modify | Replace mocked panel with `<VideoPlayer>` |
| `src/pages/SettingsPage.tsx` | modify | "Playback" panel with `autoAdvanceSlots` checkbox |
| `src/features/episodes/__tests__/resolveSeek.test.ts` | new | All cases from Part 3 table |
| `src/features/episodes/__tests__/resolvePlaybackPlan.test.ts` | modify | Global field assertions |
| `src/features/episodes/__tests__/usePlayback.test.ts` | new | All cases from Part 7 table |
| `src/api/__tests__/settings.test.ts` | modify | `autoAdvanceSlots` assertions |
| `src/api/__tests__/playback.test.ts` | modify | Global field assertions |
