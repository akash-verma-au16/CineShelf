import React, { useState } from 'react';
import { useApp } from '../../context/TVContext';
import { toLocalUrl, getProgress } from '../../../shared/utils/helpers';
import EpisodeCard from './TVEpisodeCard';

/** Season tabs + episode list */
export default function EpisodeList({
	series,
	initialSeason,
	activeSeason,
	onSeasonChange,
}) {
	const { launchEpisode, markWatched, markSeasonWatched, history, metadata } =
		useApp();

	// Support both controlled (activeSeason prop) and uncontrolled (own state) usage
	const [internalSeason, setInternalSeason] = useState(
		activeSeason ??
			initialSeason ??
			series.seasons?.find((s) => s.number > 0)?.number ??
			series.seasons?.[0]?.number ??
			1,
	);
	const currentSeasonNum = activeSeason ?? internalSeason;
	const setCurrentSeason =
		activeSeason !== undefined ? onSeasonChange : setInternalSeason;

	const regularSeasons = series.seasons?.filter((s) => s.number > 0) || [];
	const specialsSeason = series.seasons?.find((s) => s.number === 0) || null;

	const currentSeason = series.seasons?.find(
		(s) => s.number === currentSeasonNum,
	);
	const episodes = currentSeason?.episodes || [];

	// Count watched in current season
	const watchedCount = episodes.filter(
		(ep) => history[ep.id]?.completed,
	).length;

	// Whether every episode in the current season is watched (for the toggle label)
	const allWatched =
		episodes.length > 0 &&
		episodes.every((ep) => {
			const h = history[ep.id];
			return (
				h?.completed || getProgress(h?.position || 0, h?.duration || 0) >= 90
			);
		});

	// Per-season metadata (poster + overview) from fetched metadata
	const seriesMeta = metadata[series.id];
	const seasonMeta = seriesMeta?.seasons?.[currentSeasonNum];

	return (
		<div>
			{/* Season selector */}
			<div className="flex items-center gap-4 mb-4">
				<div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
					{regularSeasons.length > 0 && (
						<span className="text-sm text-gray-500 shrink-0 mr-1 select-none">
							Season
						</span>
					)}
					{regularSeasons.map((s) => (
						<button
							key={s.number}
							onClick={() => setCurrentSeason(s.number)}
							className={`
								shrink-0 w-9 h-9 rounded-md text-sm font-bold transition-all duration-150
								${
									currentSeasonNum === s.number
										? 'bg-white text-black'
										: 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
								}
							`}>
							{s.number}
						</button>
					))}
					{specialsSeason && (
						<button
							onClick={() => setCurrentSeason(0)}
							className={`
								shrink-0 px-3 h-9 rounded-md text-sm font-bold transition-all duration-150
								${
									currentSeasonNum === 0
										? 'bg-white text-black'
										: 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
								}
							`}>
							Specials
						</button>
					)}
				</div>
				<span className="text-sm text-gray-500 shrink-0 ml-auto">
					{watchedCount}/{episodes.length} watched
				</span>

				{/* Mark all watched / unwatched toggle */}
				<button
					onClick={() =>
						markSeasonWatched(
							series.id,
							currentSeasonNum,
							episodes,
							!allWatched,
						)
					}
					className="text-xs text-gray-400 hover:text-white transition-colors shrink-0">
					{allWatched ? 'Mark all unwatched' : 'Mark all watched'}
				</button>
			</div>

			{/* Season info card (shows when metadata has poster or overview) */}
			{seasonMeta && (seasonMeta.posterPath || seasonMeta.overview) && (
				<div className="flex gap-4 mb-5 p-4 rounded-xl bg-white/5 border border-white/10">
					{seasonMeta.posterPath && (
						<img
							src={toLocalUrl(seasonMeta.posterPath)}
							alt={seasonMeta.name}
							className="w-20 rounded-lg object-cover shrink-0 self-start"
							onError={(e) => {
								e.target.style.display = 'none';
							}}
						/>
					)}
					<div className="min-w-0">
						<div className="flex items-center gap-3 mb-1">
							<h4 className="font-semibold text-white text-sm">
								{seasonMeta.name}
							</h4>
							{seasonMeta.airDate && (
								<span className="text-xs text-gray-500">
									{seasonMeta.airDate.slice(0, 4)}
								</span>
							)}
							{seasonMeta.episodeCount > 0 && (
								<span className="text-xs text-gray-500">
									{seasonMeta.episodeCount} episodes
								</span>
							)}
						</div>
						{seasonMeta.overview && (
							<p className="text-gray-400 text-xs leading-relaxed">
								{seasonMeta.overview}
							</p>
						)}
					</div>
				</div>
			)}

			{/* Episodes */}
			<div className="divide-y divide-white/5">
				{episodes.map((episode) => (
					<EpisodeCard
						key={episode.id}
						episode={episode}
						seriesId={series.id}
						onPlay={launchEpisode}
						onMarkWatched={markWatched}
					/>
				))}
				{episodes.length === 0 && (
					<p className="text-gray-500 text-sm py-8 text-center">
						No episodes found for this season.
					</p>
				)}
			</div>
		</div>
	);
}
