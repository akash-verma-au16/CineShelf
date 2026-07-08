import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAnime } from '../../context/AnimeContext';
import { toLocalUrl } from '../../../shared/utils/helpers';

const POSTER_W = 160;
const POSTER_W_COMPACT = 128;
const EXPAND_W = 156;

export default function AnimeCard({ series, compact = false }) {
	const navigate = useNavigate();
	const { metadata, history, favorites, toggleFavorite, getVisibleEpisodes } =
		useAnime();
	const [hovered, setHovered] = useState(false);
	const hoverTimer = useRef(null);
	const meta = metadata[series.id];

	const posterSrc = meta?.posterPath ? toLocalUrl(meta.posterPath) : null;

	const visibleEps = getVisibleEpisodes(series);
	const watchedCount = visibleEps.filter((ep) => {
		return history[ep.id]?.completed;
	}).length;
	const seriesProgress =
		visibleEps.length > 0
			? Math.round((watchedCount / visibleEps.length) * 100)
			: 0;

	const isFav = (favorites || []).includes(series.id);

	function handleMouseEnter() {
		hoverTimer.current = setTimeout(() => setHovered(true), 380);
	}
	function handleMouseLeave() {
		clearTimeout(hoverTimer.current);
		setHovered(false);
	}

	const pW = compact ? POSTER_W_COMPACT : POSTER_W;
	const cardH = Math.round(pW * 1.5);

	return (
		<div
			className="relative shrink-0 cursor-pointer"
			style={{
				width: hovered && !compact ? pW + EXPAND_W : pW,
				transition: 'width 0.22s ease-out',
			}}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={() => navigate(`/anime/${series.id}`)}>
			<div
				className="flex rounded-md overflow-hidden shadow-lg bg-[#1a1a1a]"
				style={{ height: cardH }}>
				{/* Poster */}
				<div
					className="relative shrink-0"
					style={{ width: pW }}>
					{posterSrc ? (
						<img
							src={posterSrc}
							alt={series.name}
							className="w-full h-full object-cover"
							loading="lazy"
							onError={(e) => {
								e.target.style.display = 'none';
							}}
						/>
					) : (
						<PosterPlaceholder name={series.name} />
					)}

					{hovered && !compact && (
						<div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-r from-transparent to-[#1a1a1a] pointer-events-none" />
					)}

					{/* Favourite toggle */}
					<button
						className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center
							rounded-full z-10 transition-all duration-150
							${
								isFav
									? 'bg-red-600/90 text-white'
									: 'bg-black/50 text-white/40 hover:text-white hover:bg-black/70'
							}`}
						onClick={(e) => {
							e.stopPropagation();
							toggleFavorite(series.id);
						}}>
						<svg
							className="w-3.5 h-3.5"
							viewBox="0 0 24 24"
							fill={isFav ? 'currentColor' : 'none'}
							stroke="currentColor"
							strokeWidth={2}>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
							/>
						</svg>
					</button>

					{/* Play hint on hover */}
					{hovered && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
							<div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
								<svg
									className="w-5 h-5 text-white ml-0.5"
									viewBox="0 0 24 24"
									fill="currentColor">
									<path d="M8 5v14l11-7z" />
								</svg>
							</div>
						</div>
					)}

					{/* Progress bar */}
					{seriesProgress > 0 && seriesProgress < 100 && (
						<div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
							<div
								className="h-full bg-[#e50914]"
								style={{ width: `${seriesProgress}%` }}
							/>
						</div>
					)}
					{seriesProgress === 100 && (
						<div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500" />
					)}
				</div>

				{/* Info panel — slides in on hover */}
				{hovered && !compact && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.15 }}
						className="flex flex-col p-3 overflow-hidden bg-[#1a1a1a]"
						style={{ width: EXPAND_W }}>
						<p className="font-bold text-white text-sm leading-tight mb-1 line-clamp-2">
							{meta?.title || series.name}
						</p>

						<div className="flex items-center gap-2 mb-2 flex-wrap">
							{meta?.year && (
								<span className="text-xs text-gray-500">{meta.year}</span>
							)}
							{meta?.rating && (
								<span className="flex items-center gap-0.5 text-yellow-400 text-xs font-semibold">
									<svg
										className="w-3 h-3"
										viewBox="0 0 20 20"
										fill="currentColor">
										<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
									</svg>
									{meta.rating}
								</span>
							)}
						</div>

						{meta?.genres?.length > 0 && (
							<div className="flex flex-wrap gap-1 mb-2">
								{meta.genres.slice(0, 3).map((g) => (
									<span
										key={g}
										className="tag-badge">
										{g}
									</span>
								))}
							</div>
						)}

						{meta?.overview && (
							<p
								className="text-xs text-gray-400 leading-relaxed flex-1 overflow-y-auto"
								style={{ maxHeight: 88 }}
								onClick={(e) => e.stopPropagation()}>
								{meta.overview}
							</p>
						)}

						<div className="mt-auto pt-2 text-xs text-gray-600">
							{series.totalEpisodes} ep
						</div>
					</motion.div>
				)}
			</div>

			{/* Title below card */}
			<div
				className="mt-1.5 px-0.5 overflow-hidden"
				style={{ maxWidth: pW }}>
				<p className="text-xs text-gray-300 font-medium truncate leading-tight">
					{meta?.title || series.name}
				</p>
				{meta?.year && <p className="text-xs text-gray-500">{meta.year}</p>}
			</div>
		</div>
	);
}

function PosterPlaceholder({ name }) {
	const initial = name?.[0]?.toUpperCase() || '?';
	let hash = 0;
	for (let i = 0; i < (name?.length || 0); i++)
		hash = (name?.charCodeAt(i) || 0) + ((hash << 5) - hash);
	const hue = Math.abs(hash) % 360;
	return (
		<div
			className="w-full h-full flex flex-col items-center justify-center gap-2"
			style={{ background: `hsl(${hue}, 30%, 18%)` }}>
			<span
				className="text-4xl font-black opacity-40"
				style={{ color: `hsl(${hue}, 60%, 70%)` }}>
				{initial}
			</span>
			<span className="text-xs text-white/30 text-center px-2 leading-tight truncate w-full">
				{name}
			</span>
		</div>
	);
}
