# CineShelf — Architecture & Development Philosophy

**Last updated:** 2026-03-14  
**Version of record:** v2.0.0 (TV workflow complete, Movies & Anime scaffolded)

---

## 1. The Cardinal Rule: Three Independent Workflows

CineShelf houses **three fully separate content workflows**:

| Workflow     | Nav Label | Route prefix               | Content type                            |
| ------------ | --------- | -------------------------- | --------------------------------------- |
| **TV Shows** | TV Shows  | `/` and `/series/:id`      | Multi-season episodic series            |
| **Movies**   | Movies    | `/movies` and `/movie/:id` | Single-file feature films               |
| **Anime**    | Anime     | `/anime` and `/anime/:id`  | Episodic anime (AniList/Jikan metadata) |

**These three workflows are intentionally isolated from each other.** They share a visual design language and operational methodology, but they do not share code except at the three explicitly defined intersection points (see §4). Duplication is correct. Cross-importing between workflow directories is forbidden.

> **Why?** TV Shows reached a perfection point first. Movies and Anime have enough nuances (single-file movies have no episode structure; anime has different metadata APIs; TMDB coverage for anime is poor) that mixing them would mean every improvement to one risks breaking the others. Isolation gives the freedom to evolve each workflow independently at full speed.

---

## 2. Directory Structure

```
c:\CineShelf\
├── ARCHITECTURE.md        ← this file — read before making any change
├── package.json
├── electron/              ← Electron main process (see §6)
│   ├── main.js            ← IPC router ONLY — no workflow logic lives here
│   ├── player.js          ← VLC infra: launch, poll, command (shared, dumb executor)
│   ├── windowSyncDaemon.js← VLC/overlay Z-order sync daemon (shared infra)
│   ├── preload.js         ← main window API bridge (shared)
│   ├── overlayPreload.js  ← overlay window API bridge (shared)
│   ├── watchHistory.js    ← generic history r/w, path-parameterised (shared)
│   ├── tv/
│   │   ├── scanner.js     ← TV directory tree scanning (multi-season/episode)
│   │   ├── metadata.js    ← TMDB /tv/ API + image download
│   │   └── session.js     ← TV playlist assembly + overlay init data builder
│   ├── movies/
│   │   ├── scanner.js     ← flat file scanning, no episode/season parsing
│   │   ├── metadata.js    ← TMDB /movie/ API + image download
│   │   └── session.js     ← Movies playlist assembly + overlay init data builder
│   └── anime/
│       ├── scanner.js     ← anime-aware scanning (OVA, absolute episode numbers)
│       ├── metadata.js    ← AniList GraphQL primary, Jikan/MAL fallback
│       └── session.js     ← Anime playlist assembly + overlay init data builder
└── src/
    ├── App.js             ← shared router shell (routes only, no workflow logic)
    ├── index.js
    ├── index.css
    ├── shared/            ← INTERSECTION ZONE — allowed to be imported by any workflow
    │   ├── components/
    │   │   ├── UI/        ← pure UI primitives (no workflow state)
    │   │   │   ├── LoadingSpinner.js
    │   │   │   ├── Modal.js
    │   │   │   ├── ProgressBar.js
    │   │   │   └── Toast.js
    │   │   ├── Player/    ← VLC overlay UI (workflow-agnostic)
    │   │   │   ├── PlayerOverlay.js
    │   │   │   ├── OverlayControls.js
    │   │   │   ├── OverlayPlaylist.js
    │   │   │   └── OverlayTitleBar.js
    │   │   └── Navbar.js  ← top nav (TV Shows | Movies | Anime | Browse)
    │   └── utils/
    │       ├── helpers.js
    │       └── overlayActions.js
    ├── tv/                ← TV WORKFLOW (complete — do not modify casually)
    │   ├── context/
    │   │   └── TVContext.js
    │   └── components/
    │       ├── Home/
    │       │   ├── TVHomeScreen.js
    │       │   ├── TVHeroSection.js
    │       │   ├── TVSeriesRow.js
    │       │   ├── TVSeriesCard.js
    │       │   └── TVCustomRowsSection.js
    │       ├── Detail/
    │       │   ├── TVSeriesDetail.js
    │       │   ├── TVEpisodeList.js
    │       │   └── TVEpisodeCard.js
    │       └── Settings/
    │           ├── TVSettingsPage.js
    │           └── tabs/
    │               ├── TVGeneralTab.js
    │               ├── TVAppDataTab.js
    │               ├── TVFileSystemTab.js
    │               └── TVMouseBindingsTab.js
    ├── movies/            ← MOVIES WORKFLOW
    │   ├── context/
    │   │   └── MoviesContext.js
    │   └── components/
    │       ├── Home/
    │       │   ├── MoviesHomeScreen.js
    │       │   ├── MoviesHeroSection.js
    │       │   ├── MoviesRow.js
    │       │   ├── MoviesCard.js
    │       │   └── MoviesCustomRowsSection.js
    │       ├── Detail/
    │       │   └── MovieDetail.js     ← single-file, NO episode list
    │       └── Settings/
    │           ├── MoviesSettingsPage.js
    │           └── tabs/
    │               ├── MoviesGeneralTab.js
    │               ├── MoviesAppDataTab.js
    │               └── MoviesFileSystemTab.js
    ├── anime/             ← ANIME WORKFLOW
    │   ├── context/
    │   │   └── AnimeContext.js
    │   └── components/
    │       ├── Home/
    │       │   ├── AnimeHomeScreen.js
    │       │   ├── AnimeHeroSection.js
    │       │   ├── AnimeRow.js
    │       │   ├── AnimeCard.js
    │       │   └── AnimeCustomRowsSection.js
    │       ├── Detail/
    │       │   ├── AnimeSeriesDetail.js
    │       │   ├── AnimeEpisodeList.js
    │       │   └── AnimeEpisodeCard.js
    │       └── Settings/
    │           ├── AnimeSettingsPage.js
    │           └── tabs/
    │               ├── AnimeGeneralTab.js
    │               ├── AnimeAppDataTab.js
    │               └── AnimeFileSystemTab.js
    ├── browse/            ← SHARED BROWSE (intersection point)
    │   └── BrowsePage.js  ← tabbed: TV Shows | Movies | Anime
    └── settings/          ← SHARED SETTINGS SHELL (intersection point)
        └── SettingsPage.js← category bar (TV | Movies | Anime) + delegates to workflow settings
```

