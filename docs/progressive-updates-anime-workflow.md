# CineShelf Progressive Updates: Anime Workflow

**Reference date:** 2026-03-18

This document summarizes the anime workflow additions that landed after the original architecture and older scaffold-era docs.

## 1. Anime is now a real workflow, not a placeholder

The earlier architecture snapshot still reflects a scaffolded anime state.
Current implementation includes:

- library scanning
- metadata fetching
- history persistence
- detail page
- home page
- settings pages and tabs
- player launch
- anime-specific overlay renderer

## 2. Anime-specific Electron modules now exist

The following workflow modules were added under `electron/anime/`:

- scanner module
- metadata module
- session builder module

These handle anime-specific behavior such as:

- flat episodic library assembly
- anime metadata lookup through AniList primary and Jikan fallback
- anime-specific history keys and overlay init data

## 3. Anime overlay is renderer-isolated from TV/Movies

Anime does not reuse the shared React overlay component directly.

Current route split:

- shared TV/Movies overlay: `#/player-overlay`
- anime overlay: `#/anime-player-overlay`

Why this matters:

- shared backend behavior can still be reused
- anime-specific playlist presentation, title-bar behavior, and episode metadata can evolve without risking TV renderer regressions

## 4. Anime history model differs from TV

Anime uses namespaced history keys such as:

- `anime:<seriesId>-ep<episodeNumberStr>`

This keeps anime history isolated from TV and Movies and allows anime-specific episode numbering without collisions.

Anime overlay episode switches use anime-specific IPC rather than the shared TV switch handler.

## 5. Anime filtering is playlist-aware

Anime episode visibility is not just a UI filter.

Current behavior:

- canon, mixed, and filler visibility is stored per series
- the anime session builder uses those filters when constructing the playback playlist
- next and previous navigation inside the overlay traverses only the filtered visible set

This means the overlay playlist matches the detail-page filter state at launch time.

## 6. Anime metadata scope expanded

Anime metadata now includes more than a poster and overview.
The current pipeline can provide:

- title
- year
- overview
- genres
- rating
- poster path
- backdrop path
- AniList ID
- MAL ID
- status
- total episodes
- studio
- episode-level metadata when available

## 7. Anime settings grew beyond the original shell

Anime settings now include dedicated tabs for:

- general workflow settings
- app data inspection
- file system browsing and renaming

This mirrors the broader settings expansion that also happened for Movies.

## 8. Anime renderer parity with newer player controls

Anime overlay renderer behavior was extended to match newer shared player capabilities, including:

- audio track controls
- subtitle track controls
- aspect ratio controls
- crop cycling
- external subtitle attachment

Even though anime uses a separate renderer overlay, the intent is that player-control behavior remains consistent across workflows.

## 9. Practical implication for future work

When updating anime, separate the work into two categories:

1. shared backend behavior used by every workflow
2. anime-only renderer and workflow behavior

If the change is only visual or playlist-behavior-specific to anime, prefer keeping it in anime files.
If the change is VLC-command or native-window infrastructure, it belongs in shared Electron files and must be treated as a cross-workflow change.
