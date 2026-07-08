import React, { useState } from 'react';
import TVSettingsPage from '../tv/components/Settings/TVSettingsPage';
import MoviesSettingsPage from '../movies/components/Settings/MoviesSettingsPage';
import AnimeSettingsPage from '../anime/components/Settings/AnimeSettingsPage';

// ── Shared Settings Shell ─────────────────────────────────────────────────────
// Intersection point — adds a workflow selector bar at the top so the user can
// switch between TV Shows and Movies settings in one place.
// Each workflow renders its own full settings panel below.

const WORKFLOWS = [
	{
		id: 'tv',
		label: 'TV Shows',
		icon: (
			<svg
				className="w-4 h-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.75}
					d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
		),
	},
	{
		id: 'movies',
		label: 'Movies',
		icon: (
			<svg
				className="w-4 h-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.75}
					d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
				/>
			</svg>
		),
	},
	{
		id: 'anime',
		label: 'Anime',
		icon: (
			<svg
				className="w-4 h-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.75}
					d="M5 3l14 9-14 9V3z"
				/>
			</svg>
		),
	},
];

export default function SettingsPage({ defaultWorkflow = 'tv' }) {
	const [workflow, setWorkflow] = useState(defaultWorkflow);

	return (
		<div
			className="flex flex-col"
			style={{ minHeight: '100vh' }}>
			{/* ── Workflow selector strip ─────────────────────────────────── */}
			<div className="fixed top-14 left-0 right-0 z-40 flex items-center gap-1 px-6 py-1.5 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/8">
				{WORKFLOWS.map((w) => (
					<button
						key={w.id}
						onClick={() => setWorkflow(w.id)}
						className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
							workflow === w.id
								? 'bg-white/10 text-white font-medium'
								: 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
						}`}>
						{w.icon}
						{w.label}
					</button>
				))}
			</div>

			{/* ── Workflow settings panel (shifted down by strip height ~40px) */}
			<div style={{ paddingTop: 40 }}>
				{workflow === 'tv' && <TVSettingsPage />}
				{workflow === 'movies' && <MoviesSettingsPage />}
				{workflow === 'anime' && <AnimeSettingsPage />}
			</div>
		</div>
	);
}
