import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/TVContext';
import HeroSection from './TVHeroSection';
import SeriesRow from './TVSeriesRow';
import CustomRowsSection from './TVCustomRowsSection';
import LoadingSpinner from '../../../shared/components/UI/LoadingSpinner';

export default function HomeScreen() {
	const navigate = useNavigate();
	const {
		initialized,
		library,
		allSeries,
		history,
		loading,
		scanLibrary,
		settings,
		customRows,
	} = useApp();

	// ── Recently Watched ──────────────────────────────────────────────────────
	const recentlyWatched = useMemo(() => {
		if (!library) return [];
		const latestMap = {};
		for (const s of allSeries) {
			for (const season of s.seasons || []) {
				for (const ep of season.episodes || []) {
					const h = history[ep.id];
					if (
						h?.lastWatched &&
						(!latestMap[s.id] || h.lastWatched > latestMap[s.id])
					) {
						latestMap[s.id] = h.lastWatched;
					}
				}
			}
		}
		return allSeries
			.filter((s) => latestMap[s.id])
			.sort((a, b) => (latestMap[b.id] > latestMap[a.id] ? 1 : -1));
	}, [library, history, allSeries]);

	// ── Home count (custom shelf shows only) ────────────────────────────────
	const homeSeriesCount = useMemo(() => {
		const ids = new Set((customRows || []).flatMap((r) => r.seriesIds));
		return ids.size;
	}, [customRows]);

	// ── States ────────────────────────────────────────────────────────────────
	if (!initialized) {
		return (
			<div className="flex items-center justify-center h-full">
				<LoadingSpinner size="xl" />
			</div>
		);
	}

	if (!library || allSeries.length === 0) {
		return (
			<EmptyState
				onScan={scanLibrary}
				onSettings={() => navigate('/settings')}
				scanning={loading.scanning}
				settings={settings}
			/>
		);
	}

	return (
		<div className="pb-16">
			{/* Hero */}
			<HeroSection />

			<div className="relative z-10 pt-2">
				{/* Fixed top row — recently watched */}
				{recentlyWatched.length > 0 && (
					<SeriesRow
						title="Recently Watched"
						series={recentlyWatched}
					/>
				)}

				{/* Gradient divider with shelf count */}
				<div className="relative flex items-center px-6 mb-6 mt-1">
					<div
						className="flex-1 h-px"
						style={{
							background:
								'linear-gradient(to right, transparent, rgba(255,255,255,0.07) 40%, rgba(255,255,255,0.07) 60%, transparent)',
						}}
					/>
					<span className="ml-3 text-[11px] text-gray-700 tabular-nums select-none shrink-0">
						{homeSeriesCount}
						<span className="mx-0.5 text-gray-800">/</span>
						{allSeries.length}
					</span>
				</div>

				{/* User-defined custom shelves (DnD) */}
				<CustomRowsSection />
			</div>
		</div>
	);
}

function EmptyState({ onScan, onSettings, scanning, settings }) {
	const hasSourceDirs = settings?.sourceDirs?.length > 0;
	return (
		<div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
			<div className="text-6xl opacity-20">🎬</div>
			<div>
				<h2 className="text-2xl font-bold text-white mb-2">
					{hasSourceDirs ? 'Library is empty' : 'Welcome to CineShelf'}
				</h2>
				<p className="text-gray-400 max-w-md">
					{hasSourceDirs
						? 'No series were found in your configured directories. Make sure your media folders contain series folders.'
						: 'Add your TV series media directories in Settings, then scan to build your library.'}
				</p>
			</div>
			<div className="flex gap-3">
				{hasSourceDirs && (
					<button
						onClick={onScan}
						disabled={scanning}
						className="btn-primary flex items-center gap-2">
						{scanning ? (
							<>
								<span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
								Scanning…
							</>
						) : (
							<>
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								Scan Library
							</>
						)}
					</button>
				)}
				<button
					onClick={onSettings}
					className="btn-secondary">
					Open Settings
				</button>
			</div>
		</div>
	);
}
