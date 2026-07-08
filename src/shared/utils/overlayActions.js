/**
 * Playback actions recognised by the overlay and the Controls settings tab.
 * Each action can be mapped to a mouse button / scroll wheel in Settings → Controls.
 * Keyboard shortcuts are fixed (standard VLC defaults) and shown here as reference only.
 */

export const OVERLAY_ACTIONS = [
	{ id: 'play_pause', label: 'Play / Pause', defaultKey: 'Space' },
	{ id: 'stop', label: 'Stop', defaultKey: 'S' },
	{ id: 'next', label: 'Next Episode', defaultKey: 'N' },
	{ id: 'prev', label: 'Previous Episode', defaultKey: 'P' },
	{ id: 'seek_fwd_10', label: 'Seek Forward 10s', defaultKey: '→' },
	{ id: 'seek_back_10', label: 'Seek Back 10s', defaultKey: '←' },
	{ id: 'seek_fwd_60', label: 'Seek Forward 1 min', defaultKey: '↑' },
	{ id: 'seek_back_60', label: 'Seek Back 1 min', defaultKey: '↓' },
	{ id: 'seek_fwd_180', label: 'Seek Forward 3 min', defaultKey: 'Ctrl + →' },
	{ id: 'seek_back_180', label: 'Seek Back 3 min', defaultKey: 'Ctrl + ←' },
	{ id: 'vol_up', label: 'Volume Up (~10%)', defaultKey: 'Scroll ↑' },
	{ id: 'vol_down', label: 'Volume Down (~10%)', defaultKey: 'Scroll ↓' },
	{ id: 'mute', label: 'Mute / Unmute', defaultKey: 'M' },
	{ id: 'fullscreen', label: 'Toggle Fullscreen', defaultKey: 'F' },
];

/**
 * Factory defaults for mouse button → action mapping.
 * Persisted in settings.json under `mouseBindings`.
 * Keys: "button0"–"button4" (MouseEvent.button) and "wheelup" / "wheeldown".
 */
export const DEFAULT_MOUSE_BINDINGS = {
	button1: 'play_pause', // middle click       → play / pause
	button3: 'prev', // mouse back button  → previous episode
	button4: 'next', // mouse fwd button   → next episode
	wheelup: 'vol_up', // scroll up          → volume up
	wheeldown: 'vol_down', // scroll down        → volume down
};

/** Human-readable labels for each mouse button key. */
export const MOUSE_BUTTON_LABELS = {
	button0: 'Left Click',
	button1: 'Middle Click',
	button2: 'Right Click',
	button3: 'Mouse Back',
	button4: 'Mouse Forward',
	wheelup: 'Scroll Up',
	wheeldown: 'Scroll Down',
};
