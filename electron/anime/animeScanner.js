/**
 * electron/anime/animeScanner.js
 *
 * Anime-specific directory scanner. Designed around flat-episode series like
 * Naruto and Naruto Shippuden where every episode is a single video file in
 * a single directory, named with an absolute episode number.
 *
 * Naming patterns supported:
 *   "Series Name Episode NNN - Title.ext"       (dash separator)
 *   "Series Name Episode NNN Title.ext"          (space separator)
 *   "Series Name - Episode NNN - Title.ext"      (leading dash)
 *   "Episode NNN Title.ext"                      (no series prefix)
 *   "Series Name Ep. NNN Title.ext"              (Ep. abbreviation)
 *   Any digit count 1-5+ (1, 01, 001, 0001) — treated as absolute integer.
 *   Episode 001, 01, 1 are ALL episode 1 (same absolute value).
 *   Episode 100 is episode 100, not episode 1 with extra zeros.
 *
 * Filler data: if a "*Filler List.json" exists inside the series directory
 * it is automatically loaded and used to tag each episode as
 * 'canon' | 'mixed' | 'filler'. All entries in the JSON are compared as
 * integers so "001", "01", "1" all match episode number 1.
 *
 * Duplicate handling: if multiple files resolve to the same episode number
 * (e.g. an original .mkv and an upscaled .mp4), the file with the largest
 * fileSize wins for playback. The display title is always cleaned of
 * quality-tag suffixes.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set([
	'.mkv',
	'.mp4',
	'.avi',
	'.m4v',
	'.mov',
	'.ts',
	'.wmv',
	'.flv',
	'.m2ts',
	'.webm',
	'.rmvb',
	'.divx',
	'.mpg',
	'.mpeg',
	'.3gp',
]);

// Regex matching any "*Filler List.json" filename (case-insensitive)
const FILLER_FILE_RE = /filler\s*list\.json$/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isVideoFile(filename) {
	return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function statSafe(p) {
	try {
		return fs.statSync(p);
	} catch {
		return null;
	}
}

function slugify(str) {
	return str
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();
}

/**
 * Remove quality/encode tags appended to titles via underscores or brackets.
 * e.g. "The Kazekage Stands Tall_2.25x_1920x1080_alq-10" → "The Kazekage Stands Tall"
 * e.g. "Some Title [BDRip 1080p]" stays unaffected (bracket titles are fine)
 */
function cleanTitle(raw) {
	return (
		raw
			// Strip _NUMx or _NUMxNUM quality strings (e.g. _2.25x, _1920x1080)
			.replace(/_[\d.]+x[\d.]*[\w\-.]*/g, '')
			// Strip _alq-N, _crf-N, _xvid, _h264, _h265, _hevc, _avc, _10bit, etc.
			.replace(
				/_\w*(alq|crf|xvid|x264|x265|h264|h265|hevc|avc|bluray|bdrip|dvdrip|web-?dl|hdrip|8bit|10bit)\w*/gi,
				'',
			)
			// Strip _NNNNp resolution tags (_1080p, _720p, _2160p)
			.replace(/_\d{3,4}p\b/gi, '')
			// Strip trailing underscores and dashes
			.replace(/[\s_-]+$/, '')
			.trim()
	);
}

// ── Episode filename parser ──────────────────────────────────────────────────

/**
 * Parse a single anime episode filename.
 *
 * Returns:
 *   { seriesName, episodeNumber, episodeNumberStr, displayTitle }
 *   or null if no episode number could be extracted.
 *
 * episodeNumber    — integer (absolute): parseInt("001") === parseInt("1") === 1
 * episodeNumberStr — raw digit string directly from filename ("001", "1", "100")
 *
 * This means:
 *   "001" → episodeNumber 1  (first episode)
 *   "01"  → episodeNumber 1  (same, first episode)
 *   "1"   → episodeNumber 1  (same, first episode)
 *   "100" → episodeNumber 100 (one-hundredth episode)
 *   "500" → episodeNumber 500 (five-hundredth episode)
 */
