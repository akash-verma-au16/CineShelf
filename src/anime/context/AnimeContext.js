import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useCallback,
	useRef,
} from 'react';

const AnimeContext = createContext(null);

// Default filter applied to every new series (user hasn't configured it yet)
const DEFAULT_FILTERS = { canon: true, mixed: true, filler: false };

function getEpisodeType(episode) {
	return (episode?.episodeType || episode?.type || 'canon').toLowerCase();
}

function getEpisodeHistoryKey(episode) {
	return episode?.id;
}

function traceAnimeContext(label, data) {
	try {
		console.log(`${label} ${JSON.stringify(data)}`);
	} catch {
		console.log(label);
	}
}

const initialState = {
	settings: null,
	library: null, // { series[], totalSeries, totalEpisodes, scannedAt }
	metadata: {}, // { [seriesId]: { backdropPath, overview, ... } }
	history: {}, // { [episodeId]: { position, duration, completed, ... } }
	// Per-series filter state — { [seriesId]: { canon, mixed, filler } }
	// Loaded from settings.animeFilters on init, written back on change.
	filters: {},
	favorites: [], // array of seriesIds (stored in settings.animeFavorites)
	customRows: [], // array of { id, title, seriesIds[] } (stored in settings.animeCustomRows)
	loading: { library: false, scanning: false, metadata: false },
	toast: null,
	initialized: false,
	player: {
		isOpen: false,
		seriesId: null,
		episodeId: null,
		initialSeek: 0,
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
		case 'DELETE_HISTORY_ENTRY': {
			const next = { ...state.history };
			delete next[action.key];
			return { ...state, history: next };
		}
		case 'CLEAR_SERIES_HISTORY': {
			const next = { ...state.history };
			for (const key of Object.keys(next)) {
				if (next[key]?.seriesId === action.seriesId) {
					delete next[key];
				}
			}
			return { ...state, history: next };
		}
		case 'SET_FAVORITES':
			return { ...state, favorites: action.payload };
		case 'SET_CUSTOM_ROWS':
			return { ...state, customRows: action.payload };
		case 'SET_FILTERS':
			return { ...state, filters: action.payload };
		case 'PATCH_FILTER':
			return {
				...state,
				filters: {
					...state.filters,
					[action.seriesId]: {
						...(state.filters[action.seriesId] || DEFAULT_FILTERS),
						[action.key]: action.value,
					},
				},
			};
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

export function AnimeProvider({ children }) {
	const [state, dispatch] = useReducer(reducer, initialState);
	const toastTimer = useRef(null);
	const stateRef = useRef(state);
	const playEpisodeRef = useRef(null);
	const positionLogBucketsRef = useRef({});

	// Keep stateRef always current so closures registered once don't go stale
	useEffect(() => {
		stateRef.current = state;
	});

	// ── Toast ─────────────────────────────────────────────────────────────────
	const showToast = useCallback((message, type = 'info') => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		dispatch({ type: 'SET_TOAST', payload: { message, type, id: Date.now() } });
		toastTimer.current = setTimeout(
			() => dispatch({ type: 'SET_TOAST', payload: null }),
			3500,
		);
	}, []);

	// ── Init: load everything on mount ────────────────────────────────────────
	useEffect(() => {
		async function init() {
			if (!window.api) {
				dispatch({ type: 'SET_INITIALIZED' });
				return;
			}
			try {
				const [settings, library, metadata, history] = await Promise.all([
					window.api.getSettings(),
					window.api.animeGetLibrary(),
					window.api.animeGetMetadata(),
					window.api.animeGetHistory(),
				]);
				dispatch({ type: 'SET_SETTINGS', payload: settings });
				if (library) dispatch({ type: 'SET_LIBRARY', payload: library });
				if (metadata) dispatch({ type: 'SET_METADATA', payload: metadata });
				if (history) dispatch({ type: 'SET_HISTORY', payload: history });
				traceAnimeContext('[AnimeContext] Init loaded', {
					seriesCount: library?.series?.length || 0,
					historyEntries: Object.keys(history || {}).length,
					legacyHistoryKeys: Object.keys(history || {}).filter((key) =>
						key.startsWith('anime:'),
					).length,
				});
				// Restore per-series filter preferences
				if (settings?.animeFilters) {
					dispatch({ type: 'SET_FILTERS', payload: settings.animeFilters });
				}
				// Restore custom shelf rows
				if (settings?.animeCustomRows) {
					dispatch({
						type: 'SET_CUSTOM_ROWS',
						payload: settings.animeCustomRows,
					});
				}
				// Restore favourites list
				if (settings?.animeFavorites) {
					dispatch({ type: 'SET_FAVORITES', payload: settings.animeFavorites });
				}
			} catch (err) {
				console.error('[AnimeContext] Init error:', err);
			}
			dispatch({ type: 'SET_INITIALIZED' });
		}
		init();
	}, []);

	// ── anime:metadata-patched listener ──────────────────────────────────────
	useEffect(() => {
		if (!window.api?.onAnimeMetadataPatched) return;
		const unsub = window.api.onAnimeMetadataPatched(({ seriesId, meta }) => {
			dispatch({
				type: 'PATCH_METADATA',
				payload: { id: seriesId, ...meta },
			});
		});
		return unsub;
	}, []);

	// ── Live position updates while VLC is playing ────────────────────────────
	// Updates in-memory history every ~1 s so progress bars stay accurate
	// without waiting for VLC to close. Mirrors TV's onPlayerPositionUpdate.
	useEffect(() => {
		if (!window.api?.onAnimePositionUpdate) return;
		return window.api.onAnimePositionUpdate(
			({ episodeId: epId, position, duration, completed }) => {
				if (!epId || position === undefined) return;
				const existingEntry = stateRef.current.history[epId] || {};
				const existingDur = duration || existingEntry.duration || 0;
				const computedCompleted =
					typeof completed === 'boolean'
						? completed
						: existingDur > 0 && position / existingDur >= 0.9;
				const progressBucket = Math.floor(Number(position || 0) / 30);
				if (
					positionLogBucketsRef.current[epId] !== progressBucket ||
					computedCompleted
				) {
					positionLogBucketsRef.current[epId] = progressBucket;
					traceAnimeContext('[AnimeContext] Position update', {
						episodeId: epId,
						position: Math.floor(position),
						duration: Math.floor(existingDur),
						completed: computedCompleted,
					});
				}
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

	// ── anime:closed — final history write + next/prev navigation ─────────────
	useEffect(() => {
		if (!window.api?.onAnimeClosed) return;
		const unsub = window.api.onAnimeClosed(
			async ({
				episodeId,
				seriesId,
				season,
				episode,
				position,
				duration,
				action,
			}) => {
				traceAnimeContext('[AnimeContext] Player closed', {
					episodeId,
					seriesId,
					season,
					episode,
					position: Math.floor(position || 0),
					duration: Math.floor(duration || 0),
					action,
				});
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
					await window.api.animeUpdateHistory(entry);
				}

				dispatch({ type: 'SET_PLAYER', payload: initialState.player });

				const cs = stateRef.current;
				const series = cs.library?.series?.find((s) => s.id === seriesId);
				if (series?.episodes?.length) {
					const canonEps = series.episodes.filter(
						(ep) => getEpisodeType(ep) === 'canon',
					);
					if (canonEps.length) {
						// Build merged history (optimistic: include the entry we just wrote)
						const mergedHist = episodeId
							? {
									...cs.history,
									[episodeId]: {
										...(cs.history[episodeId] || {}),
										completed:
											(duration || 0) > 0 &&
											(position || 0) / (duration || 1) >= 0.9,
									},
								}
							: cs.history;
						const allCanonDone = canonEps.every((ep) => {
							const key = getEpisodeHistoryKey(ep);
							return mergedHist[key]?.completed === true;
						});
						if (allCanonDone) {
							dispatch({
								type: 'SET_TOAST',
								payload: {
									message: `${series.name} — all canon episodes watched!`,
									type: 'success',
									id: Date.now(),
								},
							});
						}
					}
				}

				if ((action === 'next' || action === 'prev') && series) {
					const visible = getVisibleEpisodes(series);
					const idx = visible.findIndex((ep) => ep.id === episodeId);
					const target =
						action === 'next' ? visible[idx + 1] : visible[idx - 1];
					if (target && playEpisodeRef.current) {
						setTimeout(() => playEpisodeRef.current(series, target), 600);
					}
				}
			},
		);
		return unsub;
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Actions ───────────────────────────────────────────────────────────────

	const scanLibrary = useCallback(async () => {
		const dirs = stateRef.current.settings?.animeSourceDirs || [];
		if (!dirs.length) {
			showToast(
				'No source directories configured. Go to Anime → Settings.',
				'warning',
			);
			return;
		}
		dispatch({ type: 'SET_LOADING', key: 'scanning', value: true });
		showToast('Scanning anime library…', 'info');
		try {
			const result = await window.api.animeScan(dirs);
			if (result.success) {
				dispatch({ type: 'SET_LIBRARY', payload: result.library });
				showToast(
					`Found ${result.library.totalSeries} series, ${result.library.totalEpisodes} episodes.`,
					'success',
				);
			} else {
				showToast(`Scan failed: ${result.error}`, 'error');
			}
		} catch (err) {
			showToast('Scan error: ' + err.message, 'error');
		} finally {
			dispatch({ type: 'SET_LOADING', key: 'scanning', value: false });
		}
	}, [showToast]);

	const saveSettings = useCallback(
		async (updates) => {
			try {
				const merged = { ...stateRef.current.settings, ...updates };
				await window.api.saveSettings(merged);
				dispatch({ type: 'SET_SETTINGS', payload: merged });
				showToast('Settings saved.', 'success');
			} catch (err) {
				showToast('Failed to save settings: ' + err.message, 'error');
			}
		},
		[showToast],
	);

	/**
	 * Set a single filter toggle for a specific series.
	 * Persists immediately to settings.animeFilters so it survives restart.
	 *
	 * @param {string} seriesId  — e.g. 'naruto'
	 * @param {string} key       — 'canon' | 'mixed' | 'filler'
	 * @param {boolean} value
	 */
	const setFilter = useCallback(async (seriesId, key, value) => {
		dispatch({ type: 'PATCH_FILTER', seriesId, key, value });
		// Persist — read current merged filters from the ref (after dispatch
		// the ref hasn't updated yet, so we build the new value manually)
		const current = stateRef.current.filters[seriesId] || DEFAULT_FILTERS;
		const updated = { ...current, [key]: value };
		const allFilters = { ...stateRef.current.filters, [seriesId]: updated };
		try {
			const merged = { ...stateRef.current.settings, animeFilters: allFilters };
			await window.api.saveSettings(merged);
			dispatch({ type: 'SET_SETTINGS', payload: merged });
		} catch (err) {
			console.error('[AnimeContext] setFilter persist error:', err);
		}
	}, []);

	/**
	 * Get the active filter for a series — returns DEFAULT_FILTERS if not set.
	 */
	const getFilters = useCallback(
		(seriesId) => state.filters[seriesId] || DEFAULT_FILTERS,
		[state.filters],
	);

	/**
	 * Returns the filtered + sorted episode list for a series based on the
	 * active filter state. This is what the episode grid and playlist show.
	 *
	 * @param {object} series  — series object from library
	 * @returns {AnimeEpisode[]}
	 */
	const getVisibleEpisodes = useCallback(
		(series) => {
			if (!series?.episodes) return [];
			const filters = stateRef.current.filters[series.id] || DEFAULT_FILTERS;
			return series.episodes.filter((ep) => {
				const episodeType = getEpisodeType(ep);
				if (episodeType === 'filler') return filters.filler === true;
				if (episodeType === 'mixed') return filters.mixed === true;
				return filters.canon !== false;
			});
			// episodes array is already sorted ascending by episodeNumber from the scanner
		},
		[], // stateRef always current
	);

	/**
	 * Returns the episode to play/resume for a series:
	 * - The furthest in-progress episode (not completed)
	 * - Or the next after the furthest completed episode
	 * - Or the first visible episode if nothing was watched
	 * Only considers visible (filter-passing) episodes.
	 */
	const getNextEpisode = useCallback(
		(series) => {
			const visible = getVisibleEpisodes(series);
			if (!visible.length) return null;

			// Find the furthest episode (by position in visible list) with any history
			let furthestIdx = -1;
			for (let i = 0; i < visible.length; i++) {
				const key = getEpisodeHistoryKey(visible[i]);
				if (stateRef.current.history[key]) furthestIdx = i;
			}

			if (furthestIdx === -1) return visible[0]; // nothing watched yet

			const ep = visible[furthestIdx];
			const key = getEpisodeHistoryKey(ep);
			const hist = stateRef.current.history[key];

			if (!hist?.completed) return ep; // in-progress
			if (furthestIdx + 1 < visible.length) return visible[furthestIdx + 1]; // next ep
			return null; // all done
		},
		[getVisibleEpisodes],
	);

	const playEpisode = useCallback(
		async (series, episode) => {
			if (!window.api?.animeLaunch) return;

			const hist = stateRef.current.history[episode.id];
			const settings = stateRef.current.settings;

			let seekSeconds = 0;
			if (settings?.autoResume !== false) {
				if (hist && !hist.completed && (hist.position || 0) > 30) {
					seekSeconds = hist.position;
				}
			}

			const filters = stateRef.current.filters[series.id] || DEFAULT_FILTERS;

			traceAnimeContext('[AnimeContext] Launch request', {
				seriesId: series.id,
				episodeId: episode.id,
				seekSeconds,
				filters,
			});

			dispatch({
				type: 'SET_PLAYER',
				payload: {
					isOpen: true,
					seriesId: series.id,
					episodeId: episode.id,
					initialSeek: seekSeconds,
				},
			});

			try {
				const result = await window.api.animeLaunch({
					seriesId: series.id,
					episodeId: episode.id,
					filters,
					seekSeconds,
				});
				traceAnimeContext('[AnimeContext] Launch result', {
					seriesId: series.id,
					episodeId: episode.id,
					success: !!result?.success,
					error: result?.error || null,
				});
				if (!result.success) {
					dispatch({ type: 'SET_PLAYER', payload: initialState.player });
					showToast(result.error || 'Failed to launch player.', 'error');
				}
			} catch (err) {
				console.error('[AnimeContext] Launch error:', err);
				dispatch({ type: 'SET_PLAYER', payload: initialState.player });
				showToast('Player error: ' + err.message, 'error');
			}
		},
		[showToast],
	);

	// Keep playEpisodeRef in sync so the once-registered onAnimeClosed listener
	// always calls the current version without stale-closure issues.
	useEffect(() => {
		playEpisodeRef.current = playEpisode;
	}, [playEpisode]);

	const markWatched = useCallback(
		async (episode, watched = true) => {
			const key = getEpisodeHistoryKey(episode);

			if (!watched) {
				dispatch({ type: 'DELETE_HISTORY_ENTRY', key });
				if (window.api?.animeDeleteHistory) {
					await window.api.animeDeleteHistory(key);
				}
				showToast('Marked as unwatched', 'success');
				return;
			}

			const existing = stateRef.current.history[key] || {};
			const entry = {
				...existing,
				key,
				seriesId: episode.seriesId,
				position: Math.floor(existing.duration || existing.position || 0),
				duration: Math.floor(existing.duration || 0),
				completed: true,
				lastWatched: new Date().toISOString(),
			};

			dispatch({ type: 'PATCH_HISTORY', payload: entry });
			if (window.api?.animeUpdateHistory) {
				await window.api.animeUpdateHistory(entry);
			}
			showToast('Marked as watched', 'success');
		},
		[showToast],
	);

	const markEpisodesWatched = useCallback(
		async (episodes, watched = true) => {
			if (!Array.isArray(episodes) || episodes.length === 0) return;

			if (!watched) {
				for (const episode of episodes) {
					const key = getEpisodeHistoryKey(episode);
					dispatch({ type: 'DELETE_HISTORY_ENTRY', key });
					if (window.api?.animeDeleteHistory) {
						await window.api.animeDeleteHistory(key);
					}
				}
				showToast('Marked all as unwatched', 'success');
				return;
			}

			for (const episode of episodes) {
				const key = getEpisodeHistoryKey(episode);
				const existing = stateRef.current.history[key] || {};
				const entry = {
					...existing,
					key,
					seriesId: episode.seriesId,
					position: Math.floor(existing.duration || existing.position || 0),
					duration: Math.floor(existing.duration || 0),
					completed: true,
					lastWatched: new Date().toISOString(),
				};

				dispatch({ type: 'PATCH_HISTORY', payload: entry });
				if (window.api?.animeUpdateHistory) {
					await window.api.animeUpdateHistory(entry);
				}
			}

			showToast('Marked all as watched', 'success');
		},
		[showToast],
	);

	const getSeriesWatchedCount = useCallback((series) => {
		const episodes = series?.episodes || [];
		const watched = episodes.filter((episode) => {
			const hist = stateRef.current.history[getEpisodeHistoryKey(episode)];
			return hist?.completed === true;
		}).length;
		return { watched, total: episodes.length };
	}, []);

	const deleteHistoryEntry = useCallback(async (key) => {
		dispatch({ type: 'DELETE_HISTORY_ENTRY', key });
		if (window.api?.animeDeleteHistory) {
			await window.api.animeDeleteHistory(key);
		}
	}, []);

	const saveHistoryEntry = useCallback(async (entry) => {
		if (!window.api?.animeSaveHistoryEntry) return { success: false };
		const result = await window.api.animeSaveHistoryEntry(entry);
		if (result?.success) {
			dispatch({ type: 'PATCH_HISTORY', payload: entry });
		}
		return result;
	}, []);

	const patchMetadataEntry = useCallback(async (seriesId, updates) => {
		if (!window.api?.animePatchMetadataEntry) return { success: false };
		const result = await window.api.animePatchMetadataEntry(seriesId, updates);
		if (result?.success && result.metadata) {
			dispatch({
				type: 'PATCH_METADATA',
				payload: { id: seriesId, ...result.metadata },
			});
		}
		return result;
	}, []);

	const clearSeriesHistory = useCallback(
		async (seriesId) => {
			if (!window.api) return;
			// Wipe in-memory in one shot
			dispatch({ type: 'CLEAR_SERIES_HISTORY', seriesId });
			// Single atomic disk write — mirrors TV's history:clear-series
			if (window.api.animeClearSeriesHistory) {
				await window.api.animeClearSeriesHistory(seriesId);
			}
			showToast('Watch progress reset', 'success');
		},
		[showToast],
	);

	/**
	 * Fetch and store metadata for a single anime series.
	 */
	const fetchMetadata = useCallback(async (seriesId, seriesName) => {
		if (!window.api?.animeFetchMetadata) return;
		dispatch({ type: 'SET_LOADING', key: 'metadata', value: true });
		try {
			const result = await window.api.animeFetchMetadata({
				seriesId,
				seriesName,
			});
			if (result.success && result.meta) {
				dispatch({
					type: 'PATCH_METADATA',
					payload: { id: seriesId, ...result.meta },
				});
			}
			return result;
		} catch (err) {
			console.error('[AnimeContext] fetchMetadata error:', err);
			return { success: false, error: err.message };
		} finally {
			dispatch({ type: 'SET_LOADING', key: 'metadata', value: false });
		}
	}, []);

	/**
	 * Fetch metadata for all series that are missing it, sequentially.
	 */
	const fetchAllMetadata = useCallback(async () => {
		const series = stateRef.current.library?.series || [];
		const meta = stateRef.current.metadata;
		const missing = series.filter(
			(s) => !meta[s.id]?.anilistId && !meta[s.id]?.malId,
		);
		if (!missing.length) {
			showToast('All series already have metadata.', 'info');
			return;
		}
		showToast(`Fetching metadata for ${missing.length} series…`, 'info');
		let done = 0;
		for (const s of missing) {
			await fetchMetadata(s.id, s.name);
			done++;
		}
		showToast(`Metadata fetched for ${done} series.`, 'success');
	}, [fetchMetadata, showToast]);

	/**
	 * Toggle a series in the animeFavorites list.
	 */
	const toggleFavorite = useCallback(async (seriesId) => {
		const current = stateRef.current.favorites || [];
		const next = current.includes(seriesId)
			? current.filter((id) => id !== seriesId)
			: [...current, seriesId];
		dispatch({ type: 'SET_FAVORITES', payload: next });
		try {
			const merged = {
				...stateRef.current.settings,
				animeFavorites: next,
			};
			await window.api.saveSettings(merged);
			dispatch({ type: 'SET_SETTINGS', payload: merged });
		} catch (err) {
			console.error('[AnimeContext] toggleFavorite error:', err);
		}
	}, []);

	/**
	 * Persist custom shelf rows to settings.
	 */
	const saveCustomRows = useCallback(async (rows) => {
		dispatch({ type: 'SET_CUSTOM_ROWS', payload: rows });
		try {
			const merged = {
				...stateRef.current.settings,
				animeCustomRows: rows,
			};
			await window.api.saveSettings(merged);
			dispatch({ type: 'SET_SETTINGS', payload: merged });
		} catch (err) {
			console.error('[AnimeContext] saveCustomRows error:', err);
		}
	}, []);

	// ── Expose context value ──────────────────────────────────────────────────
	const allSeries = state.library?.series || [];

	const value = {
		...state,
		allSeries,
		showToast,
		scanLibrary,
		saveSettings,
		setFilter,
		getFilters,
		getVisibleEpisodes,
		getNextEpisode,
		playEpisode,
		markWatched,
		markEpisodesWatched,
		getSeriesWatchedCount,
		deleteHistoryEntry,
		saveHistoryEntry,
		patchMetadataEntry,
		clearSeriesHistory,
		fetchMetadata,
		fetchAllMetadata,
		toggleFavorite,
		saveCustomRows,
	};

	return (
		<AnimeContext.Provider value={value}>{children}</AnimeContext.Provider>
	);
}

export function useAnime() {
	const ctx = useContext(AnimeContext);
	if (!ctx) throw new Error('useAnime must be used inside <AnimeProvider>');
	return ctx;
}
