/**
 * VLC external player integration for CineShelf.
 *
 * Launches VLC with a season playlist, polls the HTTP interface every second
 * for real-time position data, and fires callbacks for progress saves and
 * episode-change detection.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_VLC_PATHS = [
	'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
	'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
];

const ASPECT_RATIO_OPTIONS = [
	'default',
	'1:1',
	'4:3',
	'5:4',
	'16:9',
	'16:10',
	'221:100',
	'235:100',
	'239:100',
];

const VLC_DISABLED_HOTKEYS = [
	'mouse-button0',
	'mouse-button1',
	'mouse-button2',
	'mouse-dbl-click',
	'mouse-wheel-up',
	'mouse-wheel-down',
	'global-key-next',
	'key-next',
	'global-key-prev',
	'key-prev',
	'global-key-audio-track',
	'key-audio-track',
	'global-key-subtitle-track',
	'key-subtitle-track',
	'global-key-subtitle-revtrack',
	'key-subtitle-revtrack',
	'global-key-subtitle-toggle',
	'key-subtitle-toggle',
	'global-key-aspect-ratio',
	'key-aspect-ratio',
	'global-key-crop',
	'key-crop',
];

function findVLC(configured) {
	if (configured && configured.trim() && fs.existsSync(configured.trim())) {
		return configured.trim();
	}
	return DEFAULT_VLC_PATHS.find((p) => fs.existsSync(p)) || null;
}

function getVLCPath(configured) {
	return findVLC(configured);
}

function normalizeAspectRatio(value) {
	if (!value || value === 'default' || value === '0') return 'default';
	return String(value);
}

function extractTrackId(name, track) {
	const candidateKeys = [
		'id',
		'ID',
		'track_id',
		'Track_ID',
		'stream_id',
		'Stream_ID',
		'es',
		'ES',
		'elementary_stream_id',
		'Elementary_stream_ID',
	];

	for (const key of candidateKeys) {
		const value = track?.[key];
		if (value === undefined || value === null || value === '') continue;
		const match = String(value).match(/-?\d+/);
		if (match) return Number(match[0]);
	}

	const nameMatch = String(name || '').match(/(\d+)/);
	return nameMatch ? Number(nameMatch[1]) : null;
}

function normalizeTrackKind(value) {
	const lower = String(value || '').toLowerCase();
	if (lower.includes('audio')) return 'audio';
	if (lower.includes('subtitle') || lower.includes('spu')) return 'subtitle';
	if (lower.includes('video')) return 'video';
	return '';
}

function isTruthyTrackFlag(value) {
	const normalized = String(value ?? '')
		.trim()
		.toLowerCase();
	return ['1', 'true', 'yes', 'selected', 'default', 'on', 'enabled'].includes(
		normalized,
	);
}

function buildTrackLabel(kind, track, fallbackId) {
	const parts = [];
	const primary =
		track?.Description ||
		track?.Title ||
		track?.Name ||
		track?.Codec ||
		track?.Codec_Name ||
		null;
	const language = track?.Language || track?.lang || track?.LANGUAGE || null;
	const codec = track?.Codec || track?.Codec_Name || null;

	if (primary) parts.push(String(primary));
	if (
		language &&
		!parts.some((part) => part.toLowerCase() === String(language).toLowerCase())
	) {
		parts.push(String(language));
	}
	if (
		codec &&
		!parts.some((part) => part.toLowerCase() === String(codec).toLowerCase())
	) {
		parts.push(String(codec));
	}

	if (parts.length === 0) {
		parts.push(
			kind === 'audio' ? `Audio ${fallbackId}` : `Subtitle ${fallbackId}`,
		);
	}

	return parts.join(' · ');
}

function pickInitialTrackId(kind, tracks, previousId) {
	if (kind === 'subtitle' && previousId === -1) return -1;
	if (
		previousId !== null &&
		previousId !== undefined &&
		tracks.some((track) => track.id === previousId)
	) {
		return previousId;
	}

	const selected = tracks.find(
		(track) => track.selected || track.default || track.current || track.active,
	);
	if (selected) return selected.id;

	if (kind === 'subtitle') return -1;
	return tracks[0]?.id ?? null;
}

function extractTracksFromStatus(status, kind, previousId) {
	const categories = status?.information?.category || {};
	const seenIds = new Set();
	const tracks = [];

	for (const [name, rawTrack] of Object.entries(categories)) {
		const track = rawTrack || {};
		const trackKind = normalizeTrackKind(
			track.Type || track.Stream_type || track.Stream_Type || name,
		);
		if (trackKind !== kind) continue;

		const id = extractTrackId(name, track);
		if (id === null || seenIds.has(id)) continue;
		seenIds.add(id);

		tracks.push({
			id,
			label: buildTrackLabel(kind, track, id),
			language: track.Language || track.lang || null,
			codec: track.Codec || track.Codec_Name || null,
			selected:
				isTruthyTrackFlag(track.Selected) || isTruthyTrackFlag(track.Selection),
			default: isTruthyTrackFlag(track.Default),
			current: isTruthyTrackFlag(track.Current),
			active: isTruthyTrackFlag(track.Active),
		});
	}

	tracks.sort((left, right) => left.id - right.id);

	const selectedId = pickInitialTrackId(kind, tracks, previousId);
	const normalizedTracks =
		kind === 'subtitle' ? [{ id: -1, label: 'Off' }, ...tracks] : tracks;

	return {
		tracks: normalizedTracks,
		selectedId,
	};
}

function buildPlaybackDetails(status, controlState = {}) {
	const audio = extractTracksFromStatus(
		status,
		'audio',
		controlState.selectedAudioTrackId,
	);
	const subtitles = extractTracksFromStatus(
		status,
		'subtitle',
		controlState.selectedSubtitleTrackId,
	);

	return {
		audioTracks: audio.tracks,
		subtitleTracks: subtitles.tracks,
		selectedAudioTrackId: audio.selectedId,
		selectedSubtitleTrackId: subtitles.selectedId,
		aspectRatio: normalizeAspectRatio(status?.aspectratio),
		aspectRatioOptions: ASPECT_RATIO_OPTIONS,
	};
}

function getNextOption(options, currentValue) {
	if (!Array.isArray(options) || options.length === 0) return null;
	const currentIndex = options.indexOf(currentValue);
	if (currentIndex === -1) return options[0];
	return options[(currentIndex + 1) % options.length];
}

/**
 * Poll VLC's HTTP status endpoint once.
 * Returns parsed JSON or null on any error (network, parse, timeout).
 */
