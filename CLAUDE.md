# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CineShelf is a Windows Electron app: a local, personal media library (Netflix-style UI) for TV Shows, Movies, and Anime stored on local/external drives. It scans folders, fetches metadata (TMDB / AniList / Jikan), and plays files by launching an external VLC instance that it controls via VLC's HTTP interface, with a transparent always-on-top Electron overlay window drawn on top of VLC for playback controls.

## Commands

- `npm run dev` — primary dev loop: starts CRA dev server (`react-scripts start`) and launches Electron pointed at `localhost:3000`.
- `npm start` — CRA dev server only (React UI in a browser, no Electron/VLC integration).
- `npm run build` — production React build (`build/`).
- `npm run dist` — build + package into a Windows installer via `electron-builder` (NSIS, output in `dist/`).
- `npm run electron` — run Electron against whatever is currently in `build/` (no dev server).

There is no test suite and no lint script configured (ESLint only runs implicitly via `react-scripts`, `eslintConfig` in `package.json` sets `no-unused-vars: warn`). There is nothing to run for "tests" in this repo.

## Architecture

### Three isolated workflows, not shared code

The app has three parallel, deliberately-duplicated feature sets: **TV Shows**, **Movies**, **Anime**. Each owns its own scanner, metadata fetcher, session/launch logic, React context, and UI components. `ARCHITECTURE.md` is the canonical description of the isolation rule:

> A file inside `src/tv/` must never import from `src/movies/` or `src/anime/`, and vice versa. All three workflow directories may import from `src/shared/`. That is the only permitted cross-directory import.

Cross-cutting changes (to `electron/player.js`, `electron/windowSyncDaemon.js`, `electron/watchHistory.js`, `electron/main.js`, `electron/preload.js`, `electron/overlayPreload.js`, `src/shared/`, `src/App.js`, `src/settings/SettingsPage.js`, `src/browse/BrowsePage.js`) have blast radius across all three workflows — flag them and prefer additive changes (new IPC channel, new parameter with a safe default, duplication into a workflow-specific file) over editing shared behavior in place.

### Documentation map — read this before searching blind

The docs below are the accumulated design record for this project. They are **not equally reliable** — several were written as an aspirational target or at an earlier snapshot and never fully reconciled with the code that actually shipped. Use this table to go straight to the right doc, then see "Verified doc-vs-code discrepancies" below before trusting an exact file path or IPC name out of any of them.

