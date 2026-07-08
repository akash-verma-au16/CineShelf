import React from 'react';
import { useAnime } from '../../context/AnimeContext';
import ProgressBar from '../../../shared/components/UI/ProgressBar';
import {
	toLocalUrl,
	fmtDuration,
	fmtSize,
	getProgress,
} from '../../../shared/utils/helpers';

const TYPE_BADGE = {
	canon: { label: 'Canon', cls: 'bg-green-600/80 text-green-100' },
	mixed: { label: 'Mixed', cls: 'bg-blue-600/80 text-blue-100' },
	filler: { label: 'Filler', cls: 'bg-yellow-600/80 text-yellow-100' },
};

function getEpisodeType(episode) {
	return (episode?.episodeType || episode?.type || 'canon').toLowerCase();
}

export default function AnimeEpisodeCard({ series, episode }) {
	const { history, metadata, playEpisode, markWatched } = useAnime();

	const key = episode.id;
	const hist = history[key] || {};
	const { position = 0, duration = 0, completed = false } = hist;
	const progress = getProgress(position, duration);

	const meta = metadata[series.id] || {};
	const epMeta = meta.episodes?.[String(episode.episodeNumber)] || null;

	// Use series backdrop (wide) as episode thumbnail for a consistent look
	const thumbUrl = meta.backdropPath
		? toLocalUrl(meta.backdropPath)
		: meta.posterPath
			? toLocalUrl(meta.posterPath)
			: null;

	const isInProgress = !completed && position > 30;
	const type = getEpisodeType(episode);
	const badge = TYPE_BADGE[type] || TYPE_BADGE.canon;
	const title =
		epMeta?.title ||
		episode.displayTitle ||
		episode.title ||
		`Episode ${episode.episodeNumber}`;
	const overview = epMeta?.overview || '';
	const isWatched = completed || progress >= 90;

	const handlePlay = (e) => {
		e.stopPropagation();
		playEpisode(series, episode);
	};

	return (
		<div
			className={`group flex gap-4 p-3 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-white/5 ${isWatched ? 'opacity-60' : ''}`}
			onClick={handlePlay}>
			{/* Thumbnail */}
			<div
				className="relative shrink-0 rounded overflow-hidden bg-[#1a1a1a]"
				style={{ width: 160, height: 90 }}>
				{thumbUrl ? (
					<img
						src={thumbUrl}
						alt={title}
						className="w-full h-full object-cover"
						draggable={false}
					/>
				) : (
					<Placeholder seriesName={series.name} />
				)}

				{/* Episode number watermark */}
				<span className="absolute bottom-1 right-1.5 text-xs font-bold text-white/60 drop-shadow select-none tabular-nums">
					Ep {episode.episodeNumberStr || episode.episodeNumber}
				</span>

				{/* Completed tick */}
				{isWatched && (
					<div className="absolute top-1 right-1 bg-green-600 rounded-full p-0.5">
						<svg
							className="w-3 h-3 text-white"
							viewBox="0 0 20 20"
							fill="currentColor">
							<path
								fillRule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clipRule="evenodd"
							/>
						</svg>
					</div>
				)}

				{/* Play overlay */}
				<div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all">
					<div className="w-8 h-8 rounded-full bg-white/0 group-hover:bg-white/90 flex items-center justify-center transition-all scale-75 group-hover:scale-100">
						<svg
							className="w-4 h-4 text-black/0 group-hover:text-black translate-x-0.5 transition-all"
							fill="currentColor"
							viewBox="0 0 24 24">
							<path d="M8 5v14l11-7z" />
						</svg>
					</div>
				</div>

				<div className="absolute bottom-0 left-0 right-0">
					<ProgressBar progress={!isWatched && progress > 2 ? progress : 0} />
				</div>
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0 flex flex-col justify-center">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="text-sm font-medium text-white">
							<span className="text-gray-400 mr-2">
								Ep {episode.episodeNumberStr || episode.episodeNumber}
							</span>
							{title}
						</p>
						{overview && (
							<p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
								{overview}
							</p>
						)}
					</div>

					<div className="shrink-0 flex flex-col items-end gap-1 text-xs text-gray-500">
						<span
							className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}>
							{badge.label}
						</span>
						{progress > 2 && !isWatched && (
							<span className="text-[#e50914] font-semibold">
								{Math.round(progress)}%
							</span>
						)}
						{duration > 0 && <span>{fmtDuration(duration)}</span>}
						{episode.fileSize > 0 && <span>{fmtSize(episode.fileSize)}</span>}
					</div>
				</div>

				{(epMeta?.airDate || isInProgress) && (
					<p className="text-xs text-gray-600 mt-1">
						{epMeta?.airDate
							? new Date(epMeta.airDate).toLocaleDateString(undefined, {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
								})
							: ''}
						{epMeta?.airDate && isInProgress ? ' · ' : ''}
						{isInProgress ? `Stopped at ${fmtDuration(position)}` : ''}
					</p>
				)}

				<div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
					<button
						onClick={(e) => {
							e.stopPropagation();
							markWatched?.(episode, !isWatched);
						}}
						className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
						{isWatched ? 'Mark Unwatched' : 'Mark Watched'}
					</button>
				</div>
			</div>
		</div>
	);
}

function Placeholder({ seriesName = '' }) {
	const colors = [
		'#312e81',
		'#1e1b4b',
		'#3b0764',
		'#1e3a5f',
		'#14532d',
		'#451a03',
		'#1c1917',
	];
	const c = colors[(seriesName.charCodeAt(0) || 0) % colors.length];
	return (
		<div
			className="w-full h-full flex items-center justify-center"
			style={{ background: c }}>
			<span className="text-2xl opacity-30 select-none">⛩️</span>
		</div>
	);
}