---

## 3. The Three Intersection Points

These are the **only** places where the three workflows meet. They must stay thin — they are routers and shells, not logic owners.

### 3.1 App.js — Route Shell

- Declares all routes.
- Wraps each workflow's home/detail component in its own Context Provider.
- Has zero workflow-specific logic itself.
- The `PlayerOverlay` route is shared but the overlay is workflow-agnostic (it only talks to VLC).

### 3.2 `src/settings/SettingsPage.js` — Settings Shell

- Renders a three-tab category bar at the top: **TV Shows | Movies | Anime**.
- Each category tab renders the _full_ settings page of that workflow (`TVSettingsPage`, `MoviesSettingsPage`, `AnimeSettingsPage`).
- Has no settings logic of its own — it is purely a selector.

### 3.3 `src/browse/BrowsePage.js` — Browse/Search Shell

- Renders a three-tab bar: **TV Shows | Movies | Anime**.
- Each tab renders the search/filter page of that workflow, consuming only that workflow's context.
- Acts as a visual container, nothing more.

---

## 4. The Isolation Rule

> **A file inside `src/tv/` must never import from `src/movies/` or `src/anime/`, and vice versa.**
> **All three workflow directories may import from `src/shared/`. That is the only permitted cross-directory import.**

Enforcement checklist before every commit touching workflow code:

- [ ] All new imports in `src/tv/` resolve within `src/tv/` or `src/shared/`.
- [ ] All new imports in `src/movies/` resolve within `src/movies/` or `src/shared/`.
- [ ] All new imports in `src/anime/` resolve within `src/anime/` or `src/shared/`.
- [ ] `src/shared/` components have zero imports from any workflow directory.
- [ ] `src/App.js`, `src/browse/`, and `src/settings/` are the only files that import from multiple workflow directories simultaneously.

### Cross-Workflow Impact Rule — MANDATORY

> **If any change has potential blast radius beyond the workflow currently being worked on, it must be flagged and confirmed before being made. No exceptions.**

This is triggered when:

- A shared file needs to be modified (`src/shared/`, `electron/player.js`, `electron/windowSyncDaemon.js`, `electron/watchHistory.js`, `electron/main.js`, `electron/preload.js`, `electron/overlayPreload.js`, `src/App.js`, `src/settings/SettingsPage.js`, `src/browse/BrowsePage.js`).
- A change in one workflow's files requires a corresponding change in another workflow's files.
- A new IPC channel, data field, or settings key could conflict with or shadow an existing one in another workflow.
- A behaviour change in Electron infrastructure (`player.js`, `windowSyncDaemon.js`) could alter how currently-working workflows behave.

