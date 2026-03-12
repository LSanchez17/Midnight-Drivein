# 0002 — UI Shell

## Title
Midnight Drive-In UI Shell

## Status
Accepted

## Summary
This spec defines the UI-first phase of Midnight Drive-In. The goal is to build a complete application shell using mocked data that accurately reflects the eventual local-first desktop app.

No real filesystem scanning, database reads, or playback orchestration are required in this phase.

## Objectives
- Establish app layout and route structure
- Build reusable UI primitives
- Build the library page
- Build the episode detail page
- Build the settings page
- Establish the horror theme without harming readability
- Use realistic mock data structures aligned to the future implementation

## Routes
- `/` -> redirect to `/library`
- `/library`
- `/episode/:episodeId`
- `/settings`

## App Layout
The app should use a desktop-friendly shell:
- left sidebar or top nav
- persistent app title/logo
- main content area
- consistent spacing and panel layout
- soft transitions, minimal animation

## Theme Requirements
### Visual tone
- dark
- clean
- grindhouse/horror influence
- subtle, not cheesy

### Color tokens
- background: `#0b0b0f`
- panel: `#15151b`
- border: `#2a2a33`
- accent red: `#8b1e2d`
- accent cream: `#f3ebd2`
- muted text: `#b8b1a1`

### Typography
- bold display style for headings
- simple readable sans-serif for body text
- avoid novelty fonts in core UI
- high contrast text in all primary views

## Required Reusable UI Components
- Button
- Card
- Badge / StatusPill
- TextInput
- Select
- Panel
- SectionHeader
- EmptyState
- Drawer or Modal
- TimelineRow
- FilePathDisplay
- OffsetStepper

## Page Requirements

### Library Page
Purpose:
- show all episodes
- show current readiness state
- support discovery and filtering

#### Required elements
- page title
- search input
- status filter
- season/special filter
- episode grid
- episode cards
- empty state
- loading skeletons

#### Card requirements
Each card must show:
- episode title
- season/episode or special label
- movie 1 title
- movie 2 title
- status badge
- “Open” action

#### Statuses
- Ready
- Partial Match
- Missing Files
- Needs Timing Fix

### Episode Detail Page
Purpose:
- inspect one episode
- visualize playback flow
- repair mappings
- adjust offsets

#### Required sections
- episode header
- metadata summary
- file mapping panel
- playback panel
- timeline panel
- offset adjustment controls
- action row

#### Fake playback shell
During UI-first phase, the player can be a styled placeholder box with:
- title
- current part
- mocked transport controls
- mocked timeline preview

#### File mapping panel
Show four logical slots:
- movie 1
- segment 1
- movie 2
- segment 2

Each slot should display:
- matched filename or missing state
- confidence or status
- replace/remap button

#### Timing controls
At minimum:
- `-10s`
- `-5s`
- `+5s`
- `+10s`
- current offset display

### Settings Page
Purpose:
- surface configuration areas even before they are functional

#### Required groups
- Library Root
- Scan Preferences
- Metadata
- Appearance
- About / Legal

#### Mocked controls
- folder path field
- “Choose Folder” button
- “Rescan” button
- metadata import/export placeholders
- local-only legal explanation

## Mock Data Requirements
The UI must use data shaped like the eventual real models:
- Episode
- FileMatch
- PlaybackConfig

Mock data should include:
- a ready episode
- a partially matched episode
- an episode missing files
- an episode with timing problems
- at least one special

## Interaction Requirements
- route navigation must work
- filters update visible cards
- card click opens detail page
- mock remap action should visibly open a drawer/modal
- offset controls should update mocked displayed values in-session

## Accessibility Requirements
- keyboard-focusable controls
- status should not rely on color alone
- text contrast should remain readable
- interactive targets should be comfortably sized

## Deferred Until Later
- actual folder selection
- actual DB reads/writes
- real playback
- real scanning
- external-player fallback
- resume state
- subtitles

## Exit Criteria
UI shell phase is complete when:
- all major screens exist
- mocked flows feel coherent
- design tokens are established
- components are reusable enough to support native wiring later