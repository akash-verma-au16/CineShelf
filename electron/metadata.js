const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

function httpGet(url) {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const req = mod.get(url, { timeout: 10000 }, (res) => {
			if (res.statusCode === 301 || res.statusCode === 302) {
				return httpGet(res.headers.location).then(resolve).catch(reject);
			}
			let data = '';
			res.on('data', (c) => (data += c));
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', reject);
		req.on('timeout', () => {
			req.destroy();
			reject(new Error('Request timed out'));
		});
	});
}

function downloadFile(url, destPath) {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const tmp = destPath + '.tmp';
		const file = fs.createWriteStream(tmp);
		const req = mod.get(url, { timeout: 15000 }, (res) => {
			if (res.statusCode !== 200) {
				fs.unlink(tmp, () => {});
				return reject(new Error(`HTTP ${res.statusCode}`));
			}
			res.pipe(file);
			file.on('finish', () => {
				file.close(() => {
					fs.rename(tmp, destPath, (err) => {
						if (err) reject(err);
						else resolve(destPath);
					});
				});
			});
		});
		req.on('error', (e) => {
			fs.unlink(tmp, () => {});
			reject(e);
		});
		req.on('timeout', () => {
			req.destroy();
			reject(new Error('Download timed out'));
		});
	});
}

function safeId(name) {
	return name
		.toLowerCase()
		.replace(/[^\w]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Try TVMaze (free, no API key) as a fallback image source.
 * Returns { posterPath, title, overview, year } — no backdrop available.
 */
async function fetchFromTVMaze(seriesName, postersDir) {
	try {
		const results = await httpGet(
			`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(seriesName)}`,
		);
		if (!Array.isArray(results) || !results.length) return {};
		const show = results[0].show;
		if (!show) return {};

		let posterPath = null;
		const imageUrl = show.image?.original || show.image?.medium;
		if (imageUrl) {
			const sid = safeId(seriesName);
			const dest = path.join(postersDir, `${sid}.jpg`);
			if (!fs.existsSync(dest)) {
				await downloadFile(imageUrl, dest).catch(() => {});
			}
			if (fs.existsSync(dest)) posterPath = dest;
		}

		// Strip HTML tags from TVMaze summary
		const overview = show.summary
			? show.summary.replace(/<[^>]+>/g, '').trim()
			: '';

		return {
			posterPath,
			title: show.name || seriesName,
			overview,
			year: show.premiered ? show.premiered.slice(0, 4) : '',
			genres: show.genres || [],
			rating: show.rating?.average || null,
			networks: show.network?.name ? [show.network.name] : [],
		};
	} catch {
		return {};
	}
}

async function fetchSeriesMetadata(
	seriesName,
	apiKey,
	postersDir,
	backdropsDir,
) {
	const empty = {
		title: seriesName,
		overview: '',
		genres: [],
		year: '',
		endYear: '',
		rating: null,
		posterPath: null,
		backdropPath: null,
		cast: [],
		tmdbId: null,
		episodes: {},
		status: null,
		networks: [],
		numberOfSeasons: 0,
	};

	// ── TMDb path ──────────────────────────────────────────────────────────────
	if (apiKey && apiKey.trim()) {
		try {
			const searchRes = await httpGet(
				`${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(seriesName)}&language=en-US`,
			);

			if (searchRes.results?.length) {
				const show = searchRes.results[0];
				const tmdbId = show.id;

				const [details, credits, imagesData] = await Promise.all([
					httpGet(`${TMDB_BASE}/tv/${tmdbId}?api_key=${apiKey}&language=en-US`),
					httpGet(
						`${TMDB_BASE}/tv/${tmdbId}/credits?api_key=${apiKey}&language=en-US`,
					).catch(() => ({ cast: [] })),
					// /images returns all available poster + backdrop files with vote averages
					httpGet(
						`${TMDB_BASE}/tv/${tmdbId}/images?api_key=${apiKey}&include_image_language=en,null`,
					).catch(() => ({})),
				]);

				const sid = safeId(seriesName);

				// Pick best-voted poster and backdrop from the /images response;
				// fall back to the defaults in the show details.
				const allPosters = (imagesData.posters || []).filter(
					(p) => p.file_path,
				);
				const allBackdrops = (imagesData.backdrops || []).filter(
					(b) => b.file_path,
				);
				allPosters.sort(
					(a, b) => (b.vote_average || 0) - (a.vote_average || 0),
				);
				allBackdrops.sort(
					(a, b) => (b.vote_average || 0) - (a.vote_average || 0),
				);
				const bestPosterFile =
					allPosters[0]?.file_path || details.poster_path || null;
				const bestBackdropFile =
					allBackdrops[0]?.file_path || details.backdrop_path || null;

				// Download poster
				let posterPath = null;
				if (bestPosterFile) {
					const dest = path.join(postersDir, `${sid}.jpg`);
					if (!fs.existsSync(dest)) {
						await downloadFile(`${TMDB_IMG}/w500${bestPosterFile}`, dest).catch(
							() => {},
						);
					}
					if (fs.existsSync(dest)) posterPath = dest;
				}

				// Download backdrop
				let backdropPath = null;
				if (bestBackdropFile) {
					const dest = path.join(backdropsDir, `${sid}.jpg`);
					if (!fs.existsSync(dest)) {
						await downloadFile(
							`${TMDB_IMG}/w1280${bestBackdropFile}`,
							dest,
						).catch(() => {});
					}
					if (fs.existsSync(dest)) backdropPath = dest;
				}

				// If TMDb didn't provide a poster, try TVMaze for the poster only
				if (!posterPath) {
					const tvmaze = await fetchFromTVMaze(seriesName, postersDir);
					if (tvmaze.posterPath) posterPath = tvmaze.posterPath;
				}

				// Fetch episode + season data (throttled to avoid TMDb rate limits)
				const episodesMeta = {};
				const seasonsMeta = {};
				const seasons = (details.seasons || []).filter(
					(s) => s.season_number > 0,
				);
				for (const season of seasons) {
					try {
						const [sd, seasonImagesData] = await Promise.all([
							httpGet(
								`${TMDB_BASE}/tv/${tmdbId}/season/${season.season_number}?api_key=${apiKey}&language=en-US`,
							),
							httpGet(
								`${TMDB_BASE}/tv/${tmdbId}/season/${season.season_number}/images?api_key=${apiKey}&include_image_language=en,null`,
							).catch(() => ({})),
						]);

						// Download season poster
						let seasonPosterPath = null;
						if (sd.poster_path) {
							const spdest = path.join(
								postersDir,
								`${sid}_s${season.season_number}.jpg`,
							);
							if (!fs.existsSync(spdest)) {
								await downloadFile(
									`${TMDB_IMG}/w342${sd.poster_path}`,
									spdest,
								).catch(() => {});
							}
							if (fs.existsSync(spdest)) seasonPosterPath = spdest;
						}

						// Download season backdrop.
						// TMDB rarely provides season-level backdrops, so fall back to
						// Episode 1's still image (16:9, season-specific) when none exist.
						let seasonBackdropPath = null;
						const seasonBackdrops = (seasonImagesData.backdrops || []).filter(
							(b) => b.file_path,
						);
						seasonBackdrops.sort(
							(a, b) => (b.vote_average || 0) - (a.vote_average || 0),
						);
						const bestSeasonBackdropFile =
							seasonBackdrops[0]?.file_path || null;

						// Pick the best available still from early episodes as fallback
						const ep1Still =
							(sd.episodes || []).find((e) => e.still_path)?.still_path || null;

						const backdropSource = bestSeasonBackdropFile
							? { url: `${TMDB_IMG}/w1280${bestSeasonBackdropFile}` }
							: ep1Still
								? { url: `${TMDB_IMG}/w780${ep1Still}` }
								: null;

						if (backdropSource) {
							const sbdest = path.join(
								backdropsDir,
								`${sid}_s${season.season_number}.jpg`,
							);
							if (!fs.existsSync(sbdest)) {
								await downloadFile(backdropSource.url, sbdest).catch(() => {});
							}
							if (fs.existsSync(sbdest)) seasonBackdropPath = sbdest;
						}

						seasonsMeta[season.season_number] = {
							name: sd.name || `Season ${season.season_number}`,
							overview: sd.overview || '',
							airDate: sd.air_date || null,
							episodeCount: (sd.episodes || []).length,
							posterPath: seasonPosterPath,
							backdropPath: seasonBackdropPath,
							backdropChecked: true,
						};

						for (const ep of sd.episodes || []) {
							episodesMeta[`${season.season_number}-${ep.episode_number}`] = {
								title: ep.name || '',
								overview: ep.overview || '',
								runtime: ep.runtime || null,
								airDate: ep.air_date || null,
								stillUrl: ep.still_path
									? `${TMDB_IMG}/w300${ep.still_path}`
									: null,
							};
						}
						// Small delay to respect TMDb rate limit (40 req/10s)
						await new Promise((r) => setTimeout(r, 260));
					} catch (e) {
						console.warn(
							`Season ${season.season_number} fetch failed:`,
							e.message,
						);
					}
				}

				return {
					title: details.name || seriesName,
					overview: details.overview || '',
					genres: (details.genres || []).map((g) => g.name),
					year: details.first_air_date
						? details.first_air_date.slice(0, 4)
						: '',
					endYear: details.last_air_date
						? details.last_air_date.slice(0, 4)
						: '',
					rating: details.vote_average
						? Math.round(details.vote_average * 10) / 10
						: null,
					posterPath,
					backdropPath,
					cast: (credits.cast || []).slice(0, 12).map((m) => m.name),
					tmdbId,
					status: details.status || null,
					networks: (details.networks || []).map((n) => n.name),
					numberOfSeasons: details.number_of_seasons || 0,
					seasons: seasonsMeta,
					episodes: episodesMeta,
				};
			}
		} catch (err) {
			console.error(`TMDb metadata error for "${seriesName}":`, err.message);
		}
	}

	// ── TVMaze fallback (no API key required) ─────────────────────────────────
	console.log(`TMDb unavailable for "${seriesName}" — trying TVMaze fallback…`);
	try {
		const tvmaze = await fetchFromTVMaze(seriesName, postersDir);
		if (tvmaze.posterPath || tvmaze.title) {
			return {
				...empty,
				title: tvmaze.title || seriesName,
				overview: tvmaze.overview || '',
				genres: tvmaze.genres || [],
				year: tvmaze.year || '',
				rating: tvmaze.rating || null,
				posterPath: tvmaze.posterPath || null,
				networks: tvmaze.networks || [],
			};
		}
	} catch (err) {
		console.error(`TVMaze fallback error for "${seriesName}":`, err.message);
	}

	return empty;
}

/**
 * Background task: download episode still images that are not yet cached locally.
 * Safe to call repeatedly — skips entries where stillLocalPath exists and the
 * file is already on disk. Only intended to run when internet is available.
 *
 * Stills are downloaded at w780 (higher than the w300 URL stored in stillUrl)
 * so they can later be offered as backdrop candidates per episode.
 *
 * @param {Object}   allMeta      Full metadata object keyed by seriesId
 * @param {string}   stillsDir    Absolute path to the stills cache directory
 * @param {Function} onSeriesDone Called after each series batch completes:
 *                                (seriesId, updatedSeriesMeta, { downloaded, failed })
 * @returns {Promise<{total, downloaded, skipped, failed}>}
 */
async function cacheEpisodeStills(allMeta, stillsDir, onSeriesDone) {
	let total = 0;
	let downloaded = 0;
	let skipped = 0;
	let failed = 0;

	for (const [seriesId, meta] of Object.entries(allMeta)) {
		if (!meta?.episodes) continue;

		const sid = safeId(meta.title || seriesId);
		let seriesDownloaded = 0;
		let seriesFailed = 0;
		let seriesDirty = false;

		for (const [key, ep] of Object.entries(meta.episodes)) {
			if (!ep.stillUrl) continue;

			total++;

			// Already cached and file is present on disk — nothing to do
			if (ep.stillLocalPath && fs.existsSync(ep.stillLocalPath)) {
				skipped++;
				continue;
			}

			// Derive the w780 download URL from the stored w300 stillUrl
			// stillUrl format: https://image.tmdb.org/t/p/w300/abc123.jpg
			const stillFilePath = ep.stillUrl.slice(`${TMDB_IMG}/w300`.length);
			const downloadUrl = `${TMDB_IMG}/w780${stillFilePath}`;

			// e.g. breaking-bad_s1e4.jpg
			const [season, episode] = key.split('-');
			const fileName = `${sid}_s${season}e${episode}.jpg`;
			const destPath = path.join(stillsDir, fileName);

			try {
				if (!fs.existsSync(destPath)) {
					await downloadFile(downloadUrl, destPath);
				}
				if (fs.existsSync(destPath)) {
					ep.stillLocalPath = destPath;
					seriesDirty = true;
					downloaded++;
					seriesDownloaded++;
				} else {
					failed++;
					seriesFailed++;
				}
			} catch {
				failed++;
				seriesFailed++;
			}
		}

		if (seriesDirty && onSeriesDone) {
			onSeriesDone(seriesId, meta, {
				downloaded: seriesDownloaded,
				failed: seriesFailed,
			});
		}
	}

	return { total, downloaded, skipped, failed };
}

module.exports = { fetchSeriesMetadata, safeId, cacheEpisodeStills };
