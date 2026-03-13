# 0005 — Local Data Model

## Status
Draft

## Summary
This document is the single source of truth for every entity the app stores, derives,
or treats as nullable. It defines the shape of all persistent rows, the rules for
which fields are required, how IDs are assigned, and how the `EpisodeStatus` badge
is calculated from stored data.

**Persistence target:** SQLite via Tauri (defined here now, wired in a later phase).  
**MediaFile:** first-class inventory entity — scanned, stored, reusable across episodes.

---

## Entity overview

| Entity           | Persisted | Derived | Notes                                     |
|------------------|-----------|---------|-------------------------------------------|
| `Episode`        | ✓         |         | Metadata seed; loaded from bundled data   |
| `PlaybackCut`    | ✓         |         | One row per timed cut; N cuts per episode define playback sequence |
| `MediaFile`      | ✓         |         | One row per file found on disk            |
| `FileMatch`      | ✓         |         | Links episode's movie or segment file to a MediaFile (2 per episode) |
| `PlaybackOverride` | ✓       |         | User flag for episodes needing timing work |
| `EpisodeStatus`  |           | ✓       | Computed from FileMatch state + overrides |
| `AppSettings`    | ✓         |         | Singleton row; app-level user preferences |

---

## `Episode`

Represents one historical drive-in episode from the catalogue metadata.

| Field          | Type            | Nullable | Notes                                              |
|----------------|-----------------|----------|----------------------------------------------------|
| `id`           | `TEXT` PK       | No       | UUID v4; assigned at seed                          |
| `title`        | `TEXT`          | No       | Display title                                     |
| `season`       | `INTEGER`       | Yes      | Null for specials; present for regular episodes   |
| `episode`      | `INTEGER`       | Yes      | Present for both regular episodes and specials; null only if unknown |
| `is_special`   | `INTEGER` (bool)| No       | Default `0`                                       |
| `air_date`     | `TEXT`          | Yes      | ISO 8601 date string (`YYYY-MM-DD`)               |
| `description`  | `TEXT`          | Yes      | Summary / host quote; can be blank                |
| `created_at`   | `TEXT`          | No       | ISO timestamp; set at seed                        |

**Specials use the same shape.** A special has `is_special = 1` and `season = null`.
Specials still carry an `episode` number (e.g. episode 1 of the specials run); it is
not null unless the episode number is genuinely unknown. All other fields and
relationships are identical to a regular episode. The combination of `title`, `season`,
`episode`, and `is_special` is sufficient to identify an episode in the UI; the UUID
`id` is only used as a foreign key reference.

**`EpisodeStatus` is not stored on `Episode`.** It is derived at read-time from the
episode's `FileMatch` and `PlaybackOverride` rows. See [Derived: EpisodeStatus](#derived-episodestatus) below.

---

## `PlaybackCut`

Represents one timed segment of playback within an episode. Each cut references a time
range within one of the episode's two source files (movie or segment). Cuts are played
back in `sort_order` sequence, producing the interleaved movie-segment experience.

**An episode typically has many cuts** — e.g. intro segment → movie act 1 → intermission
segment → movie act 2 → … → closing segment. The count is dynamic and varies per episode.

| Field            | Type         | Nullable | Notes                                                           |
|------------------|--------------|----------|-----------------------------------------------------------------|
| `id`             | `TEXT` PK    | No       | UUID v4; assigned at seed                                       |
| `episode_id`     | `TEXT` FK    | No       | → `Episode.id`                                                  |
| `sort_order`     | `INTEGER`    | No       | Playback position within the episode (1-based)                  |
| `source_type`    | `TEXT`       | No       | Enum: `movie` or `segment` — which source file this cut is from |
| `start_ms`       | `INTEGER`    | No       | Start time within the source file, in milliseconds              |
| `end_ms`         | `INTEGER`    | No       | End time within the source file, in milliseconds                |
| `user_offset_ms` | `INTEGER`    | No       | User timing adjustment in milliseconds; default `0`             |

**Timestamps are stored as integer milliseconds** and displayed as `HH:MM:SS` in the UI.
Effective playback start = `start_ms + user_offset_ms`.

A typical episode sequence might look like:

