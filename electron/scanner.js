const fs = require('fs');
const path = require('path');

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
]);

const SEASON_DIR_PATTERNS = [
	/^season\s*(\d+)/i,
	/^s(\d+)$/i,
	/^series\s*(\d+)/i,
	/^saison\s*(\d+)/i,
	/^temporada\s*(\d+)/i,
];

// Directories whose contents should be treated as season 0 (Specials)
const SPECIAL_DIR_PATTERNS = [
	/^specials?$/i,
	/^extras?$/i,
	/^bonus/i,
	/^ovas?$/i,
	/^behind[- _]the[- _]scenes?/i,
	/^deleted[- _]scenes?/i,
	/^featurettes?/i,
	/^interviews?$/i,
	/^shorts?$/i,
	/^trailers?$/i,
	/^clips?$/i,
	/^season\s*0$/i,
];

function isSpecialDir(name) {
	return SPECIAL_DIR_PATTERNS.some((re) => re.test(name));
}

function isVideoFile(filename) {
	return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function parseSeasonFromDir(name) {
	for (const re of SEASON_DIR_PATTERNS) {
		const m = name.match(re);
		if (m) return parseInt(m[1], 10);
	}
	return null;
}

function parseEpisodeInfo(filename) {
	const base = path.basename(filename, path.extname(filename));

	// S01E01 / S1E1 / s01e01
	let m = base.match(/[Ss](\d{1,3})[Ee](\d{1,3})/);
	if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

	// 1x01 / 2x10
	m = base.match(/(?:^|[\.\s_-])(\d{1,2})x(\d{2,3})(?:[\.\s_-]|$)/);
	if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

	// Episode 01 / Ep 01 (no season → season 1)
	m = base.match(/[Ee]p(?:isode)?\s*\.?\s*(\d{1,3})/i);
	if (m) return { season: 1, episode: parseInt(m[1], 10) };

	// 3-digit: 101 = S01E01 style
	m = base.match(/(?:^|[\.\s_-])(\d)(\d{2})(?:[\.\s_-]|$)/);
	if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

	return { season: 1, episode: 0 };
}

function slugify(str) {
	return str
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();
}

function statSafe(p) {
	try {
		return fs.statSync(p);
	} catch {
		return null;
	}
}

function buildEpisode(filePath, seriesId, overrideSeason) {
	const { season, episode } = parseEpisodeInfo(filePath);
	const effectiveSeason = overrideSeason != null ? overrideSeason : season;
	const id = `${seriesId}-s${String(effectiveSeason).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
	const stats = statSafe(filePath);
	return {
		id,
		seriesId,
		key: `${effectiveSeason}-${episode}`,
		season: effectiveSeason,
		episode,
		filename: path.basename(filePath),
		filePath,
		fileSize: stats ? stats.size : 0,
		addedAt: stats ? stats.birthtime.toISOString() : new Date().toISOString(),
	};
}

function scanDir(dirPath) {
	try {
		return fs.readdirSync(dirPath, { withFileTypes: true });
	} catch {
		return [];
	}
}

function scanSeries(seriesPath, sourceDir) {
	const seriesName = path.basename(seriesPath);
	const seriesId = slugify(seriesName);
	const entries = scanDir(seriesPath);

	const seasonMap = new Map(); // number → episode[]

	for (const entry of entries) {
		const entryPath = path.join(seriesPath, entry.name);

		if (entry.isDirectory()) {
			const seasonNum = parseSeasonFromDir(entry.name);
			// Dirs like "Extras", "Specials", "Bonus" etc. map to season 0
			const dirOverride =
				seasonNum != null ? seasonNum : isSpecialDir(entry.name) ? 0 : null;
			const subEntries = scanDir(entryPath);

			// Recursively handle sub-season dirs
			for (const sub of subEntries) {
				if (sub.isFile() && isVideoFile(sub.name)) {
					const ep = buildEpisode(
						path.join(entryPath, sub.name),
						seriesId,
						dirOverride,
					);
					const sn = ep.season;
					if (!seasonMap.has(sn)) seasonMap.set(sn, []);
					seasonMap.get(sn).push(ep);
				} else if (sub.isDirectory() && dirOverride == null) {
					// Nested non-season dir: try one more level
					const subSeason = parseSeasonFromDir(sub.name);
					const subOverride =
						subSeason != null ? subSeason : isSpecialDir(sub.name) ? 0 : null;
					for (const leaf of scanDir(path.join(entryPath, sub.name))) {
						if (leaf.isFile() && isVideoFile(leaf.name)) {
							const ep = buildEpisode(
								path.join(entryPath, sub.name, leaf.name),
								seriesId,
								subOverride,
							);
							const sn = ep.season;
							if (!seasonMap.has(sn)) seasonMap.set(sn, []);
							seasonMap.get(sn).push(ep);
						}
					}
				}
			}
		} else if (entry.isFile() && isVideoFile(entry.name)) {
			const ep = buildEpisode(entryPath, seriesId, null);
			const sn = ep.season;
			if (!seasonMap.has(sn)) seasonMap.set(sn, []);
			seasonMap.get(sn).push(ep);
		}
	}

	const seasons = Array.from(seasonMap.entries())
		.sort(([a], [b]) => a - b)
		.map(([number, episodes]) => ({
			number,
			episodes: episodes.sort((a, b) => a.episode - b.episode),
		}));

	const totalEpisodes = seasons.reduce((s, sn) => s + sn.episodes.length, 0);
	const stats = statSafe(seriesPath);

	return {
		id: seriesId,
		name: seriesName,
		folderPath: seriesPath,
		sourceDir,
		seasons,
		totalSeasons: seasons.length,
		totalEpisodes,
		addedAt: stats ? stats.birthtime.toISOString() : new Date().toISOString(),
	};
}

// Directories that should never be treated as a TV series
const EXCLUDED_DIR_NAMES = new Set([
	'$recycle.bin',
	'recycler',
	'$windows.~bt',
	'$windows.~ws',
	'system volume information',
	'windows',
	'program files',
	'program files (x86)',
]);

function isExcludedDir(name) {
	// Skip hidden dirs (leading .) and Windows system dirs (leading $)
	if (name.startsWith('.') || name.startsWith('$')) return true;
	return EXCLUDED_DIR_NAMES.has(name.toLowerCase());
}

async function scanLibrary(sourceDirs) {
	const series = [];

	for (const sourceDir of sourceDirs || []) {
		if (!fs.existsSync(sourceDir)) continue;
		for (const entry of scanDir(sourceDir)) {
			if (!entry.isDirectory()) continue;
			if (isExcludedDir(entry.name)) continue;
			try {
				const s = scanSeries(path.join(sourceDir, entry.name), sourceDir);
				series.push(s);
			} catch (err) {
				console.error(`Scan error for ${entry.name}:`, err.message);
			}
		}
	}

	return {
		lastScanned: new Date().toISOString(),
		sourceDirs: sourceDirs || [],
		totalSeries: series.length,
		series: series.sort((a, b) => a.name.localeCompare(b.name)),
	};
}

module.exports = { scanLibrary };
