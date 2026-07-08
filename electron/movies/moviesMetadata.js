const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

function uniqStrings(items) {
	return Array.from(new Set((items || []).filter(Boolean)));
}

function pickRegionCode(preferred, availableCodes) {
	const codes = new Set((availableCodes || []).filter(Boolean));
	if (preferred && codes.has(preferred)) return preferred;
	if (codes.has('IN')) return 'IN';
	if (codes.has('US')) return 'US';
	return availableCodes?.[0] || null;
}

function pickCertificationForRegion(releaseDates, regionCode) {
	const regionBlock = (releaseDates?.results || []).find(
		(r) => r.iso_3166_1 === regionCode,
	);
	if (!regionBlock?.release_dates?.length) return null;

	const withCert = regionBlock.release_dates.find((rd) => rd.certification);
	return withCert?.certification || null;
}

function pickBestTrailer(videos) {
	const list = videos?.results || [];
	const yt = list.filter((v) => v.site === 'YouTube');

	const pick = (arr) =>
		arr.find((v) => v.type === 'Trailer' && v.official) ||
		arr.find((v) => v.type === 'Trailer') ||
		arr.find((v) => v.type === 'Teaser' && v.official) ||
		arr.find((v) => v.type === 'Teaser') ||
		arr[0] ||
		null;

	return pick(yt) || pick(list);
}

function summarizeWatchProviders(watchProviders, preferredRegion) {
	const results = watchProviders?.results || {};
	const codes = Object.keys(results);
	if (codes.length === 0) return null;

	const region = pickRegionCode(preferredRegion, codes);
	const block = region ? results[region] : null;
	if (!block) return null;

	const names = (arr) => uniqStrings((arr || []).map((p) => p.provider_name));

	return {
		region,
		link: block.link || null,
		flatrate: names(block.flatrate),
		rent: names(block.rent),
		buy: names(block.buy),
	};
}

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

