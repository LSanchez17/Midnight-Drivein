# Midnight Drive-In

A local-first desktop app for organizing and playing drive-in style horror double features.

> Phase 1 — UI Shell (mocked data, no native features yet)

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS v4
- react-router-dom v7
- clsx
- Planned: Tauri for native desktop wrapper

## Getting started

```bash
yarn          # install deps
yarn dev      # start dev server -> http://localhost:5173
```

## Build

```bash
yarn build    # production build
yarn preview  # preview production build
```

## Project structure

```
src/
  app/              # App entry, router, layout shell
    layout/         # AppShell, Sidebar
  components/ui/    # Reusable primitives (Button, Card, Panel, ...)
  features/
    episodes/       # Episode types, mocks, EpisodeCard
  pages/            # LibraryPage, EpisodeDetailPage, SettingsPage
```

## Routes

| Path           | Page                                         |
|----------------|----------------------------------------------|
| /library       | Episode library grid                         |
| /episode/:id   | Episode detail, mapping, player, offsets     |
| /settings      | Configuration (mocked)                       |

## Phase plan

- Phase 1 (current) - UI shell with mocked data
- Phase 2 - Wire Tauri commands, folder scanning, SQLite
- Phase 3 - Real playback orchestration

## Legal

This application is a local media organizer. It does not host, stream, download, or
distribute any media. All files remain on your machine at all times.
