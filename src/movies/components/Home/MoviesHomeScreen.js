import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMovies } from '../../context/MoviesContext';
import LoadingSpinner from '../../../shared/components/UI/LoadingSpinner';
import MoviesRow from './MoviesRow';
import MoviesHeroSection from './MoviesHeroSection';
import MoviesCustomRowsSection from './MoviesCustomRowsSection';

// ── Main home screen ──────────────────────────────────────────────────────────
export default function MoviesHomeScreen() {
	const {
		library,
		metadata,
		history,
		loading,
		initialized,
		scanLibrary,
		settings,
		customRows,
	} = useMovies();

	const movies = useMemo(() => library?.movies || [], [library]);

	// Recently watched
	const recentlyWatched = useMemo(() => {
		return movies
			.filter((m) => history[m.id]?.lastWatched)
			.sort(
				(a, b) =>
					new Date(history[b.id].lastWatched) -
					new Date(history[a.id].lastWatched),
			)
			.slice(0, 12);
	}, [movies, history]);

	const homeMovieCount = useMemo(() => {
		const ids = new Set((customRows || []).flatMap((row) => row.movieIds));
		return ids.size;
	}, [customRows]);

	if (!initialized) {
		return (
			<div className="flex items-center justify-center h-64">
				<LoadingSpinner size="lg" />
			</div>
		);
	}

	// No source dirs configured yet
	if (!settings?.moviesSourceDirs?.length) {
		return (
			<div className="flex flex-col items-center justify-center h-full py-32 text-center px-8">
				<div className="text-5xl mb-5">🎬</div>
				<h2 className="text-2xl font-bold text-white mb-2">
					No movies source configured
				</h2>
				<p className="text-gray-500 max-w-sm mb-6">
					Add a folder containing your movie files to get started.
				</p>
				<a
					href="#/movies/settings"
					className="px-5 py-2.5 bg-[#e50914] hover:bg-[#c40812] text-white text-sm font-semibold rounded-md transition-colors">
					Configure Movies
				</a>
			</div>
		);
	}

	// Source dirs configured but no library yet
	if (!loading.scanning && movies.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full py-32 text-center px-8">
				<div className="text-5xl mb-5">📂</div>
				<h2 className="text-2xl font-bold text-white mb-2">Library is empty</h2>
				<p className="text-gray-500 max-w-sm mb-6">
					Scan your configured directories to populate your movies library.
				</p>
				<button
					onClick={scanLibrary}
					disabled={loading.scanning}
					className="px-5 py-2.5 bg-[#e50914] hover:bg-[#c40812] disabled:opacity-50 text-white text-sm font-semibold rounded-md transition-colors">
					Scan for Movies
				</button>
			</div>
		);
	}

	return (
		<div className="pb-16">
			<MoviesHeroSection />

			<div className="relative z-10 pt-2">
				{recentlyWatched.length > 0 && (
					<MoviesRow
						title="Recently Watched"
						movies={recentlyWatched}
					/>
				)}

				<div className="relative flex items-center px-6 mb-6 mt-1">
					<div
						className="flex-1 h-px"
						style={{
							background:
								'linear-gradient(to right, transparent, rgba(255,255,255,0.07) 40%, rgba(255,255,255,0.07) 60%, transparent)',
						}}
					/>
					<span className="ml-3 text-[11px] text-gray-700 tabular-nums select-none shrink-0">
						{homeMovieCount}
						<span className="mx-0.5 text-gray-800">/</span>
						{movies.length}
					</span>
				</div>

				<MoviesCustomRowsSection />

				<MoviesRow
					title="Library"
					movies={movies}
					emptyMessage="No movies available yet."
				/>

				{loading.metadata && (
					<div className="px-6 text-xs text-gray-500 animate-pulse">
						Fetching metadata…
					</div>
				)}
			</div>
		</div>
	);
}