function pollVLCStatus(port, password) {
	return new Promise((resolve) => {
		const auth = Buffer.from(`:${password}`).toString('base64');
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: '/requests/status.json',
				method: 'GET',
				headers: { Authorization: `Basic ${auth}` },
				timeout: 800,
			},
			(res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						resolve(null);
					}
				});
			},
		);
		req.on('error', () => resolve(null));
		req.on('timeout', () => {
			req.destroy();
			resolve(null);
		});
		req.end();
	});
}

/**
 * Send a command to VLC via the HTTP interface.
 * command examples: 'pl_pause', 'pl_stop', 'pl_next', 'pl_previous', 'seek'
 * val is the seek target in seconds (as a number) when command === 'seek'.
 * paramName is the query-string key for val (default 'val'); use 'input' for
 * file-loading commands like in_play and in_enqueue.
 */
function sendVLCCommand(port, password, command, val, paramName = 'val') {
	return new Promise((resolve) => {
		const auth = Buffer.from(`:${password}`).toString('base64');
		let queryPath = `/requests/status.json?command=${encodeURIComponent(command)}`;
		if (val !== undefined && val !== null) {
			queryPath += `&${paramName}=${encodeURIComponent(val)}`;
		}
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: queryPath,
				method: 'GET',
				headers: { Authorization: `Basic ${auth}` },
				timeout: 1000,
			},
			(res) => {
				res.resume();
				res.on('end', () => resolve({ success: true }));
			},
		);
		req.on('error', () => resolve({ success: false }));
		req.on('timeout', () => {
			req.destroy();
			resolve({ success: false });
		});
		req.end();
	});
}

/**
 * Fetch VLC's internal playlist JSON (all enqueued items with their IDs).
 * Returns parsed JSON or null on any error.
 */
function fetchVLCPlaylist(port, password) {
	return new Promise((resolve) => {
		const auth = Buffer.from(`:${password}`).toString('base64');
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: '/requests/playlist.json',
				method: 'GET',
				headers: { Authorization: `Basic ${auth}` },
				timeout: 800,
			},
			(res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						resolve(null);
					}
				});
			},
		);
		req.on('error', () => resolve(null));
		req.on('timeout', () => {
			req.destroy();
			resolve(null);
		});
		req.end();
	});
}

/**
 * Remove all items from VLC's internal playlist except the one identified by
 * keepId. Called after a successful episode switch to prevent the playlist
 * from growing unboundedly across a long session.
 */