function parseAnimeFilename(filename) {
	const base = path.basename(filename, path.extname(filename));

	// Primary pattern: "Series Name Episode NNN[ -][ Title]"
	// Handles "Episode", "Ep.", "Ep " abbreviations
	// Series name portion may itself contain " - " so we use non-greedy match.
	// The episode keyword is the anchor.
	const primary = base.match(
		/^(.*?)\b(?:Episode|Ep\.?)\s+(\d{1,6})\b\s*[-–]?\s*(.*?)$/i,
	);

	if (primary) {
		// Strip trailing ` - ` or ` – ` from series name
		const seriesName = primary[1].replace(/[\s\-–]+$/, '').trim();
		const episodeNumberStr = primary[2];
		const rawTitle = primary[3].trim();
		const displayTitle = rawTitle ? cleanTitle(rawTitle) : '';

		return {
			seriesName,
			episodeNumber: parseInt(episodeNumberStr, 10),
			episodeNumberStr,
			displayTitle: displayTitle || null,
		};
	}

	// Fallback: no "Episode" keyword but filename ends in digits
	// e.g. "One Piece - 1042.mkv" or "DragonBall_042.mkv"
	const fallback = base.match(/^(.+?)[\s\-_.]+(\d{1,6})[\s\-_.]*(.*?)$/);
	if (fallback) {
		const seriesName = fallback[1].trim();
		const episodeNumberStr = fallback[2];
		const rawTitle = fallback[3].trim();

		return {
			seriesName,
			episodeNumber: parseInt(episodeNumberStr, 10),
			episodeNumberStr,
			displayTitle: rawTitle ? cleanTitle(rawTitle) : null,
		};
	}

	return null;
}

// ── Filler list loader ───────────────────────────────────────────────────────

/**
 * Looks for a "*Filler List.json" inside seriesDir and parses it.
 *
 * The JSON must have shape: { canon: ["001",...], mixed: ["007",...], filler: ["026",...] }
 * All episode number strings are converted to integers for comparison so
 * "001", "01", "1" all resolve to the same episode (integer 1).
 *
 * Returns { canonSet, mixedSet, fillerSet } as Set<number>, or null.
 */
function loadFillerList(seriesDir) {
	let fillerFilePath = null;

	try {
		const entries = fs.readdirSync(seriesDir);
		for (const entry of entries) {
			if (FILLER_FILE_RE.test(entry)) {
				fillerFilePath = path.join(seriesDir, entry);
				break;
			}
		}
	} catch {
		return null;
	}

	if (!fillerFilePath) return null;

	try {
		const data = JSON.parse(fs.readFileSync(fillerFilePath, 'utf8'));
		// Convert every entry to integer — handles any padding width
		const toIntSet = (arr) =>
			new Set((arr || []).map((s) => parseInt(String(s), 10)));
		return {
			canonSet: toIntSet(data.canon),
			mixedSet: toIntSet(data.mixed),
			fillerSet: toIntSet(data.filler),
		};
	} catch {
		return null;
	}
}

// ── Series directory processor ───────────────────────────────────────────────

/**
 * Walk a single series directory, collecting all video episodes.
 * Populates seriesMap in-place.
 *
 * seriesMap: Map<seriesId string, {
 *   name: string,
 *   seriesDir: string,
 *   episodes: Map<episodeNumber integer, episodeObject>
 * }>
 *
 * Deduplication: if two files share the same episode number (e.g. original
 * .mkv + upscaled .mp4), the one with the LARGER fileSize wins for the
 * filePath used at playback.
 */
