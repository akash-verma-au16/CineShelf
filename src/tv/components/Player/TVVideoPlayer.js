import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/TVContext';
import { toLocalUrl, fmtEpLabel } from '../../../shared/utils/helpers';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(secs) {
	if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = Math.floor(secs % 60);
	if (h > 0)
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoPlayer() {
	const { player, closePlayer } = useApp();
	const { isOpen, episode, initialSeek, seriesName, episodeTitle } =
		player || {};

	const videoRef = useRef(null);
	const containerRef = useRef(null);
	const progressBarRef = useRef(null);
	const controlsTimerRef = useRef(null);
	const clickTimerRef = useRef(null);
	const centerFlashTimerRef = useRef(null);
	const skipFlashTimerRef = useRef(null);

	// ── Playback state ────────────────────────────────────────────────────────
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [buffered, setBuffered] = useState(0);
	const [speed, setSpeed] = useState(1);

	// ── UI state ──────────────────────────────────────────────────────────────
	const [showControls, setShowControls] = useState(true);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isPiP, setIsPiP] = useState(false);
	const [playerError, setPlayerError] = useState(null);
	const [loadingVideo, setLoadingVideo] = useState(true);
	const [showSpeedMenu, setShowSpeedMenu] = useState(false);
	const [showTimeRemaining, setShowTimeRemaining] = useState(false);

	// ── On-screen indicators ──────────────────────────────────────────────────
	const [centerFlash, setCenterFlash] = useState(null); // 'play' | 'pause'
	const [skipFlash, setSkipFlash] = useState(null); // { dir:'fwd'|'bck', secs }
	const [seekHover, setSeekHover] = useState({ visible: false, x: 0, pct: 0 });
	// ── Codec probe + subtitles ─────────────────────────────────────────
	const [codecWarning, setCodecWarning] = useState(null); // string[] | null
	const [subtitleTracks, setSubtitleTracks] = useState([]); // TextTrack[]
	const [activeSubTrack, setActiveSubTrack] = useState(-1); // -1 = off
	const [showSubMenu, setShowSubMenu] = useState(false);
	// ── Reset on new episode ──────────────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		setPlaying(false);
		setCurrentTime(0);
		setDuration(0);
		setBuffered(0);
		setPlayerError(null);
		setLoadingVideo(true);
		setShowControls(true);
		setSpeed(1);
		setShowSpeedMenu(false);
		setCenterFlash(null);
		setSkipFlash(null);
		setCodecWarning(null);
		setSubtitleTracks([]);
		setActiveSubTrack(-1);
		setShowSubMenu(false);
		clearTimeout(controlsTimerRef.current);
		clearTimeout(clickTimerRef.current);

		// Probe the file for codec compatibility
		if (episode?.filePath && window.api?.probeVideo) {
			window.api
				.probeVideo(episode.filePath)
				.then((info) => {
					if (
						info &&
						!info.error &&
						!info.likelyPlayable &&
						info.problematic?.length
					) {
						setCodecWarning(info.problematic);
					}
				})
				.catch(() => {});
		}
	}, [episode?.id, episode?.filePath, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Initial seek + autoplay ───────────────────────────────────────────────
	useEffect(() => {
		const video = videoRef.current;
		if (!video || !isOpen) return;
		function onLoaded() {
			if (initialSeek && initialSeek > 5) video.currentTime = initialSeek;
			setDuration(video.duration || 0);
			setLoadingVideo(false);
			video.play().catch(() => {});
			// Enumerate embedded subtitle tracks
			const tracks = Array.from(video.textTracks || []).filter(
				(t) => t.kind === 'subtitles' || t.kind === 'captions',
			);
			setSubtitleTracks(tracks);
		}
		video.addEventListener('loadedmetadata', onLoaded, { once: true });
		return () => video.removeEventListener('loadedmetadata', onLoaded);
	}, [episode?.id, isOpen, initialSeek]);

	// ── Subtitle track switching ──────────────────────────────────────────
	function selectSubTrack(idx) {
		const video = videoRef.current;
		if (!video) return;
		Array.from(video.textTracks || []).forEach((t, i) => {
			t.mode = i === idx ? 'showing' : 'hidden';
		});
		setActiveSubTrack(idx);
		setShowSubMenu(false);
	}

	// ── Auto-hide controls ────────────────────────────────────────────────────
	const resetControlsTimer = useCallback(
		(isPlaying) => {
			setShowControls(true);
			clearTimeout(controlsTimerRef.current);
			const p = isPlaying !== undefined ? isPlaying : playing;
			if (p) {
				controlsTimerRef.current = setTimeout(
					() => setShowControls(false),
					3500,
				);
			}
		},
		[playing],
	);

	// ── Flash helpers ─────────────────────────────────────────────────────────
	function flashCenter(type) {
		setCenterFlash(type);
		clearTimeout(centerFlashTimerRef.current);
		centerFlashTimerRef.current = setTimeout(() => setCenterFlash(null), 650);
	}

	function flashSkip(dir, secs) {
		setSkipFlash({ dir, secs });
		clearTimeout(skipFlashTimerRef.current);
		skipFlashTimerRef.current = setTimeout(() => setSkipFlash(null), 700);
	}

	// ── Seek helpers ──────────────────────────────────────────────────────────
	function seekBy(secs) {
		const video = videoRef.current;
		if (!video) return;
		video.currentTime = Math.max(
			0,
			Math.min(video.duration || Infinity, video.currentTime + secs),
		);
		resetControlsTimer();
		flashSkip(secs > 0 ? 'fwd' : 'bck', Math.abs(secs));
	}

	function seekTo(pct) {
		const video = videoRef.current;
		if (!video || !video.duration) return;
		video.currentTime = pct * video.duration;
		resetControlsTimer();
	}

	// ── Speed ─────────────────────────────────────────────────────────────────
	function applySpeed(sp) {
		const video = videoRef.current;
		if (video) video.playbackRate = sp;
		setSpeed(sp);
		setShowSpeedMenu(false);
		resetControlsTimer();
	}

	function changeSpeedBy(delta) {
		const idx = SPEEDS.indexOf(speed);
		applySpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, idx + delta))]);
	}

	// ── Volume ────────────────────────────────────────────────────────────────
	function setVolumeLevel(v) {
		const video = videoRef.current;
		const clamped = Math.max(0, Math.min(1, v));
		setVolume(clamped);
		setMuted(clamped === 0);
		if (video) {
			video.volume = clamped;
			video.muted = clamped === 0;
		}
	}

	function toggleMute() {
		const video = videoRef.current;
		if (!video) return;
		if (muted || volume === 0) {
			const restore = volume > 0.01 ? volume : 0.7;
			video.muted = false;
			video.volume = restore;
			setMuted(false);
			setVolume(restore);
		} else {
			video.muted = true;
			setMuted(true);
		}
	}

	// ── Fullscreen ────────────────────────────────────────────────────────────
	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen();
		}
	}

	// ── Picture-in-Picture ────────────────────────────────────────────────────
	async function togglePiP() {
		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
			} else if (videoRef.current) {
				await videoRef.current.requestPictureInPicture();
			}
		} catch (e) {
			console.warn('PiP:', e.message);
		}
	}

	// ── Click: single = play/pause, double = fullscreen ───────────────────────
	function handleVideoClick() {
		if (clickTimerRef.current) {
			clearTimeout(clickTimerRef.current);
			clickTimerRef.current = null;
			toggleFullscreen();
		} else {
			clickTimerRef.current = setTimeout(() => {
				clickTimerRef.current = null;
				const video = videoRef.current;
				if (!video) return;
				if (video.paused) {
					video.play();
					flashCenter('play');
				} else {
					video.pause();
					flashCenter('pause');
				}
			}, 230);
		}
	}

	// ── Scroll wheel → volume ─────────────────────────────────────────────────
	function handleWheel(e) {
		e.preventDefault();
		setVolumeLevel(volume + (e.deltaY < 0 ? 0.05 : -0.05));
		resetControlsTimer();
	}

	// ── Progress bar ─────────────────────────────────────────────────────────
	function handleSeek(e) {
		const video = videoRef.current;
		const bar = progressBarRef.current;
		if (!video || !bar || !video.duration) return;
		const rect = bar.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		video.currentTime = pct * video.duration;
		e.stopPropagation();
	}

	function handleSeekHoverMove(e) {
		const bar = progressBarRef.current;
		if (!bar) return;
		const rect = bar.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const pct = Math.max(0, Math.min(1, x / rect.width));
		setSeekHover({ visible: true, x, pct });
	}

	// ── Keyboard shortcuts ────────────────────────────────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		function onKey(e) {
			const video = videoRef.current;
			if (!video) return;
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
				return;
			switch (e.key) {
				// Space / K — play/pause
				case ' ':
				case 'k':
				case 'K':
					e.preventDefault();
					if (video.paused) {
						video.play();
						flashCenter('play');
					} else {
						video.pause();
						flashCenter('pause');
					}
					break;
				// J — back 10s (Shift+J = 30s)
				case 'j':
				case 'J':
					e.preventDefault();
					seekBy(e.shiftKey ? -30 : -10);
					break;
				// L — fwd 10s (Shift+L = 30s)
				case 'l':
				case 'L':
					e.preventDefault();
					seekBy(e.shiftKey ? 30 : 10);
					break;
				// Arrow ← → — ±5s (Ctrl/Shift = ±30s)
				case 'ArrowLeft':
					e.preventDefault();
					seekBy(e.ctrlKey || e.metaKey || e.shiftKey ? -30 : -5);
					break;
				case 'ArrowRight':
					e.preventDefault();
					seekBy(e.ctrlKey || e.metaKey || e.shiftKey ? 30 : 5);
					break;
				// Arrow ↑ ↓ — volume
				case 'ArrowUp':
					e.preventDefault();
					setVolumeLevel(video.volume + 0.1);
					resetControlsTimer();
					break;
				case 'ArrowDown':
					e.preventDefault();
					setVolumeLevel(video.volume - 0.1);
					resetControlsTimer();
					break;
				case 'm':
				case 'M':
					toggleMute();
					break;
				case 'f':
				case 'F':
					toggleFullscreen();
					break;
				case 'p':
				case 'P':
					togglePiP();
					break;
				// , / . — speed down / up
				case ',':
					changeSpeedBy(-1);
					break;
				case '.':
					changeSpeedBy(1);
					break;
				case 'Home':
					e.preventDefault();
					video.currentTime = 0;
					flashSkip('bck', 0);
					break;
				case 'End':
					e.preventDefault();
					if (video.duration)
						video.currentTime = Math.max(0, video.duration - 3);
					flashSkip('fwd', 0);
					break;
				case 'Escape':
					if (
						!document.fullscreenElement &&
						!document.pictureInPictureElement
					) {
						handleClose();
					}
					break;
				default:
					// 0–9: jump to percentage
					if (e.key >= '0' && e.key <= '9') {
						e.preventDefault();
						seekTo(parseInt(e.key, 10) / 10);
					}
					break;
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [isOpen, speed, volume, muted]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Fullscreen change ─────────────────────────────────────────────────────
	useEffect(() => {
		function onFsChange() {
			setIsFullscreen(!!document.fullscreenElement);
		}
		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	}, []);

	// ── PiP change ────────────────────────────────────────────────────────────
	useEffect(() => {
		function onPiP() {
			setIsPiP(!!document.pictureInPictureElement);
		}
		document.addEventListener('enterpictureinpicture', onPiP);
		document.addEventListener('leavepictureinpicture', onPiP);
		return () => {
			document.removeEventListener('enterpictureinpicture', onPiP);
			document.removeEventListener('leavepictureinpicture', onPiP);
		};
	}, []);

	// ── Time update ───────────────────────────────────────────────────────────
	const handleTimeUpdate = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		setCurrentTime(video.currentTime);
		if (video.buffered.length > 0 && video.duration > 0) {
			setBuffered(
				(video.buffered.end(video.buffered.length - 1) / video.duration) * 100,
			);
		}
	}, []);

	// ── Close ─────────────────────────────────────────────────────────────────
	function handleClose() {
		const video = videoRef.current;
		const pos = video ? Math.floor(video.currentTime) : 0;
		const dur = video ? Math.floor(video.duration || 0) : 0;
		if (video) video.pause();
		closePlayer({ position: pos, duration: dur });
	}

	if (!isOpen || !episode) return null;

	const videoSrc = toLocalUrl(episode.filePath);
	const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
	const epLabel = fmtEpLabel(episode.season, episode.episode);
	const displayTitle = episodeTitle ? `${epLabel} · ${episodeTitle}` : epLabel;
	const timeDisplay =
		showTimeRemaining && duration > 0
			? `-${formatTime(duration - currentTime)}`
			: formatTime(currentTime);

	return createPortal(
		<div
			ref={containerRef}
			className="fixed inset-0 z-[100] bg-black select-none"
			style={{ cursor: showControls ? 'default' : 'none' }}
			onMouseMove={() => resetControlsTimer()}
			onWheel={handleWheel}>
			{/* ── Video element ── */}
			<video
				ref={videoRef}
				src={videoSrc}
				className="absolute inset-0 w-full h-full"
				style={{ objectFit: 'contain' }}
				onClick={handleVideoClick}
				onPlay={() => {
					setPlaying(true);
					resetControlsTimer(true);
				}}
				onPause={() => {
					setPlaying(false);
					setShowControls(true);
					clearTimeout(controlsTimerRef.current);
				}}
				onTimeUpdate={handleTimeUpdate}
				onEnded={() => {
					setPlaying(false);
					setShowControls(true);
				}}
				onWaiting={() => setLoadingVideo(true)}
				onPlaying={() => setLoadingVideo(false)}
				onCanPlay={() => setLoadingVideo(false)}
				onError={(e) => {
					const v = e.target;
					const code = v?.error?.code;
					// code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (codec not supported)
					// code 3 = MEDIA_ERR_DECODE
					const msg =
						code === 4
							? 'Unsupported codec — cannot decode this file in the browser.'
							: code === 3
								? 'Decode error — file may be corrupted or use an unsupported codec.'
								: 'Playback error — could not load the video.';
					setPlayerError(msg);
					// Auto-launch with system player after a short delay
					if (episode?.filePath && window.api?.openPath) {
						setTimeout(() => window.api.openPath(episode.filePath), 800);
					}
				}}
				preload="metadata"
			/>

			{/* ── Spinner ── */}
			{loadingVideo && !playerError && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<div className="w-14 h-14 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
				</div>
			)}

			{/* ── Center play/pause flash ── */}
			<AnimatePresence>
				{centerFlash && (
					<motion.div
						key={centerFlash + Date.now()}
						initial={{ opacity: 0.9, scale: 0.8 }}
						animate={{ opacity: 0, scale: 1.5 }}
						transition={{ duration: 0.55, ease: 'easeOut' }}
						className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
						<div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center">
							{centerFlash === 'play' ? (
								<svg
									className="w-9 h-9 text-white ml-1"
									viewBox="0 0 24 24"
									fill="currentColor">
									<path d="M8 5v14l11-7z" />
								</svg>
							) : (
								<svg
									className="w-9 h-9 text-white"
									viewBox="0 0 24 24"
									fill="currentColor">
									<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
								</svg>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* ── Skip flash ── */}
			<AnimatePresence>
				{skipFlash && (
					<motion.div
						key={skipFlash.dir + Date.now()}
						initial={{ opacity: 1 }}
						animate={{ opacity: 0 }}
						transition={{ duration: 0.65, ease: 'easeOut' }}
						className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1.5 z-10 ${skipFlash.dir === 'fwd' ? 'right-16' : 'left-16'}`}>
						<div className="w-16 h-16 border-2 border-white/60 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-sm">
							{skipFlash.dir === 'fwd' ? (
								<svg
									className="w-8 h-8 text-white"
									viewBox="0 0 24 24"
									fill="currentColor">
									<path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
								</svg>
							) : (
								<svg
									className="w-8 h-8 text-white"
									viewBox="0 0 24 24"
									fill="currentColor">
									<path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
								</svg>
							)}
						</div>
						{skipFlash.secs > 0 && (
							<span className="text-white text-sm font-semibold drop-shadow-lg">
								{skipFlash.dir === 'fwd' ? '+' : '-'}
								{skipFlash.secs}s
							</span>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			{/* ── Codec warning banner (shown before playback if probe found issues) ── */}
			{codecWarning && !playerError && (
				<div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-start gap-3 bg-yellow-900/90 border border-yellow-500/40 text-yellow-200 rounded-lg px-4 py-3 max-w-lg shadow-2xl pointer-events-auto">
					<svg
						className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
						/>
					</svg>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold">Codec warning</p>
						<p className="text-xs text-yellow-300 mt-0.5">
							Detected: <strong>{codecWarning.join(', ')}</strong>. May not play
							— if it fails, use your system player.
						</p>
					</div>
					<button
						onClick={() => setCodecWarning(null)}
						className="text-yellow-400 hover:text-white shrink-0">
						✕
					</button>
				</div>
			)}

			{/* ── Error overlay ── */}
			{playerError && (
				<div
					className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-10"
					onClick={(e) => e.stopPropagation()}>
					<svg
						className="w-16 h-16 text-red-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
						/>
					</svg>
					<p className="text-white text-lg font-semibold text-center">
						{playerError}
					</p>
					<p className="text-gray-400 text-sm text-center max-w-md leading-relaxed">
						Your system player is opening this file automatically — or use the
						button below.
					</p>
					<div className="flex items-center gap-3 mt-2">
						<button
							onClick={() =>
								episode?.filePath && window.api?.openPath(episode.filePath)
							}
							className="px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors flex items-center gap-2">
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
								/>
							</svg>
							Open with system player
						</button>
						<button
							onClick={() =>
								episode?.filePath && window.api?.showInFolder(episode.filePath)
							}
							className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors flex items-center gap-2">
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
								/>
							</svg>
							Show in folder
						</button>
						<button
							onClick={handleClose}
							className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 text-sm transition-colors">
							Close
						</button>
					</div>
				</div>
			)}

			{/* ── Controls overlay ── */}
			<div
				className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 ${
					showControls ? 'opacity-100' : 'opacity-0'
				}`}>
				{/* Top bar */}
				<div className="flex items-center gap-3 px-4 pt-4 pb-12 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
					<button
						onClick={handleClose}
						className="w-9 h-9 flex items-center justify-center rounded-full bg-black/50 hover:bg-white/20 transition-colors text-white shrink-0">
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2.2}>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
							/>
						</svg>
					</button>
					<div className="min-w-0 flex-1">
						<div className="text-white font-semibold text-sm leading-tight truncate">
							{seriesName || episode.seriesId}
						</div>
						<div className="text-gray-300 text-xs truncate">{displayTitle}</div>
					</div>
					{speed !== 1 && (
						<span className="text-xs text-white/70 font-mono bg-white/10 px-2 py-0.5 rounded shrink-0">
							{speed}×
						</span>
					)}
				</div>

				{/* Bottom controls */}
				<div className="px-4 pb-5 pt-16 bg-gradient-to-t from-black/90 to-transparent pointer-events-auto">
					{/* ── Seek bar ── */}
					<div
						ref={progressBarRef}
						className="w-full mb-4 relative cursor-pointer group/seek py-2"
						onClick={handleSeek}
						onMouseMove={handleSeekHoverMove}
						onMouseLeave={() =>
							setSeekHover((s) => ({ ...s, visible: false }))
						}>
						{/* Time tooltip */}
						{seekHover.visible && duration > 0 && (
							<div
								className="absolute -top-8 -translate-x-1/2 bg-black/80 text-white text-xs font-mono rounded px-2 py-0.5 pointer-events-none whitespace-nowrap"
								style={{ left: seekHover.x }}>
								{formatTime(seekHover.pct * duration)}
							</div>
						)}
						<div className="w-full h-[3px] group-hover/seek:h-[5px] bg-white/25 rounded-full relative transition-all duration-150">
							<div
								className="absolute left-0 top-0 h-full bg-white/30 rounded-full"
								style={{ width: `${buffered}%` }}
							/>
							<div
								className="absolute left-0 top-0 h-full bg-red-500 rounded-full transition-none"
								style={{ width: `${progress}%` }}
							/>
							<div
								className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none"
								style={{ left: `calc(${progress}% - 8px)` }}
							/>
						</div>
					</div>

					{/* ── Button row ── */}
					<div className="flex items-center gap-0.5">
						{/* Play/Pause */}
						<Btn
							onClick={() => {
								const v = videoRef.current;
								if (!v) return;
								if (v.paused) {
									v.play();
									flashCenter('play');
								} else {
									v.pause();
									flashCenter('pause');
								}
							}}
							title="Play/Pause (Space / K)">
							{playing ? (
								<svg
									className="w-7 h-7"
									fill="currentColor"
									viewBox="0 0 24 24">
									<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
								</svg>
							) : (
								<svg
									className="w-7 h-7"
									fill="currentColor"
									viewBox="0 0 24 24">
									<path d="M8 5v14l11-7z" />
								</svg>
							)}
						</Btn>

						{/* -10s */}
						<Btn
							onClick={(e) => {
								e.stopPropagation();
								seekBy(-10);
							}}
							title="-10s (J)">
							<svg
								className="w-5 h-5"
								viewBox="0 0 24 24"
								fill="currentColor">
								<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
							</svg>
						</Btn>

						{/* +10s */}
						<Btn
							onClick={(e) => {
								e.stopPropagation();
								seekBy(10);
							}}
							title="+10s (L)">
							<svg
								className="w-5 h-5"
								viewBox="0 0 24 24"
								fill="currentColor">
								<path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
							</svg>
						</Btn>

						{/* Volume */}
						<div
							className="flex items-center gap-1.5 ml-1"
							onClick={(e) => e.stopPropagation()}>
							<Btn
								onClick={toggleMute}
								title="Mute (M)">
								{muted || volume === 0 ? (
									<svg
										className="w-5 h-5"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0017.73 19l1.27 1.27L20.27 19l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
									</svg>
								) : volume < 0.5 ? (
									<svg
										className="w-5 h-5"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
									</svg>
								) : (
									<svg
										className="w-5 h-5"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
									</svg>
								)}
							</Btn>
							<input
								type="range"
								min="0"
								max="1"
								step="0.02"
								value={muted ? 0 : volume}
								onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
								className="w-20 h-1 accent-white cursor-pointer"
							/>
							<span className="text-white/50 text-xs font-mono w-8 text-right shrink-0">
								{Math.round((muted ? 0 : volume) * 100)}%
							</span>
						</div>

						{/* Time — click toggles remaining/elapsed */}
						<button
							onClick={(e) => {
								e.stopPropagation();
								setShowTimeRemaining((v) => !v);
							}}
							className="text-white text-xs font-mono ml-2 shrink-0 hover:text-white/70 transition-colors">
							{timeDisplay}
							<span className="text-white/40"> / {formatTime(duration)}</span>
						</button>

						<div className="flex-1" />

						{/* Speed selector */}
						<div
							className="relative"
							onClick={(e) => e.stopPropagation()}>
							<button
								onClick={() => setShowSpeedMenu((v) => !v)}
								title="Playback speed (< / >)"
								className="text-white/70 hover:text-white text-xs font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors min-w-[3rem] text-center">
								{speed === 1 ? '1×' : `${speed}×`}
							</button>
							{showSpeedMenu && (
								<div className="absolute bottom-full right-0 mb-1 bg-[#1c1c1c] border border-white/10 rounded-lg overflow-hidden shadow-2xl">
									{SPEEDS.map((sp) => (
										<button
											key={sp}
											onClick={() => applySpeed(sp)}
											className={`w-full px-4 py-2 text-sm text-left hover:bg-white/10 transition-colors whitespace-nowrap ${
												sp === speed
													? 'text-white font-semibold'
													: 'text-gray-300'
											}`}>
											{sp === 1 ? 'Normal' : `${sp}×`}
										</button>
									))}
								</div>
							)}
						</div>

						{/* Subtitles (only shown when tracks exist) */}
						{subtitleTracks.length > 0 && (
							<div
								className="relative"
								onClick={(e) => e.stopPropagation()}>
								<Btn
									onClick={() => setShowSubMenu((v) => !v)}
									title="Subtitles">
									<svg
										className={`w-5 h-5 ${activeSubTrack >= 0 ? 'text-yellow-400' : ''}`}
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.8}>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M7 8h10M7 12h6m-6 4h10M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"
										/>
									</svg>
								</Btn>
								{showSubMenu && (
									<div className="absolute bottom-full right-0 mb-1 bg-[#1c1c1c] border border-white/10 rounded-lg overflow-hidden shadow-2xl min-w-[140px]">
										<button
											onClick={() => selectSubTrack(-1)}
											className={`w-full px-4 py-2 text-sm text-left hover:bg-white/10 transition-colors ${activeSubTrack === -1 ? 'text-white font-semibold' : 'text-gray-300'}`}>
											Off
										</button>
										{subtitleTracks.map((t, i) => (
											<button
												key={i}
												onClick={() => selectSubTrack(i)}
												className={`w-full px-4 py-2 text-sm text-left hover:bg-white/10 transition-colors whitespace-nowrap ${activeSubTrack === i ? 'text-yellow-400 font-semibold' : 'text-gray-300'}`}>
												{t.label || t.language || `Track ${i + 1}`}
											</button>
										))}
									</div>
								)}
							</div>
						)}

						{/* Open externally */}
						<Btn
							onClick={(e) => {
								e.stopPropagation();
								if (episode?.filePath) window.api?.openPath(episode.filePath);
							}}
							title="Open with system player">
							<svg
								className="w-5 h-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.8}>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
								/>
							</svg>
						</Btn>

						{/* PiP */}
						<Btn
							onClick={(e) => {
								e.stopPropagation();
								togglePiP();
							}}
							title="Picture-in-Picture (P)">
							<svg
								className={`w-5 h-5 ${isPiP ? 'text-blue-400' : ''}`}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.8}>
								<rect
									x="2"
									y="4"
									width="20"
									height="16"
									rx="2"
									strokeLinejoin="round"
								/>
								<rect
									x="13"
									y="11"
									width="8"
									height="6"
									rx="1"
									fill="currentColor"
									stroke="none"
								/>
							</svg>
						</Btn>

						{/* Fullscreen */}
						<Btn
							onClick={(e) => {
								e.stopPropagation();
								toggleFullscreen();
							}}
							title="Fullscreen (F)">
							{isFullscreen ? (
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24">
									<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
								</svg>
							) : (
								<svg
									className="w-5 h-5"
									fill="currentColor"
									viewBox="0 0 24 24">
									<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
								</svg>
							)}
						</Btn>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}

/** Small icon button helper */
function Btn({ children, onClick, title }) {
	return (
		<button
			onClick={onClick}
			title={title}
			className="w-10 h-10 flex items-center justify-center text-white hover:text-gray-200 hover:bg-white/10 rounded transition-colors shrink-0">
			{children}
		</button>
	);
}
