import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/TVContext';
import { toLocalUrl, yearRange } from '../../../shared/utils/helpers';

/**
 * Hero carousel — shows Hall of Fame first, then Favourites, then most-recently
 * watched, then top series by episode count. Auto-advances every 7 s.
 */
export default function HeroSection() {
	const navigate = useNavigate();
	const {
		allSeries,
		metadata,
		history,
		favorites,
		getNextEpisode,
		launchEpisode,
	} = useApp();

	const featured = useMemo(() => {
		if (!allSeries.length) return [];
		const seen = new Set();
		const list = [];

		// 1. Favourites (in saved order)
		for (const id of favorites) {
			const s = allSeries.find((x) => x.id === id);
			if (s && !seen.has(s.id)) {
				seen.add(s.id);
				list.push(s);
			}
		}

		// 2. Most recently watched (fill up to 8)
		if (list.length < 8) {
			const timeMap = {};
			for (const s of allSeries) {
				for (const season of s.seasons || []) {
					for (const ep of season.episodes || []) {
						const h = history[ep.id];
						if (
							h?.lastWatched &&
							(!timeMap[s.id] || h.lastWatched > timeMap[s.id])
						) {
							timeMap[s.id] = h.lastWatched;
						}
					}
				}
			}
			const recent = allSeries
				.filter((s) => timeMap[s.id] && !seen.has(s.id))
				.sort((a, b) => (timeMap[b.id] > timeMap[a.id] ? 1 : -1))
				.slice(0, 8 - list.length);
			for (const s of recent) {
				seen.add(s.id);
				list.push(s);
			}
		}

		// 3. Top by rating (fill remaining)
		if (list.length < 8) {
			const rest = allSeries
				.filter((s) => !seen.has(s.id))
				.sort(
					(a, b) =>
						(parseFloat(metadata[b.id]?.rating) || 0) -
						(parseFloat(metadata[a.id]?.rating) || 0),
				)
				.slice(0, 8 - list.length);
			for (const s of rest) list.push(s);
		}

		return list.slice(0, 8);
	}, [allSeries, favorites, history, metadata]);

	const [activeIdx, setActiveIdx] = useState(0);
	const [paused, setPaused] = useState(false);

	// Reset when featured list rebuilds (e.g. after a library scan)
	useEffect(() => {
		setActiveIdx(0);
	}, [featured.length]);

	// Auto-advance every 7 seconds
	useEffect(() => {
		if (paused || featured.length <= 1) return;
		const t = setTimeout(
			() => setActiveIdx((i) => (i + 1) % featured.length),
			7000,
		);
		return () => clearTimeout(t);
	}, [activeIdx, paused, featured.length]);

	const goPrev = useCallback(
		() => setActiveIdx((i) => (i - 1 + featured.length) % featured.length),
		[featured.length],
	);
	const goNext = useCallback(
		() => setActiveIdx((i) => (i + 1) % featured.length),
		[featured.length],
	);

	if (!featured.length) return null;

	const activeSeries = featured[activeIdx];
	const activeNextEp = activeSeries ? getNextEpisode(activeSeries) : null;
	const activeNextEpHist = activeNextEp ? history[activeNextEp.id] : null;
	const activeIsResuming =
		!!activeNextEpHist &&
		!activeNextEpHist.completed &&
		(activeNextEpHist.position || 0) > 30;

	return (
		<div
			className="relative w-full overflow-hidden select-none"
			style={{ height: '56vw', maxHeight: '680px', minHeight: '360px' }}
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}>
			{/* ── Backdrop slides — cross-fade ── */}
			{featured.map((series, idx) => {
				const m = metadata[series.id];
				const bsrc = m?.backdropPath ? toLocalUrl(m.backdropPath) : null;
				return (
					<div
						key={series.id}
						className="absolute inset-0 transition-opacity duration-700"
						style={{ opacity: idx === activeIdx ? 1 : 0 }}>
						{bsrc ? (
							<img
								src={bsrc}
								alt={series.name}
								className="w-full h-full object-cover object-top"
								onError={(e) => {
									e.target.style.display = 'none';
								}}
							/>
						) : (
							<HeroBgPlaceholder name={series.name} />
						)}
					</div>
				);
			})}

			{/* Gradient overlays */}
			<div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent pointer-events-none" />
			<div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent pointer-events-none" />
			{/* Top fade — blends hero into page background / navbar */}
			<div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#0a0a0a]/80 via-[#0a0a0a]/20 to-transparent pointer-events-none" />

			{/* ── Slide content (animates per-slide) ── */}
			<AnimatePresence mode="wait">
				<SlideContent
					key={activeSeries?.id}
					series={activeSeries}
					meta={metadata[activeSeries?.id]}
					isResuming={activeIsResuming}
					nextEp={activeNextEp}
					onPlay={() =>
						activeNextEp
							? launchEpisode(activeNextEp)
							: navigate(`/series/${activeSeries.id}`)
					}
					onNavigate={() => navigate(`/series/${activeSeries.id}`)}
				/>
			</AnimatePresence>

			{/* ── Prev / Next arrows ── */}
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
				</>
			)}

			{/* ── Dot indicators ── */}
			{featured.length > 1 && (
				<div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
					{featured.map((_, i) => (
						<button
							key={i}
							onClick={() => setActiveIdx(i)}
							className={`rounded-full transition-all duration-300 ${
								i === activeIdx
									? 'w-5 h-2 bg-white'
									: 'w-2 h-2 bg-white/35 hover:bg-white/60'
							}`}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function SlideContent({
	series,
	meta,
	isResuming,
	nextEp,
	onPlay,
	onNavigate,
}) {
	if (!series) return null;
	return (
		<motion.div
			initial={{ opacity: 0, x: -24 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: 12 }}
			transition={{ duration: 0.45, ease: 'easeOut' }}
			className="absolute bottom-0 left-0 px-12 pb-14 max-w-2xl z-10">
			{/* Meta row */}
			<div className="flex items-center gap-3 mb-3 text-sm">
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
				<span className="text-gray-400">
					{series.totalSeasons} season{series.totalSeasons !== 1 ? 's' : ''}
				</span>
				<span className="text-gray-400">{series.totalEpisodes} episodes</span>
			</div>

			{/* Title */}
			<h1 className="text-4xl lg:text-5xl font-black text-white text-shadow leading-tight mb-3">
				{meta?.title || series.name}
			</h1>

			{/* Genre tags */}
			{meta?.genres?.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-4">
					{meta.genres.slice(0, 4).map((g) => (
						<span
							key={g}
							className="tag-badge">
							{g}
						</span>
					))}
				</div>
			)}

			{/* Overview */}
			{meta?.overview && (
				<p className="text-gray-300 text-sm leading-relaxed mb-5 max-w-lg text-shadow line-clamp-4">
					{meta.overview}
				</p>
			)}

			{/* Buttons */}
			<div className="flex items-center gap-3">
				<button
					onClick={onPlay}
					className="btn-primary flex items-center gap-2 text-base px-7 py-2.5">
					<svg
						className="w-5 h-5"
						viewBox="0 0 24 24"
						fill="currentColor">
						<path d="M8 5v14l11-7z" />
					</svg>
					{isResuming ? 'Resume' : 'Play'}
				</button>
				<button
					onClick={onNavigate}
					className="btn-secondary flex items-center gap-2 text-base px-7 py-2.5">
					<svg
						className="w-5 h-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					More Info
				</button>
			</div>
		</motion.div>
	);
}

function HeroBgPlaceholder({ name }) {
	let hash = 0;
	for (let i = 0; i < (name?.length || 0); i++)
		hash = (name?.charCodeAt(i) || 0) + ((hash << 5) - hash);
	const hue = Math.abs(hash) % 360;
	return (
		<div
			className="absolute inset-0"
			style={{
				background: `linear-gradient(135deg, hsl(${hue},25%,12%) 0%, hsl(${(hue + 60) % 360},20%,8%) 100%)`,
			}}
		/>
	);
}
