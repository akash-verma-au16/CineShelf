import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useCallback,
	useRef,
} from 'react';
import { getProgress } from '../../shared/utils/helpers';

const TVContext = createContext(null);

const initialState = {
	settings: null,
	library: null,
	metadata: {},
	history: {},
	loading: { library: false, scanning: false, metadata: false },
	toast: null,
	initialized: false,
	player: {
		isOpen: false,
		episode: null,
		initialSeek: 0,
		seriesName: '',
		episodeTitle: '',
	},
};

function reducer(state, action) {
	switch (action.type) {
		case 'SET_SETTINGS':
			return { ...state, settings: action.payload };
		case 'SET_LIBRARY':
			return { ...state, library: action.payload };
		case 'SET_METADATA':
			return { ...state, metadata: action.payload };
		case 'PATCH_METADATA':
			return {
				...state,
				metadata: { ...state.metadata, [action.payload.id]: action.payload },
			};
		case 'SET_HISTORY':
			return { ...state, history: action.payload };
		case 'PATCH_HISTORY':
			return {
				...state,
				history: {
					...state.history,
					[action.payload.key]: {
						...(state.history[action.payload.key] || {}),
						...action.payload,
					},
				},
			};
		case 'CLEAR_SERIES_HISTORY': {
			const next = { ...state.history };
			const prefix = action.seriesId + '-';
			for (const key of Object.keys(next)) {
				if (
					next[key]?.seriesId === action.seriesId ||
					key === `series:${action.seriesId}` ||
					key.startsWith(prefix)
				) {
					delete next[key];
				}
			}
			return { ...state, history: next };
		}
		case 'CLEAR_SEASON_HISTORY': {
			const next = { ...state.history };
			for (const key of Object.keys(next)) {
				if (
					next[key]?.seriesId === action.seriesId &&
					next[key]?.season === action.season
				) {
					delete next[key];
				}
			}
			return { ...state, history: next };
		}
		case 'DELETE_HISTORY_ENTRY': {
			const next = { ...state.history };
			delete next[action.key];
			return { ...state, history: next };
		}
		case 'SET_LOADING':
			return {
				...state,
				loading: { ...state.loading, [action.key]: action.value },
			};
		case 'SET_TOAST':
			return { ...state, toast: action.payload };
		case 'SET_INITIALIZED':
			return { ...state, initialized: true };
		case 'SET_PLAYER':
			return { ...state, player: action.payload };
		default:
			return state;
	}
}