| sort_order | source_type | start_ms | end_ms  | HH:MM:SS equivalent    |
|------------|-------------|----------|---------|------------------------|
| 1          | segment     | 0        | 300000  | 00:00:00 → 00:05:00    |
| 2          | movie       | 0        | 900000  | 00:00:00 → 00:15:00    |
| 3          | segment     | 300000   | 720000  | 00:05:00 → 00:12:00    |
| 4          | movie       | 900000   | 2100000 | 00:15:00 → 00:35:00    |
| 5          | segment     | 720000   | 1020000 | 00:12:00 → 00:17:00    |
| 6          | movie       | 2100000  | 3600000 | 00:35:00 → 01:00:00    |

Cuts into the same source file are non-overlapping ranges — each source file is a single
long file; playback seeks to `start_ms` and plays until `end_ms`.

`PlaybackCut` rows are seeded from metadata. `user_offset_ms` is the only user-editable
field; all other fields are read-only after seeding.

---

## `MediaFile`

Represents a single physical file discovered on disk during a library scan.

| Field          | Type            | Nullable | Notes                                            |
|----------------|-----------------|----------|--------------------------------------------------|
| `id`           | `TEXT` PK       | No       | UUID v4; assigned at first scan                  |
| `filename`     | `TEXT`          | No       | Basename only: `humanoids.mkv`                   |
| `display_name` | `TEXT`          | Yes      | User-editable human-friendly name; UI falls back to `filename` when null |
| `path`         | `TEXT`          | No       | Absolute path at time of scan                    |
| `folder_root`  | `TEXT`          | No       | Which configured root: `movies` or `segments`    |
| `size_bytes`   | `INTEGER`       | Yes      | Null if stat failed                              |
| `duration_ms`  | `INTEGER`       | Yes      | Null until probed                                |
| `last_seen_at` | `TEXT`          | No       | ISO timestamp of most recent scan that found it  |
| `is_missing`   | `INTEGER` (bool)| No       | `1` if previously scanned, now absent on disk    |

**Reuse:** A `MediaFile` row is not deleted when it is unmatched from an episode. It
persists in inventory so the same physical file can be re-matched or re-used without
re-scanning. The `is_missing` flag is updated, not the row deleted.

---

## `FileMatch`

Links one episode's movie or segment source file to a `MediaFile`. There are exactly
two `FileMatch` rows per episode — one for `file_type = 'movie'` and one for
`file_type = 'segment'`. Records the confidence score and whether the match was
set by the scanner or by the user.

| Field                | Type            | Nullable | Notes                                              |
|----------------------|-----------------|----------|----------------------------------------------------|
| `id`                 | `INTEGER` PK    | No       | Auto-increment                                     |
| `episode_id`         | `TEXT` FK       | No       | → `Episode.id`                                     |
| `file_type`          | `TEXT`          | No       | Enum: `movie` or `segment`                         |
| `media_file_id`      | `TEXT` FK       | Yes      | → `MediaFile.id`; **null = no file assigned**      |
| `match_status`       | `TEXT`          | No       | Enum: `matched` `low-confidence` `missing`         |
| `confidence`         | `REAL`          | Yes      | 0.0–1.0; null when `match_status = missing`        |
| `is_user_overridden` | `INTEGER` (bool)| No       | `1` when user manually selected this file          |
| `matched_at`         | `TEXT`          | Yes      | ISO timestamp; null if no file was ever assigned   |

**Unique constraint:** `(episode_id, file_type)` — at most one row per file type per episode.  
When a user remaps a file, the existing row is updated in-place (`media_file_id`,
`match_status`, `confidence`, `is_user_overridden`, `matched_at` all update together).

**`confidence` thresholds (informational):**

| Range         | `match_status`    |
|---------------|-------------------|
| ≥ 0.85        | `matched`         |
| 0.50 – 0.84   | `low-confidence`  |
| no file found | `missing`         |

---

## `PlaybackOverride`

Episode-level flags set by the user. Per-cut timing offsets are stored on `PlaybackCut`
(`user_offset_ms`) rather than here, because each cut already belongs to exactly one
episode and the count is variable.

| Field              | Type         | Nullable | Notes                                                |
|--------------------|--------------|----------|------------------------------------------------------|
| `episode_id`       | `TEXT` PK FK | No       | → `Episode.id`; one row per episode                  |
| `flagged_for_timing` | `INTEGER` (bool) | No | `1` if user explicitly marked this episode as needing timing work |
| `created_at`       | `TEXT`       | No       | ISO timestamp; set when the row is first created     |
| `updated_at`       | `TEXT`       | No       | ISO timestamp of last user change                    |

**Row creation:** A `PlaybackOverride` row is created on first user interaction (e.g.
the first time the user flags an episode). Episodes with no user flags have no row;
readers should treat a missing row as `flagged_for_timing = false`.