function processSeriesDir(seriesDir, seriesMap) {
	let entries;
	try {
		entries = fs.readdirSync(seriesDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isFile() || !isVideoFile(entry.name)) continue;

		const fullPath = path.join(seriesDir, entry.name);
		const parsed = parseAnimeFilename(entry.name);
		if (!parsed) continue;

		// Derive series ID from parsed name, fall back to folder name
		const nameForId = parsed.seriesName || path.basename(seriesDir);
		const seriesId = slugify(nameForId);
		if (!seriesId) continue;

		if (!seriesMap.has(seriesId)) {
			seriesMap.set(seriesId, {
				name: parsed.seriesName || path.basename(seriesDir),
				seriesDir,
				episodes: new Map(),
			});
		}

		const seriesData = seriesMap.get(seriesId);
		const stats = statSafe(fullPath);
		const fileSize = stats ? stats.size : 0;

		const existing = seriesData.episodes.get(parsed.episodeNumber);

		if (existing) {
			// Keep the file with the larger size (prefer upscaled/higher-quality version)
			// but only replace if meaningfully larger (> 500 KB difference to avoid
			// replacing with a slightly-different-encode that isn't actually better)
			if (fileSize > existing.fileSize + 512 * 1024) {
				// Update filePath and fileSize but preserve the cleaner display title
				// by keeping whichever title doesn't contain quality tag remnants
				const betterTitle =
					parsed.displayTitle && !parsed.displayTitle.includes('_')
						? parsed.displayTitle
						: existing.displayTitle;
				seriesData.episodes.set(parsed.episodeNumber, {
					...existing,
					filePath: fullPath,
					filename: entry.name,
					fileSize,
					displayTitle: betterTitle || existing.displayTitle,
				});
			}
			continue;
		}

		seriesData.episodes.set(parsed.episodeNumber, {
			id: `${seriesId}-${parsed.episodeNumberStr}`,
			seriesId,
			episodeNumber: parsed.episodeNumber, // integer, used for sort + filler lookup
			episodeNumberStr: parsed.episodeNumberStr, // raw string from filename, used for display
			displayTitle: parsed.displayTitle || '',
			filePath: fullPath,
			filename: entry.name,
			fileSize,
			episodeType: 'canon', // overwritten below after filler data is loaded
			addedAt: stats ? stats.birthtime.toISOString() : new Date().toISOString(),
		});
	}
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Scan a list of anime source directories.
 *
 * Layout modes handled automatically:
 *   Mode A — source dir contains subdirs, each is a separate series:
 *     E:/Anime/  ← configured as source dir
 *       Naruto/          ← series dir
 *       Naruto Shippuden/ ← series dir
 *
 *   Mode B — source dir IS the series dir (contains video files directly):
 *     E:/Anime/Naruto/  ← configured as source dir
 *       Naruto Episode 001 - Enter Naruto Uzumaki!.mkv
 *       ...
 *
 *   Mode C — mixed: source dir has both video files AND subdirs
 *     Treats the source dir itself as an additional series alongside any subdirs.
 *
 * Returns:
 *   { series: AnimeSeriesObject[], totalSeries, totalEpisodes, scannedAt }
 *
 * AnimeSeriesObject:
 *   { id, name, path, totalEpisodes, canonCount, mixedCount, fillerCount,
 *     hasFillerData, episodes: AnimeEpisodeObject[] }
 *
 * AnimeEpisodeObject:
 *   { id, seriesId, episodeNumber, episodeNumberStr, displayTitle,
 *     filePath, filename, fileSize, episodeType, addedAt }
 *
 * Episodes are sorted ascending by absolute episodeNumber (integer).
 * Series are sorted alphabetically.
 */
async function scanAnime(sourceDirs) {
	// seriesId → { name, seriesDir, episodes: Map<int, obj> }
	const seriesMap = new Map();

	for (const dir of sourceDirs) {
		if (!fs.existsSync(dir)) continue;

		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		// Check whether the source dir itself has video files (Mode B / Mode C)
		const hasDirectVideos = entries.some(
			(e) => e.isFile() && isVideoFile(e.name),
		);

		if (hasDirectVideos) {
			// This directory IS a series (Mode B) — process it as-is
			processSeriesDir(dir, seriesMap);
		}

		// Also scan subdirectories (Mode A / Mode C)
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const subDir = path.join(dir, entry.name);
			processSeriesDir(subDir, seriesMap);
		}
	}

	// Finalise: load filler data, assign episode types, sort episodes
	const series = [];

	for (const [seriesId, data] of seriesMap) {
		const fillerData = loadFillerList(data.seriesDir);

		// Sort episodes by absolute episodeNumber (integer) ascending
		// This guarantees correct order regardless of filename padding:
		// ep 1, ep 2, ..., ep 9, ep 10, ep 11, ..., ep 100, ep 101, ...
		const episodes = Array.from(data.episodes.values()).sort(
			(a, b) => a.episodeNumber - b.episodeNumber,
		);

		// Assign episode types based on filler data
		if (fillerData) {
			for (const ep of episodes) {
				const n = ep.episodeNumber; // integer — matches regardless of original padding
				if (fillerData.fillerSet.has(n)) {
					ep.episodeType = 'filler';
				} else if (fillerData.mixedSet.has(n)) {
					ep.episodeType = 'mixed';
				} else {
					// Default to canon — episodes not in any list are treated as canon
					ep.episodeType = 'canon';
				}
			}
		}
		// If no filler data, all episodes remain 'canon' (set during collection)

		const canonCount = episodes.filter((e) => e.episodeType === 'canon').length;
		const mixedCount = episodes.filter((e) => e.episodeType === 'mixed').length;
		const fillerCount = episodes.filter(
			(e) => e.episodeType === 'filler',
		).length;

		series.push({
			id: seriesId,
			name: data.name,
			path: data.seriesDir,
			totalEpisodes: episodes.length,
			canonCount,
			mixedCount,
			fillerCount,
			hasFillerData: fillerData !== null,
			episodes,
		});
	}

	// Sort series alphabetically
	series.sort((a, b) => a.name.localeCompare(b.name));

	const totalEpisodes = series.reduce((n, s) => n + s.totalEpisodes, 0);

	return {
		series,
		totalSeries: series.length,
		totalEpisodes,
		scannedAt: new Date().toISOString(),
	};
}

module.exports = { scanAnime, parseAnimeFilename, loadFillerList };
