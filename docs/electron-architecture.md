# CineShelf — Electron Architecture

**Reference for:** How the Electron main process works, IPC channel design, the session.js contract, data paths, and safe modification rules for shared backend files.

---

## 1. One Process, Three Workflows

Electron runs a **single main process** (Node.js). There is no OS-level separation between the TV, Movies, and Anime workflows. The isolation is purely code organisation: different module files, different IPC channel name prefixes, different data file paths.

This is standard for any Electron app. Think of `main.js` as the Express router in a Node.js web server — it receives named IPC requests and delegates immediately to the right handler module. The handlers live in per-workflow subdirectories.

```
main.js (one Node.js process)
├── ipcMain.handle('tv:scan', ...)              → electron/tv/scanner.js
├── ipcMain.handle('tv:player:launch', ...)     → electron/tv/session.js
├── ipcMain.handle('movies:scan', ...)          → electron/movies/scanner.js
├── ipcMain.handle('movies:player:launch', ...) → electron/movies/session.js
├── ipcMain.handle('anime:scan', ...)           → electron/anime/scanner.js
├── ipcMain.handle('anime:player:launch', ...)  → electron/anime/session.js
└── shared handlers: window:*, app:*, shell:*, fs:*, player:command
```

All three workflows run in the same process and share the same memory. The discipline rule is: they must not call each other's modules — not because it's technically impossible, but because we explicitly forbid it to maintain isolation.

---

## 2. IPC Channel Map

### TV Workflow (`tv:` prefix)

| Channel                   | Handler module                        | Description                                |
| ------------------------- | ------------------------------------- | ------------------------------------------ |
| `tv:scan`                 | `electron/tv/scanner.js`              | Scan tvSourceDirs, build `tv/library.json` |
| `tv:get-library`          | read `tv/library.json`                | Return TV library to React                 |
| `tv:get-metadata`         | read `tv/metadata.json`               | Return all TV metadata                     |
| `tv:fetch-metadata`       | `electron/tv/metadata.js`             | Fetch TMDB /tv/, cache images              |
| `tv:get-history`          | `watchHistory.js` → `tv/history.json` | Return TV watch history                    |
| `tv:update-history`       | `watchHistory.js` → `tv/history.json` | Write a TV history entry                   |
| `tv:clear-series-history` | `watchHistory.js` → `tv/history.json` | Clear all entries for a series             |
| `tv:player:launch`        | `electron/tv/session.js`              | Assemble season playlist, launch VLC       |

### Movies Workflow (`movies:` prefix)

| Channel                 | Handler module                            | Description                                        |
| ----------------------- | ----------------------------------------- | -------------------------------------------------- |
| `movies:scan`           | `electron/movies/scanner.js`              | Scan moviesSourceDirs, build `movies/library.json` |
| `movies:get-library`    | read `movies/library.json`                | Return movies library to React                     |
| `movies:get-metadata`   | read `movies/metadata.json`               | Return all movies metadata                         |
| `movies:fetch-metadata` | `electron/movies/metadata.js`             | Fetch TMDB /movie/, cache images                   |
| `movies:get-history`    | `watchHistory.js` → `movies/history.json` | Return movie watch history                         |
| `movies:update-history` | `watchHistory.js` → `movies/history.json` | Write a movie history entry                        |
| `movies:player:launch`  | `electron/movies/session.js`              | Assemble movie playlist, launch VLC                |

### Anime Workflow (`anime:` prefix)

| Channel                      | Handler module                           | Description                                      |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `anime:scan`                 | `electron/anime/scanner.js`              | Scan animeSourceDirs, build `anime/library.json` |
| `anime:get-library`          | read `anime/library.json`                | Return anime library to React                    |
| `anime:get-metadata`         | read `anime/metadata.json`               | Return all anime metadata                        |
| `anime:fetch-metadata`       | `electron/anime/metadata.js`             | AniList GraphQL primary, Jikan fallback          |
| `anime:get-history`          | `watchHistory.js` → `anime/history.json` | Return anime watch history                       |
| `anime:update-history`       | `watchHistory.js` → `anime/history.json` | Write an anime history entry                     |
| `anime:clear-series-history` | `watchHistory.js` → `anime/history.json` | Clear all entries for an anime series            |
| `anime:player:launch`        | `electron/anime/session.js`              | Assemble season playlist, launch VLC             |

