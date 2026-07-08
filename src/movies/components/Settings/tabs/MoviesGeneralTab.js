import React, { useState, useEffect } from 'react';
import { useMovies } from '../../../context/MoviesContext';
import LoadingSpinner from '../../../../shared/components/UI/LoadingSpinner';

export default function MoviesGeneralTab() {
	const { settings, saveSettings, scanLibrary, loading, library, showToast } =
		useMovies();
	const [form, setForm] = useState(null);
	const [newDir, setNewDir] = useState('');

	useEffect(() => {
		if (settings && !form) {
			setForm({
				moviesSourceDirs: settings.moviesSourceDirs || [],
				tmdbApiKey: settings.tmdbApiKey || '',
			});
		}
	}, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

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

	async function pickDir() {
		if (!window.api) {
			showToast('Directory picker only available in desktop app', 'warning');
			return;
		}
		const dir = await window.api.openDir();
		if (dir && !form.moviesSourceDirs.includes(dir)) {
			update('moviesSourceDirs', [...form.moviesSourceDirs, dir]);
		}
	}

	function addManualDir() {
		const d = newDir.trim();
		if (!d) return;
		if (form.moviesSourceDirs.includes(d)) {
			showToast('Directory already in list', 'warning');
			return;
		}
		update('moviesSourceDirs', [...form.moviesSourceDirs, d]);
		setNewDir('');
	}

	function removeDir(dir) {
		update(
			'moviesSourceDirs',
			form.moviesSourceDirs.filter((d) => d !== dir),
		);
	}

	return (
		<div className="px-10 py-10 max-w-3xl">
			<h1 className="text-2xl font-bold text-white mb-8">Movies — General</h1>

			{/* Source directories */}
			<section className="mb-10">
				<h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-4">
					Source Directories
				</h2>
				<p className="text-sm text-gray-500 mb-4">
					Folders where your movie files are stored. CineShelf will scan these
					for video files and match them against TMDB.
				</p>

				{/* Directory list */}
				<div className="space-y-2 mb-4">
					{form.moviesSourceDirs.length === 0 && (
						<p className="text-sm text-gray-600 italic">
							No directories added yet.
						</p>
					)}
					{form.moviesSourceDirs.map((dir) => (
						<div
							key={dir}
							className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
							<svg
								className="w-4 h-4 text-gray-500 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.75}
									d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
								/>
							</svg>
							<span className="flex-1 text-sm text-gray-200 font-mono truncate">
								{dir}
							</span>
							<button
								onClick={() => removeDir(dir)}
								className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
								title="Remove">
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
				</div>

				{/* Add directory controls */}
				<div className="flex gap-2 mb-2">
					<input
						type="text"
						placeholder="e.g. E:\Movies"
						value={newDir}
						onChange={(e) => setNewDir(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && addManualDir()}
						className="flex-1 bg-white/5 border border-white/15 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
					/>
					<button
						onClick={addManualDir}
						className="px-4 py-2 bg-white/10 hover:bg-white/15 text-sm text-white rounded-lg border border-white/15 transition-colors">
						Add
					</button>
					<button
						onClick={pickDir}
						className="px-4 py-2 bg-white/10 hover:bg-white/15 text-sm text-white rounded-lg border border-white/15 transition-colors">
						Browse…
					</button>
				</div>
			</section>

			{/* TMDB API key */}
			<section className="mb-10">
				<h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-4">
					TMDB API Key
				</h2>
				<p className="text-sm text-gray-500 mb-4">
					Used for movie posters, backdrops, and metadata. Shared with the TV
					Shows workflow.
				</p>
				<input
					type="text"
					value={form.tmdbApiKey}
					onChange={(e) => update('tmdbApiKey', e.target.value)}
					className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-white/30"
					placeholder="Paste your TMDB v3 API key here"
				/>
			</section>

			{/* Library stats */}
			{library && (
				<section className="mb-10">
					<h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-4">
						Library
					</h2>
					<div className="flex gap-6">
						<div className="bg-white/5 border border-white/10 rounded-lg px-5 py-3 text-center">
							<p className="text-2xl font-bold text-white">
								{library.totalMovies}
							</p>
							<p className="text-xs text-gray-500 mt-1">Movies</p>
						</div>
						{library.scannedAt && (
							<div className="bg-white/5 border border-white/10 rounded-lg px-5 py-3 text-center">
								<p className="text-sm font-medium text-white">
									{new Date(library.scannedAt).toLocaleDateString()}
								</p>
								<p className="text-xs text-gray-500 mt-1">Last Scanned</p>
							</div>
						)}
					</div>
				</section>
			)}

			{/* Actions */}
			<div className="flex gap-3">
				<button
					onClick={handleSave}
					disabled={loading.scanning}
					className="px-5 py-2.5 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-sm text-white font-medium rounded-lg border border-white/15 transition-colors">
					Save
				</button>
				<button
					onClick={handleSaveAndScan}
					disabled={loading.scanning || loading.library}
					className="px-5 py-2.5 bg-[#e50914] hover:bg-[#c40812] disabled:opacity-50 text-sm text-white font-medium rounded-lg transition-colors flex items-center gap-2">
					{loading.scanning ? (
						<>
							<svg
								className="w-4 h-4 animate-spin"
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
							Scanning…
						</>
					) : (
						'Save & Scan'
					)}
				</button>
			</div>
		</div>
	);
}
