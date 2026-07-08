import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnime } from '../../context/AnimeContext';
import AnimeEpisodeList from './AnimeEpisodeList';
import AnimeRow from '../Home/AnimeRow';
import LoadingSpinner from '../../../shared/components/UI/LoadingSpinner';
import {
	toLocalUrl,
	fmtDuration,
	getProgress,
} from '../../../shared/utils/helpers';

// ── Filter badge toggle ───────────────────────────────────────────────────────
function FilterToggle({ label, active, color, hiddenCount, onClick }) {
	const colorMap = {
		green: active
			? 'bg-green-500/20 border-green-500/40 text-green-300'
			: 'bg-white/5 border-white/10 text-gray-500',
		blue: active
			? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
			: 'bg-white/5 border-white/10 text-gray-500',
		yellow: active
			? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
			: 'bg-white/5 border-white/10 text-gray-500',
	};
	return (
		<button
			onClick={onClick}
			className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${colorMap[color]}`}>
			<span
				className={`w-1.5 h-1.5 rounded-full transition-colors ${
					active
						? color === 'green'
							? 'bg-green-400'
							: color === 'blue'
								? 'bg-blue-400'
								: 'bg-yellow-400'
						: 'bg-gray-600'
				}`}
			/>
			{label}
			{!active && hiddenCount > 0 && (
				<span className="text-gray-600">({hiddenCount} hidden)</span>
			)}
		</button>
	);
}

// ── Series detail page ────────────────────────────────────────────────────────
export default function AnimeSeriesDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const {
		library,
		metadata,
		filters,
		setFilter,
		getVisibleEpisodes,
		fetchMetadata,
		toggleFavorite,
		favorites,
		loading,
		initialized,
		allSeries,
		history,
		playEpisode,
		getNextEpisode,
		getSeriesWatchedCount,
		clearSeriesHistory,
	} = useAnime();

	const [confirmReset, setConfirmReset] = useState(false);

	const series = library?.series?.find((s) => s.id === id);
	const meta = metadata[id] || {};
	const currentFilters = filters[id] || {
		canon: true,
		mixed: true,
		filler: false,
	};
	const visibleEpisodes = series ? getVisibleEpisodes(series) : [];
	const nextEp = series ? getNextEpisode?.(series) : null;
	const restartEp = visibleEpisodes[0] || series?.episodes?.[0] || null;
	const playTargetEp = nextEp || restartEp;
	const isFav = favorites?.includes(id);
	const isFetching = loading?.metadata;
	const nextKey = playTargetEp?.id || null;
	const nextEpHist = nextKey ? history[nextKey] || null : null;
	const isResuming =
		nextEpHist && !nextEpHist.completed && (nextEpHist.position || 0) > 30;
	const resumeProgress = getProgress(
		nextEpHist?.position || 0,
		nextEpHist?.duration || 0,
	);
	const watchedStats = series
		? getSeriesWatchedCount?.(series)
		: { watched: 0, total: 0 };
	const isWatchAgain = !nextEp && !!playTargetEp;
	const nextEpLabel = playTargetEp
		? `Ep ${playTargetEp.episodeNumberStr || playTargetEp.episodeNumber}`
		: '';
	const playButtonMeta = isResuming
		? `Resume from ${fmtDuration(nextEpHist?.position || 0)}${nextEpLabel ? ` · ${nextEpLabel}` : ''}`
		: nextEpLabel;

	useEffect(() => {
		if (series && (!meta.anilistId || !meta.episodes) && !isFetching) {
			fetchMetadata?.(id, series.name);
		}
	}, [id, series?.name]); // eslint-disable-line react-hooks/exhaustive-deps

	const similarAnime = useMemo(() => {
		if (!meta.genres?.length || !allSeries?.length) return [];
		return allSeries
			.filter((s) => s.id !== id)
			.map((s) => {
				const sm = metadata[s.id] || {};
				const overlap = (sm.genres || []).filter((g) =>
					meta.genres.includes(g),
				).length;
				return { series: s, overlap };
			})
			.filter((x) => x.overlap > 0)
			.sort((a, b) => b.overlap - a.overlap)
			.slice(0, 20)
			.map((x) => x.series);
	}, [id, meta.genres, allSeries, metadata]);

	const hiddenFillerCount = !currentFilters.filler
		? series?.fillerCount || 0
		: 0;
	const hiddenMixedCount = !currentFilters.mixed ? series?.mixedCount || 0 : 0;
	const hiddenCanonCount = !currentFilters.canon ? series?.canonCount || 0 : 0;

	if (!initialized)
		return (
			<div className="flex items-center justify-center py-32">
				<LoadingSpinner />
			</div>
		);

	if (!series)
		return (
			<div className="px-8 py-24 text-center">
				<p className="text-gray-500">Series not found.</p>
				<button
					onClick={() => navigate('/anime')}
					className="mt-4 text-sm text-violet-400 hover:text-violet-300">
					← Back to Anime
				</button>
			</div>
		);

	const backdropUrl = meta.backdropPath ? toLocalUrl(meta.backdropPath) : null;
	const posterUrl = meta.posterPath ? toLocalUrl(meta.posterPath) : null;
	const title = meta.title || series.name;

	return (
		<div className="pb-16">
			{/* Backdrop hero */}
			<div className="relative h-[380px] overflow-hidden">
				{backdropUrl ? (
					<img
						src={backdropUrl}
						alt=""
						className="absolute inset-0 w-full h-full object-cover"
						draggable={false}
					/>
				) : (
					<div
						className="w-full h-full"
						style={{
							background: hashBg(series.name, [
								'#1a1a3e',
								'#0d1f2d',
								'#1a0d2e',
								'#0d2a1a',
								'#2d1a0d',
							]),
						}}>
						<div className="w-full h-full flex items-center justify-center">
							<span className="text-8xl opacity-10 select-none">⛩️</span>
						</div>
					</div>
				)}
				<div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/60 to-transparent" />
				<div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f]/80 via-transparent to-transparent" />
				<button
					onClick={() => navigate('/anime')}
					className="absolute top-24 left-6 z-10 text-sm text-gray-400 hover:text-white flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg">
					<svg
						className="w-3.5 h-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M15 19l-7-7 7-7"
						/>
					</svg>
					Anime
				</button>
			</div>

			{/* Metadata panel */}
			<div className="relative z-10 px-8 -mt-32">
				<div className="flex items-end gap-6">
					<div className="shrink-0 w-40 h-[240px] rounded-xl overflow-hidden shadow-2xl border border-white/10">
						{posterUrl ? (
							<img
								src={posterUrl}
								alt={title}
								className="w-full h-full object-cover"
								draggable={false}
							/>
						) : (
							<div
								className="w-full h-full flex items-center justify-center"
								style={{
									background: hashBg(series.name, [
										'#312e81',
										'#1e1b4b',
										'#3b0764',
										'#1e3a5f',
										'#14532d',
									]),
								}}>
								<span className="text-4xl opacity-20 select-none">⛩️</span>
							</div>
						)}
					</div>
					<div className="pb-2 flex-1 min-w-0">
						<h1 className="text-4xl font-bold text-white leading-tight truncate">
							{title}
						</h1>
						<div className="flex items-center gap-3 mt-2 flex-wrap">
							{meta.year && (
								<span className="text-sm text-gray-400">{meta.year}</span>
							)}
							{meta.status && (
								<span
									className={`text-xs px-2 py-0.5 rounded-full border font-medium ${meta.status === 'FINISHED' ? 'bg-green-500/15 border-green-500/25 text-green-400' : 'bg-blue-500/15 border-blue-500/25 text-blue-400'}`}>
									{meta.status === 'FINISHED' ? 'Finished' : 'Airing'}
								</span>
							)}
							{meta.rating && (
								<span className="text-xs text-yellow-400">
									★ {meta.rating.toFixed(1)}
								</span>
							)}
							{meta.studio && (
								<span className="text-xs text-gray-500">{meta.studio}</span>
							)}
							<span className="text-xs text-gray-500">
								{series.totalEpisodes} eps
							</span>
							{watchedStats?.total > 0 && (
								<span className="text-xs text-gray-500">
									{watchedStats.watched}/{watchedStats.total} watched
								</span>
							)}
						</div>
						{meta.genres?.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mt-2">
								{meta.genres.slice(0, 6).map((g) => (
									<span
										key={g}
										className="text-[11px] px-2 py-0.5 bg-white/6 rounded text-gray-400 border border-white/8">
										{g}
									</span>
								))}
							</div>
						)}
						{meta.overview && (
							<p className="mt-3 text-sm text-gray-400 leading-relaxed line-clamp-3 max-w-2xl">
								{meta.overview}
							</p>
						)}
						<div className="flex items-center gap-3 mt-4">
							{playTargetEp && (
								<button
									onClick={() => playEpisode?.(series, playTargetEp)}
									className="btn-primary relative overflow-hidden flex items-center gap-2">
									{isResuming && resumeProgress > 0 && (
										<span
											className="absolute bottom-0 left-0 h-[3px] bg-black/30 pointer-events-none"
											style={{
												width: `${resumeProgress}%`,
												transition: 'width 0.4s ease',
											}}
										/>
									)}
									<svg
										className="w-4 h-4"
										fill="currentColor"
										viewBox="0 0 24 24">
										<path d="M8 5v14l11-7z" />
									</svg>
									{isResuming
										? 'Resume'
										: isWatchAgain
											? 'Watch Again'
											: 'Play'}
									<span className="text-black/60 text-xs ml-1">
										{playButtonMeta}
									</span>
								</button>
							)}
							<button
								onClick={() => toggleFavorite?.(id)}
								className={`p-2.5 rounded-lg border transition-all ${isFav ? 'bg-pink-600/20 border-pink-500/30 text-pink-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}>
								<svg
									className="w-4 h-4"
									fill={isFav ? 'currentColor' : 'none'}
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
									/>
								</svg>
							</button>
							<button
								onClick={() => setConfirmReset(true)}
								className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-red-400 transition-all">
								↺ Reset Progress
							</button>
							<button
								onClick={() => fetchMetadata?.(id, series.name)}
								disabled={isFetching}
								className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 transition-all disabled:opacity-50">
								{isFetching ? (
									<span className="w-3 h-3 border border-gray-500 border-t-gray-300 rounded-full animate-spin" />
								) : (
									<svg
										className="w-3.5 h-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
										/>
									</svg>
								)}
								{meta.anilistId ? 'Refresh Metadata' : 'Fetch Metadata'}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Reset confirmation overlay */}
			{confirmReset && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
					<div className="bg-[#0a0a0f] border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
						<h3 className="text-white font-bold text-lg mb-2">
							Reset Watch Progress?
						</h3>
						<p className="text-gray-400 text-sm mb-5">
							This will clear all episode progress and history for{' '}
							<span className="text-white font-semibold">
								{meta.title || series.name}
							</span>
							. This cannot be undone.
						</p>
						<div className="flex gap-3 justify-end">
							<button
								onClick={() => setConfirmReset(false)}
								className="btn-secondary text-sm px-4 py-2">
								Cancel
							</button>
							<button
								onClick={async () => {
									setConfirmReset(false);
									await clearSeriesHistory(id);
								}}
								className="bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-4 py-2 rounded-md transition-colors">
								Reset
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Episode section */}
			<div className="px-8 mt-10">
				<div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
					<h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
						Episodes
						{hiddenFillerCount + hiddenMixedCount + hiddenCanonCount > 0 && (
							<span className="ml-2 text-gray-700 normal-case font-normal">
								({visibleEpisodes.length} shown)
							</span>
						)}
					</h2>
					{series.hasFillerData && (
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-xs text-gray-600 mr-1">Filter:</span>
							<FilterToggle
								label={`Canon (${series.canonCount || 0})`}
								active={currentFilters.canon}
								color="green"
								hiddenCount={hiddenCanonCount}
								onClick={() => setFilter(id, 'canon', !currentFilters.canon)}
							/>
							<FilterToggle
								label={`Mixed (${series.mixedCount || 0})`}
								active={currentFilters.mixed}
								color="blue"
								hiddenCount={hiddenMixedCount}
								onClick={() => setFilter(id, 'mixed', !currentFilters.mixed)}
							/>
							<FilterToggle
								label={`Filler (${series.fillerCount || 0})`}
								active={currentFilters.filler}
								color="yellow"
								hiddenCount={hiddenFillerCount}
								onClick={() => setFilter(id, 'filler', !currentFilters.filler)}
							/>
						</div>
					)}
				</div>
				{visibleEpisodes.length === 0 ? (
					<div className="py-16 text-center">
						<p className="text-gray-500">
							All episodes are hidden by your current filters.
						</p>
					</div>
				) : (
					<AnimeEpisodeList series={{ ...series, episodes: visibleEpisodes }} />
				)}
			</div>

			{similarAnime.length > 1 && (
				<div className="mt-10">
					<AnimeRow
						title="Similar Anime"
						series={similarAnime}
					/>
				</div>
			)}
		</div>
	);
}

function hashBg(str = '', palette) {
	let h = 0;
	for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
	return palette[h % palette.length];
}
