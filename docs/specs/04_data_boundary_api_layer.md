# 0004 — Data Boundary API Layer

## Status
Accepted

## Summary
Introduce a thin, app-facing API module that all UI pages import instead of calling mock
data or Tauri directly. The module starts backed by mocks. When Tauri is integrated, only
this module changes — no page or component needs to know where data came from.

---

## Problem

Today every page that needs data imports directly from `src/features/episodes/mocks.ts`:

```ts
// LibraryPage.tsx
import { getEpisodes } from '../features/episodes/mocks'

// EpisodeDetailPage.tsx
import { getEpisode } from '../features/episodes/mocks'
```

This couples the UI to the implementation. Swapping mocks for Tauri calls requires
touching every consuming file, and there is no single place to add loading/error
handling contract, logging, or caching later.

---

## Goal

Create `src/api/index.ts` as the **only import path** any page or component uses for
data. The functions inside always return the same shapes. The backing implementation
(mock / Tauri / fetch) is an internal detail of that module.

---

## API surface

### Episodes

```ts
getEpisodes(filters?: EpisodeFilters): Promise<Episode[]>
getEpisodeById(id: string): Promise<Episode | undefined>
```

### Settings

```ts
getSettings(): Promise<AppSettings>
saveSettings(patch: Partial<AppSettings>): Promise<void>
```

### Offsets

```ts
updateOffsets(episodeId: string, offsets: OffsetPatch): Promise<void>
```

### Library scan (stub only in Phase 1)

```ts
triggerScan(): Promise<void>
```

---

## Types to add

Add to `src/features/episodes/types.ts` or a new `src/api/types.ts`:

```ts
export interface EpisodeFilters {
  search?: string
  status?: EpisodeStatus | 'All'
  type?: 'All' | 'Episodes' | 'Specials'
}

export interface AppSettings {
  moviesFolder: string
  segmentsFolder: string
  // extendable — theme, scan preferences, etc.
}

export interface OffsetPatch {
  segment1: number
  segment2: number
}
```

---

## Module structure

```
src/
  api/
    index.ts          ← the only import path pages use
    types.ts          ← EpisodeFilters, AppSettings, OffsetPatch
    _mock.ts          ← Phase 1 implementation (delegates to mocks.ts)
    _tauri.ts         ← Phase 2 implementation (calls invoke())
```

`index.ts` picks the implementation based on a simple flag:

```ts
// src/api/index.ts
import * as mock from './_mock'
// import * as tauri from './_tauri'   // swap in Phase 2

export const {
  getEpisodes,
  getEpisodeById,
  getSettings,
  saveSettings,
  updateOffsets,
  triggerScan,
} = mock
```

The flag approach is intentionally simple — no dependency injection, no context, no
factory. A one-line comment swap is enough for Phase 2. A runtime env flag can replace
it later if needed.

---

## Phase 1 mock implementation (`_mock.ts`)

```ts
// src/api/_mock.ts
import { MOCK_EPISODES } from '../features/episodes/mocks'
import type { Episode } from '../features/episodes/types'
import type { EpisodeFilters, AppSettings, OffsetPatch } from './types'

export function getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
  return new Promise((resolve) =>
    setTimeout(() => {
      let results = [...MOCK_EPISODES]
      if (filters?.search) {
        const q = filters.search.toLowerCase()
        results = results.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.movies.some((m) => m.title.toLowerCase().includes(q)),
        )
      }
      if (filters?.status && filters.status !== 'All') {
        results = results.filter((e) => e.status === filters.status)
      }
      if (filters?.type === 'Specials') results = results.filter((e) => e.isSpecial)
      if (filters?.type === 'Episodes') results = results.filter((e) => !e.isSpecial)
      resolve(results)
    }, 300),
  )
}

export function getEpisodeById(id: string): Promise<Episode | undefined> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(MOCK_EPISODES.find((e) => e.id === id)), 200),
  )
}

export function getSettings(): Promise<AppSettings> {
  return Promise.resolve({ moviesFolder: '', segmentsFolder: '' })
}

export function saveSettings(_patch: Partial<AppSettings>): Promise<void> {
  return Promise.resolve()
}

export function updateOffsets(_episodeId: string, _offsets: OffsetPatch): Promise<void> {
  return Promise.resolve()
}

export function triggerScan(): Promise<void> {
  return Promise.resolve()
}
```

---

## Phase 2 Tauri stub (`_tauri.ts`)

Not implemented yet. Placeholder structure for reference:

```ts
// src/api/_tauri.ts
import { invoke } from '@tauri-apps/api/core'
import type { Episode } from '../features/episodes/types'
import type { EpisodeFilters, AppSettings, OffsetPatch } from './types'

export function getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
  return invoke('get_episodes', { filters })
}

export function getEpisodeById(id: string): Promise<Episode | undefined> {
  return invoke('get_episode_by_id', { id })
}

export function getSettings(): Promise<AppSettings> {
  return invoke('get_settings')
}

export function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  return invoke('save_settings', { patch })
}

export function updateOffsets(episodeId: string, offsets: OffsetPatch): Promise<void> {
  return invoke('update_offsets', { episodeId, offsets })
}

export function triggerScan(): Promise<void> {
  return invoke('trigger_scan')
}
```

---

## Migration: pages after this change

Each page replaces its mock import with the API import. No other logic changes.

| Before | After |
|---|---|
| `import { getEpisodes } from '../features/episodes/mocks'` | `import { getEpisodes } from '../api'` |
| `import { getEpisode } from '../features/episodes/mocks'` | `import { getEpisodeById } from '../api'` |
| `getEpisode(episodeId)` | `getEpisodeById(episodeId)` |

`SettingsPage` gains `getSettings()` and `saveSettings()` calls once its form is wired.

Filters currently applied client-side in `LibraryPage` move into the `getEpisodes(filters)`
call — the page passes `{ search, status, type }` and receives filtered results back.

---

## Filtering: client-side vs. server-side

In Phase 1, `_mock.ts` filters in JS. In Phase 2, `_tauri.ts` passes the filter struct to
the Rust backend and SQLite does the filtering. Pages never know the difference because
they call the same function with the same arguments.

---

## Error handling contract

All functions return a rejected Promise on failure. Pages are responsible for catching
and displaying errors. No global error wrapper is added in Phase 1 — keep it simple.

---

## What this does NOT do

- Does not add React Query or SWR (can be layered on top later)
- Does not define a caching strategy
- Does not wrap responses in a `{ data, error, loading }` envelope
- Does not create an HTTP client — Tauri uses IPC, not HTTP

---

## Exit criteria for this phase

- `src/api/index.ts`, `src/api/types.ts`, and `src/api/_mock.ts` exist
- `src/api/_tauri.ts` exists as a documented stub (not wired)
- `LibraryPage` and `EpisodeDetailPage` import only from `src/api`
- No page or component imports directly from `src/features/episodes/mocks`
- All existing behaviour is identical to before the refactor
- TypeScript reports zero errors

---

## Deferred

- Tauri SDK install and `invoke()` wiring (Phase 2)
- Real SQLite reads
- Real filesystem scan
- Caching / optimistic updates
- Global error boundary
