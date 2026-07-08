import React, { useState, useEffect } from 'react';
import { useMovies } from '../../../context/MoviesContext';

function formatBytes(bytes) {
	if (!bytes) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function fmtDate(iso) {
	if (!iso) return '—';
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

function fmtDuration(sec) {
	if (!sec) return '0:00';
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	if (h > 0)
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MoviesAppDataTab() {
	const { library, metadata, history, showToast, deleteHistoryEntry } =
		useMovies();
	const [section, setSection] = useState('library');
	const [dataInfo, setDataInfo] = useState(null);

	useEffect(() => {
		if (window.api?.moviesGetDataInfo) {
			window.api.moviesGetDataInfo().then(setDataInfo);
		}
	}, []);

	return (
		<div className="px-8 py-8 min-h-full">
			{/* Header */}
			<div className="flex items-start justify-between mb-5">
				<div>
					<h1 className="text-xl font-bold text-white">Movies — App Data</h1>
					{dataInfo && (
						<p className="text-xs text-gray-500 mt-1 font-mono">
							{dataInfo.dataDir}
						</p>
					)}
				</div>
			</div>

			{/* File size strip */}
			{dataInfo?.files?.length > 0 && (
				<div className="grid grid-cols-3 gap-2 mb-6">
					{dataInfo.files.map((f) => (
						<div
							key={f.name}
							className="bg-white/5 border border-white/8 rounded-lg px-3 py-2.5">
							<p className="text-[11px] font-mono text-gray-500">{f.name}</p>
							<p className="text-sm font-semibold text-white mt-0.5">
								{formatBytes(f.size)}
							</p>
							<p className="text-[11px] text-gray-600 mt-0.5">
								{f.exists ? fmtDate(f.modified) : 'not found'}
							</p>
						</div>
					))}
				</div>
			)}

			{/* Section pills */}
			<div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit mb-7">
				{['library', 'metadata', 'history'].map((s) => (
					<button
						key={s}
						onClick={() => setSection(s)}
						className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all capitalize
							${section === s ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
						{s}
					</button>
				))}
			</div>

			{section === 'library' && <LibrarySection library={library} />}
			{section === 'metadata' && (
				<MetadataSection
					library={library}
					metadata={metadata}
				/>
			)}
			{section === 'history' && (
				<HistorySection
					history={history}
					library={library}
					showToast={showToast}
					deleteHistoryEntry={deleteHistoryEntry}
				/>
			)}
		</div>
	);
}

// ── Library Section ───────────────────────────────────────────────────────────

function LibrarySection({ library }) {
	const [search, setSearch] = useState('');

	if (!library?.movies?.length) {
		return (
			<p className="text-gray-500 text-sm py-8 text-center">
				No library scanned yet. Go to General → Save & Scan Library.
			</p>
		);
	}

	const movies = library.movies.filter((m) =>
		(m.name || '').toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div>
			<div className="grid grid-cols-4 gap-3 mb-6">
				<StatCard
					label="Total Movies"
					value={library.totalMovies?.toLocaleString()}
				/>
				<StatCard
					label="Scanned At"
					value={
						library.scannedAt
							? new Date(library.scannedAt).toLocaleDateString()
							: '—'
					}
				/>
			</div>

			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search movies…"
				className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white w-full mb-4 focus:outline-none focus:border-white/25 placeholder-gray-600"
			/>

			<div className="space-y-1.5">
				{movies.map((m) => (
					<div
						key={m.id}
						className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-4">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="font-medium text-white text-sm">{m.name}</span>
								{m.year && (
									<span className="text-[11px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
										{m.year}
									</span>
								)}
							</div>
							<p className="text-[11px] font-mono text-gray-600 mt-0.5 truncate">
								{m.filePath}
							</p>
						</div>
						<div className="text-right text-xs text-gray-600 shrink-0">
							<p>{formatBytes(m.fileSize)}</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Metadata Section ──────────────────────────────────────────────────────────

function MetadataSection({ library, metadata }) {
	const [search, setSearch] = useState('');

	const movies = library?.movies || [];
	const withMeta = movies.filter((m) => metadata?.[m.id]?.tmdbId);
	const withoutMeta = movies.filter((m) => !metadata?.[m.id]?.tmdbId);

	const filtered = movies.filter((m) =>
		(m.name || '').toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div>
			<div className="grid grid-cols-3 gap-3 mb-6">
				<StatCard
					label="With TMDB Data"
					value={withMeta.length}
					accent="green"
				/>
				<StatCard
					label="Missing Metadata"
					value={withoutMeta.length}
					accent="yellow"
				/>
				<StatCard
					label="Total"
					value={movies.length}
				/>
			</div>

			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search movies…"
				className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white w-full mb-4 focus:outline-none focus:border-white/25 placeholder-gray-600"
			/>

			<div className="space-y-1.5">
				{filtered.map((m) => {
					const meta = metadata?.[m.id];
					const has = !!meta?.tmdbId;
					return (
						<div
							key={m.id}
							className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-4">
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="font-medium text-white text-sm">
										{m.name}
									</span>
									{m.year && (
										<span className="text-[11px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
											{m.year}
										</span>
									)}
									{has ? (
										<Chip color="green">TMDB ✓</Chip>
									) : (
										<Chip color="yellow">no metadata</Chip>
									)}
								</div>
								{meta?.overview && (
									<p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
										{meta.overview}
									</p>
								)}
							</div>
							{has && (
								<div className="text-right text-xs text-gray-600 shrink-0">
									<p>TMDB {meta.tmdbId}</p>
									{meta.vote_average && <p>{meta.vote_average.toFixed(1)} ★</p>}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── History Section ───────────────────────────────────────────────────────────

function HistorySection({ history, library, showToast, deleteHistoryEntry }) {
	const [search, setSearch] = useState('');

	const movieMap = {};
	(library?.movies || []).forEach((m) => {
		movieMap[m.id] = m;
	});

	const entries = Object.values(history || {}).sort(
		(a, b) => new Date(b.lastWatched || 0) - new Date(a.lastWatched || 0),
	);

	const filtered = search
		? entries.filter((e) => {
				const movie = movieMap[e.key];
				return (
					(e.key || '').toLowerCase().includes(search.toLowerCase()) ||
					(movie?.name || '').toLowerCase().includes(search.toLowerCase())
				);
			})
		: entries;

	async function handleDelete(key) {
		await deleteHistoryEntry(key);
		showToast('History entry deleted', 'success');
	}

	return (
		<div>
			<div className="grid grid-cols-3 gap-3 mb-6">
				<StatCard
					label="History Entries"
					value={entries.length}
				/>
				<StatCard
					label="Completed"
					value={entries.filter((e) => e.completed).length}
					accent="green"
				/>
				<StatCard
					label="In Progress"
					value={
						entries.filter((e) => !e.completed && (e.position || 0) > 0).length
					}
					accent="yellow"
				/>
			</div>

			{entries.length === 0 ? (
				<p className="text-gray-500 text-sm py-8 text-center">
					No watch history yet.
				</p>
			) : (
				<>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search history…"
						className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white w-full mb-4 focus:outline-none focus:border-white/25 placeholder-gray-600"
					/>

					<div className="space-y-1.5">
						{filtered.map((entry) => {
							const movie = movieMap[entry.key];
							const progress =
								entry.duration > 0
									? Math.round((entry.position / entry.duration) * 100)
									: 0;
							return (
								<div
									key={entry.key}
									className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-4">
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-white truncate">
											{movie?.name || entry.key}
											{movie?.year && (
												<span className="text-gray-500 font-normal ml-1.5">
													({movie.year})
												</span>
											)}
										</p>
										<div className="flex items-center gap-3 mt-1.5">
											<div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
												<div
													className="h-full bg-blue-500 rounded-full"
													style={{ width: `${Math.min(progress, 100)}%` }}
												/>
											</div>
											<span className="text-xs text-gray-500 shrink-0">
												{progress}%
											</span>
											<span className="text-xs text-gray-600 shrink-0">
												{fmtDuration(entry.position)} /{' '}
												{fmtDuration(entry.duration)}
											</span>
										</div>
									</div>
									<div className="text-right text-xs text-gray-600 shrink-0 space-y-0.5">
										{entry.completed && (
											<p className="text-green-500/70">Completed</p>
										)}
										<p>{fmtDate(entry.lastWatched)}</p>
									</div>
									<button
										onClick={() => handleDelete(entry.key)}
										className="text-gray-600 hover:text-red-400 transition-colors shrink-0 ml-2"
										title="Delete entry">
										<svg
											className="w-4 h-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.75}
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</div>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
	const color =
		accent === 'green'
			? 'text-green-400'
			: accent === 'yellow'
				? 'text-yellow-400'
				: accent === 'red'
					? 'text-red-400'
					: 'text-white';
	return (
		<div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-center">
			<p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
			<p className="text-xs text-gray-500 mt-1">{label}</p>
		</div>
	);
}

function Chip({ color, children }) {
	const cls =
		color === 'green'
			? 'bg-green-500/15 text-green-400'
			: color === 'yellow'
				? 'bg-yellow-500/15 text-yellow-400'
				: color === 'red'
					? 'bg-red-500/15 text-red-400'
					: 'bg-white/10 text-gray-400';
	return (
		<span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>
			{children}
		</span>
	);
}
