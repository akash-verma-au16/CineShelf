const fs = require('fs');

function getHistory(historyFile) {
	try {
		if (fs.existsSync(historyFile)) {
			return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
		}
	} catch (e) {
		console.error('Error reading history:', e.message);
	}
	return {};
}

function updateHistory(historyFile, entry) {
	if (!entry || !entry.key) return;
	const history = getHistory(historyFile);
	history[entry.key] = {
		...(history[entry.key] || {}),
		...entry,
		lastWatched: entry.lastWatched || new Date().toISOString(),
	};
	try {
		fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
	} catch (e) {
		console.error('Error writing history:', e.message);
	}
}

function clearSeriesHistory(historyFile, seriesId) {
	const history = getHistory(historyFile);
	const updated = {};
	for (const [key, entry] of Object.entries(history)) {
		// Match only entries that belong to this exact series.
		// Deliberately NO key.startsWith(seriesId+'-') fallback — that would
		// incorrectly delete spin-offs whose ID happens to start with the same
		// prefix (e.g. "ncis" would match "ncis-tony-and-ziva").
		// sanitizeHistory() on startup ensures every episode entry has seriesId set.
		const belongs = entry.seriesId === seriesId || key === `series:${seriesId}`;
		if (!belongs) {
			updated[key] = entry;
		}
	}
	try {
		fs.writeFileSync(historyFile, JSON.stringify(updated, null, 2));
	} catch (e) {
		console.error('Error writing history:', e.message);
	}
	return updated;
}

/**
 * Sanitizes history.json by cross-referencing the library to fill in any
 * fields that were stripped by the old PATCH_HISTORY partial-overwrite bug
 * (missing seriesId, season, episode, filePath). Also ensures every entry
 * carries its own key as a field. Safe to run on every startup — it only
 * writes back when it actually finds something to fix.
 *
 * @param {string} historyFile  - path to history.json
 * @param {object} library      - parsed library.json object ({ series: [...] })
 * @returns {number} count of entries that were repaired
 */
function sanitizeHistory(historyFile, library) {
	if (!library || !library.series) return 0;

	// Build a fast lookup: episodeId -> { seriesId, season, episode, filePath }
	const epLookup = {};
	for (const series of library.series) {
		for (const season of series.seasons || []) {
			for (const ep of season.episodes || []) {
				epLookup[ep.id] = {
					seriesId: series.id,
					season: ep.season,
					episode: ep.episode,
					filePath: ep.filePath,
				};
			}
		}
	}

	const history = getHistory(historyFile);
	let repaired = 0;
	let changed = false;

	for (const [key, entry] of Object.entries(history)) {
		if (!entry) continue;
		let dirty = false;

		// Every entry must carry its own key as a field
		if (!entry.key) {
			entry.key = key;
			dirty = true;
		}

		// Skip series-level entries (series:seriesId) — they don't have ep fields
		if (key.startsWith('series:')) continue;

		// Attempt to recover missing episode-level fields from the library
		const lib = epLookup[key];
		if (lib) {
			if (!entry.seriesId) {
				entry.seriesId = lib.seriesId;
				dirty = true;
			}
			if (entry.season === undefined || entry.season === null) {
				entry.season = lib.season;
				dirty = true;
			}
			if (entry.episode === undefined || entry.episode === null) {
				entry.episode = lib.episode;
				dirty = true;
			}
			if (!entry.filePath) {
				entry.filePath = lib.filePath;
				dirty = true;
			}
		}

		if (dirty) {
			history[key] = entry;
			repaired++;
			changed = true;
		}
	}

	if (changed) {
		try {
			fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
			console.log('[History] Sanitized', repaired, 'entries');
		} catch (e) {
			console.error('[History] Sanitize write error:', e.message);
		}
	}

	return repaired;
}

module.exports = {
	getHistory,
	updateHistory,
	clearSeriesHistory,
	sanitizeHistory,
};
