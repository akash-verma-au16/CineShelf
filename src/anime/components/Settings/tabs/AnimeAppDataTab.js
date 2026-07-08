import React, { useState, useEffect } from 'react';
import { useAnime } from '../../../context/AnimeContext';

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

function traceAnimeAppData(label, data) {
	try {
		console.log(`${label} ${JSON.stringify(data)}`);
	} catch {
		console.log(label);
	}
}

function buildEpisodeLookup(library) {
	const lookup = new Map();
	for (const series of library?.series || []) {
		for (const episode of series.episodes || []) {
			lookup.set(episode.id, {
				seriesId: episode.seriesId,
				episodeId: episode.id,
				episode: episode.episodeNumber,
				episodeNumberStr: episode.episodeNumberStr,
				title: episode.displayTitle || episode.title || '',
			});
			lookup.set(`anime:${episode.seriesId}-ep${episode.episodeNumberStr}`, {
				seriesId: episode.seriesId,
				episodeId: episode.id,
				episode: episode.episodeNumber,
				episodeNumberStr: episode.episodeNumberStr,
				title: episode.displayTitle || episode.title || '',
			});
		}
	}
	return lookup;
}

export default function AnimeAppDataTab() {
	const {
		library,
		metadata,
		history,
		showToast,
		fetchMetadata,
		patchMetadataEntry,
		saveHistoryEntry,
		deleteHistoryEntry,
		clearSeriesHistory,
	} = useAnime();
	const [section, setSection] = useState('library');
	const [dataInfo, setDataInfo] = useState(null);

	useEffect(() => {
		if (window.api?.animeGetDataInfo) {
			window.api.animeGetDataInfo().then(setDataInfo);
		}
	}, []);

	return (
		<div className="px-8 py-8 min-h-full">
			{/* Header */}
			<div className="flex items-start justify-between mb-5">
				<div>
					<h1 className="text-xl font-bold text-white">Anime — App Data</h1>
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
					showToast={showToast}
					fetchMetadata={fetchMetadata}
					patchMetadataEntry={patchMetadataEntry}
				/>
			)}
			{section === 'history' && (
				<HistorySection
					history={history}
					library={library}
					showToast={showToast}
					saveHistoryEntry={saveHistoryEntry}
					deleteHistoryEntry={deleteHistoryEntry}
					clearSeriesHistory={clearSeriesHistory}
				/>
			)}
		</div>
	);
}

// ── Library Section ───────────────────────────────────────────────────────────

