import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useCallback,
	useRef,
} from 'react';

const MoviesContext = createContext(null);

const initialState = {
	settings: null,
	library: null, // { movies: [], totalMovies, scannedAt }
	metadata: {}, // { [movieId]: { title, year, overview, ... } }
	history: {}, // { [movieId]: { position, duration, completed, ... } }
	customRows: [],
	loading: { library: false, scanning: false, metadata: false },
	toast: null,
	initialized: false,
	player: {
		isOpen: false,
		movieId: null,
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
		case 'SET_CUSTOM_ROWS':
			return { ...state, customRows: action.payload };
		case 'PATCH_HISTORY':
			return {
				...state,
				history: { ...state.history, [action.payload.key]: action.payload },
			};
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

export function MoviesProvider({ children }) {
	const [state, dispatch] = useReducer(reducer, initialState);
	const toastTimer = useRef(null);
	const stateRef = useRef(state);

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	// ── Toast ─────────────────────────────────────────────────────────────────
	const showToast = useCallback((message, type = 'info') => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		dispatch({ type: 'SET_TOAST', payload: { message, type } });
		toastTimer.current = setTimeout(
			() => dispatch({ type: 'SET_TOAST', payload: null }),
			3500,
		);
	}, []);

	// ── Init: load everything on mount ────────────────────────────────────────
	useEffect(() => {
		async function init() {
			try {
				const [settings, library, metadata, history] = await Promise.all([
					window.api.getSettings(),
					window.api.moviesGetLibrary(),
					window.api.moviesGetMetadata(),
					window.api.moviesGetHistory(),
				]);
				dispatch({ type: 'SET_SETTINGS', payload: settings });
				if (library) dispatch({ type: 'SET_LIBRARY', payload: library });
				if (metadata) dispatch({ type: 'SET_METADATA', payload: metadata });
				if (history) dispatch({ type: 'SET_HISTORY', payload: history });
				if (settings?.moviesCustomRows) {
					dispatch({
						type: 'SET_CUSTOM_ROWS',
						payload: settings.moviesCustomRows,
					});
				}
				dispatch({ type: 'SET_INITIALIZED' });
			} catch (err) {
				console.error('[MoviesContext] Init error:', err);
				dispatch({ type: 'SET_INITIALIZED' });
			}
		}
		init();
	}, []);

	// ── Player closed listener ─────────────────────────────────────────────────
	useEffect(() => {
		const unsub = window.api.onMoviesClosed(
			({ movieId, position, duration }) => {
				dispatch({
					type: 'PATCH_HISTORY',
					payload: {
						key: movieId,
						position,
						duration,
						completed: duration > 0 && position / duration >= 0.9,
						lastWatched: new Date().toISOString(),
					},
				});
				dispatch({ type: 'SET_PLAYER', payload: initialState.player });
			},
		);
		return unsub;
	}, []);

	// ── Actions ───────────────────────────────────────────────────────────────

	const fetchMetadata = useCallback(async (movieId, movieName, year) => {
		const settings = stateRef.current.settings;
		if (!window.api?.moviesFetchMetadata || !settings?.tmdbApiKey) return null;
		try {
			dispatch({ type: 'SET_LOADING', key: 'metadata', value: true });
			const res = await window.api.moviesFetchMetadata({
				movieId,
				movieName,
				year,
				apiKey: settings.tmdbApiKey,
			});
			if (res?.success && res.metadata) {
				dispatch({ type: 'PATCH_METADATA', payload: res.metadata });
				return res.metadata;
			}
			return null;
		} catch (err) {
			console.error('[MoviesContext] fetchMetadata error:', err);
			return null;
		} finally {
			dispatch({ type: 'SET_LOADING', key: 'metadata', value: false });
		}
	}, []);

	const scanLibrary = useCallback(async () => {
		const settings = stateRef.current.settings;
		const dirs = settings?.moviesSourceDirs || [];
		if (!dirs.length) {
			showToast(
				'No source directories configured. Go to Movies → Settings.',
				'warning',
			);
			return;
		}
		dispatch({ type: 'SET_LOADING', key: 'scanning', value: true });
		try {
			const result = await window.api.moviesScan(dirs);
			if (result.success) {
				dispatch({ type: 'SET_LIBRARY', payload: result.library });
				showToast(
					`Found ${result.library.totalMovies} movie${result.library.totalMovies !== 1 ? 's' : ''}.`,
					'success',
				);

				// Auto-fetch metadata for new movies
				if (settings?.tmdbApiKey && result.library?.movies?.length) {
					const currentMeta = stateRef.current.metadata;
					const needsMeta = result.library.movies.filter(
						(m) => !currentMeta[m.id]?.tmdbId,
					);
					if (needsMeta.length) {
						for (const movie of needsMeta) {
							await fetchMetadata(movie.id, movie.name, movie.year);
						}
					}
				}
			} else {
				showToast(`Scan failed: ${result.error}`, 'error');
			}
		} catch (err) {
			showToast('Scan error: ' + err.message, 'error');
		} finally {
			dispatch({ type: 'SET_LOADING', key: 'scanning', value: false });
		}
	}, [fetchMetadata, showToast]);

	const saveSettings = useCallback(
		async (updates) => {
			try {
				const merged = { ...stateRef.current.settings, ...updates };
				await window.api.saveSettings(merged);
				dispatch({
					type: 'SET_SETTINGS',
					payload: merged,
				});
				showToast('Settings saved.', 'success');
			} catch (err) {
				showToast('Failed to save settings: ' + err.message, 'error');
			}
		},
		[showToast],
	);

	const saveCustomRows = useCallback(
		async (rows) => {
			dispatch({ type: 'SET_CUSTOM_ROWS', payload: rows });
			await saveSettings({ moviesCustomRows: rows });
		},
		[saveSettings],
	);

	const playMovie = useCallback(
		async (movie, seekSeconds = 0) => {
			dispatch({
				type: 'SET_PLAYER',
				payload: { isOpen: true, movieId: movie.id, initialSeek: seekSeconds },
			});
			try {
				const result = await window.api.moviesLaunch({
					movieId: movie.id,
					filePath: movie.filePath,
					seekSeconds,
				});
				if (!result.success) {
					dispatch({ type: 'SET_PLAYER', payload: initialState.player });
					showToast(result.error || 'Failed to launch player.', 'error');
				}
			} catch (err) {
				dispatch({ type: 'SET_PLAYER', payload: initialState.player });
				showToast('Player error: ' + err.message, 'error');
			}
		},
		[showToast],
	);

	const value = {
		...state,
		showToast,
		scanLibrary,
		saveSettings,
		saveCustomRows,
		fetchMetadata,
		playMovie,
		deleteHistoryEntry: useCallback(async (key) => {
			if (window.api?.moviesDeleteHistory) {
				await window.api.moviesDeleteHistory(key);
			}
			dispatch({ type: 'DELETE_HISTORY_ENTRY', key });
		}, []),
	};

	return (
		<MoviesContext.Provider value={value}>{children}</MoviesContext.Provider>
	);
}

export function useMovies() {
	const ctx = useContext(MoviesContext);
	if (!ctx) throw new Error('useMovies must be used inside <MoviesProvider>');
	return ctx;
}
