import React, { useState, useEffect, useRef, useCallback } from 'react';
import AnimeOverlayTitleBar from './AnimeOverlayTitleBar';
import AnimeOverlayControls from './AnimeOverlayControls';
import AnimeOverlayPlaylist from './AnimeOverlayPlaylist';

const EMPTY_PLAYBACK_DETAILS = {
	audioTracks: [],
	subtitleTracks: [{ id: -1, label: 'Off' }],
	selectedAudioTrackId: null,
	selectedSubtitleTrackId: -1,
	aspectRatio: 'default',
	aspectRatioOptions: [],
};

function normalizeTrackLabel(label) {
	return String(label || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function detectTrackLanguage(label) {
	const normalized = normalizeTrackLabel(label);
	if (/(^| )(japanese|jpn|jap|ja)( |$)/.test(normalized)) return 'japanese';
	if (/(^| )(english|eng|en)( |$)/.test(normalized)) return 'english';
	return null;
}

function createTrackPreference(track) {
	if (!track) return null;
	return {
		id: Number(track.id),
		label: normalizeTrackLabel(track.label),
		language: detectTrackLanguage(track.label),
	};
}

function findPreferredTrack(tracks, preference, { allowOff = false } = {}) {
	if (!preference || !Array.isArray(tracks) || tracks.length === 0) return null;
	const candidates = allowOff
		? tracks
		: tracks.filter((track) => track.id !== -1);
	if (candidates.length === 0) return null;

	if (preference.id === -1) {
		return candidates.find((track) => Number(track.id) === -1) || null;
	}

	const exactMatch = candidates.find(
		(track) => normalizeTrackLabel(track.label) === preference.label,
	);
	if (exactMatch) return exactMatch;

	if (preference.language) {
		return (
			candidates.find(
				(track) => detectTrackLanguage(track.label) === preference.language,
			) || null
		);
	}

	return null;
}

function traceOverlay(label, data) {
	try {
		console.log(`${label} ${JSON.stringify(data)}`);
	} catch {
		console.log(label);
	}
}

export default function AnimePlayerOverlay() {
	const [vlcState, setVlcState] = useState('stopped');
	const [position, setPosition] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(256);
	const [playbackDetails, setPlaybackDetails] = useState(
		EMPTY_PLAYBACK_DETAILS,
	);

	const [allSeasons, setAllSeasons] = useState([]);
	// eslint-disable-next-line
	const [mode, setMode] = useState('tv');
	const [currentEpisodeId, setCurrentEpisodeId] = useState(null);
	const [currentSeason, setCurrentSeason] = useState(null);
	const [seriesName, setSeriesName] = useState('');
	const [filterDesc, setFilterDesc] = useState('');
	const [history, setHistory] = useState({});

	const [transitioning, setTransitioning] = useState(false);

	const [showControls, setShowControls] = useState(false);
	const [showPlaylist, setShowPlaylist] = useState(false);
	const [showTitleBar, setShowTitleBar] = useState(false);
	const [isControlMenuOpen, setIsControlMenuOpen] = useState(false);

	const positionRef = useRef(0);
	const durationRef = useRef(0);
	const savedVolumeRef = useRef(256);
	const volumeRef = useRef(256);
	const hideTimerRef = useRef(null);
	const currentEpisodeIdRef = useRef(null);
	const pendingEpisodeIdRef = useRef(null);
	const transitioningRef = useRef(false);
	const seekTargetRef = useRef(null);
	const seekTimerRef = useRef(null);
	const lastActionTimesRef = useRef(new Map());
	const zonesActiveRef = useRef({ top: false, bottom: false, right: false });
	const currentSeasonRef = useRef(null);
	const prevEpisodeIdRef = useRef(null);
	const prevSeasonRef = useRef(null);
	const preloadedNextRef = useRef(false);
	const autoAdvanceArmedRef = useRef(false);
	const manualStopRef = useRef(false);
	const lastVlcStateRef = useRef('stopped');
	const lastAutoAdvanceFromEpisodeRef = useRef(null);
	const historyRef = useRef({});
	const playbackDetailsReadyRef = useRef(false);
	const playbackDetailsRefreshInFlightRef = useRef(false);
	const lastLoggedStateRef = useRef({ episodeId: null, state: null });
	const preferredAudioTrackRef = useRef(null);
	const preferredSubtitleTrackRef = useRef(
		createTrackPreference({ id: -1, label: 'Off' }),
	);
	const pendingTrackPreferenceApplyRef = useRef(false);
	const desiredStateRef = useRef({
		playState: 'paused',
		volume: 256,
	});
	const driftCountRef = useRef({ playState: 0, volume: 0 });

	useEffect(() => {
		positionRef.current = position;
	}, [position]);
	useEffect(() => {
		durationRef.current = duration;
	}, [duration]);
	useEffect(() => {
		volumeRef.current = volume;
	}, [volume]);
	useEffect(() => {
		currentEpisodeIdRef.current = currentEpisodeId;
	}, [currentEpisodeId]);
	useEffect(() => {
		transitioningRef.current = transitioning;
		if (transitioning) {
			driftCountRef.current.playState = 0;
			driftCountRef.current.volume = 0;
		}
	}, [transitioning]);
	useEffect(() => {
		currentSeasonRef.current = currentSeason;
	}, [currentSeason]);
	useEffect(() => {
		historyRef.current = history;
	}, [history]);

	const flatEpisodes = allSeasons.flatMap((season) => season.episodes || []);

	const applyPlaybackDetails = useCallback((details) => {
		if (!details) return;
		setPlaybackDetails((prev) => ({ ...prev, ...details }));
		playbackDetailsReadyRef.current = true;
	}, []);

	const rememberTrackPreferences = useCallback((details, options = {}) => {
		if (!details) return;
		if (options.audio) {
			const selectedAudio = (details.audioTracks || []).find(
				(track) => track.id === details.selectedAudioTrackId,
			);
			preferredAudioTrackRef.current = createTrackPreference(selectedAudio);
		}
		if (options.subtitle) {
			const selectedSubtitle = (details.subtitleTracks || []).find(
				(track) => track.id === details.selectedSubtitleTrackId,
			);
			preferredSubtitleTrackRef.current = createTrackPreference(
				selectedSubtitle || { id: -1, label: 'Off' },
			);
		}
	}, []);

	const applyPreferredTrackSelections = useCallback(async (details) => {
		let nextDetails = details;
		try {
			const audioPreference = preferredAudioTrackRef.current;
			if (audioPreference) {
				const preferredAudio = findPreferredTrack(
					nextDetails.audioTracks,
					audioPreference,
				);
				if (
					preferredAudio &&
					preferredAudio.id !== nextDetails.selectedAudioTrackId
				) {
					const audioResult = await window.overlayApi?.setAudioTrack?.(
						preferredAudio.id,
					);
					if (audioResult?.success && audioResult.details) {
						nextDetails = audioResult.details;
					}
				}
			}

			const subtitlePreference = preferredSubtitleTrackRef.current;
			if (subtitlePreference) {
				const preferredSubtitle = findPreferredTrack(
					nextDetails.subtitleTracks,
					subtitlePreference,
					{ allowOff: true },
				);
				if (
					preferredSubtitle &&
					preferredSubtitle.id !== nextDetails.selectedSubtitleTrackId
				) {
					const subtitleResult = await window.overlayApi?.setSubtitleTrack?.(
						preferredSubtitle.id,
					);
					if (subtitleResult?.success && subtitleResult.details) {
						nextDetails = subtitleResult.details;
					}
				}
			}
		} finally {
			pendingTrackPreferenceApplyRef.current = false;
		}
		return nextDetails;
	}, []);

	const refreshPlaybackDetails = useCallback(async () => {
		if (!window.overlayApi?.getPlaybackDetails) return null;
		if (playbackDetailsRefreshInFlightRef.current) return null;
		playbackDetailsRefreshInFlightRef.current = true;
		try {
			const result = await window.overlayApi.getPlaybackDetails();
			if (result?.success && result.details) {
				let details = result.details;
				if (pendingTrackPreferenceApplyRef.current) {
					details = await applyPreferredTrackSelections(details);
				}
				applyPlaybackDetails(details);
				return details;
			}
			return null;
		} finally {
			playbackDetailsRefreshInFlightRef.current = false;
		}
	}, [applyPlaybackDetails, applyPreferredTrackSelections]);

	const runPlaybackDetailAction = useCallback(
		async (runner, options = {}) => {
			const result = await runner?.();
			if (result?.success && result.details) {
				rememberTrackPreferences(result.details, options);
				applyPlaybackDetails(result.details);
				return result.details;
			}
			if (result?.success) {
				const details = await refreshPlaybackDetails();
				rememberTrackPreferences(details, options);
				return details;
			}
			return null;
		},
		[applyPlaybackDetails, refreshPlaybackDetails, rememberTrackPreferences],
	);

	useEffect(() => {
		window.history.pushState({ overlayGuard: true }, '');
		const onPopState = () => {
			window.history.pushState({ overlayGuard: true }, '');
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	}, [refreshPlaybackDetails]);

	useEffect(() => {
		for (const el of [document.documentElement, document.body]) {
			el.style.setProperty('background', 'transparent', 'important');
			el.style.setProperty('margin', '0', 'important');
			el.style.setProperty('padding', '0', 'important');
		}
		const root = document.getElementById('root');
		if (root) root.style.setProperty('background', 'transparent', 'important');
	}, []);

	const handlePlayEpisode = useCallback(async (targetEp, opts = {}) => {
		if (!window.overlayApi) return;
		if (transitioningRef.current) return;
		if (targetEp.episodeId === currentEpisodeIdRef.current) return;

		manualStopRef.current = false;
		autoAdvanceArmedRef.current = false;

		clearTimeout(seekTimerRef.current);
		seekTargetRef.current = null;

		prevEpisodeIdRef.current = currentEpisodeIdRef.current;
		prevSeasonRef.current = currentSeasonRef.current;

		const epHistory = historyRef.current[targetEp.episodeId];
		const seekSeconds =
			epHistory && !epHistory.completed && (epHistory.position || 0) > 10
				? epHistory.position
				: 0;

		traceOverlay('[AnimePlayerOverlay] Switch request', {
			fromEpisodeId: currentEpisodeIdRef.current,
			toEpisodeId: targetEp.episodeId,
			season: targetEp.season,
			episode: targetEp.episode,
			seekSeconds,
			forceCompletePrevious: !!opts.forceCompletePrevious,
			prevPosition: Math.floor(positionRef.current),
			prevDuration: Math.floor(durationRef.current),
		});

		pendingEpisodeIdRef.current = targetEp.episodeId;
		setCurrentEpisodeId(targetEp.episodeId);
		setCurrentSeason(targetEp.season);
		setTransitioning(true);

		window.overlayApi.sendCommand('pl_pause');

		const forceCompletePrevious = !!opts.forceCompletePrevious;
		const prevEpId = prevEpisodeIdRef.current;
		const completedPos = forceCompletePrevious
			? durationRef.current
			: positionRef.current;
		const completedDur = durationRef.current;
		if (prevEpId && completedDur > 0 && completedPos / completedDur >= 0.9) {
			setHistory((prev) => ({
				...prev,
				[prevEpId]: {
					...(prev[prevEpId] || {}),
					position: Math.floor(completedPos),
					duration: Math.floor(completedDur),
					completed: true,
				},
			}));
		}
		const prevPosToSave = forceCompletePrevious
			? durationRef.current
			: positionRef.current;
		const prevDurToSave = forceCompletePrevious
			? durationRef.current
			: durationRef.current;

		window.overlayApi.animePlayEpisode({
			episodeId: targetEp.episodeId,
			filePath: targetEp.filePath,
			seriesId: targetEp.seriesId,
			season: targetEp.season,
			episode: targetEp.episode,
			seekSeconds,
			prevPosition: prevPosToSave,
			prevDuration: prevDurToSave,
			prevEpisodeId: prevEpisodeIdRef.current,
		});
	}, []);

	const seekDispatch = useCallback((target) => {
		clearTimeout(seekTimerRef.current);
		seekTimerRef.current = setTimeout(() => {
			window.overlayApi?.sendCommand('seek', target);
		}, 80);
	}, []);

	const dispatchAction = useCallback(
		(actionId) => {
			if (!window.overlayApi) return;
			traceOverlay('[AnimePlayerOverlay] Action', {
				actionId,
				episodeId: currentEpisodeIdRef.current,
				position: Math.floor(positionRef.current),
				duration: Math.floor(durationRef.current),
			});
			switch (actionId) {
				case 'play_pause':
					desiredStateRef.current.playState =
						desiredStateRef.current.playState === 'playing'
							? 'paused'
							: 'playing';
					driftCountRef.current.playState = 0;
					window.overlayApi.sendCommand('pl_pause');
					break;
				case 'stop':
					manualStopRef.current = true;
					autoAdvanceArmedRef.current = false;
					desiredStateRef.current.playState = 'stopped';
					driftCountRef.current.playState = 0;
					window.overlayApi.sendCommand('pl_stop');
					break;
				case 'seek_fwd_10': {
					const base = seekTargetRef.current ?? positionRef.current;
					const target = Math.max(0, Math.min(durationRef.current, base + 10));
					seekTargetRef.current = target;
					seekDispatch(target);
					break;
				}
				case 'seek_back_10': {
					const base = seekTargetRef.current ?? positionRef.current;
					const target = Math.max(0, Math.min(durationRef.current, base - 10));
					seekTargetRef.current = target;
					seekDispatch(target);
					break;
				}
				case 'seek_fwd_60': {
					const base = seekTargetRef.current ?? positionRef.current;
					const target = Math.max(0, Math.min(durationRef.current, base + 60));
					seekTargetRef.current = target;
					seekDispatch(target);
					break;
				}
				case 'seek_back_60': {
					const base = seekTargetRef.current ?? positionRef.current;
					const target = Math.max(0, Math.min(durationRef.current, base - 60));
					seekTargetRef.current = target;
					seekDispatch(target);
					break;
				}
				case 'seek_fwd_180': {
					const base = seekTargetRef.current ?? positionRef.current;
					const target = Math.max(0, Math.min(durationRef.current, base + 180));
					seekTargetRef.current = target;
					seekDispatch(target);
					break;
				}
				case 'seek_back_180': {
					const base = seekTargetRef.current ?? positionRef.current;
					const target = Math.max(0, Math.min(durationRef.current, base - 180));
					seekTargetRef.current = target;
					seekDispatch(target);
					break;
				}
				case 'vol_up': {
					const newVol = Math.min(512, volumeRef.current + 26);
					desiredStateRef.current.volume = newVol;
					driftCountRef.current.volume = 0;
					window.overlayApi.sendCommand('volume', newVol);
					break;
				}
				case 'vol_down': {
					const newVol = Math.max(0, volumeRef.current - 26);
					desiredStateRef.current.volume = newVol;
					driftCountRef.current.volume = 0;
					window.overlayApi.sendCommand('volume', newVol);
					break;
				}
				case 'mute':
					if (volumeRef.current > 0) {
						savedVolumeRef.current = volumeRef.current;
						desiredStateRef.current.volume = 0;
						window.overlayApi.sendCommand('volume', 0);
					} else {
						desiredStateRef.current.volume = savedVolumeRef.current || 256;
						window.overlayApi.sendCommand(
							'volume',
							savedVolumeRef.current || 256,
						);
					}
					driftCountRef.current.volume = 0;
					break;
				case 'fullscreen':
					window.overlayApi.close();
					break;
				default:
					break;
			}
		},
		[seekDispatch],
	);

	const throttledDispatch = useCallback(
		(actionId, minMs) => {
			const last = lastActionTimesRef.current.get(actionId) || 0;
			const now = Date.now();
			if (now - last < minMs) return;
			lastActionTimesRef.current.set(actionId, now);
			dispatchAction(actionId);
		},
		[dispatchAction],
	);

	useEffect(() => {
		if (!window.overlayApi) return;

		const applyInit = (data) => {
			if (!data) return;
			const episodeCount = (data.allSeasons || []).reduce(
				(total, seasonData) => total + (seasonData.episodes || []).length,
				0,
			);
			traceOverlay('[AnimePlayerOverlay] Init', {
				currentEpisodeId: data.currentEpisodeId ?? null,
				season: data.season ?? null,
				episodeCount,
				filterDesc: data.filterDesc || '',
				initialSeek: data.initialSeek || 0,
			});
			setAllSeasons(data.allSeasons || []);
			setMode(data.mode || 'tv');
			setCurrentEpisodeId(data.currentEpisodeId ?? null);
			setSeriesName(data.seriesName || '');
			setFilterDesc(data.filterDesc || '');
			setCurrentSeason(data.season ?? null);
			setPlaybackDetails(EMPTY_PLAYBACK_DETAILS);
			pendingEpisodeIdRef.current = null;
			setPosition(0);
			setDuration(0);
			if (data.history) setHistory(data.history);
			desiredStateRef.current.playState = 'playing';
			playbackDetailsReadyRef.current = false;
			pendingTrackPreferenceApplyRef.current = true;
			driftCountRef.current.playState = 0;
			driftCountRef.current.volume = 0;
		};

		const cleanInit = window.overlayApi.onInit(applyInit);
		window.overlayApi.getInit().then(applyInit);

		const cleanState = window.overlayApi.onStateUpdate((update) => {
			const expectedEpisodeId = transitioningRef.current
				? pendingEpisodeIdRef.current
				: currentEpisodeIdRef.current;
			if (
				update.episodeId &&
				expectedEpisodeId &&
				update.episodeId !== expectedEpisodeId
			) {
				return;
			}

			if (update.position !== undefined) {
				setPosition(update.position);
				if (
					seekTargetRef.current !== null &&
					Math.abs(update.position - seekTargetRef.current) < 5
				) {
					seekTargetRef.current = null;
				}
			}
			if (update.duration !== undefined && update.duration > 0)
				setDuration(update.duration);
			if (update.state !== undefined) setVlcState(update.state);
			if (update.volume !== undefined && update.volume >= 0)
				setVolume(update.volume);
			if (
				!playbackDetailsReadyRef.current &&
				((update.duration || 0) > 0 || update.state === 'playing')
			) {
				refreshPlaybackDetails();
			}

			if (transitioningRef.current || !window.overlayApi) return;

			const desired = desiredStateRef.current;
			const vlcActual = update.state;

			if (vlcActual && vlcActual !== 'stopped') {
				const desiredPlaying = desired.playState === 'playing';
				const actuallyPlaying = vlcActual === 'playing';

				if (desiredPlaying !== actuallyPlaying) {
					driftCountRef.current.playState += 1;
					if (driftCountRef.current.playState >= 2) {
						driftCountRef.current.playState = 0;
						window.overlayApi.sendCommand('pl_pause');
					}
				} else {
					driftCountRef.current.playState = 0;
				}
			}

			if (update.volume !== undefined) {
				const volDiff = Math.abs(update.volume - desired.volume);
				if (volDiff > 5) {
					driftCountRef.current.volume += 1;
					if (driftCountRef.current.volume >= 2) {
						driftCountRef.current.volume = 0;
						window.overlayApi.sendCommand('volume', desired.volume);
					}
				} else {
					driftCountRef.current.volume = 0;
				}
			}
		});

		const cleanEpChanged = window.overlayApi.onEpisodeChanged?.((data) => {
			traceOverlay('[AnimePlayerOverlay] Episode changed', {
				currentEpisodeId: data.currentEpisodeId,
				season: data.season,
			});
			setCurrentEpisodeId(data.currentEpisodeId);
			setCurrentSeason(data.season);
			setPlaybackDetails(EMPTY_PLAYBACK_DETAILS);
			pendingEpisodeIdRef.current = null;
			setPosition(0);
			setDuration(0);
			setTransitioning(false);
			preloadedNextRef.current = false;
			autoAdvanceArmedRef.current = false;
			manualStopRef.current = false;
			lastAutoAdvanceFromEpisodeRef.current = null;
			setHistory((prev) => ({ ...prev }));
			desiredStateRef.current.playState = 'playing';
			playbackDetailsReadyRef.current = false;
			pendingTrackPreferenceApplyRef.current = true;
			driftCountRef.current.playState = 0;
			driftCountRef.current.volume = 0;
		});

		const cleanEpisodeError = window.overlayApi.onEpisodeError?.((data) => {
			setCurrentEpisodeId(prevEpisodeIdRef.current);
			setCurrentSeason(prevSeasonRef.current);
			pendingEpisodeIdRef.current = null;
			setTransitioning(false);
			console.error(
				'[AnimePlayerOverlay] Episode switch failed:',
				data.message,
			);
			desiredStateRef.current.playState = 'playing';
			driftCountRef.current.playState = 0;
		});

		const cleanHistoryPatch = window.overlayApi.onStateUpdate((update) => {
			const expectedEpisodeId = transitioningRef.current
				? pendingEpisodeIdRef.current
				: currentEpisodeIdRef.current;
			if (
				update.episodeId &&
				expectedEpisodeId &&
				update.episodeId !== expectedEpisodeId
			) {
				return;
			}

			if (update.episodeId && update.position !== undefined) {
				setHistory((prev) => ({
					...prev,
					[update.episodeId]: {
						...(prev[update.episodeId] || {}),
						position: update.position,
						duration: update.duration || prev[update.episodeId]?.duration || 0,
					},
				}));
			}
		});

		return () => {
			cleanInit?.();
			cleanState?.();
			cleanEpChanged?.();
			cleanHistoryPatch?.();
			cleanEpisodeError?.();
		};
	}, [refreshPlaybackDetails]);

	useEffect(() => {
		const last = lastLoggedStateRef.current;
		if (last.episodeId === currentEpisodeId && last.state === vlcState) return;
		traceOverlay('[AnimePlayerOverlay] Playback state', {
			episodeId: currentEpisodeId,
			state: vlcState,
			position: Math.floor(position),
			duration: Math.floor(duration),
			transitioning,
		});
		lastLoggedStateRef.current = {
			episodeId: currentEpisodeId,
			state: vlcState,
		};
	}, [currentEpisodeId, duration, position, transitioning, vlcState]);

	useEffect(() => {
		if (!window.overlayApi?.onCursorPosition) return;
		const clean = window.overlayApi.onCursorPosition(({ x, y }) => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const zones = zonesActiveRef.current;

			const wantsTop = y < 50;
			const staysTop = y < 90;
			const wantsBottom = y > h - 120;
			const staysBottom = y > h - 160;
			const wantsRight = x > w - 340;
			const staysRight = x > w - 400;

			let newTop = zones.top ? staysTop : false;
			let newBottom = zones.bottom ? staysBottom : false;
			let newRight = zones.right ? staysRight : false;
			if (isControlMenuOpen) newBottom = true;

			if (!newTop && !newBottom && !newRight && !isControlMenuOpen) {
				if (wantsBottom) newBottom = true;
				else if (wantsTop) newTop = true;
				else if (wantsRight) newRight = true;
			}

			if (newTop !== zones.top) {
				zones.top = newTop;
				setShowTitleBar(newTop);
			}
			if (newBottom !== zones.bottom) {
				zones.bottom = newBottom;
				setShowControls(newBottom);
			}
			if (newRight !== zones.right) {
				zones.right = newRight;
				setShowPlaylist(newRight);
			}

			const inAny = newTop || newBottom || newRight || isControlMenuOpen;
			if (inAny) {
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = setTimeout(() => {
					zones.top = zones.bottom = zones.right = false;
					setShowTitleBar(false);
					setShowControls(false);
					setShowPlaylist(false);
				}, 3000);
			} else {
				clearTimeout(hideTimerRef.current);
			}
		});

		return () => {
			clean?.();
			clearTimeout(hideTimerRef.current);
		};
	}, [isControlMenuOpen]);

	useEffect(() => {
		window.overlayApi?.setUIActive?.(
			showControls || showPlaylist || showTitleBar,
		);
	}, [showControls, showPlaylist, showTitleBar]);

	useEffect(() => {
		function onKeyDown(e) {
			if (!window.overlayApi) return;
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
				return;
			if (vlcState === 'stopped' && !['f', 'F', 'Escape'].includes(e.key))
				return;
			if (transitioningRef.current) return;
			switch (e.key) {
				case ' ':
					e.preventDefault();
					throttledDispatch('play_pause', 300);
					break;
				case 's':
				case 'S':
					e.preventDefault();
					throttledDispatch('stop', 500);
					break;
				case 'n':
				case 'N': {
					e.preventDefault();
					const curIdx = flatEpisodes.findIndex(
						(ep) => ep.episodeId === currentEpisodeIdRef.current,
					);
					if (curIdx >= 0 && curIdx < flatEpisodes.length - 1) {
						handlePlayEpisode(flatEpisodes[curIdx + 1]);
					}
					break;
				}
				case 'p':
				case 'P': {
					e.preventDefault();
					const curIdx = flatEpisodes.findIndex(
						(ep) => ep.episodeId === currentEpisodeIdRef.current,
					);
					if (curIdx > 0) {
						handlePlayEpisode(flatEpisodes[curIdx - 1]);
					}
					break;
				}
				case 'm':
				case 'M':
					e.preventDefault();
					throttledDispatch('mute', 300);
					break;
				case 'v':
				case 'V':
					e.preventDefault();
					runPlaybackDetailAction(
						() => window.overlayApi?.cycleAudioTrack?.(),
						{ audio: true },
					);
					break;
				case 'b':
				case 'B':
					e.preventDefault();
					runPlaybackDetailAction(
						() => window.overlayApi?.cycleSubtitleTrack?.(),
						{ subtitle: true },
					);
					break;
				case 'o':
				case 'O':
					e.preventDefault();
					runPlaybackDetailAction(
						() => window.overlayApi?.setSubtitleTrack?.(-1),
						{ subtitle: true },
					);
					break;
				case 'a':
				case 'A':
					e.preventDefault();
					runPlaybackDetailAction(() =>
						window.overlayApi?.cycleAspectRatio?.(),
					);
					break;
				case 'c':
				case 'C':
					e.preventDefault();
					runPlaybackDetailAction(() => window.overlayApi?.cycleCrop?.());
					break;
				case 'f':
				case 'F':
				case 'Escape':
					e.preventDefault();
					window.overlayApi?.close();
					break;
				case 'ArrowRight':
					e.preventDefault();
					throttledDispatch(e.ctrlKey ? 'seek_fwd_180' : 'seek_fwd_10', 80);
					break;
				case 'ArrowLeft':
					e.preventDefault();
					throttledDispatch(e.ctrlKey ? 'seek_back_180' : 'seek_back_10', 80);
					break;
				case 'ArrowUp':
					e.preventDefault();
					throttledDispatch('seek_fwd_60', 80);
					break;
				case 'ArrowDown':
					e.preventDefault();
					throttledDispatch('seek_back_60', 80);
					break;
				default:
					break;
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [
		dispatchAction,
		throttledDispatch,
		vlcState,
		flatEpisodes,
		handlePlayEpisode,
		runPlaybackDetailAction,
	]);

	const currentEp = flatEpisodes.find(
		(ep) => ep.episodeId === currentEpisodeId,
	);
	const currentFlatIndex = flatEpisodes.findIndex(
		(ep) => ep.episodeId === currentEpisodeId,
	);
	const nextEp =
		currentFlatIndex >= 0 && currentFlatIndex < flatEpisodes.length - 1
			? flatEpisodes[currentFlatIndex + 1]
			: null;
	const prevEp =
		currentFlatIndex > 0 ? flatEpisodes[currentFlatIndex - 1] : null;

	const isMuted = volume === 0;
	const nearEnd = duration > 0 && position > duration - 60 && !!nextEp;

	useEffect(() => {
		if (nearEnd && nextEp) autoAdvanceArmedRef.current = true;
	}, [nearEnd, nextEp]);

	useEffect(() => {
		const prev = lastVlcStateRef.current;
		lastVlcStateRef.current = vlcState;

		if (vlcState !== 'stopped' || prev === 'stopped') return;
		if (transitioningRef.current) return;
		if (manualStopRef.current) return;
		if (!autoAdvanceArmedRef.current) return;
		if (!nextEp) return;

		const fromEpisodeId = currentEpisodeIdRef.current;
		if (!fromEpisodeId) return;
		if (lastAutoAdvanceFromEpisodeRef.current === fromEpisodeId) return;

		traceOverlay('[AnimePlayerOverlay] Auto-advance', {
			fromEpisodeId,
			toEpisodeId: nextEp.episodeId,
			position: Math.floor(positionRef.current),
			duration: Math.floor(durationRef.current),
		});

		lastAutoAdvanceFromEpisodeRef.current = fromEpisodeId;
		autoAdvanceArmedRef.current = false;
		preloadedNextRef.current = false;
		handlePlayEpisode(nextEp, { forceCompletePrevious: true });
	}, [vlcState, nextEp, handlePlayEpisode]);

	const handlePlayPause = useCallback(
		() => dispatchAction('play_pause'),
		[dispatchAction],
	);
	const handleStop = useCallback(
		() => dispatchAction('stop'),
		[dispatchAction],
	);
	const handleSeek = useCallback(
		(s) => window.overlayApi?.sendCommand('seek', s),
		[],
	);
	const handleVolumeChange = useCallback((val) => {
		if (val > 0) savedVolumeRef.current = val;
		desiredStateRef.current.volume = val;
		driftCountRef.current.volume = 0;
		window.overlayApi?.sendCommand('volume', val);
	}, []);
	const handleToggleMute = useCallback(
		() => dispatchAction('mute'),
		[dispatchAction],
	);
	const handleNext = useCallback(() => {
		if (nextEp) handlePlayEpisode(nextEp);
	}, [nextEp, handlePlayEpisode]);
	const handlePrev = useCallback(() => {
		if (prevEp) handlePlayEpisode(prevEp);
	}, [prevEp, handlePlayEpisode]);
	const handleSetAudioTrack = useCallback(
		(trackId) =>
			runPlaybackDetailAction(
				() => window.overlayApi?.setAudioTrack?.(trackId),
				{ audio: true },
			),
		[runPlaybackDetailAction],
	);
	const handleSetSubtitleTrack = useCallback(
		(trackId) =>
			runPlaybackDetailAction(
				() => window.overlayApi?.setSubtitleTrack?.(trackId),
				{ subtitle: true },
			),
		[runPlaybackDetailAction],
	);
	const handleSetAspectRatio = useCallback(
		(aspectValue) =>
			runPlaybackDetailAction(() =>
				window.overlayApi?.setAspectRatio?.(aspectValue),
			),
		[runPlaybackDetailAction],
	);
	const handleCycleCrop = useCallback(
		() => runPlaybackDetailAction(() => window.overlayApi?.cycleCrop?.()),
		[runPlaybackDetailAction],
	);
	const handleAttachSubtitle = useCallback(
		() => runPlaybackDetailAction(() => window.overlayApi?.attachSubtitle?.()),
		[runPlaybackDetailAction],
	);

	return (
		<div
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				overflow: 'hidden',
				background: 'transparent',
				fontFamily:
					'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
				color: '#fff',
			}}>
			{nearEnd && !transitioning && (
				<div
					style={{
						position: 'absolute',
						bottom: 100,
						right: showPlaylist ? 360 : 20,
						zIndex: 25,
						transition: 'right 0.22s ease, opacity 0.3s ease',
						opacity: 1,
					}}>
					<button
						onClick={() =>
							handlePlayEpisode(nextEp, { forceCompletePrevious: true })
						}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '8px 14px',
							background: 'rgba(229,9,20,0.9)',
							border: 'none',
							borderRadius: 6,
							color: '#fff',
							fontSize: 12,
							fontWeight: 600,
							cursor: 'pointer',
							backdropFilter: 'blur(4px)',
							boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
							letterSpacing: 0.3,
						}}>
						<svg
							width="12"
							height="12"
							viewBox="0 0 12 12"
							fill="none">
							<path
								d="M2 2l8 4-8 4V2z"
								fill="white"
							/>
							<rect
								x="9"
								y="2"
								width="1.5"
								height="8"
								rx="0.5"
								fill="white"
							/>
						</svg>
						Next: {nextEp.title || `Episode ${nextEp.episode}`}
					</button>
				</div>
			)}

			{transitioning && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						zIndex: 30,
						background: 'rgba(0,0,0,0.75)',
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 14,
					}}>
					<div
						style={{
							width: 32,
							height: 32,
							border: '3px solid rgba(255,255,255,0.15)',
							borderTopColor: '#e50914',
							borderRadius: '50%',
							animation: 'spin 0.7s linear infinite',
						}}
					/>
					<span style={{ fontSize: 13, color: '#aaa', letterSpacing: 0.5 }}>
						Loading next episode…
					</span>
					<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
				</div>
			)}

			<div
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					zIndex: 20,
					transform: showTitleBar ? 'translateY(0)' : 'translateY(-100%)',
					opacity: showTitleBar ? 1 : 0,
					transition: 'transform 0.2s ease, opacity 0.15s ease',
				}}>
				<AnimeOverlayTitleBar
					seriesName={seriesName}
					filterDesc={filterDesc}
					episodeNumber={currentEp?.episode}
					episodeType={currentEp?.episodeType}
					episodeTitle={currentEp?.title || ''}
					onClose={() => window.overlayApi?.close()}
				/>
			</div>

			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: 'transparent',
					zIndex: 10,
					cursor: 'default',
				}}
			/>

			<div
				style={{
					position: 'absolute',
					top: 0,
					right: 0,
					bottom: 0,
					width: 340,
					zIndex: 15,
					opacity: showPlaylist ? 1 : 0,
					pointerEvents: showPlaylist ? 'auto' : 'none',
					transition: 'opacity 0.2s ease',
					overflow: 'hidden',
				}}>
				<AnimeOverlayPlaylist
					allSeasons={allSeasons}
					currentEpisodeId={currentEpisodeId}
					history={history}
					onPlayEpisode={handlePlayEpisode}
					transitioning={transitioning}
					filterDesc={filterDesc}
				/>
			</div>

			<div
				style={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					zIndex: 20,
					transform: showControls ? 'translateY(0)' : 'translateY(100%)',
					opacity: showControls ? 1 : 0,
					transition: 'transform 0.2s ease, opacity 0.15s ease',
				}}>
				<AnimeOverlayControls
					position={position}
					duration={duration}
					vlcState={vlcState}
					volume={volume}
					isMuted={isMuted}
					hasNext={!!nextEp}
					hasPrev={!!prevEp}
					nextEpTitle={nextEp?.title || ''}
					onPlayPause={handlePlayPause}
					onStop={handleStop}
					onPrev={handlePrev}
					onNext={handleNext}
					onSeek={handleSeek}
					onVolumeChange={handleVolumeChange}
					onToggleMute={handleToggleMute}
					audioTracks={playbackDetails.audioTracks}
					subtitleTracks={playbackDetails.subtitleTracks}
					selectedAudioTrackId={playbackDetails.selectedAudioTrackId}
					selectedSubtitleTrackId={playbackDetails.selectedSubtitleTrackId}
					aspectRatio={playbackDetails.aspectRatio}
					aspectRatioOptions={playbackDetails.aspectRatioOptions}
					onSetAudioTrack={handleSetAudioTrack}
					onSetSubtitleTrack={handleSetSubtitleTrack}
					onSetAspectRatio={handleSetAspectRatio}
					onCycleCrop={handleCycleCrop}
					onAttachSubtitle={handleAttachSubtitle}
					onMenuOpenChange={setIsControlMenuOpen}
				/>
			</div>
		</div>
	);
}
