import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMovies } from '../../context/MoviesContext';
import { toLocalUrl } from '../../../shared/utils/helpers';
import LoadingSpinner from '../../../shared/components/UI/LoadingSpinner';
import MoviesRow from '../Home/MoviesRow';

function formatRuntime(minutes) {
	if (!minutes) return null;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(value) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
		return null;
	return `$${value.toLocaleString()}`;
}

export default function MovieDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const {
		library,
		metadata,
		history,
		initialized,
		playMovie,
		loading,
		fetchMetadata,
	} = useMovies();
	const movie = library?.movies?.find((m) => m.id === id);
	const meta = metadata[id] || {};
	const hist = history[id];
	const backdropSrc = meta.backdropPath ? toLocalUrl(meta.backdropPath) : null;
	const posterSrc = meta.posterPath ? toLocalUrl(meta.posterPath) : null;
	const progress =
		hist?.duration > 0 ? Math.round((hist.position / hist.duration) * 100) : 0;
	const resumeAt = hist?.position > 30 && !hist?.completed ? hist.position : 0;

	useEffect(() => {
		if (!movie || loading.metadata) return;
		if (!meta.tmdbId || meta.enhanced !== true) {
			fetchMetadata?.(movie.id, movie.name, movie.year);
		}
	}, [movie, meta.tmdbId, meta.enhanced, loading.metadata, fetchMetadata]);

	const collectionMovies = useMemo(() => {
		if (!meta.collection?.id) return [];
		return (library?.movies || []).filter(
			(entry) =>
				entry.id !== id &&
				metadata[entry.id]?.collection?.id === meta.collection.id,
		);
	}, [library, metadata, meta.collection, id]);

	const sameDirectorMovies = useMemo(() => {
		if (!meta.director) return [];
		return (library?.movies || [])
			.filter(
				(entry) =>
					entry.id !== id && metadata[entry.id]?.director === meta.director,
			)
			.slice(0, 18);
	}, [library, metadata, meta.director, id]);

	const castNames = useMemo(
		() => new Set((meta.cast || []).map((entry) => entry.name).filter(Boolean)),
		[meta.cast],
	);

	const castRelatedMovies = useMemo(() => {
		if (castNames.size === 0) return [];
		return (library?.movies || [])
			.filter((entry) => entry.id !== id)
			.map((entry) => {
				const overlap = (metadata[entry.id]?.cast || []).filter((person) =>
					castNames.has(person.name),
				).length;
				return { movie: entry, overlap };
			})
			.filter((entry) => entry.overlap > 0)
			.sort((a, b) => b.overlap - a.overlap)
			.slice(0, 18)
			.map((entry) => entry.movie);
	}, [library, metadata, castNames, id]);

	const genreSet = useMemo(() => new Set(meta.genres || []), [meta.genres]);
	const genreRelatedMovies = useMemo(() => {
		if (genreSet.size === 0) return [];
		return (library?.movies || [])
			.filter((entry) => entry.id !== id)
			.map((entry) => {
				const overlap = (metadata[entry.id]?.genres || []).filter((genre) =>
					genreSet.has(genre),
				).length;
				return { movie: entry, overlap };
			})
			.filter((entry) => entry.overlap > 0)
			.sort((a, b) => b.overlap - a.overlap)
			.slice(0, 18)
			.map((entry) => entry.movie);
	}, [library, metadata, genreSet, id]);

	if (!initialized) {
		return (
			<div className="flex items-center justify-center h-64 pt-16">
				<LoadingSpinner size="lg" />
			</div>
		);
	}
	if (!movie) {
		return (
			<div className="flex flex-col items-center justify-center h-64 pt-16 text-center px-8">
				<p className="text-gray-500">Movie not found.</p>
				<button
					onClick={() => navigate('/movies')}
					className="mt-4 text-sm text-[#e50914] hover:underline">
					← Back to Movies
				</button>
			</div>
		);
	}

	return (
		<div className="min-h-screen pb-16">
			{/* Backdrop hero */}
			<div
				className="relative w-full overflow-hidden"
				style={{ height: '46vw', maxHeight: 580, minHeight: 300 }}>
				{backdropSrc ? (
					<img
						src={backdropSrc}
						alt={meta.title || movie.name}
						className="absolute inset-0 w-full h-full object-cover object-top"
					/>
				) : (
					<div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-800" />
				)}
				<div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/20 to-transparent" />
				<div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/70 via-transparent to-transparent" />

				{/* Back button */}
				<button
					onClick={() => navigate('/movies')}
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
					Movies
				</button>
			</div>

			{/* Main content */}
			<div className="px-12 -mt-28 relative z-10 flex gap-8">
				{/* Poster */}
				{posterSrc && (
					<div
						className="shrink-0 hidden md:block w-[300px] rounded-lg overflow-hidden shadow-2xl"
						style={{ aspectRatio: '2/3', minWidth: 180 }}>
						<img
							src={posterSrc}
							alt={meta.title || movie.name}
							className="w-full h-full object-cover"
						/>
					</div>
				)}

				{/* Info */}
				<div className="flex-1 min-w-0 pt-20">
					{/* Title */}
					<h1 className="text-4xl font-black text-white leading-tight mb-1">
						{meta.title || movie.name}
					</h1>

					{/* Metadata row */}
					<div className="flex items-center flex-wrap gap-3 text-sm text-gray-400 mb-4">
						{movie.year && <span>{movie.year}</span>}
						{meta.runtime && <span>{formatRuntime(meta.runtime)}</span>}
						{meta.rating && (
							<span className="flex items-center gap-1 text-yellow-400 font-semibold">
								<svg
									className="w-3.5 h-3.5"
									fill="currentColor"
									viewBox="0 0 24 24">
									<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
								</svg>
								{meta.rating}
								{meta.tmdbId && (
									<a
										href={`https://www.themoviedb.org/movie/${meta.tmdbId}`}
										target="_blank"
										rel="noopener noreferrer"
										className="ml-2 px-2 py-0.5 rounded bg-[#222] text-xs text-white font-medium hover:bg-[#444]">
										TMDB: {meta.tmdbId}
									</a>
								)}
							</span>
						)}
						{meta.genres?.map((g) => (
							<span
								key={g}
								className="px-2 py-0.5 rounded-full text-xs bg-gradient-to-r from-[#e50914]/20 to-[#fff]/10 text-white">
								{g}
							</span>
						))}
					</div>

					{/* Play actions and progress bar above description */}
					<div className="flex gap-3 mb-4">
						<button
							onClick={() => playMovie(movie, resumeAt)}
							disabled={loading.scanning}
							className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50">
							<svg
								className="w-4 h-4"
								fill="currentColor"
								viewBox="0 0 24 24">
								<path d="M8 5v14l11-7z" />
							</svg>
							{resumeAt > 0 ? 'Resume' : 'Play'}
						</button>
						{resumeAt > 0 && (
							<button
								onClick={() => playMovie(movie, 0)}
								className="flex items-center gap-2 px-5 py-3 bg-white/15 hover:bg-white/20 text-white font-semibold text-sm rounded-md transition-colors">
								Play from Start
							</button>
						)}
					</div>

					{progress > 0 && progress < 95 && (
						<div className="mb-4">
							<div className="flex justify-between text-xs text-gray-500 mb-1">
								<span>
									{hist?.position
										? Math.floor(hist.position / 60) + 'm watched'
										: ''}
								</span>
								<span>{progress}%</span>
							</div>
							<div className="h-1.5 bg-white/10 rounded-full">
								<div
									className="h-full bg-gradient-to-r from-[#e50914] to-[#fff]/60 rounded-full"
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					)}

					{meta.tagline && (
						<p className="text-sm text-gray-500 italic mb-3">{meta.tagline}</p>
					)}

					<div className="mt-4">
						<div className="min-w-0">
							{meta.overview && (
								<p className="text-sm text-gray-300 leading-relaxed max-w-2xl mb-4">
									{meta.overview}
								</p>
							)}
							{meta.cast?.length > 0 && (
								<div className="mb-2">
									<div className="flex flex-wrap gap-1">
										{meta.cast.slice(0, 8).map((c) => (
											<span
												key={c.name}
												className="bg-[#222] text-white px-2 py-0.5 rounded text-sm font-medium">
												{c.name}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* More Info */}
			<div className="relative z-10 px-12 mt-8">
				<div className="w-full">
					<h2 className="pl-4 text-lg font-semibold text-gray-400 mb-3">
						More Info
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						{/* Left: details */}
						<div className="rounded-lg border border-white/10 bg-white/5 p-4">
							<div className="grid grid-cols-1 gap-2 text-sm">
								{meta.director && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Director
										</span>
										<span className="text-white">{meta.director}</span>
									</div>
								)}
								{meta.status && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Status
										</span>
										<span className="text-white">{meta.status}</span>
									</div>
								)}
								{meta.releaseDate && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Release
										</span>
										<span className="text-white">{meta.releaseDate}</span>
									</div>
								)}
								{meta.certification && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Certification
										</span>
										<span className="text-white">{meta.certification}</span>
									</div>
								)}
								{meta.originalTitle && meta.originalTitle !== meta.title && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Original Title
										</span>
										<span className="text-white">{meta.originalTitle}</span>
									</div>
								)}
								{meta.originalLanguage && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Original Lang
										</span>
										<span className="text-white">{meta.originalLanguage}</span>
									</div>
								)}
								{meta.spokenLanguages?.length > 0 && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Languages
										</span>
										<span className="text-white">
											{meta.spokenLanguages.join(', ')}
										</span>
									</div>
								)}
								{meta.productionCountries?.length > 0 && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Countries
										</span>
										<span className="text-white">
											{meta.productionCountries.join(', ')}
										</span>
									</div>
								)}
								{meta.productionCompanies?.length > 0 && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Companies
										</span>
										<span className="text-white">
											{meta.productionCompanies.slice(0, 4).join(', ')}
											{meta.productionCompanies.length > 4 ? '…' : ''}
										</span>
									</div>
								)}
								{formatMoney(meta.budget) && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Budget
										</span>
										<span className="text-white">
											{formatMoney(meta.budget)}
										</span>
									</div>
								)}
								{formatMoney(meta.revenue) && (
									<div className="flex gap-2">
										<span className="w-36 shrink-0 text-gray-400 font-semibold">
											Revenue
										</span>
										<span className="text-white">
											{formatMoney(meta.revenue)}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Right: links, keywords, providers */}
						<div className="rounded-lg border border-white/10 bg-white/5 p-4">
							<div className="text-sm">
								<div className="flex flex-wrap gap-2 mb-3">
									{meta.homepage && (
										<a
											href={meta.homepage}
											target="_blank"
											rel="noopener noreferrer"
											className="px-2 py-1 rounded bg-[#222] text-white font-medium hover:bg-[#444]">
											Homepage
										</a>
									)}
									{meta.imdbId && (
										<a
											href={`https://www.imdb.com/title/${meta.imdbId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="px-2 py-1 rounded bg-[#222] text-white font-medium hover:bg-[#444]">
											IMDb
										</a>
									)}
									{meta.externalIds?.wikidataId && (
										<a
											href={`https://www.wikidata.org/wiki/${meta.externalIds.wikidataId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="px-2 py-1 rounded bg-[#222] text-white font-medium hover:bg-[#444]">
											Wikidata
										</a>
									)}
									{meta.trailer?.site === 'YouTube' && meta.trailer?.key && (
										<a
											href={`https://www.youtube.com/watch?v=${meta.trailer.key}`}
											target="_blank"
											rel="noopener noreferrer"
											className="px-2 py-1 rounded bg-[#222] text-white font-medium hover:bg-[#444]">
											Trailer
										</a>
									)}
								</div>

								{meta.keywords?.length > 0 && (
									<div className="mb-4">
										<div className="text-gray-400 font-semibold mb-1">
											Keywords
										</div>
										<div className="flex flex-wrap gap-1">
											{meta.keywords.slice(0, 18).map((k) => (
												<span
													key={k}
													className="bg-[#222] text-white px-2 py-0.5 rounded text-sm font-medium">
													{k}
												</span>
											))}
										</div>
									</div>
								)}

								{meta.watchProviders && (
									<div>
										<div className="text-gray-400 font-semibold mb-1">
											Watch Providers
											{meta.watchProviders.region
												? ` (${meta.watchProviders.region})`
												: ''}
										</div>
										<div className="grid grid-cols-1 gap-2">
											{meta.watchProviders.flatrate?.length > 0 && (
												<div className="flex gap-2">
													<span className="w-24 shrink-0 text-gray-400 font-semibold">
														Stream
													</span>
													<span className="text-white">
														{meta.watchProviders.flatrate.join(', ')}
													</span>
												</div>
											)}
											{meta.watchProviders.rent?.length > 0 && (
												<div className="flex gap-2">
													<span className="w-24 shrink-0 text-gray-400 font-semibold">
														Rent
													</span>
													<span className="text-white">
														{meta.watchProviders.rent.join(', ')}
													</span>
												</div>
											)}
											{meta.watchProviders.buy?.length > 0 && (
												<div className="flex gap-2">
													<span className="w-24 shrink-0 text-gray-400 font-semibold">
														Buy
													</span>
													<span className="text-white">
														{meta.watchProviders.buy.join(', ')}
													</span>
												</div>
											)}
											{meta.watchProviders.link && (
												<a
													href={meta.watchProviders.link}
													target="_blank"
													rel="noopener noreferrer"
													className="text-xs text-gray-400 hover:underline">
													View on TMDB
												</a>
											)}
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Related rows */}
			<div className="relative z-10 mt-12">
				{collectionMovies.length > 0 && (
					<MoviesRow
						title={meta.collection?.name || 'Franchise'}
						movies={collectionMovies}
					/>
				)}
				{sameDirectorMovies.length > 0 && (
					<MoviesRow
						title={`More from ${meta.director}`}
						movies={sameDirectorMovies}
					/>
				)}
				{castRelatedMovies.length > 0 && (
					<MoviesRow
						title="With Similar Cast"
						movies={castRelatedMovies}
					/>
				)}
				{genreRelatedMovies.length > 0 && (
					<MoviesRow
						title="More Like This"
						movies={genreRelatedMovies}
					/>
				)}
			</div>
		</div>
	);
}
