import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/TVContext';
import SeriesCard from '../Home/TVSeriesCard';
const FILTERS = [
	{ id: 'all', label: 'All' },
	{ id: 'favorites', label: 'Favorites' },
	{ id: 'watched', label: 'Completed' },
	{ id: 'unwatched', label: 'Unwatched' },
	{ id: 'in-progress', label: 'In Progress' },
];

export default function SearchPage() {
	const [searchParams] = useSearchParams();
	const { allSeries, metadata, favorites, getSeriesWatchedCount, history } = useApp();

	const [query, setQuery] = useState(searchParams.get('q') || '');
	const [activeFilter, setActiveFilter] = useState('all');
	const [sortBy, setSortBy] = useState('name');

	// Update query from URL
	useEffect(() => {
		const q = searchParams.get('q') || '';
		setQuery(q);
	}, [searchParams]);

	const filtered = useMemo(() => {
		let results = [...allSeries];
		const q = query.toLowerCase().trim();

		// Text search: name, genres, cast
		if (q) {
			results = results.filter((s) => {
				const meta = metadata[s.id];
				const inName = s.name.toLowerCase().includes(q);
				const inTitle = meta?.title?.toLowerCase().includes(q);
				const inGenre = meta?.genres?.some((g) => g.toLowerCase().includes(q));
				const inCast = meta?.cast?.some((c) => c.toLowerCase().includes(q));
				const inEpTitle = meta?.episodes
					? Object.values(meta.episodes).some(
							(ep) =>
								ep.title?.toLowerCase().includes(q) ||
								ep.overview?.toLowerCase().includes(q),
						)
					: false;
				return inName || inTitle || inGenre || inCast || inEpTitle;
			});
		}

		// Filter buttons
		if (activeFilter === 'favorites')
			results = results.filter((s) => favorites.includes(s.id));
		else if (activeFilter === 'watched') {
			results = results.filter((s) => {
				const { watched, total } = getSeriesWatchedCount(s);
				return total > 0 && watched === total;
			});
		} else if (activeFilter === 'unwatched') {
			results = results.filter((s) => {
				const { watched } = getSeriesWatchedCount(s);
				return watched === 0;
			});
		} else if (activeFilter === 'in-progress') {
			results = results.filter((s) => {
				const { watched, total } = getSeriesWatchedCount(s);
				if (total === 0) return false;
				if (watched === total) return false; // fully completed
				if (watched > 0) return true; // some episodes completed
				// Also include series that have been started (any episode has lastWatched)
				const allEps = (s.seasons || []).flatMap((sn) => sn.episodes || []);
				return allEps.some((ep) => history[ep.id]?.lastWatched);
			});
		}

		// Sort
		if (sortBy === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
		else if (sortBy === 'episodes')
			results.sort((a, b) => b.totalEpisodes - a.totalEpisodes);
		else if (sortBy === 'added')
			results.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
		else if (sortBy === 'rating') {
			results.sort((a, b) => {
				const ra = metadata[a.id]?.rating || 0;
				const rb = metadata[b.id]?.rating || 0;
				return rb - ra;
			});
		}

		return results;
	}, [
		allSeries,
		metadata,
		favorites,
		history,
		query,
		activeFilter,
		sortBy,
		getSeriesWatchedCount,
	]);

	return (
		<div className="pt-20 pb-16 px-12">
			{/* Search + Sort header */}
			<div className="flex flex-wrap items-center gap-4 mb-6">
				<div className="relative flex-1 min-w-[240px] max-w-md">
					<svg
						className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
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
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search series, cast, genre, episode titles…"
						className="w-full bg-white/10 border border-white/15 rounded-lg pl-10 pr-4 py-2.5
							text-white placeholder-gray-500 text-sm
							focus:outline-none focus:bg-white/15 focus:border-white/30"
					/>
					{query && (
						<button
							onClick={() => setQuery('')}
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

				{/* Sort */}
				<select
					value={sortBy}
					onChange={(e) => setSortBy(e.target.value)}
					className="bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-sm text-white
						focus:outline-none focus:border-white/30 cursor-pointer">
					<option value="name">Sort: A–Z</option>
					<option value="episodes">Sort: Most Episodes</option>
					<option value="added">Sort: Recently Added</option>
					<option value="rating">Sort: Rating</option>
				</select>

				<span className="text-sm text-gray-500 ml-auto">
					{filtered.length} series
				</span>
			</div>

			{/* Filter chips */}
			<div className="flex flex-wrap gap-2 mb-8">
				{FILTERS.map((f) => (
					<button
						key={f.id}
						onClick={() => setActiveFilter(f.id)}
						className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150
							${
								activeFilter === f.id
									? 'bg-white text-black'
									: 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
							}
						`}>
						{f.label}
					</button>
				))}
			</div>

			{/* Results grid */}
			{filtered.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-500">
					<span className="text-4xl opacity-30">🔍</span>
					<p>
						{query
							? `No results for "${query}"`
							: 'No series match this filter'}
					</p>
				</div>
			) : (
				<div
					className="grid gap-4"
					style={{
						gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
					}}>
					{filtered.map((s) => (
						<SeriesCard
							key={s.id}
							series={s}
						/>
					))}
				</div>
			)}
		</div>
	);
}