function LibrarySection({ library }) {
	const [search, setSearch] = useState('');
	const [expandedId, setExpandedId] = useState(null);

	if (!library?.series?.length) {
		return (
			<p className="text-gray-500 text-sm py-8 text-center">
				No library scanned yet. Go to General → Save & Scan Library.
			</p>
		);
	}

	const filtered = library.series.filter((s) =>
		s.name.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div>
			<div className="grid grid-cols-4 gap-3 mb-6">
				<StatCard
					label="Series"
					value={library.totalSeries}
				/>
				<StatCard
					label="Episodes"
					value={library.totalEpisodes?.toLocaleString()}
				/>
				<StatCard
					label="Canon + Mixed"
					value={library.series
						.reduce((n, s) => n + s.canonCount + s.mixedCount, 0)
						.toLocaleString()}
					accent="green"
				/>
				<StatCard
					label="Filler"
					value={library.series
						.reduce((n, s) => n + s.fillerCount, 0)
						.toLocaleString()}
					accent="yellow"
				/>
			</div>

			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search series…"
				className="input-field w-full mb-4"
			/>

			<div className="space-y-2">
				{filtered.map((s) => (
					<div
						key={s.id}
						className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
						<button
							onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
							className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
							<ChevronRight expanded={expandedId === s.id} />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="font-medium text-white text-sm">
										{s.name}
									</span>
									{s.hasFillerData && <Chip color="green">filler data ✓</Chip>}
								</div>
								<p className="text-[11px] text-gray-500 font-mono mt-0.5">
									{s.id}
								</p>
							</div>
							<div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
								<p>{s.totalEpisodes} episodes</p>
								<p className="text-gray-600">
									{s.canonCount}c · {s.mixedCount}m · {s.fillerCount}f
								</p>
							</div>
						</button>

						{expandedId === s.id && (
							<div className="border-t border-white/8 px-4 py-4 bg-black/20">
								<div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-4">
									<FieldRow
										label="Series ID"
										value={s.id}
										mono
									/>
									<FieldRow
										label="Path"
										value={s.path}
										mono
									/>
									<FieldRow
										label="Episodes"
										value={s.totalEpisodes}
									/>
									<FieldRow
										label="Has Filler Data"
										value={s.hasFillerData ? 'Yes' : 'No'}
									/>
								</div>
								<div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto">
									{s.episodes.map((ep) => (
										<div
											key={ep.id}
											className="flex items-center gap-3 text-xs text-gray-500 rounded px-2 py-1 hover:bg-white/5">
											<span className="font-mono text-gray-400 w-8 shrink-0 text-right">
												{ep.episodeNumberStr}
											</span>
											<TypeDot type={ep.episodeType} />
											<span className="flex-1 truncate text-gray-400">
												{ep.displayTitle || ep.filename}
											</span>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

// ── Metadata Section ──────────────────────────────────────────────────────────

const ANIME_META_FIELDS = [
	{ key: 'title', label: 'Title', type: 'text' },
	{ key: 'year', label: 'Year', type: 'text', half: true },
	{ key: 'status', label: 'Status', type: 'text', half: true },
	{ key: 'rating', label: 'Rating (0–10)', type: 'number', half: true },
	{ key: 'totalEpisodes', label: 'Total Episodes', type: 'number', half: true },
	{ key: 'anilistId', label: 'AniList ID', type: 'number', half: true },
	{ key: 'malId', label: 'MAL ID', type: 'number', half: true },
	{ key: 'studio', label: 'Studio', type: 'text', half: true },
	{
		key: 'genres',
		label: 'Genres (comma-separated)',
		type: 'text',
		array: true,
	},
	{ key: 'overview', label: 'Overview', type: 'textarea' },
];

function metaToDraft(m) {
	return {
		title: m.title || '',
		year: m.year || '',
		status: m.status || '',
		rating: m.rating ?? '',
		totalEpisodes: m.totalEpisodes || '',
		anilistId: m.anilistId || '',
		malId: m.malId || '',
		studio: m.studio || '',
		genres: (m.genres || []).join(', '),
		overview: m.overview || '',
	};
}

function draftToUpdates(draft) {
	return {
		title: draft.title,
		year: draft.year,
		status: draft.status,
		rating: draft.rating !== '' ? parseFloat(draft.rating) : null,
		totalEpisodes: draft.totalEpisodes
			? parseInt(draft.totalEpisodes, 10)
			: null,
		anilistId: draft.anilistId ? parseInt(draft.anilistId, 10) : null,
		malId: draft.malId ? parseInt(draft.malId, 10) : null,
		studio: draft.studio,
		genres: draft.genres
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean),
		overview: draft.overview,
	};
}

function MetadataSection({
	library,
	metadata,
	showToast,
	fetchMetadata,
	patchMetadataEntry,
}) {
	const [search, setSearch] = useState('');
	const [expandedId, setExpandedId] = useState(null);
	const [drafts, setDrafts] = useState({});
	const [saving, setSaving] = useState({});
	const [fetching, setFetching] = useState({});

	const series = library?.series || [];
	const withMeta = series.filter(
		(s) => metadata[s.id]?.anilistId || metadata[s.id]?.malId,
	);
	const withoutMeta = series.filter(
		(s) => !metadata[s.id]?.anilistId && !metadata[s.id]?.malId,
	);
	const query = search.toLowerCase();
	const filteredWith = withMeta.filter((s) =>
		s.name.toLowerCase().includes(query),
	);
	const filteredWithout = withoutMeta.filter((s) =>
		s.name.toLowerCase().includes(query),
	);

	function openEntry(id) {
		if (expandedId === id) {
			setExpandedId(null);
			return;
		}
		if (metadata[id] && !drafts[id]) {
			setDrafts((d) => ({ ...d, [id]: metaToDraft(metadata[id]) }));
		}
		setExpandedId(id);
	}

	function updateDraft(id, key, value) {
		setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
	}

	async function handleSave(seriesId) {
		if (!drafts[seriesId]) return;
		setSaving((s) => ({ ...s, [seriesId]: true }));
		const result = await patchMetadataEntry(
			seriesId,
			draftToUpdates(drafts[seriesId]),
		);
		setSaving((s) => ({ ...s, [seriesId]: false }));
		if (result?.success) showToast('Metadata saved', 'success');
		else
			showToast('Save failed: ' + (result?.error || 'unknown error'), 'error');
	}

	async function handleFetch(s) {
		setFetching((f) => ({ ...f, [s.id]: true }));
		await fetchMetadata(s.id, s.name);
		setFetching((f) => ({ ...f, [s.id]: false }));
		// Refresh draft if expanded
		if (expandedId === s.id && metadata[s.id]) {
			setDrafts((d) => ({ ...d, [s.id]: metaToDraft(metadata[s.id] || {}) }));
		}
	}

	return (
		<div>
			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search series…"
				className="input-field w-full mb-5"
			/>

			{filteredWith.length > 0 && (
				<div className="mb-6">
					<p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
						{filteredWith.length} series with metadata
					</p>
					<div className="space-y-2">
						{filteredWith.map((s) => {
							const m = metadata[s.id] || {};
							const draft = drafts[s.id];
							const isOpen = expandedId === s.id;
							return (
								<div
									key={s.id}
									className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
									<button
										onClick={() => openEntry(s.id)}
										className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
										<ChevronRight expanded={isOpen} />
										<div className="flex-1 min-w-0">
											<span className="font-medium text-white">
												{m.title || s.name}
											</span>
											{m.year && (
												<span className="text-gray-500 text-sm ml-2">
													{m.year}
												</span>
											)}
										</div>
										<div className="flex items-center gap-2 shrink-0">
											{m.rating && (
												<span className="text-xs text-yellow-400">
													★ {m.rating}
												</span>
											)}
											{m.status && <Chip color="gray">{m.status}</Chip>}
											{m.anilistId && (
												<Chip color="blue">AniList #{m.anilistId}</Chip>
											)}
										</div>
									</button>

									{isOpen && (
										<div className="border-t border-white/8 px-5 py-4 bg-black/20">
											{!draft ? (
												<p className="text-xs text-gray-500">Loading…</p>
											) : (
												<>
													<div className="grid grid-cols-2 gap-3 mb-3">
														{ANIME_META_FIELDS.filter(
															(f) => f.half && f.type !== 'textarea',
														).map((field) => (
															<div key={field.key}>
																<label className="block text-xs text-gray-500 mb-1">
																	{field.label}
																</label>
																<input
																	type={field.type}
																	value={draft[field.key]}
																	onChange={(e) =>
																		updateDraft(s.id, field.key, e.target.value)
																	}
																	className="input-field w-full text-sm"
																/>
															</div>
														))}
													</div>
													{ANIME_META_FIELDS.filter(
														(f) => !f.half && f.type !== 'textarea',
													).map((field) => (
														<div
															key={field.key}
															className="mb-3">
															<label className="block text-xs text-gray-500 mb-1">
																{field.label}
															</label>
															<input
																type={field.type}
																value={draft[field.key]}
																onChange={(e) =>
																	updateDraft(s.id, field.key, e.target.value)
																}
																className="input-field w-full text-sm"
															/>
														</div>
													))}
													{ANIME_META_FIELDS.filter(
														(f) => f.type === 'textarea',
													).map((field) => (
														<div
															key={field.key}
															className="mb-3">
															<label className="block text-xs text-gray-500 mb-1">
																{field.label}
															</label>
															<textarea
																value={draft[field.key]}
																onChange={(e) =>
																	updateDraft(s.id, field.key, e.target.value)
																}
																rows={3}
																className="input-field w-full text-sm resize-none"
															/>
														</div>
													))}
													<div className="flex items-center gap-2 mt-1">
														<button
															onClick={() => handleSave(s.id)}
															disabled={saving[s.id]}
															className="btn-primary text-sm px-5 py-1.5">
															{saving[s.id] ? 'Saving…' : 'Save Changes'}
														</button>
														<button
															onClick={() => handleFetch(s)}
															disabled={fetching[s.id]}
															className="btn-secondary text-sm px-4 py-1.5">
															{fetching[s.id]
																? 'Fetching…'
																: '↻ Re-fetch from AniList'}
														</button>
													</div>
												</>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{filteredWithout.length > 0 && (
				<div>
					<p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
						{filteredWithout.length} series without metadata
					</p>
					<div className="space-y-1.5">
						{filteredWithout.map((s) => (
							<div
								key={s.id}
								className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-lg px-4 py-2.5">
								<span className="flex-1 text-sm text-gray-300">{s.name}</span>
								<span className="text-[11px] text-gray-600 font-mono">
									{s.id}
								</span>
								<button
									onClick={() => handleFetch(s)}
									disabled={fetching[s.id]}
									className="btn-secondary text-xs px-3 py-1 shrink-0">
									{fetching[s.id] ? 'Fetching…' : 'Fetch Metadata'}
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			{filteredWith.length === 0 && filteredWithout.length === 0 && (
				<p className="text-gray-500 text-sm py-8 text-center">
					{series.length === 0
						? 'No series in library yet.'
						: 'No series match your search.'}
				</p>
			)}
		</div>
	);
}

// ── History Section ───────────────────────────────────────────────────────────

function HistorySection({
	history,
	library,
	showToast,
	saveHistoryEntry,
	deleteHistoryEntry,
	clearSeriesHistory,
}) {
	const [search, setSearch] = useState('');
	const [editingKey, setEditingKey] = useState(null);
	const [editDraft, setEditDraft] = useState({});
	const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
	const [confirmClearId, setConfirmClearId] = useState(null);
	const [saving, setSaving] = useState(false);
	const [sortBy, setSortBy] = useState('lastWatched');

	const seriesMap = Object.fromEntries(
		(library?.series || []).map((s) => [s.id, s.name]),
	);
	const episodeLookup = buildEpisodeLookup(library);

	const entries = Object.values(history || {})
		.filter((entry) => entry && typeof entry === 'object' && entry.key)
		.map((entry) => {
			const episodeInfo = episodeLookup.get(entry.key) || null;
			return {
				...entry,
				seriesId: entry.seriesId || episodeInfo?.seriesId || '',
				episodeId: entry.episodeId || episodeInfo?.episodeId || entry.key,
				episode: entry.episode || episodeInfo?.episode || null,
				episodeNumberStr: episodeInfo?.episodeNumberStr || '',
				title: entry.title || episodeInfo?.title || '',
			};
		});

	useEffect(() => {
		traceAnimeAppData('[AnimeAppDataTab] History snapshot', {
			rawEntryCount: Object.keys(history || {}).length,
			visibleEntryCount: entries.length,
			search,
			sortBy,
		});
	}, [entries.length, history, search, sortBy]);

	const completedCount = entries.filter((e) => e.completed).length;
	const inProgressCount = entries.filter(
		(e) => !e.completed && (e.position || 0) > 30,
	).length;

	const sorted = [...entries].sort((a, b) => {
		if (sortBy === 'lastWatched')
			return (b.lastWatched || '').localeCompare(a.lastWatched || '');
		if (sortBy === 'seriesId')
			return (a.seriesId || '').localeCompare(b.seriesId || '');
		if (sortBy === 'progress') {
			const pa = a.duration ? a.position / a.duration : 0;
			const pb = b.duration ? b.position / b.duration : 0;
			return pb - pa;
		}
		return 0;
	});

	const filtered = sorted.filter((e) => {
		const name = seriesMap[e.seriesId] || e.seriesId || '';
		return (
			name.toLowerCase().includes(search.toLowerCase()) ||
			(e.title || '').toLowerCase().includes(search.toLowerCase()) ||
			(e.key || '').toLowerCase().includes(search.toLowerCase())
		);
	});

	function startEdit(entry) {
		setEditDraft({
			position: entry.position || 0,
			duration: entry.duration || 0,
			completed: entry.completed || false,
			lastWatched: entry.lastWatched ? entry.lastWatched.slice(0, 16) : '',
		});
		setEditingKey(entry.key);
	}

	async function handleSaveEdit(entry) {
		setSaving(true);
		const updated = {
			...entry,
			position: parseInt(editDraft.position, 10) || 0,
			duration: parseInt(editDraft.duration, 10) || 0,
			completed: editDraft.completed,
			lastWatched: editDraft.lastWatched
				? new Date(editDraft.lastWatched).toISOString()
				: entry.lastWatched,
		};
		const result = await saveHistoryEntry(updated);
		setSaving(false);
		if (result?.success) {
			showToast('History entry saved', 'success');
			setEditingKey(null);
		} else showToast('Save failed: ' + (result?.error || 'unknown'), 'error');
	}

	async function handleDelete(key) {
		const result = await deleteHistoryEntry(key);
		if (result?.success !== false) {
			showToast('Entry deleted', 'success');
			setConfirmDeleteKey(null);
		} else showToast('Delete failed: ' + (result?.error || 'unknown'), 'error');
	}

	async function handleClearSeries(seriesId) {
		await clearSeriesHistory(seriesId);
		setConfirmClearId(null);
	}

	// Group by seriesId for the "clear series" option
	const seriesIds = [
		...new Set(entries.map((e) => e.seriesId).filter(Boolean)),
	];

	return (
		<div>
			<div className="grid grid-cols-4 gap-3 mb-6">
				<StatCard
					label="History Entries"
					value={entries.length}
				/>
				<StatCard
					label="Completed"
					value={completedCount}
					accent="green"
				/>
				<StatCard
					label="In Progress"
					value={inProgressCount}
					accent="yellow"
				/>
				<StatCard
					label="Series"
					value={seriesIds.length}
				/>
			</div>

			{entries.length === 0 ? (
				<p className="text-gray-500 text-sm py-8 text-center">
					No watch history yet.
				</p>
			) : (
				<>
					<div className="flex items-center gap-3 mb-4 flex-wrap">
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search history…"
							className="input-field flex-1 min-w-48"
						/>
						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value)}
							className="input-field text-sm">
							<option value="lastWatched">Sort: Recently Watched</option>
							<option value="seriesId">Sort: Series</option>
							<option value="progress">Sort: Progress</option>
						</select>
					</div>

					{/* Per-series clear buttons */}
					{seriesIds.length > 0 && (
						<div className="mb-4 flex gap-2 flex-wrap">
							{seriesIds.map((sid) => (
								<button
									key={sid}
									onClick={() => setConfirmClearId(sid)}
									className="text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400/70 hover:text-red-400 hover:border-red-500/60 transition-colors">
									↺ Reset {seriesMap[sid] || sid}
								</button>
							))}
						</div>
					)}

					<div className="space-y-1.5">
						{filtered.map((entry) => {
							const progress =
								entry.duration > 0
									? Math.round((entry.position / entry.duration) * 100)
									: 0;
							const isEditing = editingKey === entry.key;
							const isConfirmDelete = confirmDeleteKey === entry.key;
							return (
								<div
									key={entry.key}
									className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
									<div className="px-4 py-3 flex items-center gap-4">
										<div className="flex-1 min-w-0">
											<p className="text-sm font-mono text-gray-300 truncate">
												{entry.key}
											</p>
											{seriesMap[entry.seriesId] && (
												<p className="text-xs text-gray-600 mt-0.5">
													{seriesMap[entry.seriesId]}
												</p>
											)}
											{entry.title && (
												<p className="text-xs text-gray-500 mt-0.5 truncate">
													Ep {entry.episodeNumberStr || entry.episode || '?'} ·{' '}
													{entry.title}
												</p>
											)}
											<div className="flex items-center gap-3 mt-1.5">
												<div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
													<div
														className="h-full bg-violet-500 rounded-full"
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
										<div className="flex items-center gap-1 shrink-0">
											<button
												onClick={() =>
													isEditing ? setEditingKey(null) : startEdit(entry)
												}
												className="text-gray-600 hover:text-blue-400 transition-colors p-1"
												title="Edit entry">
												<svg
													className="w-3.5 h-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor">
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={1.75}
														d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
													/>
												</svg>
											</button>
											<button
												onClick={() =>
													isConfirmDelete
														? setConfirmDeleteKey(null)
														: setConfirmDeleteKey(entry.key)
												}
												className="text-gray-600 hover:text-red-400 transition-colors p-1"
												title="Delete entry">
												<svg
													className="w-3.5 h-3.5"
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
									</div>

									{isConfirmDelete && (
										<div className="border-t border-white/8 px-4 py-3 bg-red-500/5 flex items-center justify-between gap-3">
											<span className="text-xs text-red-400">
												Delete this entry permanently?
											</span>
											<div className="flex gap-2">
												<button
													onClick={() => setConfirmDeleteKey(null)}
													className="btn-secondary text-xs px-3 py-1">
													Cancel
												</button>
												<button
													onClick={() => handleDelete(entry.key)}
													className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1 rounded transition-colors">
													Delete
												</button>
											</div>
										</div>
									)}

									{isEditing && (
										<div className="border-t border-white/8 px-4 py-3 bg-black/20">
											<div className="grid grid-cols-2 gap-3 mb-3">
												<div>
													<label className="block text-xs text-gray-500 mb-1">
														Position (seconds)
													</label>
													<input
														type="number"
														value={editDraft.position}
														onChange={(e) =>
															setEditDraft((d) => ({
																...d,
																position: e.target.value,
															}))
														}
														className="input-field w-full text-sm"
													/>
												</div>
												<div>
													<label className="block text-xs text-gray-500 mb-1">
														Duration (seconds)
													</label>
													<input
														type="number"
														value={editDraft.duration}
														onChange={(e) =>
															setEditDraft((d) => ({
																...d,
																duration: e.target.value,
															}))
														}
														className="input-field w-full text-sm"
													/>
												</div>
												<div>
													<label className="block text-xs text-gray-500 mb-1">
														Last Watched
													</label>
													<input
														type="datetime-local"
														value={editDraft.lastWatched}
														onChange={(e) =>
															setEditDraft((d) => ({
																...d,
																lastWatched: e.target.value,
															}))
														}
														className="input-field w-full text-sm"
													/>
												</div>
												<div className="flex items-end pb-1">
													<label className="flex items-center gap-2 cursor-pointer">
														<input
															type="checkbox"
															checked={editDraft.completed}
															onChange={(e) =>
																setEditDraft((d) => ({
																	...d,
																	completed: e.target.checked,
																}))
															}
															className="w-4 h-4 accent-violet-500"
														/>
														<span className="text-sm text-gray-300">
															Completed
														</span>
													</label>
												</div>
											</div>
											<div className="flex gap-2">
												<button
													onClick={() => handleSaveEdit(entry)}
													disabled={saving}
													className="btn-primary text-xs px-4 py-1.5">
													{saving ? 'Saving…' : 'Save'}
												</button>
												<button
													onClick={() => setEditingKey(null)}
													className="btn-secondary text-xs px-3 py-1.5">
													Cancel
												</button>
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</>
			)}

			{/* Confirm clear series modal */}
			{confirmClearId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
					<div className="bg-[#1a1a1a] border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
						<h3 className="text-white font-bold text-lg mb-2">
							Reset Series History?
						</h3>
						<p className="text-gray-400 text-sm mb-5">
							This will delete all history entries for{' '}
							<span className="text-white font-semibold">
								{seriesMap[confirmClearId] || confirmClearId}
							</span>
							. This cannot be undone.
						</p>
						<div className="flex gap-3 justify-end">
							<button
								onClick={() => setConfirmClearId(null)}
								className="btn-secondary text-sm px-4 py-2">
								Cancel
							</button>
							<button
								onClick={() => handleClearSeries(confirmClearId)}
								className="bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-4 py-2 rounded-md transition-colors">
								Reset
							</button>
						</div>
					</div>
				</div>
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

function FieldRow({ label, value, mono }) {
	return (
		<div>
			<p className="text-[10px] text-gray-600 uppercase tracking-wide">
				{label}
			</p>
			<p
				className={`text-xs text-gray-300 mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>
				{value || '—'}
			</p>
		</div>
	);
}

function Chip({ color, children }) {
	const cls =
		color === 'green'
			? 'bg-green-500/15 text-green-400'
			: color === 'blue'
				? 'bg-blue-500/15 text-blue-400'
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

function ChevronRight({ expanded }) {
	return (
		<svg
			className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M9 5l7 7-7 7"
			/>
		</svg>
	);
}

function TypeDot({ type }) {
	const cls =
		type === 'filler'
			? 'bg-yellow-500'
			: type === 'mixed'
				? 'bg-blue-500'
				: 'bg-green-500';
	return (
		<span
			className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`}
			title={type}
		/>
	);
}
