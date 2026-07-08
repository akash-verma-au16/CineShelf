import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/TVContext';
import EpisodeList from './TVEpisodeList';
import SeriesRow from '../Home/TVSeriesRow';
import LoadingSpinner from '../../../shared/components/UI/LoadingSpinner';
import {
	toLocalUrl,
	yearRange,
	truncate,
	fmtEpLabel,
	fmtDuration,
	getProgress,
} from '../../../shared/utils/helpers';

export default function SeriesDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const {
		allSeries,
		metadata,
		favorites,
		history,
		loading,
		fetchMetadata,
		launchEpisode,
		toggleFavorite,
		clearSeriesHistory,
		getNextEpisode,
		getSeriesWatchedCount,
	} = useApp();

	const series = allSeries.find((s) => s.id === id);
	const meta = metadata[id];

	const [expanded, setExpanded] = useState(false);
	const [confirmReset, setConfirmReset] = useState(false);
	// null means "auto" — resolved after series/nextEp are known
	const [selectedSeason, setSelectedSeason] = useState(null);

	// Reset season selection when navigating to a different series
	useEffect(() => {
		setSelectedSeason(null);
	}, [id]);

	// Must be called unconditionally before any early return
	const relatedSeries = useMemo(() => {
		if (!meta?.genres?.length) return [];
		const genres = new Set(meta.genres);
		return allSeries
			.filter(
				(s) =>
					s.id !== id && metadata[s.id]?.genres?.some((g) => genres.has(g)),
			)
			.sort((a, b) => {
				const sa = (metadata[a.id]?.genres || []).filter((g) =>
					genres.has(g),
				).length;
				const sb = (metadata[b.id]?.genres || []).filter((g) =>
					genres.has(g),
				).length;
				return sb - sa;
			})
			.slice(0, 24);
	}, [id, allSeries, meta?.genres, metadata]); // eslint-disable-line

	// Auto-fetch metadata if missing, seasons never populated, or backdrop was never attempted
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		const seasonsObj = meta?.seasons;
		const needsBackdropCheck =
			seasonsObj &&
			Object.values(seasonsObj).some((s) => s.posterPath && !s.backdropChecked);
		if (
			series &&
			(!meta?.tmdbId || !seasonsObj || needsBackdropCheck) &&
			!loading.metadata
		) {
			fetchMetadata(series.id, series.name);
		}
		// Only re-run when the series ID changes, not on every render
	}, [series?.id]); // eslint-disable-line

	if (!series) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 pt-20">
				<p className="text-lg">Series not found.</p>
				<button
					onClick={() => navigate('/')}
					className="btn-secondary">
					Back to Home
				</button>
			</div>
		);
	}

	const backdropSrc = meta?.backdropPath ? toLocalUrl(meta.backdropPath) : null;
	const posterSrc = meta?.posterPath ? toLocalUrl(meta.posterPath) : null;

	const nextEp = getNextEpisode(series);
	const { watched, total } = getSeriesWatchedCount(series);

	// Per-season images — fall back to show-level images when season has none
	const effectiveSeason =
		selectedSeason ??
		nextEp?.season ??
		series.seasons?.find((s) => s.number > 0)?.number ??
		1;
	const seasonMeta = meta?.seasons?.[effectiveSeason];
	const displayPoster = seasonMeta?.posterPath
		? toLocalUrl(seasonMeta.posterPath)
		: posterSrc;
	const displayBackdrop = seasonMeta?.backdropPath
		? toLocalUrl(seasonMeta.backdropPath)
		: backdropSrc;
	const completionCount = history[`series:${id}`]?.completionCount || 0;

	// Resume state — is the next episode already in progress?
	const nextEpHist = nextEp ? history[nextEp.id] || null : null;
	const isResuming =
		nextEpHist && !nextEpHist.completed && (nextEpHist.position || 0) > 30;
	const resumeProgress = getProgress(
		nextEpHist?.position || 0,
		nextEpHist?.duration || 0,
	);

	const isFav = favorites.includes(id);

	const overview = meta?.overview || '';
	const longOverview = overview.length > 300;

	return (
		<div className="pb-20">
			{/* Backdrop — full bleed behind fixed navbar, same look as homepage hero */}
			<div
				className="relative w-full overflow-hidden"
				style={{ height: '46vw', maxHeight: 580, minHeight: 300 }}>
				{displayBackdrop ? (
					<img
						key={displayBackdrop}
						src={displayBackdrop}
						alt={series.name}
						className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500"
						onError={(e) => {
							e.target.style.display = 'none';
						}}
					/>
				) : (
					<BackdropPlaceholder name={series.name} />
				)}
				{/* Gradients matching homepage look */}
				<div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/20 to-transparent" />
				<div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/70 via-transparent to-transparent" />

				<button
					onClick={() => navigate(-1)}
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
					TV Series
				</button>
			</div>

			{/* Main info section */}
			<div className="px-12 -mt-28 relative z-10 flex gap-8">
				{/* Poster */}
				{displayPoster && (
					<div
						className="shrink-0 w-[300px] rounded-lg overflow-hidden shadow-2xl"
						style={{ aspectRatio: '2/3' }}>
						<img
							key={displayPoster}
							src={displayPoster}
							alt={series.name}
							className="w-full h-full object-cover transition-opacity duration-500"
							onError={(e) => {
								e.target.parentElement.style.display = 'none';
							}}
						/>
					</div>
				)}

				{/* Info */}
				<div className="flex-1 min-w-0 pt-28">
					<motion.h1
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						className="text-4xl font-black text-white mb-2 leading-tight">
						{meta?.title || series.name}
					</motion.h1>

					{/* Metadata row */}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
						{meta?.rating && (
							<span className="flex items-center gap-1 text-yellow-400 font-semibold">
								<svg
									className="w-4 h-4"
									viewBox="0 0 20 20"
									fill="currentColor">
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
								{meta.rating}
							</span>
						)}
						{meta?.year && (
							<span className="text-gray-300">
								{yearRange(meta.year, meta.endYear, meta.status)}
							</span>
						)}
						{meta?.status && (
							<span className="text-gray-400">{meta.status}</span>
						)}
						{meta?.networks?.length > 0 && (
							<span className="text-gray-400">{meta.networks.join(', ')}</span>
						)}
						<span className="text-gray-400">
							{series.totalSeasons} season{series.totalSeasons !== 1 ? 's' : ''}{' '}
							· {series.totalEpisodes} eps
						</span>
						{total > 0 && (
							<span
								className={`font-medium ${watched === total ? 'text-green-400' : 'text-gray-400'}`}>
								{watched}/{total} watched
							</span>
						)}
						{completionCount > 0 && (
							<span className="text-green-400 font-medium">
								✓ Completed {completionCount}×
							</span>
						)}
					</div>

					{/* Action buttons */}
					<div className="flex flex-wrap items-center gap-3 mb-5">
						{/* Play / Resume */}
						{nextEp && (
							<button
								onClick={() => launchEpisode(nextEp)}
								className="btn-primary relative overflow-hidden flex items-center gap-2">
								{/* Progress strip at bottom of button */}
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
									className="w-5 h-5"
									viewBox="0 0 24 24"
									fill="currentColor">
									<path d="M8 5v14l11-7z" />
								</svg>
								{isResuming ? 'Resume' : 'Play'}
								<span className="text-black/60 text-xs ml-1">
									{fmtEpLabel(nextEp.season, nextEp.episode)}
									{isResuming && nextEpHist?.position
										? ` · ${fmtDuration(nextEpHist.position)} in`
										: ''}{' '}
								</span>
							</button>
						)}
						{/* Fetch / Refresh metadata */}
						<button
							onClick={() => fetchMetadata(series.id, series.name)}
							disabled={loading.metadata}
							className="btn-secondary flex items-center gap-2 text-sm">
							{loading.metadata ? (
								<LoadingSpinner size="sm" />
							) : (
								<svg
									className="w-4 h-4"
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
							{meta?.tmdbId ? 'Refresh Metadata' : 'Fetch Metadata'}
						</button>

						{/* Tag buttons */}
						<TagBtn
							active={isFav}
							onClick={() => toggleFavorite(id)}
							label={isFav ? '♥' : '♡'}
							activeColor="text-red-400"
							labelClassName="text-xl leading-none"
						/>
						<button
							onClick={() => window.api?.openPath(series.folderPath)}
							className="flex items-center gap-2 text-sm font-medium py-2 px-4 rounded-md border border-white/15 text-gray-400 hover:text-white hover:border-white/25 transition-colors duration-150"
							title="Open folder">
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
								/>
							</svg>
							Open Folder
						</button>
						{/* Reset watch progress */}
						<TagBtn
							active={false}
							onClick={() => setConfirmReset(true)}
							label="↺ Reset Progress"
							activeColor="text-red-400"
						/>
					</div>

					{/* Genre tags */}
					{meta?.genres?.length > 0 && (
						<div className="flex flex-wrap gap-2 mb-4">
							{meta.genres.map((g) => (
								<span
									key={g}
									className="tag-badge">
									{g}
								</span>
							))}
						</div>
					)}

					{/* Overview */}
					{overview && (
						<div className="mb-4 max-w-2xl">
							<p className="text-gray-300 text-sm leading-relaxed">
								{expanded || !longOverview ? overview : truncate(overview, 300)}
							</p>
							{longOverview && (
								<button
									onClick={() => setExpanded(!expanded)}
									className="text-xs text-gray-400 hover:text-white mt-1 transition-colors">
									{expanded ? 'Show less' : 'Show more'}
								</button>
							)}
						</div>
					)}

					{/* Cast */}
					{meta?.cast?.length > 0 && (
						<p className="text-sm text-gray-400 mb-4">
							<span className="text-gray-500">Cast: </span>
							{meta.cast.slice(0, 8).join(', ')}
						</p>
					)}
				</div>
			</div>

			{/* Reset confirmation overlay */}
			{confirmReset && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
					<div className="bg-[#1a1a1a] border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
						<h3 className="text-white font-bold text-lg mb-2">
							Reset Watch Progress?
						</h3>
						<p className="text-gray-400 text-sm mb-5">
							This will clear all episode progress, history and completion
							records for{' '}
							<span className="text-white font-semibold">
								{meta?.title || series.name}
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

			{/* Episode list */}
			<div className="px-12 mt-10">
				<h2 className="text-xl font-bold text-white mb-4">Episodes</h2>
				{series.seasons?.length > 0 ? (
					<EpisodeList
						key={series.id}
						series={series}
						activeSeason={effectiveSeason}
						onSeasonChange={setSelectedSeason}
					/>
				) : (
					<p className="text-gray-500 text-sm">No episodes found.</p>
				)}
			</div>

			{/* Related shows */}
			{relatedSeries.length > 0 && (
				<div className="mt-6">
					<SeriesRow
						title="More Like This"
						series={relatedSeries}
					/>
				</div>
			)}
		</div>
	);
}

function TagBtn({ active, onClick, label, activeColor, labelClassName }) {
	return (
		<button
			onClick={onClick}
			className={`text-sm font-medium py-2 px-4 rounded-md border transition-colors duration-150
				${
					active
						? `${activeColor} border-white/20 bg-white/5`
						: 'text-gray-400 border-white/15 hover:text-white hover:border-white/25'
				}`}>
			<span className={labelClassName}>{label}</span>
		</button>
	);
}

function BackdropPlaceholder({ name }) {
	let hash = 0;
	for (let i = 0; i < name.length; i++)
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	const h = Math.abs(hash) % 360;
	return (
		<div
			className="absolute inset-0"
			style={{
				background: `linear-gradient(135deg, hsl(${h},25%,10%) 0%, hsl(${(h + 60) % 360},20%,7%) 100%)`,
			}}
		/>
	);
}
