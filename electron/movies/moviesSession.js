/**
 * moviesSession.js
 *
 * Builds the initData payload for a movie playback session.
 * The overlay window (PlayerOverlay.js) is workflow-agnostic — it just
 * needs a playlist array and some display metadata.
 *
 * For movies: the "playlist" is a single item (the movie file). When the
 * user has a movie collection (e.g. James Bond films), the caller can pass
 * multiple movies to queue them as a playlist — same overlay, multiple items.
 */

/**
 * Build initData for a single-movie or collection session.
 *
 * @param {object} opts
 * @param {object}   opts.movie       - The primary movie object from library
 * @param {object}   opts.metadata    - TMDB metadata for the movie (may be null)
 * @param {number}   opts.initialSeek - Resume position in seconds (default 0)
 * @param {object}   opts.settings    - App settings (for mouse bindings etc.)
 * @param {object[]} [opts.collection] - Optional array of movies to queue after
 * @returns {object} initData passed to overlay:init IPC event
 */
function buildMovieSession({
	movie,
	metadata,
	initialSeek = 0,
	settings,
	collection = [],
}) {
	// Build the playlist — primary movie first, then collection items
	const allMovies = [movie, ...collection.filter((m) => m.id !== movie.id)];

	const playlist = allMovies.map((m, idx) => ({
		index: idx,
		filePath: m.filePath,
		title: metadata && idx === 0 ? metadata.title || m.name : m.name,
		subtitle: m.year ? String(m.year) : '',
		// For overlay display: season/episode concept maps to nothing for movies,
		// but we keep these fields so the overlay component doesn't break.
		season: null,
		episode: null,
		key: m.id,
	}));

	return {
		workflow: 'movies',
		mode: 'movies',
		playlist,
		currentIndex: 0,
		initialSeek,
		// Display info for the overlay title bar
		seriesName: metadata?.title || movie.name,
		episodeTitle: movie.year ? String(movie.year) : '',
		// Pass through mouse bindings so the overlay has them from frame 0
		ahkMappings: settings?.ahkMappings || {},
		vlcHttpPort: settings?.vlcHttpPort || 8080,
		vlcHttpPassword: settings?.vlcHttpPassword || 'cineshelf',
	};
}

module.exports = { buildMovieSession };
