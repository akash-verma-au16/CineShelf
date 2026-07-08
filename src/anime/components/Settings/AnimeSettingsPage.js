import React, { useState } from 'react';
import AnimeGeneralTab from './tabs/AnimeGeneralTab';
import AnimeAppDataTab from './tabs/AnimeAppDataTab';
import AnimeFileSystemTab from './tabs/AnimeFileSystemTab';

const TABS = [
	{
		id: 'general',
		label: 'General',
		desc: 'Source directories, scan',
		icon: (
			<svg
				className="w-4 h-4 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.75}
					d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
				/>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.75}
					d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
		),
	},
	{
		id: 'appdata',
		label: 'App Data',
		desc: 'Library, history, data files',
		icon: (
			<svg
				className="w-4 h-4 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor">
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.75}
					d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
				/>
			</svg>
		),
	},
	{
		id: 'filesystem',
		label: 'File System',
		desc: 'Browse & rename files on disk',
		icon: (
			<svg
				className="w-4 h-4 shrink-0"
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
		),
	},
];

export default function AnimeSettingsPage() {
	const [activeTab, setActiveTab] = useState('general');

	return (
		<div
			className="flex pt-16"
			style={{ minHeight: 'calc(100vh - 64px)' }}>
			{/* Left sidebar */}
			<aside className="w-56 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-white/10 py-7 px-3 bg-[#0d0d0d]">
				<p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-4">
					Anime Settings
				</p>
				{TABS.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-left transition-all
							${
								activeTab === tab.id
									? 'bg-white/10 text-white'
									: 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
							}`}>
						{tab.icon}
						<div className="min-w-0">
							<p className="text-sm font-medium leading-none">{tab.label}</p>
							<p className="text-[10px] text-gray-600 mt-1 truncate">
								{tab.desc}
							</p>
						</div>
					</button>
				))}
			</aside>

			{/* Right content pane */}
			<div className="flex-1 min-w-0">
				{activeTab === 'general' && <AnimeGeneralTab />}
				{activeTab === 'appdata' && <AnimeAppDataTab />}
				{activeTab === 'filesystem' && <AnimeFileSystemTab />}
			</div>
		</div>
	);
}
