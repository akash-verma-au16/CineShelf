import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../../context/TVContext';
import LoadingSpinner from '../../../../shared/components/UI/LoadingSpinner';

export default function GeneralTab() {
	const {
		settings,
		saveSettings,
		scanLibrary,
		fetchAllMetadata,
		loading,
		allSeries,
		showToast,
	} = useApp();
	const [form, setForm] = useState(null);
	const [newDir, setNewDir] = useState('');
	const [vlcStatus, setVlcStatus] = useState(null);
	const [autostart, setAutostart] = useState(false);

	useEffect(() => {
		if (!window.api?.getAutostart) return;
		window.api.getAutostart().then((v) => setAutostart(!!v));
	}, []);

	useEffect(() => {
		if (settings && !form) {
			setForm({
				tmdbApiKey: settings.tmdbApiKey || '',
				autoResume: settings.autoResume !== false,
				sourceDirs: settings.sourceDirs || [],
				vlcPath: settings.vlcPath || '',
				vlcHttpPort: settings.vlcHttpPort || 8080,
				vlcHttpPassword: settings.vlcHttpPassword || 'cineshelf',
			});
		}
	}, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

	const checkVlc = useCallback(async () => {
		if (!window.api?.checkVlc) return;
		const status = await window.api.checkVlc();
		setVlcStatus(status);
	}, []);

	useEffect(() => {
		if (form) checkVlc();
	}, [form?.vlcPath]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!form) {
		return (
			<div className="flex items-center justify-center h-64">
				<LoadingSpinner size="lg" />
			</div>
		);
	}

	function update(key, value) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	async function handleSave() {
		await saveSettings(form);
	}

	async function handleSaveAndScan() {
		await saveSettings(form);
		await scanLibrary();
	}

	async function handleAutostartToggle() {
		if (!window.api?.setAutostart) {
			showToast('Autostart only available in the installed app', 'warning');
			return;
		}
		const next = !autostart;
		const result = await window.api.setAutostart(next);
		if (result?.success === false) {
			showToast(result.error || 'Could not update autostart', 'error');
		} else {
			setAutostart(next);
			showToast(
				next
					? 'CineShelf will launch on Windows startup'
					: 'Removed from Windows startup',
				'success',
			);
		}
	}

	async function pickDir() {
		if (!window.api) {
			showToast('Directory picker only available in desktop app', 'warning');
			return;
		}
		const dir = await window.api.openDir();
		if (dir && !form.sourceDirs.includes(dir)) {
			update('sourceDirs', [...form.sourceDirs, dir]);
		}
	}

	function addManualDir() {
		const d = newDir.trim();
		if (!d) return;
		if (form.sourceDirs.includes(d)) {
			showToast('Directory already in list', 'warning');
			return;
		}
		update('sourceDirs', [...form.sourceDirs, d]);
		setNewDir('');
	}

	function removeDir(dir) {
		update(
			'sourceDirs',
			form.sourceDirs.filter((d) => d !== dir),
		);
	}

	return (
		<div className="px-10 py-10 max-w-3xl">
			<h1 className="text-2xl font-bold text-white mb-8">General</h1>

			{/* Source Directories */}
			<Section
				title="Media Source Directories"
				desc="Folders containing your TV series. Each subfolder is treated as one series.">
				<div className="space-y-2 mb-3">
					{form.sourceDirs.map((dir) => (
						<div
							key={dir}
							className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
							<svg
								className="w-4 h-4 text-gray-400 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
								/>
							</svg>
							<span className="flex-1 text-sm text-gray-300 font-mono truncate">
								{dir}
							</span>
							<button
								onClick={() => removeDir(dir)}
								className="text-gray-500 hover:text-red-400 transition-colors">
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
					))}
					{form.sourceDirs.length === 0 && (
						<p className="text-sm text-gray-500 py-2">
							No directories added yet.
						</p>
					)}
				</div>
				<div className="flex gap-2">
					<input
						type="text"
						value={newDir}
						onChange={(e) => setNewDir(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && addManualDir()}
						placeholder="Paste a path manually, e.g. E:\MediaLibrary"
						className="input-field flex-1 font-mono text-sm"
					/>
					<button
						onClick={addManualDir}
						className="btn-secondary text-sm px-4">
						Add
					</button>
					<button
						onClick={pickDir}
						className="btn-secondary text-sm px-4 flex items-center gap-2">
						<svg
							className="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 6v6m0 0v6m0-6h6m-6 0H6"
							/>
						</svg>
						Browse
					</button>
				</div>
			</Section>

			{/* TMDb API Key */}
			<Section
				title="TMDb API Key"
				desc={
					<>
						Get a free key from{' '}
						<span className="text-blue-400">themoviedb.org/settings/api</span>.
						Used to fetch posters, backdrops, cast, ratings, and episode
						metadata.
					</>
				}>
				<input
					type="password"
					value={form.tmdbApiKey}
					onChange={(e) => update('tmdbApiKey', e.target.value)}
					placeholder="Your TMDb v3 API key"
					className="input-field w-full"
					autoComplete="off"
				/>
				{form.tmdbApiKey && (
					<p className="text-xs text-green-400 mt-1">✓ API key configured</p>
				)}
			</Section>

			{/* Preferences */}
			<Section
				title="Playback Preferences"
				desc="How the player behaves when you launch an episode.">
				<label className="flex items-center gap-3 cursor-pointer">
					<div
						className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${form.autoResume ? 'bg-[#e50914]' : 'bg-white/20'}`}
						onClick={() => update('autoResume', !form.autoResume)}>
						<div
							className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${form.autoResume ? 'translate-x-5' : 'translate-x-0.5'}`}
						/>
					</div>
					<span className="text-sm text-gray-300">
						Auto-resume from last position
					</span>
				</label>
				<p className="text-xs text-gray-500 mt-1 ml-13">
					VLC will resume from the last saved position when auto-resume is on.
				</p>
			</Section>

			{/* Startup */}
			<Section
				title="Windows Startup"
				desc="Launch CineShelf automatically when Windows starts. Only takes effect in the installed app.">
				<label className="flex items-center gap-3 cursor-pointer">
					<div
						className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${autostart ? 'bg-[#e50914]' : 'bg-white/20'}`}
						onClick={handleAutostartToggle}>
						<div
							className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${autostart ? 'translate-x-5' : 'translate-x-0.5'}`}
						/>
					</div>
					<span className="text-sm text-gray-300">
						Launch on Windows startup
					</span>
				</label>
			</Section>

			{/* VLC */}
			<Section
				title="External Player — VLC"
				desc="VLC is used to open all videos with real-time playback tracking. Download from videolan.org if not already installed.">
				<div className="space-y-3">
					<div className="flex gap-2 items-center">
						<input
							type="text"
							value={form.vlcPath}
							onChange={(e) => update('vlcPath', e.target.value)}
							placeholder="Auto-detect — or paste full path to vlc.exe"
							className="input-field flex-1 font-mono text-sm"
						/>
						<button
							onClick={checkVlc}
							className="btn-secondary text-sm px-4">
							Check
						</button>
					</div>
					{vlcStatus && (
						<p
							className={`text-xs mt-1 ${vlcStatus.found ? 'text-green-400' : 'text-red-400'}`}>
							{vlcStatus.found
								? `✓ Found: ${vlcStatus.path}`
								: '✗ VLC not found — install it or paste the full path above'}
						</p>
					)}
					<div className="grid grid-cols-2 gap-3 pt-1">
						<div>
							<label className="block text-xs text-gray-500 mb-1">
								HTTP Port
							</label>
							<input
								type="number"
								value={form.vlcHttpPort}
								onChange={(e) =>
									update('vlcHttpPort', parseInt(e.target.value, 10) || 8080)
								}
								className="input-field w-full font-mono text-sm"
								min="1024"
								max="65535"
							/>
						</div>
						<div>
							<label className="block text-xs text-gray-500 mb-1">
								HTTP Password
							</label>
							<input
								type="password"
								value={form.vlcHttpPassword}
								onChange={(e) => update('vlcHttpPassword', e.target.value)}
								placeholder="cineshelf"
								className="input-field w-full font-mono text-sm"
								autoComplete="off"
							/>
						</div>
					</div>
					<p className="text-xs text-gray-600">
						Port and password must match the values set in VLC → Preferences →
						Interface → Lua HTTP.
					</p>
				</div>
			</Section>

			{allSeries.length > 0 && (
				<Section
					title="Library Status"
					desc="">
					<div className="grid grid-cols-3 gap-4">
						<Stat
							label="Series"
							value={allSeries.length}
						/>
						<Stat
							label="Total Episodes"
							value={allSeries.reduce((n, s) => n + s.totalEpisodes, 0)}
						/>
						<Stat
							label="Seasons"
							value={allSeries.reduce((n, s) => n + s.totalSeasons, 0)}
						/>
					</div>
				</Section>
			)}

			{/* Action buttons */}
			<div className="flex flex-wrap gap-3 mt-8">
				<button
					onClick={handleSave}
					className="btn-primary">
					Save Settings
				</button>
				<button
					onClick={handleSaveAndScan}
					disabled={loading.scanning}
					className="btn-secondary flex items-center gap-2">
					{loading.scanning ? (
						<>
							<LoadingSpinner size="sm" /> Scanning…
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
							Save &amp; Scan Library
						</>
					)}
				</button>
				<button
					onClick={fetchAllMetadata}
					disabled={loading.metadata || !form.tmdbApiKey}
					className="btn-secondary flex items-center gap-2"
					title={!form.tmdbApiKey ? 'Add a TMDb API key first' : ''}>
					{loading.metadata ? (
						<>
							<LoadingSpinner size="sm" /> Fetching…
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
									d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
								/>
							</svg>
							Fetch All Metadata
						</>
					)}
				</button>
			</div>

			<p className="text-xs text-gray-600 mt-6">
				All data (settings, library index, metadata, images) is stored in your
				AppData folder.
			</p>
		</div>
	);
}

function Section({ title, desc, children }) {
	return (
		<div className="mb-8">
			<div className="mb-3">
				<h2 className="text-base font-semibold text-white">{title}</h2>
				{desc && <p className="text-sm text-gray-500 mt-0.5">{desc}</p>}
			</div>
			{children}
		</div>
	);
}

function Stat({ label, value }) {
	return (
		<div className="bg-white/5 rounded-lg p-4 text-center">
			<p className="text-2xl font-bold text-white">
				{typeof value === 'number' ? value.toLocaleString() : value}
			</p>
			<p className="text-xs text-gray-500 mt-1">{label}</p>
		</div>
	);
}
