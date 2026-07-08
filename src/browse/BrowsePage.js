import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../tv/context/TVContext';
import { useMovies } from '../movies/context/MoviesContext';
import { useAnime } from '../anime/context/AnimeContext';
import SeriesCard from '../tv/components/Home/TVSeriesCard';
import AnimeCard from '../anime/components/Home/AnimeCard';
import MoviesCard from '../movies/components/Home/MoviesCard';

// ── Shared Browse Shell ───────────────────────────────────────────────────────

const WORKFLOWS = [
	{ id: 'tv', label: 'TV Shows' },
	{ id: 'movies', label: 'Movies' },
	{ id: 'anime', label: 'Anime' },
];

export default function BrowsePage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const workflow = WORKFLOWS.some((w) => w.id === searchParams.get('workflow'))
		? searchParams.get('workflow')
		: 'tv';
	const query = searchParams.get('q') || '';

	function updateSearch(nextWorkflow, nextQuery) {
		const params = new URLSearchParams();
		params.set('workflow', nextWorkflow);
		if (nextQuery.trim()) params.set('q', nextQuery.trim());
		navigate(`/browse?${params.toString()}`, { replace: true });
	}

	return (
		<div className="pt-16 pb-16 px-8">
			{/* Workflow tab strip */}
			<div className="sticky top-14 z-40 -mx-8 px-8 pt-4 pb-4 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/8">
				<div className="flex items-center gap-1 mb-4">
					{WORKFLOWS.map((w) => (
						<button
							key={w.id}
							onClick={() => updateSearch(w.id, query)}
							className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
								workflow === w.id
									? 'bg-white/10 text-white font-medium'
									: 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
							}`}>
							{w.label}
						</button>
					))}
				</div>

				<div className="flex items-center gap-4">
					<div className="relative flex-1 max-w-xl">
						<svg
							className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<input
							type="text"
							value={query}
							onChange={(e) => updateSearch(workflow, e.target.value)}
							placeholder={
								workflow === 'movies'
									? 'Search movies…'
									: workflow === 'anime'
										? 'Search anime…'
										: 'Search TV shows…'
							}
							className="w-full bg-white/10 border border-white/15 rounded-lg pl-10 pr-10 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:bg-white/15 focus:border-white/30"
						/>
						{query && (
							<button
								onClick={() => updateSearch(workflow, '')}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						)}
					</div>
				</div>
			</div>

			<div className="pt-6">
				{workflow === 'tv' && <TVBrowseResults query={query} />}
				{workflow === 'movies' && <MoviesBrowseResults query={query} />}
				{workflow === 'anime' && <AnimeBrowseResults query={query} />}
			</div>
		</div>
	);
}

function TVBrowseResults({ query }) {
	const { allSeries, metadata, favorites, getSeriesWatchedCount } = useApp();
	const filtered = useMemo(() => {
		let results = [...allSeries];
		const q = query.toLowerCase().trim();
		if (q) {
			results = results.filter((series) => {
				const meta = metadata[series.id];
				const inName = series.name.toLowerCase().includes(q);
				const inTitle = meta?.title?.toLowerCase().includes(q);
				const inGenre = meta?.genres?.some((genre) =>
					genre.toLowerCase().includes(q),
				);
				const inCast = meta?.cast?.some((cast) =>
					cast.toLowerCase().includes(q),
				);
				const inEpisode = meta?.episodes
					? Object.values(meta.episodes).some(
							(episode) =>
								episode.title?.toLowerCase().includes(q) ||
								episode.overview?.toLowerCase().includes(q),
						)
					: false;
				return inName || inTitle || inGenre || inCast || inEpisode;
			});
		}
		return results.sort((a, b) => {
			const favA = favorites.includes(a.id) ? 1 : 0;
			const favB = favorites.includes(b.id) ? 1 : 0;
			if (favA !== favB) return favB - favA;
			const progressA = getSeriesWatchedCount(a);
			const progressB = getSeriesWatchedCount(b);
			if (progressA.watched !== progressB.watched)
				return progressB.watched - progressA.watched;
			return a.name.localeCompare(b.name);
		});
	}, [allSeries, metadata, favorites, getSeriesWatchedCount, query]);

	return (
		<BrowseGrid
			title="TV Shows"
			countLabel={`${filtered.length} series`}
			emptyLabel={
				query ? `No TV shows found for "${query}"` : 'No TV shows available'
			}>
			{filtered.map((series) => (
				<SeriesCard
					key={series.id}
					series={series}
					compact
				/>
			))}
		</BrowseGrid>
	);
}

function MoviesBrowseResults({ query }) {
	const { library, metadata, history } = useMovies();
	const filtered = useMemo(() => {
		const movies = library?.movies || [];
		const q = query.toLowerCase().trim();
		const results = q
			? movies.filter((movie) => {
					const meta = metadata[movie.id] || {};
					return (
						movie.name.toLowerCase().includes(q) ||
						(meta.title || '').toLowerCase().includes(q) ||
						(meta.overview || '').toLowerCase().includes(q) ||
						(meta.genres || []).some((genre) =>
							genre.toLowerCase().includes(q),
						) ||
						(meta.cast || []).some((entry) => {
							const name =
								typeof entry === 'string' ? entry : entry?.name || '';
							return name.toLowerCase().includes(q);
						})
					);
				})
			: movies;
		return [...results].sort((a, b) => {
			const watchedA = history[a.id]?.lastWatched ? 1 : 0;
			const watchedB = history[b.id]?.lastWatched ? 1 : 0;
			if (watchedA !== watchedB) return watchedB - watchedA;
			return (metadata[a.id]?.title || a.name).localeCompare(
				metadata[b.id]?.title || b.name,
			);
		});
	}, [library, metadata, history, query]);

	return (
		<BrowseGrid
			title="Movies"
			countLabel={`${filtered.length} movies`}
			emptyLabel={
				query ? `No movies found for "${query}"` : 'No movies available'
			}>
			{filtered.map((movie) => (
				<MoviesCard
					key={movie.id}
					movie={movie}
					compact
				/>
			))}
		</BrowseGrid>
	);
}

function AnimeBrowseResults({ query }) {
	const { allSeries, metadata, getVisibleEpisodes } = useAnime();
	const filtered = useMemo(() => {
		const q = query.toLowerCase().trim();
		const results = q
			? allSeries.filter((series) => {
					const meta = metadata[series.id] || {};
					const title = (meta.title || series.name).toLowerCase();
					const inGenres = (meta.genres || []).some((genre) =>
						genre.toLowerCase().includes(q),
					);
					const inOverview = (meta.overview || '').toLowerCase().includes(q);
					const inEpisodes = getVisibleEpisodes(series).some((episode) => {
						const epMeta = meta.episodes?.[String(episode.episodeNumber)] || {};
						return (
							(epMeta.title || episode.displayTitle || '')
								.toLowerCase()
								.includes(q) ||
							(epMeta.overview || '').toLowerCase().includes(q)
						);
					});
					return title.includes(q) || inGenres || inOverview || inEpisodes;
				})
			: allSeries;
		return [...results].sort((a, b) =>
			(metadata[a.id]?.title || a.name).localeCompare(
				metadata[b.id]?.title || b.name,
			),
		);
	}, [allSeries, metadata, getVisibleEpisodes, query]);

	return (
		<BrowseGrid
			title="Anime"
			countLabel={`${filtered.length} series`}
			emptyLabel={
				query ? `No anime found for "${query}"` : 'No anime available'
			}>
			{filtered.map((series) => (
				<AnimeCard
					key={series.id}
					series={series}
					compact
				/>
			))}
		</BrowseGrid>
	);
}

function BrowseGrid({ title, countLabel, emptyLabel, children }) {
	const items = React.Children.toArray(children);
	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
					{title}
				</h2>
				<span className="text-sm text-gray-500">{countLabel}</span>
			</div>
			{items.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-500">
					<span className="text-4xl opacity-30">🔍</span>
					<p>{emptyLabel}</p>
				</div>
			) : (
				<div
					className="grid gap-4"
					style={{
						gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
					}}>
					{items}
				</div>
			)}
		</div>
	);
}
