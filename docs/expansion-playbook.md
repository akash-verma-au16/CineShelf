# CineShelf — Workflow Expansion Playbook

**Use this document when:** Starting to build out the Movies or Anime workflow from its current scaffold (placeholder UI, empty Electron stubs).

**Current scaffold state:** Nav link exists, route exists, React component returns a "Coming Soon" placeholder, Electron modules are empty stubs.

**Target state:** Fully functional workflow at feature parity with TV Shows.

---

## Overview: Build Order

Build each workflow in this exact sequence. Each phase produces something testable before the next begins. **Do not skip phases** — the React UI is useless without scanner data, and the player won't work without `session.js`.

```
Phase 1: Electron scanner    → source dirs → library.json populated, verifiable on disk
Phase 2: React context       → library loads into React state, basic count visible in UI
Phase 3: React Home screen   → cards render from library data (no metadata yet, placeholder posters)
Phase 4: Electron metadata   → metadata.json populated, poster/backdrop images downloaded
Phase 5: React Detail page   → full detail view with metadata, poster, overview, cast
Phase 6: Electron session.js → Play button launches VLC with the correct playlist
Phase 7: React watch history → progress bars, resume, mark watched
Phase 8: React Settings page → source dirs, API key, scan button, app data view
Phase 9: Custom home rows    → drag-and-drop shelf management, hero section
```

---

## Phase 1: Electron Scanner

**Goal:** Running a scan against the source directories produces a valid `library.json`.

**Files to create/edit:**

- `electron/[workflow]/scanner.js` — implement
- `electron/main.js` — register `[workflow]:scan` and `[workflow]:get-library` IPC handlers

### Movies scanner (`electron/movies/scanner.js`)

Movies have no season/episode directory structure. Each video file is a standalone movie.

The scanner must:

1. Walk each source directory recursively.
2. For each video file found, extract from the filename:
   - `title` — strip quality tags (`720p`, `1080p`, `BluRay`, `x264`, brackets, etc.) and year.
   - `year` — 4-digit year in parentheses or brackets, e.g. `Interstellar (2014)`.
3. Generate `id` = `safeId(title + '-' + year)` (lowercase, hyphens, no special chars).
4. Record: `filePath`, `fileSize`, `addedAt`.

Output `movies/library.json` shape:

```json
{
	"totalMovies": 42,
	"scannedAt": "2026-03-14T10:00:00Z",
	"movies": [
		{
			"id": "interstellar-2014",
			"title": "Interstellar",
			"year": 2014,
			"filePath": "E:/Movies/Interstellar (2014).mkv",
			"fileSize": 12884901888,
			"addedAt": "2026-03-14T10:00:00Z"
		}
	]
}
```

### Anime scanner (`electron/anime/scanner.js`)

Very similar to TV scanner (`electron/tv/scanner.js`). Key differences:

- **Absolute episode numbering:** if a folder contains files like `001.mkv`, `002.mkv` up to `150.mkv` with no `S01E` prefix → treat as Season 1, absolute episode = number.
- **OVA/Specials patterns** are more common in anime. These directory names should all map to Season 0: `OVA`, `OVAs`, `Specials`, `Special`, `Movies`, `Movie`, `Bonus`, `NCED`, `NCOP`.
- **Common anime filename patterns** to parse:
  - `[SubGroup] Show Name - 01 [720p][ABC123].mkv`
  - `Show.Name.E01.mkv`
  - `Show Name 01.mkv`
  - Standard `S01E01` patterns (same as TV scanner).

Output `anime/library.json` shape: **identical to TV's `library.json`** (array of series with seasons with episodes). This means the Anime React components are a near-copy of TV components with minimal adaptation.

### Testing Phase 1

1. Register the IPC handler in `main.js`.
2. Add a temporary "Scan" button to the placeholder Settings page that calls `window.api.[workflow]Scan()`.
3. Run the scan from the UI.
4. Manually inspect `userData/CineShelf/[workflow]/library.json` to verify the output.

