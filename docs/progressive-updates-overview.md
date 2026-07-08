# CineShelf Progressive Updates Overview

**Reference date:** 2026-03-18

This file is an additive update log for changes that landed after the main architecture snapshot in [ARCHITECTURE.md].

It is not a replacement for the architecture file.
Use it as a companion when the codebase has moved ahead of the original architecture write-up.

## What Changed After The Architecture Snapshot

### 1. Shared player overlay gained more responsibilities

- The shared TV/Movies overlay now owns additional playback controls beyond play, pause, seek, next, and previous.
- Audio track, subtitle track, aspect ratio, crop, and external subtitle attachment are now routed through the shared overlay stack.
- VLC-native bindings for those controls are explicitly disabled so CineShelf remains the authority for episode navigation and player UI behavior.

See [progressive-updates-player-overlay.md](./progressive-updates-player-overlay.md).

### 2. Anime is no longer just scaffolded

- The anime workflow now has a real scan, metadata, history, settings, detail, home, and player path.
- Anime uses a separate overlay route and separate renderer overlay components while still sharing the common Electron/VLC backend infrastructure.
- Anime history is namespaced with anime-specific keys and writes through anime-specific IPC.

See [progressive-updates-anime-workflow.md](./progressive-updates-anime-workflow.md).

### 3. Shared overlay routing is no longer single-route only

- The original architecture text treated the overlay as one shared route.
- Current behavior is split:
  - TV + Movies use `#/player-overlay`
  - Anime uses `#/anime-player-overlay`
- This preserves shared backend behavior while allowing anime-specific renderer behavior without touching TV.

### 4. Native dialog behavior changed in the overlay session

- Attaching an external subtitle now temporarily releases overlay focus and topmost ownership so the OS file picker can receive clicks correctly.
- The AHK overlay layer now treats native dialog mode as pass-through instead of translating left-click into play/pause.

### 5. Shared stale-state protection was added to TV/Movies episode switching

- A regression appeared where late state packets from the previous episode could overwrite the new episode timestamp during a switch.
- The shared TV/Movies overlay now ignores state updates whose `episodeId` does not match the expected current or pending episode.
- This mirrors the existing guard pattern used in the anime overlay.

## Recommended Reading Order

1. `ARCHITECTURE.md`
2. [electron-architecture.md](./electron-architecture.md)
3. [progressive-updates-player-overlay.md](./progressive-updates-player-overlay.md)
4. [progressive-updates-anime-workflow.md](./progressive-updates-anime-workflow.md)

## Scope Notes

- The architecture file remains the source of truth for isolation rules and shared-file safety rules.
- These progressive update files document what was added later, how behavior changed, and where the current implementation now differs from the older snapshot.