function safeMovieId(name, year) {
	const slug = name
		.toLowerCase()
		.replace(/[^\w]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return year ? `${slug}-${year}` : slug;
}

/**
 * Fetch TMDB metadata for a movie.
 * Returns an object suitable for storing in movies/metadata.json.
 */
async function fetchMovieMetadata(
	movieName,
	year,
	apiKey,
	postersDir,
	backdropsDir,
) {
	const empty = {
		title: movieName,
		year: year || null,
		overview: '',
		genres: [],
		runtime: null,
		rating: null,
		posterPath: null,
		backdropPath: null,
		cast: [],
		director: null,
		collection: null,
		tmdbId: null,
		tagline: '',
		status: null,
		budget: null,
		revenue: null,
		releaseDate: null,
		certification: null,
		originalTitle: null,
		originalLanguage: null,
		spokenLanguages: [],
		productionCompanies: [],
		productionCountries: [],
		homepage: null,
		imdbId: null,
		externalIds: null,
		keywords: [],
		trailer: null,
		watchProviders: null,
		enhanced: false,
	};

	if (!apiKey || !apiKey.trim()) return empty;

	try {
		const query = encodeURIComponent(movieName);
		const yearParam = year ? `&year=${year}` : '';
		const searchRes = await httpGet(
			`${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${query}${yearParam}&language=en-US`,
		);

		if (!searchRes.results?.length) return empty;

		// Prefer exact year match, then take first result
		let movie =
			searchRes.results.find((r) => year && r.release_date?.startsWith(year)) ||
			searchRes.results[0];

		const tmdbId = movie.id;
		const sid = safeMovieId(movieName, year);

		const [
			details,
			credits,
			imagesData,
			externalIds,
			keywordsData,
			releaseDates,
			videos,
			watchProviders,
		] = await Promise.all([
			httpGet(`${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&language=en-US`),
			httpGet(
				`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${apiKey}&language=en-US`,
			).catch(() => ({ cast: [], crew: [] })),
			httpGet(
				`${TMDB_BASE}/movie/${tmdbId}/images?api_key=${apiKey}&include_image_language=en,null`,
			).catch(() => ({})),
			httpGet(
				`${TMDB_BASE}/movie/${tmdbId}/external_ids?api_key=${apiKey}`,
			).catch(() => null),
			httpGet(`${TMDB_BASE}/movie/${tmdbId}/keywords?api_key=${apiKey}`).catch(
				() => ({ keywords: [] }),
			),
			httpGet(
				`${TMDB_BASE}/movie/${tmdbId}/release_dates?api_key=${apiKey}`,
			).catch(() => ({ results: [] })),
			httpGet(
				`${TMDB_BASE}/movie/${tmdbId}/videos?api_key=${apiKey}&language=en-US`,
			).catch(() => ({ results: [] })),
			httpGet(
				`${TMDB_BASE}/movie/${tmdbId}/watch/providers?api_key=${apiKey}`,
			).catch(() => ({ results: {} })),
		]);

		// Pick best poster and backdrop
		const allPosters = (imagesData.posters || []).filter((p) => p.file_path);
		const allBackdrops = (imagesData.backdrops || []).filter(
			(b) => b.file_path,
		);
		allPosters.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
		allBackdrops.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

		const bestPosterFile =
			allPosters[0]?.file_path || details.poster_path || null;
		const bestBackdropFile =
			allBackdrops[0]?.file_path || details.backdrop_path || null;

		// Download poster
		let posterPath = null;
		if (bestPosterFile) {
			const dest = path.join(postersDir, `movies-${sid}.jpg`);
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
			const dest = path.join(backdropsDir, `movies-${sid}.jpg`);
			if (!fs.existsSync(dest)) {
				await downloadFile(`${TMDB_IMG}/w1280${bestBackdropFile}`, dest).catch(
					() => {},
				);
			}
			if (fs.existsSync(dest)) backdropPath = dest;
		}

		// Top 10 cast
		const cast = (credits.cast || []).slice(0, 10).map((c) => ({
			name: c.name,
			character: c.character,
			profilePath: null, // skip downloading profile images
		}));

		// Director
		const director =
			(credits.crew || []).find((c) => c.job === 'Director')?.name || null;

		const releaseYear = details.release_date
			? details.release_date.slice(0, 4)
			: year || null;

		const keywords = uniqStrings(
			(keywordsData.keywords || []).map((k) => k.name),
		);
		const trailer = pickBestTrailer(videos);
		const watchProvidersSummary = summarizeWatchProviders(watchProviders, 'IN');
		const certification = pickCertificationForRegion(
			releaseDates,
			watchProvidersSummary?.region || 'IN',
		);

		return {
			title: details.title || movieName,
			year: releaseYear,
			overview: details.overview || '',
			genres: (details.genres || []).map((g) => g.name),
			runtime: details.runtime || null,
			rating: details.vote_average
				? Math.round(details.vote_average * 10) / 10
				: null,
			posterPath,
			backdropPath,
			cast,
			director,
			collection: details.belongs_to_collection
				? {
						id: details.belongs_to_collection.id,
						name: details.belongs_to_collection.name,
					}
				: null,
			tmdbId,
			tagline: details.tagline || '',
			status: details.status || null,
			budget: details.budget || null,
			revenue: details.revenue || null,
			releaseDate: details.release_date || null,
			certification,
			originalTitle: details.original_title || null,
			originalLanguage: details.original_language || null,
			spokenLanguages: uniqStrings(
				(details.spoken_languages || []).map((l) => l.english_name || l.name),
			),
			productionCompanies: uniqStrings(
				(details.production_companies || []).map((c) => c.name),
			),
			productionCountries: uniqStrings(
				(details.production_countries || []).map((c) => c.name),
			),
			homepage: details.homepage || null,
			imdbId: details.imdb_id || null,
			externalIds: externalIds
				? {
						imdbId: externalIds.imdb_id || null,
						wikidataId: externalIds.wikidata_id || null,
						facebookId: externalIds.facebook_id || null,
						instagramId: externalIds.instagram_id || null,
						twitterId: externalIds.twitter_id || null,
					}
				: null,
			keywords,
			trailer: trailer
				? {
						site: trailer.site,
						key: trailer.key,
						name: trailer.name,
						type: trailer.type,
						official: !!trailer.official,
					}
				: null,
			watchProviders: watchProvidersSummary,
			enhanced: true,
		};
	} catch (err) {
		console.error(
			`[Movies] Metadata fetch error for "${movieName}":`,
			err.message,
		);
		return empty;
	}
}

module.exports = { fetchMovieMetadata, safeMovieId };
