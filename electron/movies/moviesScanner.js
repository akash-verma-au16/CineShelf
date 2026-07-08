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

/**
 * Strip common quality/release tags from a filename to get a clean movie title.
 * Also extracts the year if present.
 */
function parseMovieName(raw) {
	// Remove extension
	let base = path.basename(raw, path.extname(raw));

	// Extract year (4 digits between 1900-2099)
	let year = null;
	const yearMatch = base.match(/[\.\s\-_([]*((?:19|20)\d{2})[\.\s\-_)\]]/);
	if (yearMatch) year = yearMatch[1];

	// Cut off everything from the year onward (quality tags follow year)
	if (year) {
		const idx = base.indexOf(year);
		base = base.slice(0, idx);
	}

	// Replace dots/underscores with spaces, trim
	const title = base.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

	return { title: title || raw, year };
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
 * Scan a list of source directories for movie files.
 * Returns { movies: [...], totalMovies: N, scannedAt: ISO }
 *
 * Movie object shape:
 *   id        - unique slug (name-year or name if no year)
 *   name      - clean display title
 *   year      - string year or null
 *   filePath  - absolute path to the video file
 *   filename  - basename of the video file
 *   fileSize  - bytes
 *   sourceDir - which source dir this came from
 *   addedAt   - file birth time ISO string
 */
async function scanMovies(sourceDirs) {
	const movies = [];
	const seenPaths = new Set();

	for (const dir of sourceDirs) {
		if (!fs.existsSync(dir)) continue;

		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isFile() && isVideoFile(entry.name)) {
				// Direct movie file in source dir
				if (seenPaths.has(fullPath)) continue;
				seenPaths.add(fullPath);

				const { title, year } = parseMovieName(entry.name);
				const id = slugify(`${title}${year ? `-${year}` : ''}`);
				const stats = statSafe(fullPath);

				movies.push({
					id,
					name: title,
					year,
					filePath: fullPath,
					filename: entry.name,
					fileSize: stats ? stats.size : 0,
					sourceDir: dir,
					addedAt: stats
						? stats.birthtime.toISOString()
						: new Date().toISOString(),
				});
			} else if (entry.isDirectory()) {
				// Movie folder — find the primary video file inside
				let subEntries;
				try {
					subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
				} catch {
					continue;
				}

				const videoFiles = subEntries
					.filter((e) => e.isFile() && isVideoFile(e.name))
					.map((e) => {
						const fp = path.join(fullPath, e.name);
						const stats = statSafe(fp);
						return {
							name: e.name,
							filePath: fp,
							fileSize: stats ? stats.size : 0,
							stats,
						};
					});

				if (!videoFiles.length) continue;

				// Pick the largest video file (main feature, not trailers)
				videoFiles.sort((a, b) => b.fileSize - a.fileSize);
				const primary = videoFiles[0];

				if (seenPaths.has(primary.filePath)) continue;
				seenPaths.add(primary.filePath);

				// Prefer folder name for title (usually cleaner than filename)
				const { title, year } = parseMovieName(entry.name);
				const id = slugify(`${title}${year ? `-${year}` : ''}`);

				movies.push({
					id,
					name: title,
					year,
					filePath: primary.filePath,
					filename: primary.name,
					fileSize: primary.fileSize,
					sourceDir: dir,
					addedAt: primary.stats
						? primary.stats.birthtime.toISOString()
						: new Date().toISOString(),
				});
			}
		}
	}

	// Sort alphabetically
	movies.sort((a, b) => a.name.localeCompare(b.name));

	return {
		movies,
		totalMovies: movies.length,
		scannedAt: new Date().toISOString(),
	};
}

module.exports = { scanMovies };
