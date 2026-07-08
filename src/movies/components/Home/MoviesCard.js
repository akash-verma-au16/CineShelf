import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMovies } from '../../context/MoviesContext';
import { toLocalUrl } from '../../../shared/utils/helpers';

const POSTER_W = 160;
const POSTER_W_COMPACT = 128;
const EXPAND_W = 156;

export default function MoviesCard({ movie, compact = false }) {
	const navigate = useNavigate();
	const { metadata, history } = useMovies();
	const [hovered, setHovered] = useState(false);
	const hoverTimer = useRef(null);
	const meta = metadata[movie.id];

	const posterSrc = meta?.posterPath ? toLocalUrl(meta.posterPath) : null;
	const progress =
		history[movie.id]?.duration > 0
			? Math.round(
					(history[movie.id].position / history[movie.id].duration) * 100,
				)
			: 0;
	const isCompleted = history[movie.id]?.completed;

	function handleMouseEnter() {
		hoverTimer.current = setTimeout(() => setHovered(true), 380);
	}

	function handleMouseLeave() {
		clearTimeout(hoverTimer.current);
		setHovered(false);
	}

	const posterWidth = compact ? POSTER_W_COMPACT : POSTER_W;
	const cardHeight = Math.round(posterWidth * 1.5);

	return (
		<div
			className="relative shrink-0 cursor-pointer"
			style={{
				width: hovered && !compact ? posterWidth + EXPAND_W : posterWidth,
				transition: 'width 0.22s ease-out',
			}}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={() => navigate(`/movies/${movie.id}`)}>
			<div
				className="flex rounded-md overflow-hidden shadow-lg bg-[#1a1a1a]"
				style={{ height: cardHeight }}>
				<div
					className="relative shrink-0"
					style={{ width: posterWidth }}>
					{posterSrc ? (
						<img
							src={posterSrc}
							alt={movie.name}
							className="w-full h-full object-cover"
							loading="lazy"
						/>
					) : (
						<div className="w-full h-full flex flex-col items-center justify-center gap-2 px-2 bg-[#151515]">
							<svg
								className="w-8 h-8 text-gray-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
								/>
							</svg>
							<p className="text-[11px] text-gray-500 text-center leading-tight">
								{movie.name}
							</p>
						</div>
					)}

					{hovered && !compact && (
						<div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-r from-transparent to-[#1a1a1a] pointer-events-none" />
					)}

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

					{progress > 0 && progress < 100 && (
						<div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
							<div
								className="h-full bg-[#e50914]"
								style={{ width: `${progress}%` }}
							/>
						</div>
					)}
					{isCompleted && (
						<div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500" />
					)}
				</div>

				{hovered && !compact && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.15 }}
						className="flex flex-col p-3 overflow-hidden bg-[#1a1a1a]"
						style={{ width: EXPAND_W }}>
						<p className="font-bold text-white text-sm leading-tight mb-1 line-clamp-2">
							{meta?.title || movie.name}
						</p>
						<div className="flex items-center gap-2 mb-2 flex-wrap">
							{movie.year && (
								<span className="text-xs text-gray-500">{movie.year}</span>
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
								{meta.genres.slice(0, 3).map((genre) => (
									<span
										key={genre}
										className="tag-badge">
										{genre}
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
						<div className="mt-auto pt-2 text-xs text-gray-600">Movie</div>
					</motion.div>
				)}
			</div>

			<div
				className="mt-1.5 px-0.5 overflow-hidden"
				style={{ maxWidth: posterWidth }}>
				<p className="text-xs text-gray-300 font-medium truncate leading-tight">
					{meta?.title || movie.name}
				</p>
				{movie.year && <p className="text-xs text-gray-500">{movie.year}</p>}
			</div>
		</div>
	);
}
