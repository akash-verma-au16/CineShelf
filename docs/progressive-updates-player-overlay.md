# CineShelf Progressive Updates: Shared Player And Overlay

**Reference date:** 2026-03-18

This document records shared player and overlay changes that landed after the original architecture and stable-workflow docs were written.

## 1. Shared overlay control surface expanded

The shared TV/Movies overlay now supports:

- Audio track cycling and explicit selection
- Subtitle track cycling and explicit selection
- Aspect ratio cycling and explicit selection
- Crop cycling
- External subtitle attachment from a native file picker

These controls are exposed through:

- `electron/player.js`
- `electron/main.js`
- `electron/overlayPreload.js`
- `src/shared/components/Player/PlayerOverlay.js`
- `src/shared/components/Player/OverlayControls.js`

## 2. VLC input ownership changed

The older docs describe mouse suppression as the key protection layer.
That is no longer the full picture.

Current behavior:

- CineShelf clears relevant VLC mouse bindings
- CineShelf also clears selected VLC keyboard bindings that would conflict with the overlay
- This prevents VLC-native next, previous, audio-track, subtitle-track, aspect-ratio, and crop keys from bypassing app logic

The relevant helper is now `patchVLCInputConfig()` in `electron/player.js`.

## 3. Key mapping behavior

The intended overlay-owned key behavior is:

- `N` / `P` for episode next and previous through app logic
- `V` for audio tracks
- `B` for subtitle tracks
- `A` for aspect ratio
- `C` for crop cycling

These bindings are app-level behavior, not VLC-native behavior.

## 4. Playback detail model added

The shared player layer now exposes a playback detail snapshot containing:

- audio tracks
- subtitle tracks
- selected audio track
- selected subtitle track
- current aspect ratio
- available aspect ratio options

This is fetched by the overlay through `overlay:get-playback-details` and used to populate menus in the bottom control bar.

## 5. Native dialog focus release for subtitle attachment

External subtitle attachment required a native Windows file dialog.
The overlay originally kept focus and topmost ownership too aggressively, which caused dialog interaction problems.

Current behavior when attaching subtitles:

- overlay enters a dialog-active state
- overlay temporarily releases mouse capture and topmost ownership
- the native dialog opens and can receive clicks correctly
- overlay focus and topmost behavior are restored after the dialog closes

The AHK layer also recognizes dialog mode so left-click is passed through instead of being converted to play/pause.

## 6. Shared stale-state guard for episode switching

After the player-control work, a regression appeared in TV/Movies episode switching.

Problem:

- the shared overlay would optimistically switch UI state to the new episode
- while VLC was still switching files, a late `overlay:state` packet from the previous episode could still arrive
- the shared overlay accepted that stale packet and overwrote the new episode position with the previous episode timestamp

Fix:

- the shared overlay now tracks a pending target `episodeId` during transitions
- incoming `overlay:state` packets are ignored if their `episodeId` does not match the expected current or pending episode
- the same guard is applied to the lightweight history patch path used by the playlist sidebar

This protection exists in `src/shared/components/Player/PlayerOverlay.js`.

## 7. Current overlay route split

The original architecture text described a single shared overlay route.
Current routing is:

- TV + Movies: `#/player-overlay`
- Anime: `#/anime-player-overlay`

This is a renderer-level split only.
The backend VLC session infrastructure remains shared.

## 8. Practical implication for future work

When working on player behavior, treat the stack as four layers:

1. `electron/player.js` for VLC command and poll behavior
2. `electron/main.js` for IPC, session tracking, overlay window behavior, and native dialogs
3. `electron/overlayPreload.js` for renderer API exposure
4. workflow overlay components for renderer-side behavior

TV and Movies share the renderer overlay.
Anime does not.

That means:

- shared renderer fixes hit TV + Movies together
- anime renderer behavior must be changed in anime-specific overlay files
- shared backend fixes can affect all workflows and should be treated as high-blast-radius work
