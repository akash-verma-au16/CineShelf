const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	// Settings
	getSettings: () => ipcRenderer.invoke('app:get-settings'),
	saveSettings: (s) => ipcRenderer.invoke('app:save-settings', s),

	// Dialog
	openDir: () => ipcRenderer.invoke('dialog:open-dir'),

	// Library
	scanLibrary: (dirs) => ipcRenderer.invoke('library:scan', dirs),
	getLibrary: () => ipcRenderer.invoke('library:get'),

	// Metadata
	getAllMetadata: () => ipcRenderer.invoke('metadata:get-all'),
	fetchSeriesMetadata: (args) =>
		ipcRenderer.invoke('metadata:fetch-series', args),

	// History
	getHistory: () => ipcRenderer.invoke('history:get'),
	updateHistory: (entry) => ipcRenderer.invoke('history:update', entry),
	markWatched: (args) => ipcRenderer.invoke('history:mark-watched', args),
	clearSeriesHistory: (seriesId) =>
		ipcRenderer.invoke('history:clear-series', seriesId),
	clearSeasonHistory: ({ seriesId, season }) =>
		ipcRenderer.invoke('history:clear-season', { seriesId, season }),
	batchUpdateHistory: (entries) =>
		ipcRenderer.invoke('history:batch-update', entries),

	// Tags
	toggleFavorite: (id) => ipcRenderer.invoke('settings:toggle-favorite', id),
	toggleHallOfFame: (id) =>
		ipcRenderer.invoke('settings:toggle-hall-of-fame', id),
	toggleHighQuality: (id) =>
		ipcRenderer.invoke('settings:toggle-high-quality', id),

	// Window controls
	minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
	maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
	closeWindow: () => ipcRenderer.invoke('window:close'),
	toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
	isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),

	// File system
	openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
	showInFolder: (p) => ipcRenderer.invoke('shell:show-in-folder', p),
	probeVideo: (p) => ipcRenderer.invoke('video:probe', p),
	getDataDir: () => ipcRenderer.invoke('fs:get-data-dir'),
	listDir: (dirPath) => ipcRenderer.invoke('fs:list-dir', dirPath),
	renameItem: (oldPath, newName) =>
		ipcRenderer.invoke('fs:rename-item', { oldPath, newName }),

	// Data editing
	patchMetadataEntry: (id, updates) =>
		ipcRenderer.invoke('data:patch-metadata-entry', { id, updates }),
	fetchImageAlternatives: (args) =>
		ipcRenderer.invoke('metadata:fetch-image-alternatives', args),
	setSeriesImage: (args) => ipcRenderer.invoke('metadata:set-image', args),
	saveHistoryEntry: (entry) =>
		ipcRenderer.invoke('data:save-history-entry', entry),
	deleteHistoryEntry: (key) =>
		ipcRenderer.invoke('data:delete-history-entry', key),
	getDataInfo: () => ipcRenderer.invoke('data:get-info'),

	// External player (VLC)
	checkVlc: () => ipcRenderer.invoke('player:check'),
	launchPlayer: (opts) => ipcRenderer.invoke('player:launch', opts),
	sendPlayerCommand: (cmd, val) =>
		ipcRenderer.invoke('player:command', { cmd, val }),

	// Autostart
	getAutostart: () => ipcRenderer.invoke('app:get-autostart'),
	setAutostart: (enable) => ipcRenderer.invoke('app:set-autostart', enable),

	// AHK mouse bindings
	saveAhkMappings: (mappings) =>
		ipcRenderer.invoke('ahk:save-mappings', mappings),
	getAhkPath: () => ipcRenderer.invoke('ahk:get-path'),

	// Renderer-side event listeners for player lifecycle
	onPlayerClosed: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('player:closed', handler);
		return () => ipcRenderer.removeListener('player:closed', handler);
	},
	onPlayerPositionUpdate: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('player:position-update', handler);
		return () => ipcRenderer.removeListener('player:position-update', handler);
	},

	// Background startup scan events
	onLibraryUpdated: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('library:updated', handler);
		return () => ipcRenderer.removeListener('library:updated', handler);
	},
	onMetadataPatched: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('metadata:patched', handler);
		return () => ipcRenderer.removeListener('metadata:patched', handler);
	},

	// Episode stills background caching
	cacheStills: () => ipcRenderer.invoke('metadata:cache-stills'),
	onStillsCached: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('metadata:stills-cached', handler);
		return () => ipcRenderer.removeListener('metadata:stills-cached', handler);
	},

	// ── Movies workflow ────────────────────────────────────────────────────────
	moviesGetLibrary: () => ipcRenderer.invoke('movies:get-library'),
	moviesScan: (dirs) => ipcRenderer.invoke('movies:scan', dirs),
	moviesGetMetadata: () => ipcRenderer.invoke('movies:get-metadata'),
	moviesFetchMetadata: (args) =>
		ipcRenderer.invoke('movies:fetch-metadata', args),
	moviesGetHistory: () => ipcRenderer.invoke('movies:get-history'),
	moviesUpdateHistory: (entry) =>
		ipcRenderer.invoke('movies:update-history', entry),
	moviesGetDataInfo: () => ipcRenderer.invoke('movies:get-data-info'),
	moviesDeleteHistory: (key) =>
		ipcRenderer.invoke('movies:delete-history', key),
	moviesLaunch: (opts) => ipcRenderer.invoke('movies:launch', opts),
	onMoviesClosed: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('movies:closed', handler);
		return () => ipcRenderer.removeListener('movies:closed', handler);
	},

	// ── Anime workflow ─────────────────────────────────────────────────────────
	animeGetLibrary: () => ipcRenderer.invoke('anime:get-library'),
	animeScan: (dirs) => ipcRenderer.invoke('anime:scan', dirs),
	animeGetMetadata: () => ipcRenderer.invoke('anime:get-metadata'),
	animeGetHistory: () => ipcRenderer.invoke('anime:get-history'),
	animeUpdateHistory: (entry) =>
		ipcRenderer.invoke('anime:update-history', entry),
	animeSaveHistoryEntry: (entry) =>
		ipcRenderer.invoke('anime:save-history-entry', entry),
	animeDeleteHistory: (key) => ipcRenderer.invoke('anime:delete-history', key),
	animeClearSeriesHistory: (seriesId) =>
		ipcRenderer.invoke('anime:clear-series-history', seriesId),
	animePatchMetadataEntry: (id, updates) =>
		ipcRenderer.invoke('anime:patch-metadata', { id, updates }),
	animeGetDataInfo: () => ipcRenderer.invoke('anime:get-data-info'),
	animeFetchMetadata: (args) =>
		ipcRenderer.invoke('anime:fetch-metadata', args),
	animeLaunch: (opts) => ipcRenderer.invoke('anime:launch', opts),
	onAnimeClosed: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('anime:closed', handler);
		return () => ipcRenderer.removeListener('anime:closed', handler);
	},
	onAnimePositionUpdate: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('anime:position-update', handler);
		return () => ipcRenderer.removeListener('anime:position-update', handler);
	},
	onAnimeMetadataPatched: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on('anime:metadata-patched', handler);
		return () => ipcRenderer.removeListener('anime:metadata-patched', handler);
	},
});
