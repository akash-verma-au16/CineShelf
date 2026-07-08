/**
 * Convert an absolute local path to a cineshelf:/// URL for Electron's
 * custom protocol handler.
 *
 * WHY triple slash: cineshelf://C:/path would put "C" in the URL *authority*
 * (hostname), and Chromium normalises that to lowercase "c" and drops the
 * colon, destroying the Windows drive letter.  With cineshelf:///C:/path the
 * authority is empty and the drive letter lives safely in the URL *path*.
 */
export function toLocalUrl(absPath) {
	if (!absPath) return null;
	if (typeof window === 'undefined' || !window.api) return null;
	// Already converted — return as-is
	if (absPath.startsWith('cineshelf://')) return absPath;
	// Convert backslashes, then encode each path segment so spaces / special
	// chars are safe, while keeping the drive-letter colon unencoded.
	const fwd = absPath.replace(/\\/g, '/');
	const encoded = fwd
		.split('/')
		.map((seg, idx) => {
			// Keep the Windows drive letter  ("C:", "E:", …) intact
			if (idx === 0 && /^[a-zA-Z]:$/.test(seg)) return seg;
			return encodeURIComponent(seg);
		})
		.join('/');
	return `cineshelf:///${encoded}`;
}

/** Format episode label: S01E05 */
export function fmtEpLabel(season, episode) {
	return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** Format seconds to h:mm or mm:ss */
export function fmtDuration(seconds) {
	if (!seconds || seconds <= 0) return '';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

/** Format file size */
export function fmtSize(bytes) {
	if (!bytes) return '';
	const gb = bytes / 1024 ** 3;
	if (gb >= 1) return `${gb.toFixed(1)} GB`;
	return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

/** Progress 0–100 */
export function getProgress(position, duration) {
	if (!duration || duration <= 0) return 0;
	return Math.min(100, Math.round((position / duration) * 100));
}

/** Year range: "2008", "2008 – 2013", "2008 – Present" */
export function yearRange(year, endYear, status) {
	if (!year) return '';
	if (!endYear || endYear === year) return year;
	const isEnded = status === 'Ended' || status === 'Canceled';
	const end = isEnded ? endYear : 'Present';
	return `${year} – ${end}`;
}

/** Truncate text to maxLen chars */
export function truncate(text, maxLen = 180) {
	if (!text) return '';
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen).trimEnd() + '…';
}

/** Get all episodes in-progress for "Continue Watching" */
export function getContinueWatching(library, history, limit = 20) {
	if (!library?.series) return [];
	const inProgress = [];
	for (const series of library.series) {
		for (const season of series.seasons || []) {
			for (const ep of season.episodes || []) {
				const h = history[ep.id];
				if (h && !h.completed && (h.position || 0) > 30) {
					inProgress.push({ ...ep, seriesName: series.name, ...h });
				}
			}
		}
	}
	return inProgress
		.sort((a, b) => new Date(b.lastWatched || 0) - new Date(a.lastWatched || 0))
		.slice(0, limit);
}

/** Recently added series sorted by addedAt */
export function getRecentlyAdded(series, limit = 24) {
	return [...series]
		.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0))
		.slice(0, limit);
}

/** Debounce function */
export function debounce(fn, ms) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}