async function cleanupVLCPlaylist(port, password, keepId) {
	try {
		const pl = await fetchVLCPlaylist(port, password);
		if (!pl) return;
		// Flatten up to two levels of nesting (Playlist / Media Library groups)
		const allItems = (pl.children || []).flatMap((g) => [
			...(g.children || []),
			...(g.children || []).flatMap((c) => c.children || []),
		]);
		const toDelete = allItems.filter(
			(item) => String(item.id) !== String(keepId),
		);
		if (toDelete.length === 0) return;
		console.log(
			`[cleanupVLCPlaylist] Removing ${toDelete.length} stale item(s) from playlist`,
		);
		const auth = Buffer.from(`:${password}`).toString('base64');
		for (const item of toDelete) {
			await new Promise((resolve) => {
				const req = http.request(
					{
						hostname: '127.0.0.1',
						port,
						path: `/requests/status.json?command=pl_delete&id=${encodeURIComponent(item.id)}`,
						method: 'GET',
						headers: { Authorization: `Basic ${auth}` },
						timeout: 800,
					},
					(res) => {
						res.resume();
						res.on('end', () => resolve());
					},
				);
				req.on('error', () => resolve());
				req.on('timeout', () => {
					req.destroy();
					resolve();
				});
				req.end();
			});
		}
		console.log('[cleanupVLCPlaylist] Cleanup complete');
	} catch (e) {
		console.error('[cleanupVLCPlaylist] Error:', e.message);
	}
}

/**
 * Launch VLC for playback of a single episode file.
 *
 * VLC always receives exactly ONE file. All episode navigation (next, prev,
 * jump-to) is handled by React/Electron: the overlay sends an IPC request,
 * main saves history for the current episode, kills VLC, and relaunches it
 * with the new file. VLC never needs to know about the playlist.
 *
 * Options:
 *   filePath           – absolute path to the episode to play
 *   episodeInfo        – { episodeId, seriesId, season, episode } for tracking
 *   vlcPath            – custom VLC exe path (null = auto-detect)
 *   seekSeconds        – seek to this offset (default 0)
 *   httpPort           – VLC HTTP interface port (default 8080)
 *   httpPassword       – VLC HTTP interface password (default 'cineshelf')
 *   onPositionUpdate   – ({ position, duration, state, episodeId, ... }) => void
 *                        called every ~1 s while VLC is open
 *   onProgressSave     – (position, duration, episodeId, seriesId, season, episode) => void
 *                        called every ~10 s for mid-session disk writes
 *
 * Returns on success:
 *   { sessionId, exited: Promise<{...}>, sendCommand, kill, vlcPid }
 * Returns on failure:
 *   { error: string }
 */
