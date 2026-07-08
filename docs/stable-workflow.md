# CineShelf Stable Workflow (v2.0.0)

## Episode Switch Worker — Robust, Race-Proof

- When switching episodes, CineShelf launches a persistent worker that:
  - Issues `in_play` to VLC (immediate file load/play)
  - Polls VLC status every 200ms for up to 10s
  - Detects if the new file is loaded, paused, stopped, or playing
  - Debounces resume toggles if paused (recovers from React/Electron race)
  - Retries `in_play` if VLC stalls or stops
  - Confirms seek position (retries if not settled)
  - Exits early on success, never leaves user stuck

## Auto Fullscreen Restoration

- After every episode switch, CineShelf restores VLC to fullscreen and hides it from the taskbar
- Ensures overlay always sits on top, focus never lost

## History & Seek Accuracy

- Each episode switch uses per-episode history to resume at the correct timestamp
- Seek is confirmed and retried if needed
- Completion is tracked with 90% threshold, mid-session saves every 10s

## Race Recovery

- Handles all known race conditions between React/Electron and VLC
- Persistent polling, debounced resume, robust seek
- No more manual play clicks or wrong seek positions

## Version

- This workflow is stable as of CineShelf v2.0.0
- All previous bugs with episode switching, auto-play, and seek are resolved

---

For full technical details, see electron/player.js and electron/main.js.
