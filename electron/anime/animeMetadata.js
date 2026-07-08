const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// AniList GraphQL endpoint — free, no API key required
const ANILIST_URL = 'https://graphql.anilist.co';
// Jikan (MAL) REST API — free, no API key required
const JIKAN_BASE = 'https://api.jikan.moe/v4';

function httpGet(url) {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const req = mod.get(url, { timeout: 15000 }, (res) => {
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

function httpPost(url, body) {
	return new Promise((resolve, reject) => {
		const payload = JSON.stringify(body);
		const urlObj = new URL(url);
		const opts = {
			hostname: urlObj.hostname,
			path: urlObj.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'Content-Length': Buffer.byteLength(payload),
			},
			timeout: 15000,
		};
		const req = https.request(opts, (res) => {
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
		req.write(payload);
		req.end();
	});
}

function downloadFile(url, destPath) {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const tmp = destPath + '.tmp';
		const file = fs.createWriteStream(tmp);
		const req = mod.get(url, { timeout: 20000 }, (res) => {
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

function safeAnimeId(name) {
	return (name || '')
		.toLowerCase()
		.replace(/[^\w]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

function stripHtml(str) {
	return (str || '')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.trim();
}

const ANILIST_STATUS_MAP = {
	FINISHED: 'Ended',
	RELEASING: 'Airing',
	NOT_YET_RELEASED: 'Upcoming',
	CANCELLED: 'Cancelled',
	HIATUS: 'Hiatus',
};

async function fetchJikanEpisodeMetadata(malId) {
	if (!malId) return {};

	const episodes = {};
	let page = 1;
	let hasNextPage = true;

	while (hasNextPage) {
		const res = await httpGet(
			`${JIKAN_BASE}/anime/${malId}/episodes?page=${page}`,
		);

		for (const episode of res?.data || []) {
			if (!episode?.mal_id) continue;
			episodes[String(episode.mal_id)] = {
				title:
					episode.title ||
					episode.title_romanji ||
					episode.title_japanese ||
					'',
				overview: stripHtml(episode.synopsis || ''),
				airDate: episode.aired || null,
				filler: episode.filler === true,
				recap: episode.recap === true,
			};
		}

		hasNextPage = res?.pagination?.has_next_page === true;
		page += 1;
	}

	return episodes;
}

/**
 * Fetch anime metadata using AniList GraphQL (primary) with Jikan REST (fallback).
 *
 * @param {string} seriesName   — anime series name as scanned from disk
 * @param {string} postersDir   — absolute path to posters directory
 * @param {string} backdropsDir — absolute path to backdrops directory
 * @returns {object}            — structured metadata ready for anime/metadata.json
 */
async function fetchAnimeMetadata(seriesName, postersDir, backdropsDir) {
	const sid = safeAnimeId(seriesName);

	const empty = {
		title: seriesName,
		year: null,
		overview: '',
		genres: [],
		rating: null,
		posterPath: null,
		backdropPath: null,
		anilistId: null,
		malId: null,
		status: null,
		totalEpisodes: null,
		studio: null,
		episodes: {},
	};

	if (!seriesName) return empty;

	// ── AniList (primary) ─────────────────────────────────────────────────────
	try {
		const query = `
			query ($search: String) {
				Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
					id
					idMal
					title { romaji english native }
					description(asHtml: false)
					genres
					coverImage { extraLarge large }
					bannerImage
					averageScore
					startDate { year }
					status
					episodes
					studios(isMain: true) { nodes { name } }
				}
			}
		`;

		const res = await httpPost(ANILIST_URL, {
			query,
			variables: { search: seriesName },
		});

		const media = res?.data?.Media;

		if (media) {
			const title = media.title.english || media.title.romaji || seriesName;
			const overview = stripHtml(media.description);
			const rating = media.averageScore
				? Math.round(media.averageScore) / 10
				: null;
			const year = media.startDate?.year || null;
			const studio = media.studios?.nodes?.[0]?.name || null;
			const status = ANILIST_STATUS_MAP[media.status] || media.status || null;

			// Download poster (coverImage.extraLarge is the best quality)
			let posterPath = null;
			const posterUrl = media.coverImage?.extraLarge || media.coverImage?.large;
			if (posterUrl) {
				const dest = path.join(postersDir, `anime-${sid}.jpg`);
				if (!fs.existsSync(dest)) {
					await downloadFile(posterUrl, dest).catch(() => {});
				}
				if (fs.existsSync(dest)) posterPath = dest;
			}

			// Download backdrop (bannerImage is wide-format — ideal backdrop)
			let backdropPath = null;
			if (media.bannerImage) {
				const dest = path.join(backdropsDir, `anime-${sid}.jpg`);
				if (!fs.existsSync(dest)) {
					await downloadFile(media.bannerImage, dest).catch(() => {});
				}
				if (fs.existsSync(dest)) backdropPath = dest;
			}

			// Fallback: use poster as backdrop if no banner available
			if (!backdropPath && posterPath) {
				backdropPath = posterPath;
			}

			let episodes = {};
			if (media.idMal) {
				try {
					episodes = await fetchJikanEpisodeMetadata(media.idMal);
				} catch (episodeErr) {
					console.error(
						`[animeMetadata] Jikan episode fetch error for "${seriesName}":`,
						episodeErr.message,
					);
				}
			}

			return {
				title,
				year,
				overview,
				genres: media.genres || [],
				rating,
				posterPath,
				backdropPath,
				anilistId: media.id,
				malId: media.idMal || null,
				status,
				totalEpisodes: media.episodes || null,
				studio,
				episodes,
			};
		}
	} catch (err) {
		console.error(
			`[animeMetadata] AniList error for "${seriesName}":`,
			err.message,
		);
	}

	// ── Jikan / MAL fallback ──────────────────────────────────────────────────
	try {
		// Rate-limit friendly: Jikan allows ~3 req/s
		const q = encodeURIComponent(seriesName);
		const searchRes = await httpGet(
			`${JIKAN_BASE}/anime?q=${q}&limit=5&order_by=relevance&sfw=false`,
		);
		const match = searchRes?.data?.[0];

		if (match) {
			const title = match.title_english || match.title || seriesName;
			const overview = stripHtml(match.synopsis || '');
			const rating = match.score ? Math.round(match.score * 10) / 10 : null;
			const year = match.aired?.prop?.from?.year || null;
			const status = match.status || null;
			const studio = match.studios?.[0]?.name || null;

			// Download poster
			let posterPath = null;
			const posterUrl =
				match.images?.jpg?.large_image_url || match.images?.jpg?.image_url;
			if (posterUrl) {
				const dest = path.join(postersDir, `anime-${sid}.jpg`);
				if (!fs.existsSync(dest)) {
					await downloadFile(posterUrl, dest).catch(() => {});
				}
				if (fs.existsSync(dest)) posterPath = dest;
			}

			// Jikan has no backdrop — use poster for both
			const backdropPath = posterPath;

			let episodes = {};
			if (match.mal_id) {
				try {
					episodes = await fetchJikanEpisodeMetadata(match.mal_id);
				} catch (episodeErr) {
					console.error(
						`[animeMetadata] Jikan episode fetch error for "${seriesName}":`,
						episodeErr.message,
					);
				}
			}

			return {
				title,
				year,
				overview,
				genres: (match.genres || []).map((g) => g.name),
				rating,
				posterPath,
				backdropPath,
				anilistId: null,
				malId: match.mal_id || null,
				status,
				totalEpisodes: match.episodes || null,
				studio,
				episodes,
			};
		}
	} catch (err) {
		console.error(
			`[animeMetadata] Jikan error for "${seriesName}":`,
			err.message,
		);
	}

	return empty;
}

module.exports = { fetchAnimeMetadata, safeAnimeId };
