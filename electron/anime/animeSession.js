/**
 * electron/anime/animeSession.js
 *
 * Anime playback session builder using the same player-state contract as TV,
 * while preserving anime-specific filter and episode metadata for the overlay UI.
 */

'use strict';

function getEpisodeType(episode) {
	return (episode?.episodeType || episode?.type || 'canon').toLowerCase();
}

function getVisibleEpisodes(series, filters) {
	return (series?.episodes || []).filter((episode) => {
		const episodeType = getEpisodeType(episode);
		if (episodeType === 'filler') return filters.filler === true;
		if (episodeType === 'mixed') return filters.mixed === true;
		return filters.canon !== false;
	});
}

function buildFilterDesc(filters, series) {
	const parts = [];
	if (filters.canon !== false) parts.push('Canon');
	if (filters.mixed === true) parts.push('Mixed');
	if (filters.filler === true) parts.push('Filler');

	const desc = parts.join(' · ') || 'No filter';
	const hiddenCount = filters.filler !== true ? series?.fillerCount || 0 : 0;
	if (hiddenCount > 0) {
		return `${desc}  (${hiddenCount} filler hidden)`;
	}
	return desc;
}

function buildAnimeSession({
	series,
	episodeId,
	filters = { canon: true, mixed: true, filler: false },
	initialSeek = 0,
	settings = {},
	metadata = {},
}) {
	const visibleEpisodes = getVisibleEpisodes(series, filters);
	let currentIndex = visibleEpisodes.findIndex(
		(episode) => episode.id === episodeId,
	);
	if (currentIndex < 0) currentIndex = 0;

	const startEpisode =
		visibleEpisodes[currentIndex] || visibleEpisodes[0] || null;
	const allSeasons = [
		{
			season: 1,
			episodes: visibleEpisodes.map((episode) => ({
				episodeId: episode.id,
				filePath: episode.filePath,
				seriesId: episode.seriesId,
				season: 1,
				episode: episode.episodeNumber,
				episodeNumberStr: episode.episodeNumberStr,
				episodeType: getEpisodeType(episode),
				title:
					episode.displayTitle ||
					`Episode ${episode.episodeNumberStr || episode.episodeNumber}`,
				duration: 0,
				overview: '',
				stillPath: null,
				stillUrl: null,
			})),
		},
	];

	return {
		workflow: 'anime',
		mode: 'anime',
		allSeasons,
		currentEpisodeId: startEpisode?.id || null,
		seriesId: series?.id || null,
		seriesName: metadata?.title || series?.name || '',
		season: 1,
		filterDesc: buildFilterDesc(filters, series),
		filtersActive: { ...filters },
		initialSeek,
		ahkMappings: settings.ahkMappings || {},
		vlcHttpPort: settings.vlcHttpPort || 8080,
		vlcHttpPassword: settings.vlcHttpPassword || 'cineshelf',
	};
}

module.exports = { buildAnimeSession };