---

## Derived: `EpisodeStatus`

`EpisodeStatus` is not stored. It is computed at read-time from the episode's
`FileMatch` rows and `PlaybackOverride` row.

### Computation rules (evaluated in order)

| Priority | Condition                                                                                 | Status              |
|----------|-------------------------------------------------------------------------------------------|---------------------|
| 1        | Any `FileMatch.match_status = missing`                                                    | `Missing Files`     |
| 2        | Any `FileMatch.match_status = low-confidence` (and none missing)                          | `Partial Match`     |
| 3        | All `matched` AND (any `PlaybackCut.user_offset_ms ≠ 0` OR `flagged_for_timing = 1`)      | `Needs Timing Fix`  |
| 4        | All `matched`, all `user_offset_ms = 0`, not flagged                                       | `Ready`             |

### TypeScript representation (for the API layer)

```ts
export type EpisodeStatus =
  | 'Ready'
  | 'Partial Match'
  | 'Missing Files'
  | 'Needs Timing Fix'
```

This is the same union exported from `src/features/episodes/types.ts`.
The derivation logic lives in `src/lib/derive/episodeStatus.ts` (to be created).

---

## `AppSettings`

Singleton row. Always `id = 1`. Created with defaults on first launch.

| Field              | Type            | Nullable | Notes                                              |
|--------------------|-----------------|----------|----------------------------------------------------|
| `id`               | `INTEGER` PK    | No       | Always `1`                                        |
| `movies_folder`    | `TEXT`          | Yes      | Absolute path to user's movie files folder        |
| `segments_folder`  | `TEXT`          | Yes      | Absolute path to user's segment files folder      |
| `scan_on_startup`  | `INTEGER` (bool)| No       | Default `0`                                       |
| `theme`            | `TEXT`          | No       | `'dark'` only for MVP; enum-expandable            |
| `created_at`       | `TEXT`          | No       | ISO timestamp; set on first launch                |
| `updated_at`       | `TEXT`          | No       | ISO timestamp of last user change                 |

**`movies_folder` and `segments_folder` are nullable** because the user may not have
configured them yet. The app must handle this gracefully — showing a prompt or empty
state rather than crashing. No scan is possible while either is null.

---

## Summary of nullable fields

| Entity           | Nullable fields                                                            |
|------------------|----------------------------------------------------------------------------|
| `Episode`          | `season`, `episode` (only if unknown), `air_date`, `description`                |
| `PlaybackCut`      | none — all fields required                                                      |
| `MediaFile`        | `display_name`, `size_bytes`, `duration_ms`                                     |
| `FileMatch`        | `media_file_id`, `confidence`, `matched_at`                                     |
| `PlaybackOverride` | none (row may be absent; all fields have defaults when present; `created_at`/`updated_at` set on row creation) |
| `AppSettings`      | `movies_folder`, `segments_folder`                                              |

---

## Summary of key design decisions

| Question                                    | Decision                                                    |
|---------------------------------------------|-------------------------------------------------------------|
| Do specials use the same shape?             | Yes — `is_special = 1`, `season = null`, `episode` present (null only if unknown) |
| Where are offsets stored?                       | `PlaybackCut.user_offset_ms`; per cut, applies to every cut in the sequence     |
| Is `EpisodeStatus` stored?                      | No — derived at read-time from `FileMatch` + `PlaybackOverride`                 |
| Is `MediaFile` a first-class entity?            | Yes — scanned, stored, reusable; not deleted on unmatch                         |
| How is a "no match" represented?                | `FileMatch` row with `media_file_id = null`, `match_status = missing`           |
| What happens when a file goes missing?          | `MediaFile.is_missing = 1`; `FileMatch` row preserved                           |
| When does a `PlaybackOverride` row get created? | On first user interaction; absent row = not flagged                             |
| ID format for `Episode`                         | UUID v4; `title`/`season`/`episode`/`is_special` used for display identity      |
| ID format for `PlaybackCut`                     | UUID v4; `episode_id` + `sort_order` is the natural unique key                  |
| Files per episode                               | Exactly 2 — one movie file, one segment file; `FileMatch.file_type` identifies which |
| Cut timestamps                                  | Stored as `INTEGER` milliseconds; displayed as `HH:MM:SS` in the UI             |
| Movie display name                              | `MediaFile.display_name` (user-editable); falls back to `filename` when null    |