### Shared Channels (no workflow prefix)

| Channel                                                                   | Description                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| `app:get-settings`                                                        | Read `settings.json` (shared across all workflows) |
| `app:save-settings`                                                       | Write `settings.json`                              |
| `app:get-autostart` / `app:set-autostart`                                 | Windows autostart registry entry                   |
| `player:command`                                                          | Send a command to the currently active VLC session |
| `player:check`                                                            | Check if VLC is installed at the configured path   |
| `window:minimize` / `maximize` / `close` / `fullscreen` / `is-fullscreen` | Window controls                                    |
| `shell:open-path` / `show-in-folder`                                      | OS shell operations                                |
| `fs:list-dir` / `rename-item` / `get-data-dir`                            | File system tab operations                         |
| `data:get-info` / `data:patch-metadata-entry` / etc.                      | App data management                                |
| `overlay:command` / `overlay:passthrough` / `overlay:close` / etc.        | Overlay window IPC                                 |
| `dialog:open-dir`                                                         | Native folder picker                               |

---

## 3. The session.js Contract

`session.js` is the most important module in the player chain. It bridges "user clicked Play on this item" → VLC launch + overlay initialised with the right data.

### Required export

```js
// electron/[workflow]/session.js
module.exports = {
  launch(opts, settings, dataPaths, mainWindow, createOverlayWindow)
};
```

### What launch() must do

1. **Validate** — check VLC path exists, source data is loaded.
2. **Load library** — `JSON.parse(fs.readFileSync(dataPaths.library))`.
3. **Load history** — `watchHistory.getHistory(dataPaths.history)`.
4. **Determine seek position** — from history if autoResume is on and `position > 30`.
5. **Assemble playlist** — array of `{ filePath, episodeId, title, duration }` for all items in the current season/collection, starting from the selected item.
6. **Build overlayInitData**:
   ```js
   {
     allSeasons: [ { season: N, episodes: [ { episodeId, filePath, title, duration, overview, stillPath } ] } ],
     currentEpisodeId: string,
     seriesName: string,
     mode: 'tv' | 'movies' | 'anime',
     history: { [episodeId]: { position, duration, completed } },
     mouseBindings: settings.ahkMappings,
   }
   ```
7. **Call** `player.launchVLC(vlcPath, playlist, seekSeconds, port, password)`.
8. **Create overlay window** with `overlayInitData`.
9. **Attach** `windowSyncDaemon`.

### What launch() must NOT do

- Modify `player.js` behaviour.
- Access another workflow's library or history files.
- Write to `settings.json` (read-only for session modules).
- Inline business logic that belongs to `scanner.js` or `metadata.js`.

### Mode field in overlayInitData

The `mode` field tells the overlay React component how to render:

| mode       | Playlist panel                         | Progress / label semantics                        |
| ---------- | -------------------------------------- | ------------------------------------------------- |
| `'tv'`     | Season accordion + episode list        | S01E01 labels, episode progress                   |
| `'movies'` | Flat list (single entry or collection) | No episode labels, runtime/progress only          |
| `'anime'`  | Season accordion — same as TV          | May show absolute episode number alongside S01E01 |

---

## 4. How the Overlay Gets Its Data

Two paths: **push** (main → overlay on creation) and **pull** (overlay → main on demand, handles race conditions).

**Push path:**

```
session.js calls createOverlayWindow(initData)
  → main.js creates overlay BrowserWindow
  → caches initData as pendingInitData
  → once 'ready-to-show', fires 'overlay:init' IPC → overlay window
  → overlayPreload.js forwards to PlayerOverlay.js React component
  → PlayerOverlay sets its state
```

**Pull path (race-condition safety):**

```
PlayerOverlay.js on mount: calls overlayApi.getInit()
  → IPC → main.js returns pendingInitData
```

**Live state updates (position, duration, vlcState):**

```
player.js polling loop (every ~1s)
  → fires callback with { position, duration, state }
  → main.js sends 'overlay:state' IPC to overlay window
  → PlayerOverlay updates progress bar
```

This is why `overlayPreload.js` rarely changes — the protocol is stable. The only reason to change it is if an entirely new communication channel is needed between the overlay UI and main.

---