async function launchVLC({
	filePath,
	episodeInfo = {},
	vlcPath,
	seekSeconds = 0,
	httpPort = 8080,
	httpPassword = 'cineshelf',
	onPositionUpdate,
	onProgressSave,
}) {
	const exe = findVLC(vlcPath);
	if (!exe) {
		return {
			error:
				'VLC not found. Install VLC from videolan.org or set the path in CineShelf settings.',
		};
	}

	const args = [
		filePath,
		'--fullscreen',
		'--no-video-deco',
		'--no-qt-fs-controller',
		'--no-random',
		'--no-loop',
		'--no-repeat',
		`--start-time=${Math.floor(seekSeconds)}`,
		'--extraintf=http',
		'--http-host=127.0.0.1',
		`--http-port=${httpPort}`,
		`--http-password=${httpPassword}`,
		'--no-keyboard-events',
		'--no-mouse-events',
		'--verbose=-1',
	];

	// Patch vlcrc BEFORE spawning so VLC loads the config with native mouse and
	// keyboard actions cleared for controls the overlay owns.
	patchVLCInputConfig();

	let child;
	try {
		child = spawn(exe, args, {
			detached: false,
			stdio: 'ignore',
		});
	} catch (err) {
		return { error: `Failed to start VLC: ${err.message}` };
	}

	// Runtime tracking state
	let lastPosition = seekSeconds;
	let lastDuration = 0;
	let pollTimer = null;
	let saveTimer = null;
	const sessionId = `vlc-${Date.now()}`;
	let currentFilePath = filePath;
	const controlState = {
		selectedAudioTrackId: null,
		selectedSubtitleTrackId: -1,
		aspectRatio: 'default',
	};
	// NOTE: do NOT destructure episodeInfo here. enqueueAndPlay mutates it via
	// Object.assign so that after an episode switch the poll loop reports the
	// new episode's IDs. Access episodeInfo.* directly inside every callback.

	const exited = new Promise((resolve) => {
		function startPolling() {
			pollTimer = setInterval(async () => {
				const status = await pollVLCStatus(httpPort, httpPassword);
				if (!status) return;

				const position = status.time || 0;
				const duration = status.length || 0;
				const state = status.state || 'stopped';

				lastPosition = position;
				lastDuration = duration;

				if (onPositionUpdate) {
					onPositionUpdate({
						position,
						duration,
						state,
						episodeId: episodeInfo.episodeId,
						seriesId: episodeInfo.seriesId,
						season: episodeInfo.season,
						episode: episodeInfo.episode,
						volume: status.volume,
					});
				}
			}, 1000);

			// Mid-session disk save every 10 s
			saveTimer = setInterval(() => {
				if (lastPosition > 0 && onProgressSave) {
					onProgressSave(
						lastPosition,
						lastDuration,
						episodeInfo.episodeId,
						episodeInfo.seriesId,
						episodeInfo.season,
						episodeInfo.episode,
					);
				}
			}, 10000);
		}

		// Give VLC 1.5 s to start its HTTP server before polling begins
		setTimeout(startPolling, 1500);

		child.on('close', () => {
			if (pollTimer) clearInterval(pollTimer);
			if (saveTimer) clearInterval(saveTimer);
			resolve({
				position: lastPosition,
				duration: lastDuration,
				episodeId: episodeInfo.episodeId,
				seriesId: episodeInfo.seriesId,
				season: episodeInfo.season,
				episode: episodeInfo.episode,
				action: 'ended',
			});
		});

		child.on('error', (err) => {
			if (pollTimer) clearInterval(pollTimer);
			if (saveTimer) clearInterval(saveTimer);
			resolve({
				position: lastPosition,
				duration: lastDuration,
				episodeId: episodeInfo.episodeId,
				action: 'error',
				error: err.message,
			});
		});
	});

	const sendCommand = (command, val) =>
		sendVLCCommand(httpPort, httpPassword, command, val);

	const getPlaybackDetails = async () => {
		const status = await pollVLCStatus(httpPort, httpPassword);
		if (!status) return null;
		const details = buildPlaybackDetails(status, controlState);
		controlState.selectedAudioTrackId = details.selectedAudioTrackId;
		controlState.selectedSubtitleTrackId = details.selectedSubtitleTrackId;
		controlState.aspectRatio = details.aspectRatio;
		return details;
	};

	const setAudioTrack = async (trackId) => {
		const result = await sendVLCCommand(
			httpPort,
			httpPassword,
			'audio_track',
			trackId,
		);
		if (!result.success) return { success: false };
		controlState.selectedAudioTrackId = Number(trackId);
		return {
			success: true,
			details: await getPlaybackDetails(),
		};
	};

	const setSubtitleTrack = async (trackId) => {
		const result = await sendVLCCommand(
			httpPort,
			httpPassword,
			'subtitle_track',
			trackId,
		);
		if (!result.success) return { success: false };
		controlState.selectedSubtitleTrackId = Number(trackId);
		return {
			success: true,
			details: await getPlaybackDetails(),
		};
	};

	const cycleTrack = async (kind) => {
		const details = await getPlaybackDetails();
		if (!details) return { success: false };

		if (kind === 'audio') {
			const tracks = details.audioTracks || [];
			if (tracks.length === 0) return { success: false };
			const nextTrack = getNextOption(
				tracks.map((track) => track.id),
				details.selectedAudioTrackId,
			);
			return setAudioTrack(nextTrack);
		}

		const tracks = details.subtitleTracks || [];
		if (tracks.length === 0) return { success: false };
		const nextTrack = getNextOption(
			tracks.map((track) => track.id),
			details.selectedSubtitleTrackId,
		);
		return setSubtitleTrack(nextTrack);
	};

	const setAspectRatio = async (aspectRatio) => {
		const normalized = normalizeAspectRatio(aspectRatio);
		const result = await sendVLCCommand(
			httpPort,
			httpPassword,
			'aspectratio',
			normalized,
		);
		if (!result.success) return { success: false };
		controlState.aspectRatio = normalized;
		return {
			success: true,
			details: await getPlaybackDetails(),
		};
	};

	const cycleAspectRatio = async () => {
		const details = await getPlaybackDetails();
		if (!details) return { success: false };
		const nextAspectRatio = getNextOption(
			details.aspectRatioOptions || ASPECT_RATIO_OPTIONS,
			details.aspectRatio,
		);
		return setAspectRatio(nextAspectRatio || 'default');
	};

	const cycleCrop = async () => {
		const result = await sendVLCCommand(httpPort, httpPassword, 'key', 'crop');
		return { success: result.success };
	};

	const attachSubtitle = async (subtitlePath) => {
		const before = (await getPlaybackDetails()) || { subtitleTracks: [] };
		const result = await sendVLCCommand(
			httpPort,
			httpPassword,
			'addsubtitle',
			pathToFileURL(subtitlePath).href,
		);
		if (!result.success) return { success: false };
		let details = await getPlaybackDetails();
		const beforeCount = before.subtitleTracks?.filter(
			(track) => track.id !== -1,
		).length;
		const afterTracks =
			details?.subtitleTracks?.filter((track) => track.id !== -1) || [];
		if (afterTracks.length > beforeCount) {
			const newestTrack = afterTracks[afterTracks.length - 1];
			const selected = await setSubtitleTrack(newestTrack.id);
			if (selected?.success) details = selected.details;
		}
		return { success: true, details };
	};

	const kill = () => {
		try {
			child.kill();
		} catch {}
	};

	return {
		sessionId,
		exited,
		sendCommand,
		kill,
		vlcPid: child.pid,
		httpPort,
		httpPassword,
		getStatus: () => pollVLCStatus(httpPort, httpPassword),
		getPlaybackDetails,
		cycleAudioTrack: () => cycleTrack('audio'),
		cycleSubtitleTrack: () => cycleTrack('subtitle'),
		setAudioTrack,
		setSubtitleTrack,
		cycleAspectRatio,
		setAspectRatio,
		cycleCrop,
		attachSubtitle,
		getCurrentFilePath: () => currentFilePath,
		/**
		 * Switch the running VLC session to a new episode file.
		 *
		 * Uses a persistent polling worker instead of a single one-shot call:
		 *   Phase 1 – issue in_play (immediate file load + play)
		 *   Phase 2 – poll every 200 ms; detect load via filename match in status
		 *             • paused  → debounced resume toggle (retries as needed)
		 *             • stopped → re-issue in_play
		 *             • not loaded after 2.5 s → retry in_play (up to 2 times)
		 *             • playing → seek if needed, then done
		 *   Phase 3 – seek confirmation loop (up to 2 s, one retry)
		 * Total budget: 10 s.  Typical success: < 1 s.
		 */
		enqueueAndPlay: async (newFilePath, newEpisodeInfo, seekSeconds = 0) => {
			console.log(
				'[switchEpisode] Starting switch →',
				newFilePath,
				'| seek:',
				seekSeconds,
				's',
			);

			const fileUri = pathToFileURL(newFilePath).href;
			const targetFilename = path
				.basename(newFilePath)
				.toLowerCase()
				.replace(/\.[^.]+$/, ''); // strip extension for fuzzy match

			console.log('[switchEpisode] in_play URI:', fileUri);
			console.log(
				'[switchEpisode] Matching against filename (no ext):',
				targetFilename,
			);

			// Returns true when VLC's status reflects the target file is loaded.
			function isTargetLoaded(status) {
				if (!status?.information) return false;
				const vlcFile = (
					status.information?.category?.meta?.filename ||
					status.information?.category?.meta?.title ||
					''
				)
					.toLowerCase()
					.replace(/\.[^.]+$/, '');
				return vlcFile.length > 0 && vlcFile.includes(targetFilename);
			}

			const issuePlay = () => {
				console.log('[switchEpisode] Issuing in_play');
				return sendVLCCommand(
					httpPort,
					httpPassword,
					'in_play',
					fileUri,
					'input',
				);
			};

			// Phase 1: kick off the load
			await issuePlay();

			// Phase 2 constants
			const TOTAL_TIMEOUT = 10000; // ms total budget
			const POLL_INTERVAL = 200; // ms between polls
			const RETRY_AFTER = 2500; // ms before retrying in_play if not loaded
			const RESUME_DEBOUNCE = 700; // ms between resume toggle sends
			const MAX_PLAY_RETRIES = 2;

			const deadline = Date.now() + TOTAL_TIMEOUT;
			let pollCount = 0;
			let playRetriesUsed = 0;
			let lastPlaySentAt = Date.now();
			let lastResumeSentAt = 0;

			while (Date.now() < deadline) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
				const status = await pollVLCStatus(httpPort, httpPassword);
				pollCount++;

				if (!status) {
					console.warn(`[switchEpisode] Poll ${pollCount}: VLC not responding`);
					continue;
				}

				const vlcState = status.state;
				const loaded = isTargetLoaded(status);
				const vlcFile = (
					status.information?.category?.meta?.filename ||
					status.information?.category?.meta?.title ||
					''
				).toLowerCase();

				console.log(
					`[switchEpisode] Poll ${pollCount}: state=${vlcState}, loaded=${loaded}, file='${vlcFile}'`,
				);

				if (!loaded) {
					// File not yet visible — retry in_play if we've waited long enough
					const elapsed = Date.now() - lastPlaySentAt;
					if (elapsed >= RETRY_AFTER && playRetriesUsed < MAX_PLAY_RETRIES) {
						playRetriesUsed++;
						console.warn(
							`[switchEpisode] Not loaded after ${elapsed}ms — retry in_play (${playRetriesUsed}/${MAX_PLAY_RETRIES})`,
						);
						await issuePlay();
						lastPlaySentAt = Date.now();
					}
					continue;
				}

				// Target file is now loaded in VLC
				if (vlcState === 'stopped') {
					// VLC loaded the file but stopped (happens briefly during switch)
					if (Date.now() - lastPlaySentAt >= 300) {
						console.warn(
							'[switchEpisode] Loaded but stopped — re-issuing play',
						);
						await issuePlay();
						lastPlaySentAt = Date.now();
					}
					continue;
				}

				if (vlcState === 'paused') {
					// Loaded but paused: pl_pause race between React's pause and our play.
					// Debounce the resume toggle so we don't spam it.
					if (Date.now() - lastResumeSentAt >= RESUME_DEBOUNCE) {
						lastResumeSentAt = Date.now();
						console.log(
							'[switchEpisode] Loaded but paused — sending resume toggle',
						);
						await sendVLCCommand(httpPort, httpPassword, 'pl_pause');
					}
					continue;
				}

				if (vlcState === 'playing') {
					console.log('[switchEpisode] VLC confirmed playing new episode ✓');

					// Phase 3: seek + confirmation
					if (seekSeconds > 0) {
						console.log('[switchEpisode] Seeking to', seekSeconds, 's');
						await sendVLCCommand(httpPort, httpPassword, 'seek', seekSeconds);

						const seekDeadline = Date.now() + 2000;
						let seekRetried = false;
						while (Date.now() < seekDeadline) {
							await new Promise((r) => setTimeout(r, 250));
							const seekStatus = await pollVLCStatus(httpPort, httpPassword);
							if (!seekStatus) break;
							const pos = seekStatus.time || 0;
							console.log(
								`[switchEpisode] Seek check: pos=${pos}s target=${seekSeconds}s`,
							);
							if (Math.abs(pos - seekSeconds) <= 15) {
								console.log('[switchEpisode] Seek confirmed ✓');
								break;
							}
							// Single retry when nearly out of time
							if (!seekRetried && Date.now() > seekDeadline - 750) {
								seekRetried = true;
								console.warn('[switchEpisode] Seek not settled — retrying');
								await sendVLCCommand(
									httpPort,
									httpPassword,
									'seek',
									seekSeconds,
								);
							}
						}
					}

					// Commit: update episode tracking so the 1 s poll loop reports the new ep
					currentFilePath = newFilePath;
					Object.assign(episodeInfo, newEpisodeInfo);
					console.log(
						'[switchEpisode] Done ✓ polls=',
						pollCount,
						'retries=',
						playRetriesUsed,
					);
					return { success: true };
				}
			}

			console.error(
				`[switchEpisode] TIMED OUT after ${TOTAL_TIMEOUT}ms.`,
				`loaded=${isTargetLoaded(null)}, polls=${pollCount}, retries=${playRetriesUsed}`,
			);
			return {
				success: false,
				error: `Episode switch timed out after ${TOTAL_TIMEOUT / 1000}s`,
			};
		},
		/** Silently enqueue the next file so VLC has it ready (fire-and-forget). */
		preloadEpisode: async (newFilePath) => {
			const fileUri = pathToFileURL(newFilePath).href;
			await sendVLCCommand(
				httpPort,
				httpPassword,
				'in_enqueue',
				fileUri,
				'input',
			);
		},
	};
}