Required response when triggered:

1. Stop. Do not make the change.
2. Name the file and describe what needs to change and why.
3. List every workflow that would be affected.
4. Propose the safest implementation path (e.g. new parameter with default, duplication instead of modification).
5. Wait for explicit user confirmation.

Preferred alternatives to modifying shared files:

- **Duplicate** the file into the specific workflow's directory if only that workflow needs different behaviour.
- **Add a new parameter with a safe default** so existing callers are unaffected.
- **Add a new IPC channel** rather than altering an existing handler's behaviour.
- **Use the `mode` field** in overlay init data to branch UI without touching shared infrastructure.

---

## 5. Data Storage (Electron userData)

Each workflow gets its own data silo under `userData/CineShelf/`:

```
userData/CineShelf/
├── settings.json        ← shared: VLC path, API keys, window prefs, autostart
├── tv/
│   ├── library.json
│   ├── metadata.json
│   └── history.json
├── movies/
│   ├── library.json
│   ├── metadata.json
│   └── history.json
└── anime/
    ├── library.json
    ├── metadata.json
    └── history.json
```

Source directories are stored **per-workflow** inside `settings.json`:

```json
{
  "tvSourceDirs": ["E:\\TV Shows\\", "G:\\Series\\"],
  "moviesSourceDirs": ["E:\\Movies\\"],
  "animeSourceDirs": ["E:\\Anime\\"],
  "tmdbApiKey": "...",
  "vlcPath": "...",
  ...
}
```

---

## 6. Electron Backend Architecture

### Shared infrastructure (never workflow-specific)

| File                  | Role                                                                                                                                                  | Modification rule                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `main.js`             | IPC router. Registers every `ipcMain.handle()` channel. Delegates to workflow modules. Has zero playlist/library logic.                               | Add new IPC registrations here. Never add business logic.                |
| `player.js`           | VLC executor. Launches VLC, polls HTTP status, sends commands. Receives file paths and numbers only — has no concept of series, seasons, or episodes. | Only modify to fix VLC compatibility. Never add workflow-specific logic. |
| `windowSyncDaemon.js` | Z-order daemon. Forces VLC to stay below the overlay by periodically calling Windows native APIs. Knows nothing about content.                        | Only modify if Z-order sync behaviour needs tuning.                      |
| `watchHistory.js`     | Generic JSON r/w. Takes a file path as argument. All three workflows use it with their own separate history file.                                     | Safe to modify — no workflow knowledge.                                  |
| `preload.js`          | Exposes `window.api` IPC bridge to the React main window.                                                                                             | Add bridges when new IPC channels are added in `main.js`.                |
| `overlayPreload.js`   | Exposes `window.overlayApi` to the overlay window.                                                                                                    | Rarely changes — only if overlay communication protocol changes.         |

### Per-workflow modules (fully isolated)

Each workflow has three modules inside its own subdirectory — `electron/tv/`, `electron/movies/`, `electron/anime/`:

- **`scanner.js`** — Walks the source directories and builds `library.json` for that workflow. Each scanner understands its own file/directory conventions and produces its own library shape.
- **`metadata.js`** — Fetches and caches metadata for that workflow from the appropriate API. Downloads images. Writes `metadata.json`.
- **`session.js`** — **The critical module.** When a user clicks Play, `main.js` calls this. It reads the workflow's library and history, assembles the VLC playlist (array of file paths), builds the overlay init object (`allSeasons` / `currentEpisodeId` / `seriesName` / `mode` payload), calls `player.launchVLC()`, creates the overlay window, and attaches `windowSyncDaemon`. All workflow-specific play logic lives here.

### How main.js delegates

```js
// main.js — all player launch handlers follow this pattern
const tvSession = require('./tv/session');
const movSession = require('./movies/session');
const anSession = require('./anime/session');

ipcMain.handle('tv:player:launch', (e, opts) =>
	tvSession.launch(opts, settings, paths),
);
ipcMain.handle('movies:player:launch', (e, opts) =>
	movSession.launch(opts, settings, paths),
);
ipcMain.handle('anime:player:launch', (e, opts) =>
	anSession.launch(opts, settings, paths),
);
```

`player.js` and `windowSyncDaemon.js` are called from inside `session.js`, not from `main.js` directly.