## 5. Data File Paths

`main.js` builds a `paths` object on startup and passes it to workflow modules:

```js
const DATA_DIR = path.join(app.getPath('userData'), 'CineShelf');

const paths = {
	settings: path.join(DATA_DIR, 'settings.json'),
	tv: {
		library: path.join(DATA_DIR, 'tv', 'library.json'),
		metadata: path.join(DATA_DIR, 'tv', 'metadata.json'),
		history: path.join(DATA_DIR, 'tv', 'history.json'),
		posters: path.join(DATA_DIR, 'tv', 'posters'),
		backdrops: path.join(DATA_DIR, 'tv', 'backdrops'),
		stills: path.join(DATA_DIR, 'tv', 'stills'),
	},
	movies: {
		library: path.join(DATA_DIR, 'movies', 'library.json'),
		metadata: path.join(DATA_DIR, 'movies', 'metadata.json'),
		history: path.join(DATA_DIR, 'movies', 'history.json'),
		posters: path.join(DATA_DIR, 'movies', 'posters'),
		backdrops: path.join(DATA_DIR, 'movies', 'backdrops'),
	},
	anime: {
		library: path.join(DATA_DIR, 'anime', 'library.json'),
		metadata: path.join(DATA_DIR, 'anime', 'metadata.json'),
		history: path.join(DATA_DIR, 'anime', 'history.json'),
		posters: path.join(DATA_DIR, 'anime', 'posters'),
		backdrops: path.join(DATA_DIR, 'anime', 'backdrops'),
		stills: path.join(DATA_DIR, 'anime', 'stills'),
	},
};
```

### v1 → v2 Data Migration

During the architecture reorganisation, existing TV data (previously stored flat in `userData/CineShelf/`) must be migrated to `userData/CineShelf/tv/`. `main.js` handles this as a one-time startup migration:

```js
function migrateV1Data() {
	const oldLibrary = path.join(DATA_DIR, 'library.json');
	const newLibrary = path.join(DATA_DIR, 'tv', 'library.json');
	if (fs.existsSync(oldLibrary) && !fs.existsSync(newLibrary)) {
		fs.mkdirSync(path.join(DATA_DIR, 'tv'), { recursive: true });
		fs.copyFileSync(oldLibrary, newLibrary);
		fs.renameSync(oldLibrary, oldLibrary + '.migrated');
		// repeat for metadata.json, history.json
		// repeat for posters/, backdrops/, stills/ directories
	}
}
```

This runs before any IPC handlers are registered. After migration, the `.migrated` suffix prevents it from running again.

---

## 6. Safe Modification Rules for Shared Backend Files

### `player.js`

- **Only modify to:** fix VLC launch flags, fix HTTP poll reliability, fix command encoding bugs, add a new `launchVLC()` parameter that `session.js` sets.
- **Never add:** playlist assembly, episode ID handling, overlay data building, workflow-specific branching.
- **Rule of thumb:** if VLC can handle the file path array and seek position, `player.js` has done its job.

### `windowSyncDaemon.js`

- **Only modify to:** tune `POLL_MS`, `MAX_RETRIES`, `FORCE_SYNC_MS` if Z-order sync regresses.
- The `start()` / `stop()` / `attach({ vlcPid })` / `detach()` API should be considered frozen.
- It has no workflow knowledge and should never acquire any.

### `watchHistory.js`

- **Safe to modify.** It is a thin JSON read/write utility.
- Adding new fields to history entries is backward compatible (JSON merge on read).
- Never add workflow-specific logic here — keep it a generic utility.

### `main.js`

- **Add:** new `ipcMain.handle()` registrations when workflows add new actions.
- **Handler bodies should be ≤5 lines** that delegate to workflow modules. If a handler grows beyond this, move the logic into the workflow module.
- Never inline playlist assembly, metadata fetching, or data file access directly in `main.js`.

### `preload.js`

- For every new `ipcMain.handle('channel:name', ...)` in `main.js`, add the matching `window.api.methodName = () => ipcRenderer.invoke('channel:name', ...)` bridge here.
- Bridges must be thin — no logic, field mapping, or validation. That belongs in the caller or the handler.

---

_For the full project structure, see `ARCHITECTURE.md`. For workflow build steps, see `docs/expansion-playbook.md`._