| Doc | Covers | Reliability |
| --- | --- | --- |
| `ARCHITECTURE.md` | Master reference: three-workflow isolation rule, directory layout, the three "intersection points" (`App.js`, `SettingsPage.js`, `BrowsePage.js`), shared-file modification rules, per-workflow feature-parity checklist. Start here for any structural question. | Directory tree and isolation *rule* are accurate; some exact paths/IPC names it lists for TV are aspirational — see discrepancies below. |
| `docs/electron-architecture.md` | Deep dive on the Electron main process: full IPC channel map per workflow, the `session.js` launch contract (what `launch()` must/must not do), how overlay init data flows (push + pull path), data file paths, safe-modification rules per shared file. | Same caveat as above — written for the same `electron/tv/` + `tv:`-prefix layout that doesn't exist for TV in practice. Movies/Anime sections match reality closely. |
| `docs/expansion-playbook.md` | Step-by-step build order used to take Movies and Anime from scaffold to feature parity with TV (scanner → context → home → metadata → session → history → settings → custom rows). Useful as a template if a 4th workflow or a major workflow feature is ever added the same way. | Historical/procedural — describes the *process* that was followed, still an accurate model for "how to extend a workflow" even where specific old file names differ from what landed. |
| `docs/app-data.md` | Shape of every file under `userData/CineShelf/`: `settings.json`, `library.json`, `metadata.json`, `history.json`, `posters/`/`backdrops/` naming convention. Written from the TV workflow's perspective (pre-Movies/Anime split). | Accurate for TV's flat file layout and JSON shapes. Doesn't mention the `movies/` and `anime/` subdirectories added later — see `docs/electron-architecture.md` §5 for those. |
| `docs/metadata-and-images.md` | Full metadata/image pipeline: TMDB endpoint sequence, TVMaze fallback, image download/caching rules (never re-download if the file exists), episode-stills background caching task, offline-behavior table, `cineshelf:///` protocol serving. | Accurate on mechanism and TMDB/TVMaze behavior (verified against `electron/metadata.js`). One stale path: it says the renderer's `toLocalUrl()` lives at `src/utils/helpers.js` — it actually lives at `src/shared/utils/helpers.js`. |
| `docs/watch-history.md` | `history.json` schema (episode entries + `series:{id}` completion-counter entries), 90%-completion rule, resume logic (30s guard + `autoResume` setting), series-completion counter, "Continue Watching" / `getNextEpisode()` resume-point algorithm. | Accurate; TV-focused but the same completion/resume model applies to Movies and Anime (each with its own `history.json`). |
| `docs/stable-workflow.md` | Short note on the episode-switch worker's race-proofing (poll-and-retry `in_play`, debounced resume, seek confirmation) and why TV playback switching is considered stable/locked. | Accurate, narrow scope — pairs with `docs/progressive-updates-player-overlay.md` §6 (stale-state guard) for the current full picture. |
| `docs/progressive-updates-overview.md` | Index/changelog of everything that landed **after** the original `ARCHITECTURE.md` snapshot: expanded overlay control surface, anime maturing past scaffold, the overlay route split, native-dialog focus handling, stale-state guard. Points to the two detail docs below. | Read this *first* among the progressive-updates docs — it's the table of contents for the other two. |
| `docs/progressive-updates-anime-workflow.md` | What anime specifically gained beyond its original scaffold: real scanner/metadata/session modules, its own overlay route, namespaced history keys (`anime:<seriesId>-ep<N>`), canon/filler/mixed playlist filtering, expanded metadata scope. | Accurate and current — this is the best single doc for "what state is anime actually in." |
| `docs/progressive-updates-player-overlay.md` | What the shared TV/Movies overlay gained: audio/subtitle/aspect-ratio/crop controls, `patchVLCInputConfig()` clearing VLC's native key/mouse bindings, the playback-detail snapshot model, native-dialog focus release for subtitle attachment, the stale-`episodeId` guard during episode switches. | Accurate and current — read before touching `PlayerOverlay.js`, `OverlayControls.js`, or `electron/player.js` input handling. |

**Precedence when docs conflict:** `docs/progressive-updates-*.md` postdate and override `ARCHITECTURE.md`/`docs/electron-architecture.md` on *behavior*. But none of the docs are authoritative on exact file paths or IPC channel names — grep the actual `electron/` and `src/` trees (see discrepancies below for known traps) rather than trusting a doc's file path literally.

### Verified doc-vs-code discrepancies (checked directly against source)

- **No `electron/tv/` subdirectory, no `tv:`-prefixed IPC.** `ARCHITECTURE.md` and `docs/electron-architecture.md` describe `electron/tv/scanner.js`, `electron/tv/metadata.js`, `electron/tv/session.js`, and channels like `tv:scan`/`tv:player:launch`. None of that exists. TV — the original, oldest workflow — lives flat at the root of `electron/`: `electron/scanner.js`, `electron/metadata.js`. Its launch/session logic is inlined directly in `electron/main.js` (the `player:launch` handler), not a separate `session.js`. Its IPC channels are unprefixed legacy names: `library:scan`, `library:get`, `metadata:get-all`, `metadata:fetch-series`, `history:get`, `history:update`, `player:launch`, `player:command`, etc. When a doc says `electron/tv/scanner.js` or `tv:player:launch`, mentally translate to "TV logic in `electron/scanner.js` / inlined in `main.js`."
- **Movies and Anime do match the subdirectory+session.js pattern**, but filenames inside are workflow-prefixed, not generic: `electron/movies/moviesScanner.js`, `moviesMetadata.js`, `moviesSession.js`; `electron/anime/animeScanner.js`, `animeMetadata.js`, `animeSession.js`. IPC channels are properly prefixed: `movies:scan`, `movies:launch`, `anime:scan`, `anime:launch`, etc. (full list in `electron/preload.js`).
- **TV's settings route is `/tv/settings`**, not `/settings` — `/settings` is the shared cross-workflow settings shell (`src/settings/SettingsPage.js`) that `ARCHITECTURE.md` describes as an "intersection point." Check `src/App.js` for the live route table rather than assuming a doc's route list is exact.
- **`toLocalUrl()` lives at `src/shared/utils/helpers.js`**, not `src/utils/helpers.js` as `docs/metadata-and-images.md` states.
- **`docs/app-data.md`'s directory listing predates the Movies/Anime split** — it only shows the flat TV-era layout (`library.json`, `metadata.json`, `history.json` at the data-dir root). In the current app those same three files are TV's; Movies and Anime each have their own `movies/` and `anime/` subdirectories with the same three filenames inside (see `docs/electron-architecture.md` §5, which does reflect this correctly).
- **Each workflow scanner has its own private `slugify()`** (`electron/scanner.js`, `electron/movies/moviesScanner.js`, `electron/anime/animeScanner.js`) rather than a shared one — consistent with the "duplication is correct" philosophy in `ARCHITECTURE.md` §1, just worth knowing so you edit all three if the slugification rule ever needs to change everywhere.

