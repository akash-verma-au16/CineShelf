const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
	// Main → overlay pushes
	onInit: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('overlay:init', handler);
		return () => ipcRenderer.removeListener('overlay:init', handler);
	},
	onStateUpdate: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('overlay:state', handler);
		return () => ipcRenderer.removeListener('overlay:state', handler);
	},
	// Fired by main when the active episode changes (after overlay:play-episode).
	// Carries { currentEpisodeId, season } — the overlay updates its state in place.
	onEpisodeChanged: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('overlay:episode-changed', handler);
		return () => ipcRenderer.removeListener('overlay:episode-changed', handler);
	},

	// Overlay → main commands
	sendCommand: (cmd, val) =>
		ipcRenderer.invoke('overlay:command', { cmd, val }),
	setPassthrough: (enable) => ipcRenderer.invoke('overlay:passthrough', enable),
	close: () => ipcRenderer.invoke('overlay:close'),
	// Pull init data on demand (handles race where push event arrived before listener registered)
	getInit: () => ipcRenderer.invoke('overlay:get-init'),
	// Cursor position pushed from main process poll — reliable even in passthrough mode
	onCursorPosition: (cb) => {
		const handler = (_, pos) => cb(pos);
		ipcRenderer.on('overlay:cursor', handler);
		return () => ipcRenderer.removeListener('overlay:cursor', handler);
	},
	// Switch to a different episode — injects into running VLC via enqueueAndPlay
	playEpisode: (opts) => ipcRenderer.invoke('overlay:play-episode', opts),
	// Anime-specific episode switch — writes to anime history file
	animePlayEpisode: (opts) => ipcRenderer.invoke('anime:play-episode', opts),
	getPlaybackDetails: () => ipcRenderer.invoke('overlay:get-playback-details'),
	cycleAudioTrack: () => ipcRenderer.invoke('overlay:cycle-audio-track'),
	cycleSubtitleTrack: () => ipcRenderer.invoke('overlay:cycle-subtitle-track'),
	setAudioTrack: (trackId) =>
		ipcRenderer.invoke('overlay:set-audio-track', trackId),
	setSubtitleTrack: (trackId) =>
		ipcRenderer.invoke('overlay:set-subtitle-track', trackId),
	cycleAspectRatio: () => ipcRenderer.invoke('overlay:cycle-aspect-ratio'),
	setAspectRatio: (aspectRatio) =>
		ipcRenderer.invoke('overlay:set-aspect-ratio', aspectRatio),
	cycleCrop: () => ipcRenderer.invoke('overlay:cycle-crop'),
	attachSubtitle: () => ipcRenderer.invoke('overlay:attach-subtitle'),
	// Fired by main when an episode switch fails — React rolls back optimistic state
	onEpisodeError: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('overlay:episode-error', handler);
		return () => ipcRenderer.removeListener('overlay:episode-error', handler);
	},
	// Silently pre-enqueue the next episode file into VLC's playlist
	preloadEpisode: (opts) => ipcRenderer.invoke('overlay:preload-episode', opts),
	// Tell main whether any UI panel is currently visible so AHK can decide
	// whether to translate left-click → Space or pass it through as a real click.
	setUIActive: (active) => ipcRenderer.invoke('overlay:set-ui-active', active),
});
