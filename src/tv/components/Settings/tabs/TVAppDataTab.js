import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/TVContext';

function formatBytes(bytes) {
	if (!bytes) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(sec) {
	if (!sec) return '0:00';
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	if (h > 0)
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso) {
	if (!iso) return '\u2014';
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

export default function AppDataTab() {
	const {
		allSeries,
		metadata,
		history,
		settings,
		showToast,
		fetchMetadata,
		patchMetadataEntry,
		saveHistoryEntry,
		deleteHistoryEntry,
	} = useApp();
	const [section, setSection] = useState('library');
	const [dataInfo, setDataInfo] = useState(null);

	useEffect(() => {
		if (window.api?.getDataInfo) {
			window.api.getDataInfo().then(setDataInfo);
		}
	}, []);

	return (
		<div className="px-8 py-8 min-h-full">
			{/* Header */}
			<div className="flex items-start justify-between mb-5">
				<div>
					<h1 className="text-xl font-bold text-white">App Data</h1>
					{dataInfo && (
						<p className="text-xs text-gray-500 mt-1 font-mono">
							{dataInfo.dataDir}
						</p>
					)}
				</div>
				{dataInfo && (
					<div className="flex items-center gap-2 text-xs text-gray-500">
						<span className="bg-white/5 rounded px-2 py-1">
							{dataInfo.posterCount} posters
						</span>
						<span className="bg-white/5 rounded px-2 py-1">
							{dataInfo.backdropCount} backdrops
						</span>
					</div>
				)}
			</div>

			{/* File size strip */}
			{dataInfo && (
				<div className="grid grid-cols-4 gap-2 mb-6">
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

			{section === 'library' && (
				<LibrarySection
					series={allSeries}
					metadata={metadata}
				/>
			)}
			{section === 'metadata' && (
				<MetadataSection
					series={allSeries}
					metadata={metadata}
					settings={settings}
					showToast={showToast}
					fetchMetadata={fetchMetadata}
					patchMetadataEntry={patchMetadataEntry}
				/>
			)}
			{section === 'history' && (
				<HistorySection
					history={history}
					series={allSeries}
					showToast={showToast}
					saveHistoryEntry={saveHistoryEntry}
					deleteHistoryEntry={deleteHistoryEntry}
				/>
			)}
		</div>
	);
}

// \u2500\u2500 Library Section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function LibrarySection({ series, metadata }) {
	const [search, setSearch] = useState('');
	const [expandedId, setExpandedId] = useState(null);

	const filtered = series.filter((s) =>
		s.name.toLowerCase().includes(search.toLowerCase()),
	);
	const totalEps = series.reduce((n, s) => n + s.totalEpisodes, 0);
	const totalSeasons = series.reduce((n, s) => n + s.totalSeasons, 0);
	const withMeta = series.filter((s) => metadata[s.id]?.tmdbId).length;

	return (
		<div>
			{/* Stats */}
			<div className="grid grid-cols-4 gap-3 mb-6">
				<StatCard
					label="Series"
					value={series.length}
				/>
				<StatCard
					label="Episodes"
					value={totalEps.toLocaleString()}
				/>
				<StatCard
					label="Seasons"
					value={totalSeasons}
				/>
				<StatCard
					label="With Metadata"
					value={`${withMeta} / ${series.length}`}
					accent={withMeta < series.length ? 'yellow' : 'green'}
				/>
			</div>

			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search series\u2026"
				className="input-field w-full mb-4"
			/>

			{filtered.length === 0 && (
				<p className="text-gray-500 text-sm py-8 text-center">
					{series.length === 0
						? 'No library scanned yet. Go to General \u2192 Save & Scan Library.'
						: 'No series match your search.'}
				</p>
			)}

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
									<span className="font-medium text-white">{s.name}</span>
									{s.unavailable && <Chip color="red">Unavailable</Chip>}
									{metadata[s.id]?.tmdbId && (
										<Chip color="blue">TMDb \u2713</Chip>
									)}
									{!metadata[s.id]?.tmdbId && (
										<Chip color="gray">No metadata</Chip>
									)}
								</div>
								<p className="text-[11px] text-gray-500 font-mono mt-0.5">
									{s.id}
								</p>
							</div>
							<div className="text-right text-xs text-gray-500 shrink-0 space-y-0.5">
								<p>
									{s.totalSeasons} season{s.totalSeasons !== 1 ? 's' : ''}
								</p>
								<p>{s.totalEpisodes} episodes</p>
							</div>
						</button>

						{expandedId === s.id && (
							<div className="border-t border-white/8 px-4 py-4 bg-black/20 space-y-3">
								<div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
									<FieldRow
										label="Series ID"
										value={s.id}
										mono
									/>
									<FieldRow
										label="Source Dir"
										value={s.sourceDir || '\u2014'}
										mono
									/>
									<FieldRow
										label="Folder Path"
										value={s.folderPath || '\u2014'}
										mono
									/>
									<FieldRow
										label="Added"
										value={
											s.addedAt
												? new Date(s.addedAt).toLocaleDateString()
												: '\u2014'
										}
									/>
									{metadata[s.id]?.year && (
										<FieldRow
											label="Year"
											value={metadata[s.id].year}
										/>
									)}
									{metadata[s.id]?.rating && (
										<FieldRow
											label="Rating"
											value={`${metadata[s.id].rating} / 10`}
										/>
									)}
								</div>
								<div className="space-y-2 mt-2">
									{s.seasons.map((season) => (
										<div
											key={season.number}
											className="bg-white/5 rounded-lg px-3 py-2">
											<p className="text-xs font-semibold text-gray-300 mb-2">
												{season.number === 0
													? 'Specials'
													: `Season ${season.number}`}{' '}
												\u2014 {season.episodes.length} episode
												{season.episodes.length !== 1 ? 's' : ''}
											</p>
											<div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
												{season.episodes.map((ep) => (
													<div
														key={ep.id}
														className="flex items-center gap-2 text-xs text-gray-500 rounded px-1.5 py-0.5">
														<span className="text-gray-400 font-mono shrink-0">
															E{String(ep.episode).padStart(2, '0')}
														</span>
														<span className="truncate">{ep.filename}</span>
													</div>
												))}
											</div>
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

// \u2500\u2500 Metadata Section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const META_FIELDS = [
	{ key: 'title', label: 'Title', type: 'text' },
	{ key: 'year', label: 'Year', type: 'text', half: true },
	{ key: 'endYear', label: 'End Year', type: 'text', half: true },
	{ key: 'status', label: 'Status', type: 'text', half: true },
	{ key: 'rating', label: 'Rating (0\u201310)', type: 'number', half: true },
	{ key: 'tmdbId', label: 'TMDb ID', type: 'number', half: true },
	{
		key: 'numberOfSeasons',
		label: 'No. of Seasons',
		type: 'number',
		half: true,
	},
	{
		key: 'genres',
		label: 'Genres (comma-separated)',
		type: 'text',
		array: true,
	},
	{
		key: 'networks',
		label: 'Networks (comma-separated)',
		type: 'text',
		array: true,
	},
	{ key: 'cast', label: 'Cast (comma-separated)', type: 'text', array: true },
	{ key: 'overview', label: 'Overview', type: 'textarea' },
];

function metaToDraft(m) {
	return {
		title: m.title || '',
		year: m.year || '',
		endYear: m.endYear || '',
		status: m.status || '',
		rating: m.rating ?? '',
		tmdbId: m.tmdbId || '',
		numberOfSeasons: m.numberOfSeasons || '',
		genres: (m.genres || []).join(', '),
		networks: (m.networks || []).join(', '),
		cast: (m.cast || []).join(', '),
		overview: m.overview || '',
	};
}

function draftToUpdates(draft) {
	return {
		title: draft.title,
		year: draft.year,
		endYear: draft.endYear,
		status: draft.status,
		rating: draft.rating !== '' ? parseFloat(draft.rating) : null,
		tmdbId: draft.tmdbId ? parseInt(draft.tmdbId, 10) : null,
		numberOfSeasons: draft.numberOfSeasons
			? parseInt(draft.numberOfSeasons, 10)
			: 0,
		genres: draft.genres
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean),
		networks: draft.networks
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean),
		cast: draft.cast
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean),
		overview: draft.overview,
	};
}

function MetadataSection({
	series,
	metadata,
	settings,
	showToast,
	fetchMetadata,
	patchMetadataEntry,
}) {
	const [search, setSearch] = useState('');
	const [expandedId, setExpandedId] = useState(null);
	const [episodesOpenId, setEpisodesOpenId] = useState(null);
	const [drafts, setDrafts] = useState({});
	const [saving, setSaving] = useState({});
	const [fetching, setFetching] = useState({});

	const withMeta = series.filter((s) => metadata[s.id]?.tmdbId);
	const withoutMeta = series.filter((s) => !metadata[s.id]?.tmdbId);
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

	async function handleFetch(series) {
		if (!settings?.tmdbApiKey) {
			showToast('Add a TMDb API key in General settings first', 'warning');
			return;
		}
		setFetching((f) => ({ ...f, [series.id]: true }));
		await fetchMetadata(series.id, series.name);
		setFetching((f) => ({ ...f, [series.id]: false }));
	}

	return (
		<div>
			<input
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search series\u2026"
				className="input-field w-full mb-5"
			/>

			{/* Series with metadata */}
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
													{m.endYear && m.endYear !== m.year
														? `\u2013${m.endYear}`
														: ''}
												</span>
											)}
										</div>
										<div className="flex items-center gap-2 shrink-0">
											{m.rating && (
												<span className="text-xs text-yellow-400">
													\u2605 {m.rating}
												</span>
											)}
											{m.status && <Chip color="gray">{m.status}</Chip>}
											{m.tmdbId && <Chip color="blue">TMDb #{m.tmdbId}</Chip>}
										</div>
									</button>

									{isOpen && draft && (
										<div className="border-t border-white/8 px-5 py-4 bg-black/20">
											<div className="grid grid-cols-2 gap-3 mb-3">
												{META_FIELDS.filter(
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
											{META_FIELDS.filter(
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
											{META_FIELDS.filter((f) => f.type === 'textarea').map(
												(field) => (
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
												),
											)}
											{/* Read-only info */}
											<div className="grid grid-cols-3 gap-2 my-3 p-3 bg-white/3 rounded-lg">
												<div className="text-center">
													<p className="text-xs text-gray-500">Seasons data</p>
													<p className="text-sm font-semibold text-white mt-0.5">
														{Object.keys(m.seasons || {}).length}
													</p>
												</div>
												<div className="text-center">
													<p className="text-xs text-gray-500">Episodes data</p>
													<p className="text-sm font-semibold text-white mt-0.5">
														{Object.keys(m.episodes || {}).length}
													</p>
												</div>
												<div className="text-center">
													<p className="text-xs text-gray-500">Poster</p>
													<p className="text-sm font-semibold text-white mt-0.5">
														{m.posterPath ? '\u2713' : '\u2717'}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-2 mt-1">
												<button
													onClick={() => handleSave(s.id)}
													disabled={saving[s.id]}
													className="btn-primary text-sm px-5 py-1.5">
													{saving[s.id] ? 'Saving\u2026' : 'Save Changes'}
												</button>
												<button
													onClick={() => handleFetch(s)}
													disabled={fetching[s.id]}
													className="btn-secondary text-sm px-4 py-1.5">
													{fetching[s.id]
														? 'Fetching\u2026'
														: '\u21bb Re-fetch from TMDb'}
												</button>
											</div>

											{/* Episode metadata toggle */}
											{(Object.keys(m.episodes || {}).length > 0 ||
												Object.keys(m.seasons || {}).length > 0) && (
												<div className="mt-4 border-t border-white/8 pt-3">
													<button
														onClick={() =>
															setEpisodesOpenId(
																episodesOpenId === s.id ? null : s.id,
															)
														}
														className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors w-full text-left">
														<ChevronRight expanded={episodesOpenId === s.id} />
														<span className="font-medium text-gray-300">
															Episode Metadata
														</span>
														<span className="text-gray-600 ml-1">
															({Object.keys(m.episodes || {}).length} ep
															{Object.keys(m.episodes || {}).length !== 1
																? 's'
																: ''}
															{' \u00b7 '}
															{Object.keys(m.seasons || {}).length} season
															{Object.keys(m.seasons || {}).length !== 1
																? 's'
																: ''}
															)
														</span>
													</button>
													{episodesOpenId === s.id && (
														<div className="mt-3">
															<EpisodeMetadataPanel m={m} />
														</div>
													)}
												</div>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Series without metadata */}
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
								{s.unavailable && <Chip color="red">Unavailable</Chip>}
								<button
									onClick={() => handleFetch(s)}
									disabled={fetching[s.id]}
									className="btn-secondary text-xs px-3 py-1 shrink-0">
									{fetching[s.id] ? 'Fetching\u2026' : 'Fetch Metadata'}
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

// \u2500\u2500 Episode Metadata Panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function EpisodeMetadataPanel({ m }) {
	const [expandedSeasons, setExpandedSeasons] = useState(new Set());

	const episodeEntries = Object.entries(m.episodes || {});
	if (
		episodeEntries.length === 0 &&
		Object.keys(m.seasons || {}).length === 0
	) {
		return (
			<p className="text-xs text-gray-600 py-2 px-1">
				No episode metadata available.
			</p>
		);
	}

	// Group episodes by season number
	const bySeason = {};
	for (const [key, ep] of episodeEntries) {
		const parts = key.split('-');
		const sNum = parseInt(parts[0], 10);
		const eNum = parseInt(parts[1], 10);
		if (!bySeason[sNum]) bySeason[sNum] = [];
		bySeason[sNum].push({ ...ep, _key: key, _ep: eNum });
	}

	// Also include seasons that have metadata but no episodes fetched yet
	for (const sNum of Object.keys(m.seasons || {})) {
		const n = parseInt(sNum, 10);
		if (!bySeason[n]) bySeason[n] = [];
	}

	const seasonNums = Object.keys(bySeason)
		.map(Number)
		.sort((a, b) => a - b);

	function toggleSeason(num) {
		setExpandedSeasons((prev) => {
			const next = new Set(prev);
			if (next.has(num)) next.delete(num);
			else next.add(num);
			return next;
		});
	}

	return (
		<div className="space-y-1">
			{seasonNums.map((num) => {
				const eps = (bySeason[num] || []).sort((a, b) => a._ep - b._ep);
				const seasonMeta = m.seasons?.[num] || m.seasons?.[String(num)] || {};
				const isOpen = expandedSeasons.has(num);
				const seasonLabel = num === 0 ? 'Specials' : `Season ${num}`;
				const hasCustomName =
					seasonMeta.name && seasonMeta.name !== seasonLabel;

				return (
					<div
						key={num}
						className="bg-white/[0.03] border border-white/8 rounded-lg overflow-hidden">
						<button
							onClick={() => toggleSeason(num)}
							className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left">
							<ChevronRight expanded={isOpen} />
							<span className="text-xs font-semibold text-gray-300">
								{seasonLabel}
								{hasCustomName && (
									<span className="text-gray-500 font-normal ml-1">
										\u2014 {seasonMeta.name}
									</span>
								)}
							</span>
							<div className="flex items-center gap-3 ml-auto text-[11px] text-gray-600 shrink-0">
								{seasonMeta.airDate && <span>{seasonMeta.airDate}</span>}
								<span>
									{eps.length} ep{eps.length !== 1 ? 's' : ''}
								</span>
							</div>
						</button>

						{isOpen && (
							<div className="px-3 pb-2">
								{/* Season-level info */}
								{(seasonMeta.overview || seasonMeta.episodeCount) && (
									<div className="flex items-start gap-4 mb-2 pt-1 pb-2 border-b border-white/8">
										{seasonMeta.overview && (
											<p className="text-[11px] text-gray-500 italic flex-1 leading-relaxed">
												{seasonMeta.overview}
											</p>
										)}
										{seasonMeta.episodeCount && (
											<span className="text-[11px] text-gray-600 shrink-0">
												{seasonMeta.episodeCount} total
											</span>
										)}
									</div>
								)}

								{/* Episode rows */}
								{eps.length === 0 ? (
									<p className="text-[11px] text-gray-600 py-2 px-1">
										No episode data fetched for this season.
									</p>
								) : (
									<div className="divide-y divide-white/[0.04]">
										{eps.map((ep) => (
											<div
												key={ep._key}
												className="flex gap-3 py-2 px-1">
												<span className="font-mono text-[11px] text-gray-500 shrink-0 w-8 pt-0.5">
													E{String(ep._ep).padStart(2, '0')}
												</span>
												<div className="flex-1 min-w-0">
													<p className="text-xs text-gray-200 font-medium truncate">
														{ep.title || '\u2014'}
													</p>
													{ep.overview && (
														<p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
															{ep.overview}
														</p>
													)}
												</div>
												<div className="shrink-0 text-right space-y-0.5">
													{ep.airDate && (
														<p className="text-[11px] text-gray-600">
															{ep.airDate}
														</p>
													)}
													{ep.runtime && (
														<p className="text-[11px] text-gray-600">
															{ep.runtime}m
														</p>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// \u2500\u2500 History Section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function HistorySection({
	history,
	series,
	showToast,
	saveHistoryEntry,
	deleteHistoryEntry,
}) {
	const [search, setSearch] = useState('');
	const [editingKey, setEditingKey] = useState(null);
	const [editDraft, setEditDraft] = useState({});
	const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
	const [saving, setSaving] = useState(false);
	const [sortBy, setSortBy] = useState('lastWatched'); // 'lastWatched' | 'seriesId' | 'progress'

	const seriesMap = Object.fromEntries(series.map((s) => [s.id, s.name]));

	const entries = Object.values(history).filter((e) => e.lastWatched);
	const episodeEntries = entries.filter((e) => !e.key?.startsWith('series:'));
	const seriesCompletions = entries.filter((e) => e.key?.startsWith('series:'));

	const completedCount = episodeEntries.filter((e) => e.completed).length;
	const inProgressCount = episodeEntries.filter(
		(e) => !e.completed && (e.position || 0) > 30,
	).length;

	const sorted = [...episodeEntries].sort((a, b) => {
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
		if (result?.success) {
			showToast('Entry deleted', 'success');
			setConfirmDeleteKey(null);
		} else showToast('Delete failed: ' + (result?.error || 'unknown'), 'error');
	}

	return (
		<div>
			{/* Stats */}
			<div className="grid grid-cols-4 gap-3 mb-6">
				<StatCard
					label="Total Entries"
					value={episodeEntries.length}
				/>
				<StatCard
					label="Completed"
					value={completedCount}
					accent="green"
				/>
				<StatCard
					label="In Progress"
					value={inProgressCount}
					accent="blue"
				/>
				<StatCard
					label="Series Finished"
					value={seriesCompletions.length}
					accent="yellow"
				/>
			</div>

			<div className="flex gap-3 mb-4">
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by series or episode\u2026"
					className="input-field flex-1"
				/>
				<select
					value={sortBy}
					onChange={(e) => setSortBy(e.target.value)}
					className="input-field text-sm pr-8 bg-[#1a1a1a] cursor-pointer">
					<option value="lastWatched">Sort: Last Watched</option>
					<option value="seriesId">Sort: Series</option>
					<option value="progress">Sort: Progress</option>
				</select>
			</div>

			{filtered.length === 0 && (
				<p className="text-gray-500 text-sm py-8 text-center">
					{episodeEntries.length === 0
						? 'No watch history yet.'
						: 'No entries match your search.'}
				</p>
			)}

			<div className="space-y-2">
				{filtered.map((entry) => {
					const seriesName =
						seriesMap[entry.seriesId] || entry.seriesId || '\u2014';
					const pct =
						entry.duration > 0
							? Math.min(100, (entry.position / entry.duration) * 100)
							: 0;
					const isEditing = editingKey === entry.key;
					const isConfirmDelete = confirmDeleteKey === entry.key;
					const sLabel = `S${String(entry.season || 0).padStart(2, '0')}E${String(entry.episode || 0).padStart(2, '0')}`;

					return (
						<div
							key={entry.key}
							className="bg-white/5 border border-white/8 rounded-xl overflow-hidden">
							{/* Compact row */}
							<div className="flex items-center gap-3 px-4 py-3">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										<span className="text-sm font-medium text-white truncate">
											{seriesName}
										</span>
										<span className="text-xs font-mono text-gray-400 shrink-0">
											{sLabel}
										</span>
										{entry.completed ? (
											<Chip color="green">Watched</Chip>
										) : pct > 0 ? (
											<Chip color="blue">In Progress</Chip>
										) : (
											<Chip color="gray">Not Started</Chip>
										)}
									</div>
									{/* Progress bar */}
									<div className="flex items-center gap-2">
										<div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
											<div
												className={`h-full rounded-full transition-all ${entry.completed ? 'bg-green-500' : 'bg-[#e50914]'}`}
												style={{ width: `${pct}%` }}
											/>
										</div>
										<span className="text-[11px] text-gray-500 shrink-0 font-mono">
											{formatTime(entry.position)} /{' '}
											{formatTime(entry.duration)}
										</span>
										<span className="text-[11px] text-gray-600 shrink-0">
											{Math.round(pct)}%
										</span>
									</div>
									<p className="text-[11px] text-gray-600 mt-1">
										{fmtDate(entry.lastWatched)}
									</p>
								</div>
								{/* Actions */}
								<div className="flex items-center gap-1.5 shrink-0">
									<button
										onClick={() =>
											isEditing ? setEditingKey(null) : startEdit(entry)
										}
										className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
										title="Edit">
										<svg
											className="w-4 h-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
											/>
										</svg>
									</button>
									<button
										onClick={() =>
											setConfirmDeleteKey(isConfirmDelete ? null : entry.key)
										}
										className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
										title="Delete">
										<svg
											className="w-4 h-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</div>
							</div>

							{/* Delete confirmation */}
							{isConfirmDelete && (
								<div className="border-t border-white/8 px-4 py-3 bg-red-900/20 flex items-center gap-3">
									<p className="text-sm text-red-300 flex-1">
										Delete this entry permanently?
									</p>
									<button
										onClick={() => handleDelete(entry.key)}
										className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md transition-colors">
										Delete
									</button>
									<button
										onClick={() => setConfirmDeleteKey(null)}
										className="text-xs text-gray-400 hover:text-white px-3 py-1">
										Cancel
									</button>
								</div>
							)}

							{/* Edit panel */}
							{isEditing && (
								<div className="border-t border-white/8 px-4 py-4 bg-black/20">
									<p className="text-[11px] text-gray-500 font-mono mb-3">
										{entry.key}
									</p>
									<div className="grid grid-cols-2 gap-3 mb-3">
										<div>
											<label className="block text-xs text-gray-500 mb-1">
												Position (seconds)
											</label>
											<input
												type="number"
												min="0"
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
												min="0"
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
												<div
													className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${editDraft.completed ? 'bg-green-600' : 'bg-white/20'}`}
													onClick={() =>
														setEditDraft((d) => ({
															...d,
															completed: !d.completed,
														}))
													}>
													<div
														className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${editDraft.completed ? 'translate-x-4' : 'translate-x-0.5'}`}
													/>
												</div>
												<span className="text-sm text-gray-300">Completed</span>
											</label>
										</div>
									</div>
									<div className="flex gap-2">
										<button
											onClick={() => handleSaveEdit(entry)}
											disabled={saving}
											className="btn-primary text-sm px-5 py-1.5">
											{saving ? 'Saving\u2026' : 'Save'}
										</button>
										<button
											onClick={() => setEditingKey(null)}
											className="btn-secondary text-sm px-4 py-1.5">
											Cancel
										</button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// \u2500\u2500 Shared UI primitives \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function StatCard({ label, value, accent }) {
	const accentColor =
		{
			green: 'text-green-400',
			blue: 'text-blue-400',
			yellow: 'text-yellow-400',
			red: 'text-red-400',
		}[accent] || 'text-white';
	return (
		<div className="bg-white/5 border border-white/8 rounded-xl p-4 text-center">
			<p className={`text-2xl font-bold ${accentColor}`}>{value}</p>
			<p className="text-xs text-gray-500 mt-1">{label}</p>
		</div>
	);
}

function Chip({ color, children }) {
	const cls =
		{
			green: 'bg-green-500/20 text-green-400 border-green-500/30',
			blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
			yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
			red: 'bg-red-500/20 text-red-400 border-red-500/30',
			gray: 'bg-white/5 text-gray-500 border-white/10',
		}[color] || 'bg-white/5 text-gray-500 border-white/10';
	return (
		<span
			className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
			{children}
		</span>
	);
}

function ChevronRight({ expanded }) {
	return (
		<svg
			className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
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

function FieldRow({ label, value, mono }) {
	return (
		<div>
			<p className="text-[11px] text-gray-600 uppercase tracking-wider">
				{label}
			</p>
			<p
				className={`text-xs text-gray-300 mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>
				{value}
			</p>
		</div>
	);
}