/**
 * Maximize and reposition VLC's window via PowerShell so it fills the primary
 * display behind the overlay. Retries up to 10 times (every 600 ms) to handle
 * the case where VLC hasn't finished creating its window yet.
 */
/**
 * Position VLC to fill the primary display behind the overlay.
 * Passes the PID for reliable window lookup.
 */
function maximizeVLCWindow(vlcPid) {
	const { screen } = require('electron');
	const { width, height } = screen.getPrimaryDisplay().bounds;
	vlcWindowAction(vlcPid, 3, 0, 0, width, height);
}

/**
 * Perform a window action on VLC via PowerShell + Win32.
 *   action 3 = expand/reposition to x,y,w,h  (acts on first valid window)
 *   action 4 = SW_SHOWNOACTIVATE              (all windows, no focus steal)
 *   action 6 = SW_MINIMIZE                   (all windows, skip if already minimized)
 *   action 9 = SW_RESTORE                    (all windows, skip if not minimized)
 *
 * Pre-flight validation is embedded in the PowerShell script:
 *   - IsWindow() guard before every Win32 call
 *   - IsIconic() state check so minimize/restore are only applied when needed
 *   - Find-AllHwnds iterates the full window list so VLC's fullscreen renderer
 *     window (a separate top-level window from the main VLC frame) is included.
 */
