import React, { useMemo, useState } from 'react';
import { useAnime } from '../../context/AnimeContext';
import AnimeEpisodeCard from './AnimeEpisodeCard';

const FILTERS = ['all', 'canon', 'mixed', 'filler'];

const FILTER_LABEL = {
	all: 'All',
	canon: 'Canon',
	mixed: 'Mixed',
	filler: 'Filler',
};

function getEpisodeType(episode) {
	return (episode?.episodeType || episode?.type || 'canon').toLowerCase();
}

export default function AnimeEpisodeList({ series }) {
	const { history, markEpisodesWatched } = useAnime();
	const [activeFilter, setActiveFilter] = useState('all');

	const episodes = useMemo(() => series?.episodes || [], [series?.episodes]);

	// Determine which filter tabs to show (only ones with content)
	const availableFilters = useMemo(() => {
		const types = new Set(episodes.map((episode) => getEpisodeType(episode)));
		return FILTERS.filter((f) => f === 'all' || types.has(f));
	}, [episodes]);

	const visible = useMemo(() => {
		if (activeFilter === 'all') return episodes;
		return episodes.filter(
			(episode) => getEpisodeType(episode) === activeFilter,
		);
	}, [episodes, activeFilter]);

	const allWatched = useMemo(
		() =>
			visible.length > 0 &&
			visible.every((ep) => {
				return history[ep.id]?.completed;
			}),
		[visible, history],
	);

	const watchedCount = useMemo(
		() =>
			visible.filter((ep) => {
				return history[ep.id]?.completed;
			}).length,
		[visible, history],
	);

	function handleMarkAll() {
		if (!markEpisodesWatched) return;
		markEpisodesWatched(visible, !allWatched);
	}

	if (!episodes.length) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-gray-600">
				<span className="text-4xl mb-3">📭</span>
				<p>No episodes found for this series.</p>
			</div>
		);
	}

	return (
		<div>
			{/* Filter + bulk action bar */}
			<div className="flex items-center justify-between px-4 mb-3">
				{/* Filter pills */}
				{availableFilters.length > 1 && (
					<div className="flex gap-1">
						{availableFilters.map((f) => (
							<button
								key={f}
								onClick={() => setActiveFilter(f)}
								className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
									activeFilter === f
										? 'bg-purple-600 text-white'
										: 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
								}`}>
								{FILTER_LABEL[f]}
							</button>
						))}
					</div>
				)}

				<span className="text-sm text-gray-500 shrink-0 ml-auto mr-3">
					{watchedCount}/{visible.length} watched
				</span>

				{/* Mark all */}
				{visible.length > 0 && markEpisodesWatched && (
					<button
						onClick={handleMarkAll}
						className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-auto">
						{allWatched ? 'Mark all unwatched' : 'Mark all watched'}
					</button>
				)}
			</div>

			{/* Episode list */}
			<div className="flex flex-col">
				{visible.map((ep) => (
					<AnimeEpisodeCard
						key={ep.episodeNumberStr || ep.episodeNumber}
						series={series}
						episode={ep}
					/>
				))}
			</div>
		</div>
	);
}
