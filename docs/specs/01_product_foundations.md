# 0001 — Product Foundation

## Title
Midnight Drive-In Product Foundation

## Status
Accepted

## Summary
Midnight Drive-In is a local-first desktop application for organizing and playing drive-in style horror double features using a user’s own local media library.

The app does not host, distribute, or bundle media. It only indexes local files, maps them to episode metadata, and provides a playback experience that alternates between movie files and interstitial host segments.

## Problem Statement
Some horror-hosted programming is difficult to preserve in its original format because:
- full episodes may not exist as a single playable file
- users may only have movie files plus separate host/interstitial segments
- file naming is inconsistent
- there is no easy, user-friendly interface for reconstructing the intended viewing flow

Users need a local-only tool that makes these double features easy to browse, repair, and watch.

## Goals
- Build a local-first desktop application
- Support a simple and readable horror-themed UI
- Let users point the app at local folders containing movie files and interstitial segment files
- Represent historical episodes with local metadata
- Show each episode as a card in a browsable library
- Allow users to open an episode and play it in the intended sequence
- Allow manual file repair and timing adjustment when automatic matching is imperfect
- Work offline with no required server

## Non-Goals
- Hosting or distributing copyrighted media
- Cloud sync
- User accounts
- Community updates inside the app
- Subtitle/chapter support in MVP
- Resume playback sophistication in MVP
- Advanced social or sharing features

## Core Principles

### Local-first
All media, metadata, and user overrides live on the user’s machine.

### User-friendly over clever
Auto-matching is nice, but manual correction must be simple and obvious.

### UI-first delivery
The initial development phase prioritizes screen flows, interaction design, and realistic mocked data before native scanning and playback integration.

### Legally conservative
The app should be described as a local media organizer/player companion. It should not imply media distribution.

## Target Users
Primary users are horror fans with local collections of:
- movie files
- host/interstitial segment files
- enough patience to fix mismatches if the UI actually helps them

## Platform
Desktop app:
- Windows
- macOS

## High-Level Use Case
1. User opens the app
2. User sees a library of episodes
3. User selects or configures local folders
4. App scans movie and interstitial folders
5. App attempts to match files against episode metadata
6. User reviews cards showing readiness/missing files/timing issues
7. User opens an episode
8. App displays the mapped files and playback sequence
9. User adjusts offsets if needed
10. User plays the episode in app

## Episode Assumptions
For current scope:
- each episode contains exactly 2 movies
- each episode has 2 corresponding interstitial segment files
- timings are tied to a specific cut, though users may need offsets
- specials are included in the metadata DB and should be supported like normal episodes

## Functional Requirements
- Browse episode library
- Search and filter episodes
- View episode details
- Show file match status
- Support manual remapping
- Support per-episode timing adjustments
- Play local files in sequence inside the app
- Persist local settings and overrides

## Non-Functional Requirements
- Offline operation
- No media uploads
- No required backend server
- Good readability in dark mode
- Library performance should remain acceptable for hundreds of episodes
- Missing files or bad matches must fail gracefully

## Risks
- Local media filenames will be inconsistent
- Embedded playback may behave differently across codecs/platforms
- Historical timing data may not perfectly match a user’s specific file cut
- Overly spooky UI can become unreadable if not kept disciplined

## Success Criteria for MVP
- User can browse a mocked but realistic episode library
- User can inspect an episode detail page
- User can understand readiness and missing-file states at a glance
- UI is strong enough to wire into native features without redesign