export function TVProvider({ children }) {
	const [state, dispatch] = useReducer(reducer, initialState);

	// ── Toast ──────────────────────────────────────────────────────────────────
	const showToast = useCallback((message, type = 'info') => {
		dispatch({ type: 'SET_TOAST', payload: { message, type, id: Date.now() } });
		setTimeout(() => dispatch({ type: 'SET_TOAST', payload: null }), 3500);
	}, []);

	// ── Initialization ─────────────────────────────────────────────────────────
	useEffect(() => {
		async function init() {
			if (!window.api) {
				dispatch({ type: 'SET_INITIALIZED' });
				return;
			}
			try {
				const [settings, library, metadata, history] = await Promise.all([
					window.api.getSettings(),
					window.api.getLibrary(),
					window.api.getAllMetadata(),
					window.api.getHistory(),
				]);
				dispatch({ type: 'SET_SETTINGS', payload: settings });
				if (library) dispatch({ type: 'SET_LIBRARY', payload: library });
				dispatch({ type: 'SET_METADATA', payload: metadata || {} });
				dispatch({ type: 'SET_HISTORY', payload: history || {} });
			} catch (err) {
				console.error('Init error:', err);
			}
			dispatch({ type: 'SET_INITIALIZED' });
		}
		init();
	}, []);

	// ── Actions ────────────────────────────────────────────────────────────────
	const scanLibrary = useCallback(async () => {
		if (!window.api) return;
		const dirs = state.settings?.sourceDirs || [];
		if (!dirs.length) {
			showToast('No source directories set — go to Settings first', 'warning');
			return;
		}
		dispatch({ type: 'SET_LOADING', key: 'scanning', value: true });
		showToast('Scanning library…', 'info');
		try {
			const result = await window.api.scanLibrary(dirs);
			if (result.success) {
				dispatch({ type: 'SET_LIBRARY', payload: result.library });
				showToast(`Found ${result.library.totalSeries} series`, 'success');
			} else {
				showToast(`Scan failed: ${result.error}`, 'error');
			}
		} catch (err) {
			showToast(`Scan error: ${err.message}`, 'error');
		}
		dispatch({ type: 'SET_LOADING', key: 'scanning', value: false });
	}, [state.settings, showToast]);

	const saveSettings = useCallback(
		async (updates) => {
			if (!window.api) return;
			const merged = { ...state.settings, ...updates };
			await window.api.saveSettings(merged);
			dispatch({ type: 'SET_SETTINGS', payload: merged });
			showToast('Settings saved', 'success');
		},
		[state.settings, showToast],
	);

	const fetchMetadata = useCallback(
		async (seriesId, seriesName) => {
			if (!window.api) return;
			const apiKey = state.settings?.tmdbApiKey || '';
			if (!apiKey) {
				showToast('Add a TMDb API key in Settings to fetch metadata', 'info');
				return;
			}
			dispatch({ type: 'SET_LOADING', key: 'metadata', value: true });
			try {
				const result = await window.api.fetchSeriesMetadata({
					seriesId,
					seriesName,
					apiKey,
				});
				if (result.success) {
					dispatch({ type: 'PATCH_METADATA', payload: result.metadata });
				}
			} catch (err) {
				console.error('Metadata fetch error:', err);
			}
			dispatch({ type: 'SET_LOADING', key: 'metadata', value: false });
		},
		[state.settings, showToast],
	);

	const fetchAllMetadata = useCallback(async () => {
		if (!window.api || !state.library) return;
		if (!state.settings?.tmdbApiKey) {
			showToast('Add a TMDb API key in Settings to fetch metadata', 'info');
			return;
		}
		showToast('Fetching metadata for all series…', 'info');
		let count = 0;
		for (const series of state.library.series) {
			const m = state.metadata[series.id];
			if (!m?.tmdbId || !m?.seasons) {
				await fetchMetadata(series.id, series.name);
				count++;
			}
		}
		showToast(`Metadata fetched for ${count} series`, 'success');
	}, [state.library, state.metadata, state.settings, fetchMetadata, showToast]);

	// Stable refs so that the player:closed listener (registered once) can
	// always see the latest state and current launchEpisode function without
	// being torn down and re-created on every render.
	const stateRef = useRef(state);
	useEffect(() => {
		stateRef.current = state;
	});

	const launchEpisodeRef = useRef(null);

	// ── Build the launchEpisode action ─────────────────────────────────────────
	const launchEpisode = useCallback(
		async (episode) => {
			if (!episode?.filePath) return;
			const hist = state.history[episode.id];

			// Resume from saved position (if autoResume is on and > 30 s in)
			let initialSeek = 0;
			if (state.settings?.autoResume !== false) {
				if (hist && !hist.completed && (hist.position || 0) > 30) {
					initialSeek = hist.position;
				}
			}

			// ── Launch in VLC ────────────────────────────────────────────────────
			if (window.api?.launchPlayer) {
				const result = await window.api.launchPlayer({
					filePath: episode.filePath,
					seekSeconds: initialSeek,
					episodeId: episode.id,
					seriesId: episode.seriesId,
					season: episode.season,
					episode: episode.episode,
				});

				if (result?.success) {
					// VLC launched – player:closed event will do final history save
					return;
				}

				// VLC not found or failed to start
				if (result?.error) {
					showToast(result.error, 'error');
				}
				return;
			}
		},
		[state.history, state.settings, showToast],
	);

	// Keep the ref in sync so the player:closed listener always calls the
	// current version (avoids stale-closure issues with the once-registered effect).
	useEffect(() => {
		launchEpisodeRef.current = launchEpisode;
	}, [launchEpisode]);

	// ── Background scan listeners (from main process startup scan) ────────────
	useEffect(() => {
		if (!window.api?.onLibraryUpdated) return;
		return window.api.onLibraryUpdated((library) => {
			dispatch({ type: 'SET_LIBRARY', payload: library });
		});
	}, []);

	useEffect(() => {
		if (!window.api?.onMetadataPatched) return;
		return window.api.onMetadataPatched((meta) => {
			dispatch({ type: 'PATCH_METADATA', payload: meta });
		});
	}, []);

	// ── Subscribe to real-time position updates from VLC ─────────────────────
	// Updates in-memory history every ~1 s while VLC is playing so that
	// progress bars and resume positions are accurate without waiting for close.
	useEffect(() => {
		if (!window.api?.onPlayerPositionUpdate) return;
		return window.api.onPlayerPositionUpdate(
			({ position, duration, episodeId: epId, completed }) => {
				if (!epId || position === undefined) return;
				const existingDur =
					duration || stateRef.current.history[epId]?.duration || 0;
				const computedCompleted =
					typeof completed === 'boolean'
						? completed
						: existingDur > 0 && position / existingDur >= 0.9;
				dispatch({
					type: 'PATCH_HISTORY',
					payload: {
						key: epId,
						position: Math.floor(position),
						duration: Math.floor(existingDur),
						completed: computedCompleted,
					},
				});
			},
		);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Subscribe to player lifecycle events (registered once on mount) ───────────
	useEffect(() => {
		if (!window.api?.onPlayerClosed) return;

		const cleanup = window.api.onPlayerClosed(
			async ({
				episodeId,
				seriesId,
				season,
				episode,
				position,
				duration,
				action,
			}) => {
				// Persist the position to history
				if (episodeId && position !== undefined && window.api) {
					const dur = duration || 0;
					const completed = dur > 0 && position / dur >= 0.9;
					const entry = {
						key: episodeId,
						seriesId,
						season,
						episode,
						position: Math.floor(position),
						duration: Math.floor(dur),
						completed,
						lastWatched: new Date().toISOString(),
					};
					dispatch({ type: 'PATCH_HISTORY', payload: entry });
					await window.api.updateHistory(entry);

					// Check series completion
					if (completed && seriesId) {
						const cs = stateRef.current;
						const ser = cs.library?.series?.find((s) => s.id === seriesId);
						if (ser) {
							const allEps = (ser.seasons || []).flatMap(
								(s) => s.episodes || [],
							);
							const merged = { ...cs.history, [episodeId]: entry };
							const allDone = allEps.every((ep) => merged[ep.id]?.completed);
							if (allDone) {
								const sk = `series:${seriesId}`;
								const prev = merged[sk] || { completionCount: 0 };
								const ce = {
									key: sk,
									seriesId,
									completionCount: (prev.completionCount || 0) + 1,
									lastCompletedAt: new Date().toISOString(),
								};
								dispatch({ type: 'PATCH_HISTORY', payload: ce });
								window.api.updateHistory(ce);
							}
						}
					}
				}

				// Handle next / previous episode navigation
				if (action === 'next' || action === 'prev') {
					const currentState = stateRef.current;
					const series = currentState.library?.series?.find(
						(s) => s.id === seriesId,
					);
					if (series) {
						// Flatten all episodes, sorted by season then episode number
						const allEps = (series.seasons || [])
							.slice()
							.sort((a, b) => a.season - b.season)
							.flatMap((s) => s.episodes || []);
						const idx = allEps.findIndex((e) => e.id === episodeId);
						const target =
							action === 'next' ? allEps[idx + 1] : allEps[idx - 1];
						if (target && launchEpisodeRef.current) {
							// Brief pause so VLC fully closes before reopening
							setTimeout(() => launchEpisodeRef.current(target), 600);
						}
					}
				}
			},
		);

		return cleanup;
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const closePlayer = useCallback(
		async ({ position, duration } = {}) => {
			const { episode } = state.player;
			if (episode && position !== undefined && window.api) {
				const hist = state.history[episode.id] || {};
				const dur = duration || hist.duration || 0;
				const completed = dur > 0 && position / dur >= 0.9;
				const entry = {
					key: episode.id,
					seriesId: episode.seriesId,
					season: episode.season,
					episode: episode.episode,
					filePath: episode.filePath,
					position: Math.floor(position),
					duration: Math.floor(dur),
					completed,
					lastWatched: new Date().toISOString(),
				};
				dispatch({ type: 'PATCH_HISTORY', payload: entry });
				await window.api.updateHistory(entry);
			}
			dispatch({
				type: 'SET_PLAYER',
				payload: {
					isOpen: false,
					episode: null,
					initialSeek: 0,
					seriesName: '',
					episodeTitle: '',
				},
			});
		},
		[state.player, state.history],
	);

	const markWatched = useCallback(
		async (episode, watched = true) => {
			if (!window.api) return;

			if (!watched) {
				// Delete the history entry entirely so the episode resets to unwatched
				dispatch({ type: 'DELETE_HISTORY_ENTRY', key: episode.id });
				if (window.api.deleteHistoryEntry)
					await window.api.deleteHistoryEntry(episode.id);
				showToast('Marked as unwatched', 'success');
				return;
			}

			const existing = state.history[episode.id] || {};
			const entry = {
				...existing,
				key: episode.id,
				seriesId: episode.seriesId,
				season: episode.season,
				episode: episode.episode,
				filePath: episode.filePath,
				completed: true,
				lastWatched: new Date().toISOString(),
				position: existing.duration || 0,
			};
			dispatch({ type: 'PATCH_HISTORY', payload: entry });
			await window.api.updateHistory(entry);

			// Check if the whole series is now completed
			if (watched && episode.seriesId) {
				const series = state.library?.series?.find(
					(s) => s.id === episode.seriesId,
				);
				if (series) {
					const allEps = (series.seasons || []).flatMap(
						(s) => s.episodes || [],
					);
					const mergedHist = { ...state.history, [entry.key]: entry };
					const allDone = allEps.every((ep) => mergedHist[ep.id]?.completed);
					if (allDone) {
						const sk = `series:${episode.seriesId}`;
						const prev = mergedHist[sk] || { completionCount: 0 };
						const ce = {
							key: sk,
							seriesId: episode.seriesId,
							completionCount: (prev.completionCount || 0) + 1,
							lastCompletedAt: new Date().toISOString(),
						};
						dispatch({ type: 'PATCH_HISTORY', payload: ce });
						window.api.updateHistory(ce);
						showToast(`Completed ${series.name}!`, 'success');
					}
				}
			}

			showToast('Marked as watched', 'success');
		},
		[state.history, state.library, showToast],
	);

	const clearSeriesHistory = useCallback(
		async (seriesId) => {
			if (!window.api) return;
			const result = await window.api.clearSeriesHistory(seriesId);
			if (result.success) {
				dispatch({ type: 'CLEAR_SERIES_HISTORY', seriesId });
				showToast('Watch progress reset', 'success');
			}
		},
		[showToast],
	);

	// markSeasonWatched: toggle an entire season watched (true) or unwatched (false)
	// When marking watched, incrementing timestamps are assigned for display ordering
	// (getNextEpisode now uses series chronological order, not timestamps)
	const markSeasonWatched = useCallback(
		async (seriesId, seasonNumber, episodes, watched) => {
			if (!window.api || !episodes?.length) return;

			if (!watched) {
				// Delete all history entries for this season
				if (window.api.clearSeasonHistory) {
					await window.api.clearSeasonHistory({
						seriesId,
						season: seasonNumber,
					});
				}
				dispatch({
					type: 'CLEAR_SEASON_HISTORY',
					seriesId,
					season: seasonNumber,
				});
				showToast('Season marked as unwatched', 'success');
				return;
			}

			// Assign incrementing timestamps so episode order is reflected in history
			// (first episode = oldest, last episode = newest)
			// NOTE: getNextEpisode uses series chronological order, NOT lastWatched timestamps
			const baseTime = Date.now() - (episodes.length - 1) * 1000;
			const currentHistory = stateRef.current.history;
			const entries = episodes.map((ep, i) => ({
				key: ep.id,
				seriesId,
				season: ep.season,
				episode: ep.episode,
				filePath: ep.filePath,
				completed: true,
				lastWatched: new Date(baseTime + i * 1000).toISOString(),
				duration: currentHistory[ep.id]?.duration || 0,
				position: currentHistory[ep.id]?.duration || 0,
			}));

			// Batch-write all entries in one file operation
			if (window.api.batchUpdateHistory) {
				await window.api.batchUpdateHistory(entries);
			} else {
				// Fallback: sequential per-episode writes
				for (const entry of entries) {
					await window.api.updateHistory(entry);
				}
			}

			// Update in-memory state for all entries
			for (const entry of entries) {
				dispatch({ type: 'PATCH_HISTORY', payload: entry });
			}
			showToast('Season marked as watched', 'success');
		},
		[showToast], // stateRef is always current; no need to list state.history
	);

	const patchMetadataEntry = useCallback(async (seriesId, updates) => {
		if (!window.api?.patchMetadataEntry) return { success: false };
		const result = await window.api.patchMetadataEntry(seriesId, updates);
		if (result.success) {
			dispatch({ type: 'PATCH_METADATA', payload: result.metadata });
		}
		return result;
	}, []);

	const fetchImageAlternatives = useCallback(async (args) => {
		if (!window.api?.fetchImageAlternatives) return null;
		return window.api.fetchImageAlternatives(args);
	}, []);

	const setSeriesImage = useCallback(async (args) => {
		if (!window.api?.setSeriesImage) return { success: false };
		const result = await window.api.setSeriesImage(args);
		if (result?.success && result?.metadata) {
			dispatch({ type: 'PATCH_METADATA', payload: result.metadata });
		}
		return result;
	}, []);

	const saveHistoryEntry = useCallback(async (entry) => {
		if (!window.api?.saveHistoryEntry) return { success: false };
		const result = await window.api.saveHistoryEntry(entry);
		if (result.success) {
			dispatch({ type: 'PATCH_HISTORY', payload: entry });
		}
		return result;
	}, []);

	const deleteHistoryEntry = useCallback(async (key) => {
		if (!window.api?.deleteHistoryEntry) return { success: false };
		const result = await window.api.deleteHistoryEntry(key);
		if (result.success) {
			dispatch({ type: 'DELETE_HISTORY_ENTRY', key });
		}
		return result;
	}, []);

	const toggleFavorite = useCallback(
		async (seriesId) => {
			if (!window.api) return;
			const updated = await window.api.toggleFavorite(seriesId);
			dispatch({
				type: 'SET_SETTINGS',
				payload: { ...state.settings, favorites: updated },
			});
		},
		[state.settings],
	);

	// Silent save — no toast, used by CustomRowsSection for continuous DnD persistence
	const saveCustomRows = useCallback(
		async (customRows) => {
			if (!window.api) return;
			const merged = { ...stateRef.current.settings, customRows };
			await window.api.saveSettings(merged);
			dispatch({ type: 'SET_SETTINGS', payload: merged });
		},
		[], // stateRef.current is always up-to-date
	);

	// ── Derived helpers ────────────────────────────────────────────────────────
	// Returns the episode to play/resume based on series chronology:
	// 1. Find the furthest episode (by series order) that has any watch history entry
	// 2. If that ep is completed → play the next one in series order
	// 3. If that ep is not yet completed → return it (resume if in-progress)
	// 4. If nothing was ever watched → first episode
	// NOTE: "furthest" is determined by position in series order, NOT by lastWatched
	// timestamp. Watching S6E2 yesterday does not override S8E10 watched last week.
	const getNextEpisode = useCallback(
		(series) => {
			if (!series?.seasons) return null;
			const allEps = series.seasons.flatMap((s) => s.episodes || []);
			if (!allEps.length) return null;

			// Find the furthest episode in series order that has any history entry
			let furthestIdx = -1;
			for (let i = 0; i < allEps.length; i++) {
				if (state.history[allEps[i].id]) {
					furthestIdx = i;
				}
			}

			// Nothing ever watched → first episode
			if (furthestIdx === -1) return allEps[0];

			const furthestHist = state.history[allEps[furthestIdx].id];

			// Not yet completed → return this episode (launchEpisode handles resume position)
			if (!furthestHist.completed) {
				return allEps[furthestIdx];
			}

			// Completed → return the next episode in series order
			if (furthestIdx + 1 < allEps.length) {
				return allEps[furthestIdx + 1];
			}

			// All caught up → null (series done)
			return null;
		},
		[state.history],
	);

	const getSeriesWatchedCount = useCallback(
		(series) => {
			if (!series?.seasons) return { watched: 0, total: 0 };
			let watched = 0;
			let total = 0;
			for (const season of series.seasons) {
				for (const ep of season.episodes) {
					total++;
					const h = state.history[ep.id];
					if (
						h?.completed ||
						getProgress(h?.position || 0, h?.duration || 0) >= 90
					)
						watched++;
				}
			}
			return { watched, total };
		},
		[state.history],
	);

	const value = {
		...state,
		// Actions
		scanLibrary,
		saveSettings,
		fetchMetadata,
		fetchAllMetadata,
		launchEpisode,
		closePlayer,
		markWatched,
		markSeasonWatched,
		toggleFavorite,
		clearSeriesHistory,
		patchMetadataEntry,
		fetchImageAlternatives,
		setSeriesImage,
		saveHistoryEntry,
		deleteHistoryEntry,
		showToast,
		saveCustomRows,
		// Helpers
		getNextEpisode,
		getSeriesWatchedCount,
		// Convenience flags
		allSeries: state.library?.series || [],
		favorites: state.settings?.favorites || [],
		customRows: state.settings?.customRows || [],
	};

	return <TVContext.Provider value={value}>{children}</TVContext.Provider>;
}

export function useApp() {
	const ctx = useContext(TVContext);
	if (!ctx) throw new Error('useApp must be inside TVProvider');
	return ctx;
}