function vlcWindowAction(vlcPid, action, x, y, w, h) {
	const typeName = `VW${Date.now()}`;
	const script = `
Add-Type -Name ${typeName} -Namespace NW -MemberDefinition @'
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, ref int pid);
    [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint u);
'@ -ErrorAction SilentlyContinue
function Find-AllHwnds {
    $list = [System.Collections.Generic.List[IntPtr]]::new()
    $h = [NW.${typeName}]::GetTopWindow([IntPtr]::Zero)
    while ($h -ne [IntPtr]::Zero) {
        $p = 0; [NW.${typeName}]::GetWindowThreadProcessId($h, [ref]$p)
        if ($p -eq ${vlcPid}) { $list.Add($h) }
        $h = [NW.${typeName}]::GetWindow($h, 2)
    }
    return $list
}
$max = 20; $i = 0
do {
    $hwnds = Find-AllHwnds
    if ($hwnds.Count -gt 0) {
        foreach ($hwnd in $hwnds) {
            if (-not [NW.${typeName}]::IsWindow($hwnd)) { continue }
            if (${action} -eq 4) {
                [NW.${typeName}]::ShowWindow($hwnd, 4)
            } elseif (${action} -eq 6) {
                if (-not [NW.${typeName}]::IsIconic($hwnd)) { [NW.${typeName}]::ShowWindow($hwnd, 6) }
            } elseif (${action} -eq 9) {
                if ([NW.${typeName}]::IsIconic($hwnd)) { [NW.${typeName}]::ShowWindow($hwnd, 9) }
            } elseif (${action} -eq 3) {
                [NW.${typeName}]::ShowWindow($hwnd, 1)
                Start-Sleep -Milliseconds 100
                [NW.${typeName}]::SetWindowPos($hwnd, [IntPtr]::Zero, ${x}, ${y}, ${w}, ${h}, 0x0044)
                [NW.${typeName}]::MoveWindow($hwnd, ${x}, ${y}, ${w}, ${h}, $true)
                break
            }
        }
        break
    }
    $i++; Start-Sleep -Milliseconds 400
} while ($i -lt $max)
`.trim();
	spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
		detached: true,
		stdio: 'ignore',
	}).unref();
}