---

## Phase 2: React Context

**Goal:** `library.json` data loads into React state; item count is readable from the UI.

**Files to create:**

- `src/[workflow]/context/[Workflow]Context.js`

### Steps

1. Copy `src/tv/context/TVContext.js` → `src/[workflow]/context/[Workflow]Context.js`.
2. Rename:
   - `AppProvider` → `[Workflow]Provider`
   - `useApp` → `use[Workflow]`
   - `allSeries` → `allMovies` (movies) or `allSeries` (anime — same term is fine)
3. Update all `window.api` calls to use `[workflow]:*` prefixed IPC channels.
4. Remove TV-specific actions that don't apply yet (e.g. `fetchAllMetadata` can stay as a stub).
5. Wrap the workflow's route in `<[Workflow]Provider>` in `src/App.js`.

### Verifying Phase 2

The context loads without errors and `allMovies.length` / `allSeries.length` returns the correct count.

---

## Phase 3: React Home Screen

**Goal:** Items render as cards in the home screen, even without metadata (placeholder poster).

**Files to create:**

- `src/[workflow]/components/Home/[Workflow]HomeScreen.js`
- `src/[workflow]/components/Home/[Workflow]Card.js`
- `src/[workflow]/components/Home/[Workflow]Row.js`

### Steps

1. Copy `TVHomeScreen.js` → `[Workflow]HomeScreen.js`. Adapt for the workflow's library shape.
2. Copy `TVSeriesCard.js` → `[Workflow]Card.js`. Adapt the card info panel.
3. Copy `TVSeriesRow.js` → `[Workflow]Row.js`. No changes needed — it's purely a scroll container.

### Movies-specific card adaptations

- Remove: season count, episode count.
- Add: year, runtime (once metadata available), genre tag.
- Progress: single progress bar (position/duration), no episode fraction.
- "Continue" label: just "Continue" with a progress bar — no episode label.

### Anime-specific card adaptations

- Nearly identical to TV.
- May show total episode count differently (e.g. "24 eps" vs "S1/S2" breakdown).
- Otherwise use the same card structure.

### Verifying Phase 3

The workflow home screen renders cards for all scanned items. Clicking a card doesn't crash yet (detail page is still a stub).

---

## Phase 4: Electron Metadata

**Goal:** Each item has a populated metadata entry in `[workflow]/metadata.json` with poster, backdrop, and overview.

**Files to create:**

- `electron/[workflow]/metadata.js`
- Register `[workflow]:fetch-metadata` and `[workflow]:get-metadata` in `main.js`

### Movies (`electron/movies/metadata.js`)

API calls:

1. `GET https://api.themoviedb.org/3/search/movie?query={title}&year={year}&api_key={key}` — find movie.
2. `GET https://api.themoviedb.org/3/movie/{tmdbId}?api_key={key}` — full details.
3. `GET https://api.themoviedb.org/3/movie/{tmdbId}/credits?api_key={key}` — cast.

Download:

- Poster → `movies/posters/{id}-poster.jpg`
- Backdrop → `movies/backdrops/{id}-backdrop.jpg`

Output metadata entry shape:

```json
{
	"id": "interstellar-2014",
	"tmdbId": 157336,
	"title": "Interstellar",
	"year": 2014,
	"overview": "...",
	"runtime": 169,
	"genres": ["Science Fiction", "Adventure"],
	"rating": "8.6",
	"cast": ["Matthew McConaughey", "Anne Hathaway"],
	"posterPath": "C:/Users/.../CineShelf/movies/posters/interstellar-2014-poster.jpg",
	"backdropPath": "C:/Users/.../CineShelf/movies/backdrops/interstellar-2014-backdrop.jpg"
}
```

### Anime (`electron/anime/metadata.js`)

**Primary: AniList GraphQL** (`https://graphql.anilist.co`) — no API key required.