### The session.js contract

Every `session.js` must export a `launch(opts, settings, dataPaths)` function that:

1. Reads `dataPaths.library` to get the content structure.
2. Reads `dataPaths.history` to get resume positions.
3. Assembles `playlist`: `[{ filePath, episodeId, title, duration }]`
4. Assembles `overlayInitData`: `{ allSeasons, currentEpisodeId, seriesName, mode, history, mouseBindings }`
5. Calls `player.launchVLC(vlcPath, playlist, seekSeconds, port, password)`.
6. Creates the overlay window with `overlayInitData`.
7. Attaches `windowSyncDaemon`.

The `mode` field in `overlayInitData` is one of `'tv'` | `'movies'` | `'anime'`. The overlay uses this to adjust its UI.

---

## 7. Workflow-Specific Nuances

### TV Shows

- Multi-season, multi-episode directory structure.
- TMDB `/tv/` API for metadata, TVMaze as fallback.
- Episode stills cached locally.
- Watch history keyed by episode ID.
- Series progress = watched episodes / total episodes.

### Movies

- Single video file per movie — **no seasons, no episode lists**.
- TMDB `/movie/` API for metadata (poster, backdrop, overview, cast, runtime, genres).
- Watch history keyed by movie ID (treated like a single "episode").
- Progress = position/duration (resume support identical to TV).
- Detail page shows: poster, backdrop, overview, cast, runtime, genres, year — no episode list.
- Custom rows (Home shelf) work identically to TV.

### Anime

- Multi-season/episode structure like TV, but:
  - OVA / Specials handling is more prominent.
  - Episode numbering may be absolute (e.g. ep 1–150 continuous) rather than per-season.
  - AniList GraphQL is the primary metadata source.
  - Jikan (MyAnimeList API) is the secondary source.
  - TMDB `/tv/` is a tertiary fallback.
- Watch history identical to TV (per-episode).
- May eventually support AniList sync (not planned for v1 of this workflow).

---

## 8. Player (VLC Overlay)

The VLC overlay (`electron/player.js`, `src/shared/components/Player/`) is **workflow-agnostic at the infrastructure level**. The workflow-specific part is the _session assembly_ that precedes the player launch, handled entirely in each workflow's `electron/[workflow]/session.js`.

### What the overlay receives (overlayInitData shape)

```js
{
  allSeasons: [
    {
      season: 1,
      episodes: [
        { episodeId, filePath, title, duration, overview, stillPath }
      ]
    }
  ],
  currentEpisodeId: 'some-id',
  seriesName: 'Show or Movie Name',
  mode: 'tv' | 'movies' | 'anime',  // ← tells overlay how to render its UI
  history: { [episodeId]: { position, duration, completed } },
  mouseBindings: { ... }
}
```

### Mode-specific overlay behaviour

| mode     | Playlist panel                                       | Progress semantics                         |
| -------- | ---------------------------------------------------- | ------------------------------------------ |
| `tv`     | Season accordion + episode list                      | Episodes, S01E01 labels                    |
| `movies` | Flat list (one entry standalone, or collection list) | Runtime/progress only, no episode labels   |
| `anime`  | Season accordion — same as TV                        | Episodes, may show absolute episode number |

### For Movies with no episode structure

`movies/session.js` wraps the movie as a single-episode, single-season structure:

```js
allSeasons: [
	{
		season: 1,
		episodes: [
			{ episodeId: movie.id, filePath: movie.filePath, title: movie.title },
		],
	},
];
seriesName: movie.title;
mode: 'movies';
```

If a Movie Collection feature is added later (e.g. all Mission Impossible films on one playlist), `movies/session.js` populates the episodes array with all films in the collection sorted by release year. The overlay shows them as a flat list with no season accordion. This is a `movies/session.js`-only change — `player.js` and the overlay infra are untouched.

---

## 9. Navbar

Four links + settings gear:

```
CINESHELF  |  TV Shows  |  Movies  |  Anime  |  Browse        [scan]  [settings]
```

- **TV Shows** → `/`
- **Movies** → `/movies`
- **Anime** → `/anime`
- **Browse** → `/browse`
- Settings gear → `/settings`

Active link is highlighted. The scan button triggers the scan for the _currently active workflow_.

---

## 10. Development Conventions

