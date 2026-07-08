# CineShelf — Watch History & Progress Tracking (v2.0.0)

## Overview

Watch history tracks per-episode playback position, completion status, and a per-series completion counter. All data lives in `history.json` (see [app-data.md](./app-data.md)).

## Key Schema

`history.json` is a flat object. There are two types of entries:

### Episode entry

Keyed by **episode ID** (e.g. `breaking-bad-s01e01`):

```json
"breaking-bad-s01e01": {
  "key": "breaking-bad-s01e01",
  "seriesId": "breaking-bad",
  "season": 1,
  "episode": 1,
  "filePath": "E:\\Breaking Bad\\Season 1\\Breaking.Bad.S01E01.mkv",
  "position": 3480,
  "duration": 3600,
  "completed": true,
  "lastWatched": "2026-03-13T10:00:00.000Z"
}
```

| Field                | Type         | Purpose                                                  |
| -------------------- | ------------ | -------------------------------------------------------- |
| `key`                | `string`     | Same as the object key — episode ID                      |
| `seriesId`           | `string`     | Parent series ID (used for bulk clear)                   |
| `season` / `episode` | `number`     | Season and episode numbers                               |
| `filePath`           | `string`     | Absolute path to the video file at time of last watch    |
| `position`           | `number`     | Last known playback position **in seconds**              |
| `duration`           | `number`     | Total episode duration **in seconds**                    |
| `completed`          | `boolean`    | `true` when `position / duration >= 0.9` (90% threshold) |
| `lastWatched`        | `ISO string` | Timestamp of last playback event                         |

### Series completion entry

Keyed by `series:{seriesId}` (e.g. `series:breaking-bad`):

```json
"series:breaking-bad": {
  "key": "series:breaking-bad",
  "seriesId": "breaking-bad",
  "completionCount": 2,
  "lastCompletedAt": "2026-03-13T10:00:00.000Z"
}
```

This is created/incremented each time all episodes of a series are marked complete. It tracks how many times you've finished the show.

---

## How Position Is Tracked

### With VLC (external player — default)

VLC exposes a built-in HTTP interface that CineShelf polls every ~1 second for real-time playback state:

1. VLC launches with `--extraintf=http --http-port=PORT --http-password=PASSWORD --start-time=N`
2. A polling loop starts 1.5 s after launch (giving VLC time to start its HTTP server)
3. Each poll reads `http://127.0.0.1:PORT/requests/status.json` → `{ time, length, state, information }`
4. The renderer receives `player:position-update` every second — progress bars update live
5. Every 10 s, the current position is written to `history.json` as a mid-session save
6. When VLC closes, one final authoritative save is written, then `player:closed` fires

VLC reports actual video duration in the `length` field, so the 90% completion threshold works accurately without any TMDB runtime hint (though the hint is still used as a fallback if VLC hasn't reported duration yet).

### Episode-change detection (playlist)

When VLC advances to the next episode in its playlist, the `filename` field in status.json changes. CineShelf detects this and saves completion of the previous episode before starting to track the new one.

---

## Completion Logic

An episode is considered **complete** when:

```
duration > 0  AND  position / duration >= 0.9
```

The 90% threshold allows for credit-skipping — you don't need to watch the very end.

### Auto-completion flow (VLC)

1. VLC closes (or advances to next episode)
2. Final position is read from last poll; duration comes from VLC's `length` field
3. `completed = duration > 0 && position / duration >= 0.9`
4. History entry is written directly to `history.json` in the main process
5. `player:closed` IPC event fires → `AppContext` updates in-memory state and checks series completion

### Manual mark watched/unwatched

Via the episode card context menu or detail page — calls `markWatched(episode, true/false)` in `AppContext`, which sets `completed` directly and writes to `history.json`.

---

## Resume Logic

When opening an episode, `launchEpisode()` in `AppContext` checks:

```
if (autoResume is ON)
  and (history entry exists)
  and (NOT completed)
  and (position > 30 seconds)
→ resume from saved position
```

The 30-second guard prevents resuming from the very beginning of a failed or accidental play.

`autoResume` is a setting in `settings.json` (default: `true`).

---

## Series Completion Counter

When an episode is marked complete (auto or manual), `AppContext` checks whether **all episodes** in the series are now complete:

```js
const allEps = series.seasons.flatMap((s) => s.episodes);
const allDone = allEps.every((ep) => history[ep.id]?.completed);
```

If yes:

- The `series:{seriesId}` key is created or updated
- `completionCount` is incremented
- `lastCompletedAt` is set to now
- A toast notifies the user: `"Completed {series name}!"`

This counter survives history clears — wait, actually it doesn't: `clearSeriesHistory` in `electron/watchHistory.js` deletes all entries where `entry.seriesId === seriesId` **and** `key === series:{seriesId}`, so a full history reset wipes the completion count too.

---

## Clearing History

| Operation                                     | What it removes                                          |
| --------------------------------------------- | -------------------------------------------------------- |
| "Reset progress" on series detail             | All episode entries + `series:{id}` for that series only |
| Manual delete on a single entry (AppData tab) | That one episode entry only                              |
| Deleting all history (AppData tab)            | Everything in `history.json`                             |

History is only stored in `history.json` — there is no cloud sync or backup. Deleting the file or clearing via the UI is permanent.

---

## Home Screen — "Continue Watching"

The "Recently Watched" row on the home screen is derived from history:

1. For each series, find the most recent `lastWatched` timestamp across all its episodes
2. Sort series by that timestamp descending
3. Show series that have at least one watched episode

The next episode to play (via the series card play button or Resume on the detail page) is determined by `getNextEpisode()` in `TVContext`:

```
1. Find the furthest episode in series chronological order that has any history entry
   (series order = S1E1 → … → last season last episode; NOT sorted by lastWatched timestamp)
2. If that episode is completed (position/duration >= 0.9) → play the next episode in series order
3. If that episode is not yet completed → return it (launchEpisode will resume from saved position if autoResume is on and position > 30s)
4. If no episode has any history → play the first episode of the series
```

**Key distinction from wallclock-time approach:** Watching S6E2 yesterday does NOT override S8E10 watched a week ago. The furthest point chronologically in the series is always the resume point, regardless of when each episode was watched.

1. Find the most recently watched episode
2. If it's in-progress (not completed, position > 30s) → resume it
3. If it's completed → return the next episode in sequence
4. If nothing watched → return episode 1
5. If all episodes completed → return `null` (series finished)