```graphql
query ($search: String) {
	Media(search: $search, type: ANIME) {
		id
		title {
			romaji
			english
		}
		description
		episodes
		status
		coverImage {
			large
		}
		bannerImage
		genres
		averageScore
		studios {
			nodes {
				name
			}
		}
		startDate {
			year
		}
	}
}
```

**Fallback: Jikan v4** (`https://api.jikan.moe/v4/anime?q={title}`) — no API key required.

**Tertiary: TMDB /tv/** — use the existing TV metadata module's API key logic if AniList/Jikan miss a title.

Download:

- `coverImage.large` → `anime/posters/{id}-poster.jpg`
- `bannerImage` → `anime/backdrops/{id}-backdrop.jpg`
- Episode stills → `anime/stills/{id}-s{season}e{episode}.jpg` (if available from TMDB fallback)

### Verifying Phase 4

After running a metadata fetch from Settings, posters appear on cards and the detail page renders the backdrop hero.

---

## Phase 5: Electron session.js (Launch Player)

**Goal:** The Play button launches VLC with the correct playlist and the overlay initialises correctly.

**Files to create:**

- `electron/[workflow]/session.js`
- Register `[workflow]:player:launch` in `main.js`
- Add `window.api.[workflow]LaunchPlayer()` in `preload.js`

### Movies session (`electron/movies/session.js`)

```js
const player = require('../player');
const watchHistory = require('../watchHistory');
const windowSyncDaemon = require('../windowSyncDaemon');
const fs = require('fs');

async function launch(opts, settings, paths, mainWindow, createOverlayWindow) {
	const library = JSON.parse(fs.readFileSync(paths.movies.library));
	const movie = library.movies.find((m) => m.id === opts.movieId);
	if (!movie) return { success: false, error: 'Movie not found in library' };

	const history = watchHistory.getHistory(paths.movies.history);
	const hist = history[movie.id] || {};
	const seekSeconds =
		settings.autoResume !== false &&
		!hist.completed &&
		(hist.position || 0) > 30
			? hist.position
			: 0;

	const vlcPath = player.getVLCPath(settings.vlcPath);
	if (!vlcPath)
		return {
			success: false,
			error: 'VLC not found. Set VLC path in Settings.',
		};

	const playlist = [
		{
			filePath: movie.filePath,
			episodeId: movie.id,
			title: movie.title,
			duration: (movie.runtime || 0) * 60,
		},
	];

	const overlayInitData = {
		allSeasons: [
			{
				season: 1,
				episodes: [
					{ episodeId: movie.id, filePath: movie.filePath, title: movie.title },
				],
			},
		],
		currentEpisodeId: movie.id,
		seriesName: movie.title,
		mode: 'movies',
		history: { [movie.id]: hist },
		mouseBindings: settings.ahkMappings || {},
	};

	const result = await player.launchVLC(
		vlcPath,
		playlist,
		seekSeconds,
		settings.vlcHttpPort,
		settings.vlcHttpPassword,
	);
	if (!result.success) return result;

	createOverlayWindow(overlayInitData);
	windowSyncDaemon.attach({ vlcPid: result.pid });
	return { success: true };
}

module.exports = { launch };
```

### Future: Movie Collection Playlist

When a collection feature is added (e.g. all Mission Impossible films as a playlist), `movies/session.js` builds the playlist from all movies in the collection sorted by release year. The overlay receives them as a flat list with `mode: 'movies'`. Zero changes to `player.js` or the overlay infrastructure.

### TV session (`electron/tv/session.js`)

Wraps the existing TV launch logic from `main.js` into this module. The logic is already written — it just needs extracting and refactoring into the `launch(opts, settings, paths)` signature.

### Anime session (`electron/anime/session.js`)

Identical structure to TV session. Playlist = all episodes in the current season. No differences.

### Verifying Phase 5

Clicking Play on a movie/anime item launches VLC with the correct file. The overlay appears with the correct title and controls.

---

## Phase 6: React Watch History & Progress

**Goal:** Progress bars appear on cards and detail pages. Resume works. Mark watched/unwatched works.

**Files to edit:**

- `src/[workflow]/context/[Workflow]Context.js` — add history state, `launchItem`, `markWatched`, `clearHistory` actions
- Register `[workflow]:update-history`, `[workflow]:clear-history` in `main.js`

### Notes

- For Movies: history key = `movie.id`. Progress = `position / duration`. Completed = `position / duration > 0.9`.
- For Anime: identical to TV — history key = `episode.id`. Completed = same threshold.
- The `onPlayerPositionUpdate` live event listener works identically — it just dispatches to the workflow's history state.

---

## Phase 7: React Settings Page

**Goal:** User can configure source directories, API key, run a scan, and view/manage app data.

**Files to create:**

- `src/[workflow]/components/Settings/[Workflow]SettingsPage.js`
- `src/[workflow]/components/Settings/tabs/[Workflow]GeneralTab.js`
- `src/[workflow]/components/Settings/tabs/[Workflow]AppDataTab.js`
- `src/[workflow]/components/Settings/tabs/[Workflow]FileSystemTab.js`
- `src/[workflow]/components/Settings/tabs/[Workflow]MouseBindingsTab.js`

### Steps

1. Copy all four tabs from `src/tv/components/Settings/tabs/`.
2. Rename components, update context import.
3. `GeneralTab`: update the "Source Directories" label and the settings key:
   - TV uses `settings.tvSourceDirs` (or `settings.sourceDirs` for backward compat)
   - Movies uses `settings.moviesSourceDirs`
   - Anime uses `settings.animeSourceDirs`
4. `AppDataTab`: update stats labels to match the workflow (movies count, anime count, etc.).
5. `FileSystemTab`: no logic changes — uses `sourceDirs` prop generically.
6. `MouseBindingsTab`: no changes — mouse bindings are shared and workflow-agnostic.

---

## Phase 8: Custom Home Rows

**Goal:** Fully functional drag-and-drop shelf on the home screen.

**Files to create:**

- `src/[workflow]/components/Home/[Workflow]CustomRowsSection.js`

### Steps

1. Copy `src/tv/components/Home/TVCustomRowsSection.js` → `[Workflow]CustomRowsSection.js`.
2. Update context import.
3. Add `customRows` state to `[Workflow]Context.js` (loaded from `settings.[workflow]CustomRows`).
4. The drag-and-drop logic, row CRUD, and card rendering are identical — no logic changes needed.

### Settings key per workflow

- `settings.tvCustomRows`
- `settings.moviesCustomRows`
- `settings.animeCustomRows`

These are stored in the shared `settings.json` but under separate keys so they never collide.

---

## Feature Parity Checklist

For a workflow to be marked ✅ COMPLETE, all of these must work end-to-end:

- [ ] Source directory configuration in Settings
- [ ] Scan populates library, item count displays correctly
- [ ] Metadata fetch populates posters, backdrops, overviews
- [ ] Home screen: cards with posters render correctly
- [ ] Home screen: recently watched row
- [ ] Home screen: hero section (backdrop carousel)
- [ ] Home screen: custom rows (drag-and-drop shelf)
- [ ] Cards: hover expand, progress bar, favourite toggle
- [ ] Detail page: backdrop hero, overview, cast, rating, genres
- [ ] Play button launches VLC with the correct file/playlist
- [ ] Overlay appears with correct title and episode info
- [ ] Overlay controls: play/pause, seek bar, volume, next/prev
- [ ] Overlay playlist shows correct items
- [ ] Resume from last position works (autoResume setting respected)
- [ ] Watch history records position and marks completed at ~90%
- [ ] Mark watched / unmark watched manual controls
- [ ] Clear history works
- [ ] Favourites persist across sessions
- [ ] File System tab browses source directories
- [ ] App Data tab shows correct stats and file sizes
- [ ] Settings save and persist correctly

---

_See `docs/electron-architecture.md` for Electron module details. See `ARCHITECTURE.md` for the master project structure._