/**
 * Bring all VLC windows for this PID to the front of the z-order so they are
 * visible behind the overlay. This is the authoritative "focus sync" operation
 * called whenever the overlay gains focus or is restored from minimize.
 *
 * Validation chain embedded in the PowerShell script (no throw, all guarded):
 *   1. Get-Process check — exits immediately if VLC PID is no longer running
 *   2. Find-AllHwnds enumeration — collects every top-level window for the PID
 *   3. IsWindow() per-handle guard — skips any handle that became invalid
 *   4. IsIconic() state check — only calls ShowWindow if window is minimized,
 *      avoiding redundant SW_SHOWNOACTIVATE churn on already-visible windows
 *   5. SetWindowPos with insertAfterHwnd:
 *        0 (HWND_TOP) when overlay is fullscreen/topmost — VLC goes to top of
 *          non-topmost layer and the topmost overlay stays above it naturally
 *        overlayHwnd > 0 when overlay is windowed/non-topmost — VLC is placed
 *          in the z-order slot immediately below the overlay window so the
 *          overlay is never obscured
 *
 * @param {number} vlcPid           - OS process ID of the running VLC instance
 * @param {number} insertAfterHwnd  - HWND integer: 0 = HWND_TOP, else overlay HWND
 */
function vlcEnsureVisible(vlcPid, insertAfterHwnd) {
	const typeName = `VEV${Date.now()}`;
	// SWP flags: NOSIZE(0x01) | NOMOVE(0x02) | NOACTIVATE(0x10) | SHOWWINDOW(0x40) = 0x53
	const insertAfterVal = insertAfterHwnd || 0;
	const script = `
Add-Type -Name ${typeName} -Namespace VEV -MemberDefinition @'
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, ref int pid);
    [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint u);
'@ -ErrorAction SilentlyContinue
# Guard 1: verify VLC process is still alive before any Win32 work
try { $proc = Get-Process -Id ${vlcPid} -ErrorAction Stop; if ($proc.HasExited) { exit 0 } } catch { exit 0 }
# Collect all top-level windows belonging to this VLC PID
# (VLC fullscreen has 2+ top-level windows: main frame + video renderer)
$hwnds = [System.Collections.Generic.List[IntPtr]]::new()
$h = [VEV.${typeName}]::GetTopWindow([IntPtr]::Zero)
while ($h -ne [IntPtr]::Zero) {
    $p = 0; [VEV.${typeName}]::GetWindowThreadProcessId($h, [ref]$p)
    if ($p -eq ${vlcPid}) { $hwnds.Add($h) }
    $h = [VEV.${typeName}]::GetWindow($h, 2)
}
if ($hwnds.Count -eq 0) { exit 0 }
# insertAfterHwnd = 0 means HWND_TOP (IntPtr.Zero), else the overlay's HWND
$insertAfter = [IntPtr]${insertAfterVal}
$SWP_FLAGS = [uint32]0x0053
foreach ($hwnd in $hwnds) {
    # Guard 2: handle-level validity check
    if (-not [VEV.${typeName}]::IsWindow($hwnd)) { continue }
    # Guard 3: only unminimize if actually minimized (SW_SHOWNOACTIVATE = 4)
    if ([VEV.${typeName}]::IsIconic($hwnd)) { [VEV.${typeName}]::ShowWindow($hwnd, 4) }
    # Raise to target z-order slot without stealing focus from the overlay
    [VEV.${typeName}]::SetWindowPos($hwnd, $insertAfter, 0, 0, 0, 0, $SWP_FLAGS)
}
`.trim();
	spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
		detached: true,
		stdio: 'ignore',
	}).unref();
}