If you find a new discrepancy while working, prefer trusting a direct `Grep`/`Read` of the code over the docs, and consider updating this table.

### Overlay: two renderer routes, one shared backend

When Play is pressed, Electron launches VLC as a real external process and hides/positions it, then creates a **second, transparent, always-on-top, click-through-aware BrowserWindow** (`createOverlayWindow` in `electron/main.js`) that renders one of two React routes depending on workflow:

- `#/player-overlay` → `src/shared/components/Player/PlayerOverlay.js` — used by **both TV and Movies**.
- `#/anime-player-overlay` → `src/anime/components/Player/AnimePlayerOverlay.js` — anime's own, separate renderer, not shared with TV/Movies.

Both routes ultimately drive the same VLC session through the same shared Electron plumbing (`electron/player.js` for VLC launch/poll/command, `electron/windowSyncDaemon.js` for keeping VLC's native window pinned behind the overlay, `electron/overlayPreload.js` for the `window.overlayApi` bridge). A change to VLC command handling or window z-order behavior affects all three workflows even though anime's on-screen overlay UI is a separate component tree.

VLC is controlled entirely through its own HTTP interface (`--extraintf=http`), polled roughly every second for position/duration/state; there is no native video element in Chromium playing content directly.

### Data storage

Everything lives under `app.getPath('userData')/CineShelf/`: a shared `settings.json` (VLC path, TMDB key, per-workflow source dirs, AHK mouse-binding mappings, favorites/hallOfFame/highQuality tag lists), then per-workflow `library.json` / `metadata.json` / `history.json` plus `posters/` / `backdrops/` / `stills/` image caches. TV's files sit flat in that directory (`library.json`, `metadata.json`, `history.json`); Movies and Anime each get their own subdirectory (`movies/`, `anime/`). `electron/watchHistory.js` is a generic, path-parameterized JSON read/write utility shared by all three — it has no workflow-specific knowledge and is safe to extend.

### Mouse/keyboard bindings via AutoHotkey

`cineshelf-overlay.ahk` is an AutoHotkey v2 script, regenerated by `electron/main.js` (`generateAhkContent`) whenever mouse-binding settings change, and auto-launched/auto-installed to Windows Startup on app boot (`ensureAHKRunning`). It remaps mouse buttons (back/forward/middle/left-when-no-UI-visible) to keyboard events scoped to the "CineShelf Player" window title, because the overlay needs a way to receive input that VLC's own window can't intercept. `electron/player.js`'s `patchVLCInputConfig()` additionally strips VLC's own native mouse/keyboard bindings so VLC can never intercept these events itself — CineShelf's overlay is meant to be the sole authority for playback control.

### Windows-specific GPU workaround

`electron/main.js` sets `--disable-direct-composition`, `--use-angle=swiftshader`, and `--disable-gpu-sandbox` at startup specifically to avoid a GPU-process crash with NVIDIA drivers during transparent-window compositing. Do not remove these flags or call `app.disableHardwareAcceleration()` — see the comment block at the top of `main.js` for why.
