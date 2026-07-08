import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMovies } from '../../context/MoviesContext';
import { toLocalUrl } from '../../../shared/utils/helpers';

function fmtRuntime(minutes) {
	if (!minutes) return null;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function MoviesHeroSection() {
	const navigate = useNavigate();
	const { library, metadata, history, playMovie } = useMovies();

	const featured = useMemo(() => {
		const movies = library?.movies || [];
		if (!movies.length) return [];
		const seen = new Set();
		const list = [];

		const recent = [...movies]
			.filter((movie) => history[movie.id]?.lastWatched)
			.sort(
				(a, b) =>
					new Date(history[b.id].lastWatched) -
					new Date(history[a.id].lastWatched),
			)
			.slice(0, 4);
		for (const movie of recent) {
			seen.add(movie.id);
			list.push(movie);
		}

		const topRated = [...movies]
			.filter((movie) => !seen.has(movie.id))
			.sort(
				(a, b) =>
					(parseFloat(metadata[b.id]?.rating) || 0) -
					(parseFloat(metadata[a.id]?.rating) || 0),
			)
			.slice(0, 4);
		for (const movie of topRated) {
			seen.add(movie.id);
			list.push(movie);
		}

		const withBackdrops = movies.filter(
			(movie) => !seen.has(movie.id) && metadata[movie.id]?.backdropPath,
		);
		for (const movie of withBackdrops) {
			if (list.length >= 8) break;
			seen.add(movie.id);
			list.push(movie);
		}

		return list.slice(0, 8);
	}, [library, metadata, history]);

	const [activeIdx, setActiveIdx] = useState(0);
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		setActiveIdx(0);
	}, [featured.length]);

	useEffect(() => {
		if (paused || featured.length <= 1) return;
		const timer = setTimeout(
			() => setActiveIdx((index) => (index + 1) % featured.length),
			7000,
		);
		return () => clearTimeout(timer);
	}, [activeIdx, paused, featured.length]);

	const goPrev = useCallback(
		() =>
			setActiveIdx((index) => (index - 1 + featured.length) % featured.length),
		[featured.length],
	);
	const goNext = useCallback(
		() => setActiveIdx((index) => (index + 1) % featured.length),
		[featured.length],
	);

	if (!featured.length) return null;

	const activeMovie = featured[activeIdx];
	const activeMeta = metadata[activeMovie.id] || {};
	const activeHist = history[activeMovie.id] || null;
	const resumeAt =
		activeHist && !activeHist.completed && (activeHist.position || 0) > 30
			? activeHist.position
			: 0;

	return (
		<div
			className="relative w-full overflow-hidden select-none"
			style={{ height: '56vw', maxHeight: '680px', minHeight: '360px' }}
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}>
			{featured.map((movie, index) => {
				const backdropSrc = metadata[movie.id]?.backdropPath
					? toLocalUrl(metadata[movie.id].backdropPath)
					: null;
				return (
					<div
						key={movie.id}
						className="absolute inset-0 transition-opacity duration-700"
						style={{ opacity: index === activeIdx ? 1 : 0 }}>
						{backdropSrc ? (
							<img
								src={backdropSrc}
								alt={metadata[movie.id]?.title || movie.name}
								className="w-full h-full object-cover object-top"
							/>
						) : (
							<div className="w-full h-full bg-gradient-to-r from-[#141414] to-[#202020]" />
						)}
					</div>
				);
			})}

			<div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent pointer-events-none" />
			<div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent pointer-events-none" />
			<div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#0a0a0a]/80 via-[#0a0a0a]/20 to-transparent pointer-events-none" />

			<AnimatePresence mode="wait">
				<motion.div
					key={activeMovie.id}
					initial={{ opacity: 0, x: -24 }}
					animate={{ opacity: 1, x: 0 }}
					exit={{ opacity: 0, x: 12 }}
					transition={{ duration: 0.45, ease: 'easeOut' }}
					className="absolute bottom-0 left-0 px-12 pb-14 max-w-2xl z-10">
					<div className="flex items-center gap-3 mb-3 text-sm">
						{activeMeta.rating && (
							<span className="text-yellow-400 font-semibold">
								⭐ {activeMeta.rating}
							</span>
						)}
						{activeMovie.year && (
							<span className="text-gray-300">{activeMovie.year}</span>
						)}
						{activeMeta.runtime && (
							<span className="text-gray-400">
								{fmtRuntime(activeMeta.runtime)}
							</span>
						)}
						{activeMeta.genres?.length > 0 && (
							<span className="text-gray-500">
								{activeMeta.genres.slice(0, 2).join(' · ')}
							</span>
						)}
					</div>

					<h1 className="text-4xl lg:text-5xl font-black text-white text-shadow leading-tight mb-3">
						{activeMeta.title || activeMovie.name}
					</h1>

					{activeMeta.tagline && (
						<p className="text-sm text-gray-400 italic mb-3">
							{activeMeta.tagline}
						</p>
					)}

					{activeMeta.overview && (
						<p className="text-sm lg:text-[15px] text-gray-300 leading-relaxed max-w-xl line-clamp-4 mb-6">
							{activeMeta.overview}
						</p>
					)}

					<div className="flex items-center gap-3">
						<button
							onClick={() => playMovie(activeMovie, resumeAt)}
							className="btn-primary flex items-center gap-2 min-w-[148px] justify-center">
							<svg
								className="w-4 h-4"
								fill="currentColor"
								viewBox="0 0 24 24">
								<path d="M8 5v14l11-7z" />
							</svg>
							{resumeAt > 0 ? 'Resume' : 'Play'}
						</button>
						<button
							onClick={() => navigate(`/movies/${activeMovie.id}`)}
							className="btn-secondary">
							More Info
						</button>
					</div>
				</motion.div>
			</AnimatePresence>

			{featured.length > 1 && (
				<>
					<button
						onClick={goPrev}
						className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors">
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M15 19l-7-7 7-7"
							/>
						</svg>
					</button>
					<button
						onClick={goNext}
						className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors">
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</button>
					<div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
						{featured.map((_, index) => (
							<button
								key={index}
								onClick={() => setActiveIdx(index)}
								className={`rounded-full transition-all duration-300 ${index === activeIdx ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/35 hover:bg-white/60'}`}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
