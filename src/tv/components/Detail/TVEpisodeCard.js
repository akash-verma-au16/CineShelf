import React from 'react';
import { useApp } from '../../context/TVContext';
import ProgressBar from '../../../shared/components/UI/ProgressBar';
import {
	toLocalUrl,
	fmtEpLabel,
	fmtDuration,
	fmtSize,
	getProgress,
} from '../../../shared/utils/helpers';

/** A single episode row in the episode list */
export default function EpisodeCard({
	episode,
	seriesId,
	onPlay,
	onMarkWatched,
}) {
	const { metadata, history } = useApp();
	const meta = metadata[seriesId];
	const epMeta = meta?.episodes?.[episode.key];
	const hist = history[episode.id] || null;

	const progress = getProgress(hist?.position || 0, hist?.duration || 0);
	const isWatched = hist?.completed || progress >= 90;
	const hasProgress = progress > 2 && !isWatched;

	// Prefer a locally-cached still; fall back to the CDN URL while not yet downloaded
	const stillSrc = epMeta?.stillLocalPath
		? toLocalUrl(epMeta.stillLocalPath)
		: epMeta?.stillUrl || null;

	return (
		<div
			className={`
				group flex gap-4 p-3 rounded-lg cursor-pointer
				transition-colors duration-150
				hover:bg-white/5
				${isWatched ? 'opacity-60' : ''}
			`}
			onClick={() => onPlay(episode)}>
			{/* Thumbnail */}
			<div
				className="relative shrink-0 rounded overflow-hidden bg-[#1a1a1a]"
				style={{ width: 160, height: 90 }}>
				{stillSrc ? (
					<img
						src={stillSrc}
						alt={epMeta.title || episode.filename}
						className="w-full h-full object-cover"
						loading="lazy"
						onError={(e) => {
							e.target.style.display = 'none';
						}}
					/>
				) : (
					<EpThumbPlaceholder
						season={episode.season}
						ep={episode.episode}
					/>
				)}

				{/* Play overlay */}
				<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
					<div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
						<svg
							className="w-5 h-5 text-black ml-0.5"
							viewBox="0 0 24 24"
							fill="currentColor">
							<path d="M8 5v14l11-7z" />
						</svg>
					</div>
				</div>

				{/* Watched badge */}
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

				<div className="absolute bottom-0 left-0 right-0">
					<ProgressBar progress={hasProgress ? progress : 0} />
				</div>
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0 flex flex-col justify-center">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="text-sm font-medium text-white">
							<span className="text-gray-400 mr-2">
								{fmtEpLabel(episode.season, episode.episode)}
							</span>
							{epMeta?.title || episode.filename}
						</p>
						{epMeta?.overview && (
							<p className="text-xs text-gray-400 mt-1 leading-relaxed">
								{epMeta.overview}
							</p>
						)}
					</div>

					<div className="shrink-0 flex flex-col items-end gap-1 text-xs text-gray-500">
						{hasProgress && (
							<span className="text-[#e50914] font-semibold">
								{Math.round(progress)}%
							</span>
						)}
						{epMeta?.runtime && <span>{fmtDuration(epMeta.runtime * 60)}</span>}
						{episode.fileSize > 0 && <span>{fmtSize(episode.fileSize)}</span>}
					</div>
				</div>

				{/* Action buttons */}
				<div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
					<button
						onClick={(e) => {
							e.stopPropagation();
							onMarkWatched(episode, !isWatched);
						}}
						className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
						{isWatched ? (
							<>
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								Mark Unwatched
							</>
						) : (
							<>
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								Mark Watched
							</>
						)}
					</button>

					{hist?.position > 0 && !isWatched && (
						<span className="text-xs text-gray-500">
							· Stopped at {fmtDuration(hist.position)}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function EpThumbPlaceholder({ season, ep }) {
	return (
		<div className="w-full h-full flex items-center justify-center bg-[#1e1e1e]">
			<span className="text-gray-600 text-sm font-mono">
				{fmtEpLabel(season, ep)}
			</span>
		</div>
	);
}