/**
 * Hide VLC from the Windows taskbar and Alt+Tab by setting WS_EX_TOOLWINDOW
 * and clearing WS_EX_APPWINDOW. Uses GetTopWindow/GetWindow enumeration
 * (same as vlcWindowAction) since MainWindowHandle is unreliable for this use.
 */
function vlcHideFromTaskbar(vlcPid) {
	const typeName = `TW${Date.now()}`;
	const script = `
Add-Type -Name ${typeName} -Namespace TW -MemberDefinition @'
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, ref int pid);
    [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint u);
    [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr h, bool e);
'@ -ErrorAction SilentlyContinue
# Collect ALL top-level windows belonging to this VLC process.
# VLC in fullscreen creates multiple top-level windows (main frame + fullscreen
# video window). We must disable every one of them so Windows never delivers
# WM_LBUTTONDOWN / WM_MOUSEWHEEL / WM_KEYDOWN to any VLC window.
function Find-AllHwnds {
    $list = [System.Collections.Generic.List[IntPtr]]::new()
    $h = [TW.${typeName}]::GetTopWindow([IntPtr]::Zero)
    while ($h -ne [IntPtr]::Zero) {
        $p = 0; [TW.${typeName}]::GetWindowThreadProcessId($h, [ref]$p)
        if ($p -eq ${vlcPid}) { $list.Add($h) }
        $h = [TW.${typeName}]::GetWindow($h, 2)
    }
    return $list
}
$max = 25; $i = 0
do {
    $hwnds = Find-AllHwnds
    if ($hwnds.Count -gt 0) {
        foreach ($hwnd in $hwnds) {
            $ex = [TW.${typeName}]::GetWindowLong($hwnd, -20)
            # WS_EX_TOOLWINDOW (0x80) | WS_EX_NOACTIVATE (0x8000000) — clear WS_EX_APPWINDOW (0x40000)
            $ex = ($ex -bor 0x80 -bor 0x8000000) -band (-bnot 0x40000)
            [TW.${typeName}]::SetWindowLong($hwnd, -20, $ex)
            [TW.${typeName}]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, 0, 0, 0x0027)
            # Disable all Win32 mouse and keyboard input to this VLC window
            [TW.${typeName}]::EnableWindow($hwnd, $false)
        }
        break
    }
    $i++; Start-Sleep -Milliseconds 150
} while ($i -lt $max)
`.trim();
	spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
		detached: true,
		stdio: 'ignore',
	}).unref();
}

/**
 * Patch VLC's persistent config (vlcrc) to clear all mouse bindings plus the
 * keyboard bindings that CineShelf handles itself in the overlay.
 * Called before every VLC launch.  Non-fatal: errors are logged and ignored.
 */
function patchVLCInputConfig() {
	try {
		const vlcConfigDir = path.join(process.env.APPDATA || '', 'vlc');
		const vlcrcPath = path.join(vlcConfigDir, 'vlcrc');

		let content = '';
		if (fs.existsSync(vlcrcPath)) {
			content = fs.readFileSync(vlcrcPath, 'utf8');
		}

		// Replace any existing non-empty assignment with an empty one.
		for (const key of VLC_DISABLED_HOTKEYS) {
			const re = new RegExp(`^${key}=.+$`, 'gm');
			content = content.replace(re, `${key}=`);
		}

		// Add explicit empty assignments for any keys not yet in the file.
		const missing = VLC_DISABLED_HOTKEYS.filter(
			(k) => !new RegExp(`^${k}=`, 'm').test(content),
		);
		if (missing.length > 0) {
			const lines = missing.map((k) => `${k}=`).join('\n');
			if (/^\[hotkeys\]/m.test(content)) {
				// Insert right after the [hotkeys] section header.
				content = content.replace(/^(\[hotkeys\])/m, `$1\n${lines}`);
			} else {
				content += `\n[hotkeys]\n${lines}\n`;
			}
		}

		if (!fs.existsSync(vlcConfigDir)) {
			fs.mkdirSync(vlcConfigDir, { recursive: true });
		}
		fs.writeFileSync(vlcrcPath, content, 'utf8');
	} catch (err) {
		console.error('[VLC] vlcrc input patch failed:', err.message);
	}
}

function patchVLCMouseConfig() {
	patchVLCInputConfig();
}

module.exports = {
	launchVLC,
	getVLCPath,
	sendVLCCommand,
	maximizeVLCWindow,
	vlcWindowAction,
	vlcHideFromTaskbar,
	vlcEnsureVisible,
	patchVLCInputConfig,
	patchVLCMouseConfig,
};