- **Prefix all workflow-specific component names** with the workflow: `TV`, `Movies`, `Anime`. This makes it immediately obvious which workflow a file belongs to when reading import statements.
- **Never** add a feature to a workflow component "just because the other workflow will need it too." Build it once for the target workflow. Duplicate separately when the other workflow gets to that stage.
- **Commit TV code as locked.** TV workflow is feature-complete. Changes to `src/tv/` should be rare, deliberate, and clearly scoped. Do not accidentally improve TV while working on Movies.
- **Electron IPC channel naming convention:**
  - `tv:scan`, `tv:get-library`, `tv:get-metadata`, `tv:fetch-metadata`, `tv:get-history`, …
  - `movies:scan`, `movies:get-library`, `movies:get-metadata`, `movies:fetch-metadata`, `movies:get-history`, …
  - `anime:scan`, `anime:get-library`, `anime:get-metadata`, `anime:fetch-metadata`, `anime:get-history`, …
  - `tv:player:launch`, `movies:player:launch`, `anime:player:launch`
  - Shared: `app:get-settings`, `app:save-settings`, `player:command`, `player:check`, `window:*`, `shell:*`, `fs:*`, `overlay:*`, `dialog:*`

---

## 11. What "Complete" Means Per Workflow

### TV Shows — ✅ COMPLETE

All features working: scan, TMDB metadata, VLC player, overlay controls, episode tracking, watch history, custom home rows, favourites, hall of fame, file system browser, autostart.

### Movies — 🚧 SCAFFOLDED (next to build)

Target parity with TV: scan, TMDB metadata, VLC player, single-file watch tracking, custom home rows, favourites.

### Anime — 🚧 SCAFFOLDED (after Movies)

Target parity with TV: scan, AniList/Jikan metadata, VLC player, episode tracking, watch history, custom home rows.

---

## 12. Shared File Modification Rules

Before modifying any file in `electron/` (non-workflow subdirs) or `src/shared/`, apply the relevant rule.

| File                              | Modification rule                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/player.js`              | **Infrastructure only.** Fix VLC launch/poll/command bugs only. If a workflow needs custom launch behaviour, do it in that workflow's `session.js` — pass a new parameter to `launchVLC()` if needed. Never add workflow-specific branching here. |
| `electron/windowSyncDaemon.js`    | **Infrastructure only.** Tune timing constants if Z-order sync regresses. The `start/stop/attach/detach` API surface should never need to change.                                                                                                 |
| `electron/watchHistory.js`        | **Safe to modify.** Purely a JSON read/write utility. No workflow knowledge.                                                                                                                                                                      |
| `electron/main.js`                | **Router only.** Add new `ipcMain.handle()` registrations when workflows add new actions. Handler bodies should be 1–3 lines delegating to workflow modules. If a handler grows beyond ~5 lines, move the logic into the workflow module.         |
| `electron/preload.js`             | Add a matching `ipcRenderer.invoke()` bridge for every new `ipcMain.handle()` in `main.js`. Keep bridges thin — no logic.                                                                                                                         |
| `src/shared/components/Player/`   | May conditionally render based on the `mode` prop. Must never import from any workflow directory. If `mode` branching grows beyond 3 conditions per component, split into per-workflow overlay files.                                             |
| `src/shared/components/UI/`       | Pure UI primitives. Zero workflow imports. Safe to modify.                                                                                                                                                                                        |
| `src/shared/utils/helpers.js`     | Pure format utilities. Zero workflow imports. Safe to modify.                                                                                                                                                                                     |
| `src/shared/components/Navbar.js` | Add nav links for new workflows here. No workflow logic in the navbar itself.                                                                                                                                                                     |

---

## 13. Reference Documents

| Document                        | Purpose                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ARCHITECTURE.md` (this file)   | Master architecture reference. Source of truth for all structure and rules.                                             |
| `docs/electron-architecture.md` | Deep dive: Electron module responsibilities, IPC channel map, session.js contract, data paths, safe modification rules. |
| `docs/expansion-playbook.md`    | Step-by-step guide for building out Movies or Anime from scaffold to feature-complete.                                  |
| `docs/app-data.md`              | Data file formats for TV (library, metadata, history JSON shapes).                                                      |
| `docs/stable-workflow.md`       | TV workflow feature documentation — what is built and stable.                                                           |
| `docs/watch-history.md`         | Watch history data format and lifecycle.                                                                                |
| `docs/metadata-and-images.md`   | Metadata fetch flow and image caching.                                                                                  |

---

_This document is the source of truth for CineShelf's architecture. Update it whenever a new structural decision is made. It takes precedence over any inline comment or README._
