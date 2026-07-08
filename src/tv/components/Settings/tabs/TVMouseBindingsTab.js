import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/TVContext';

const ACTIONS = [
	{ value: 'play_pause', label: 'Play / Pause' },
	{ value: 'seek_back_10', label: 'Seek Back 10s' },
	{ value: 'seek_fwd_10', label: 'Seek Forward 10s' },
	{ value: 'seek_back_60', label: 'Seek Back 60s' },
	{ value: 'seek_fwd_60', label: 'Seek Forward 60s' },
	{ value: 'next_ep', label: 'Next Episode' },
	{ value: 'prev_ep', label: 'Previous Episode' },
	{ value: 'mute', label: 'Toggle Mute' },
	{ value: 'close', label: 'Close Player' },
	{ value: 'stop', label: 'Stop' },
	{ value: 'disabled', label: '— Disabled —' },
];

const BUTTONS = [
	{
		key: 'lButtonNoUi',
		label: 'Left Click',
		sub: 'When no UI panels are visible',
		icon: (
			<svg
				className="w-5 h-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor">
				<rect
					x="5"
					y="2"
					width="14"
					height="20"
					rx="4"
					strokeWidth="1.5"
				/>
				<line
					x1="12"
					y1="2"
					x2="12"
					y2="22"
					strokeWidth="1.5"
				/>
				<line
					x1="5"
					y1="10"
					x2="19"
					y2="10"
					strokeWidth="1.5"
				/>
				<circle
					cx="8.5"
					cy="6"
					r="1.5"
					fill="currentColor"
					stroke="none"
				/>
			</svg>
		),
	},
	{
		key: 'mButton',
		label: 'Middle Click',
		sub: 'Scroll wheel press',
		icon: (
			<svg
				className="w-5 h-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor">
				<rect
					x="5"
					y="2"
					width="14"
					height="20"
					rx="4"
					strokeWidth="1.5"
				/>
				<line
					x1="12"
					y1="2"
					x2="12"
					y2="22"
					strokeWidth="1.5"
				/>
				<line
					x1="5"
					y1="10"
					x2="19"
					y2="10"
					strokeWidth="1.5"
				/>
				<circle
					cx="12"
					cy="6"
					r="1.5"
					fill="currentColor"
					stroke="none"
				/>
			</svg>
		),
	},
	{
		key: 'xButton1',
		label: 'Mouse Back',
		sub: 'Side button (XButton1)',
		icon: (
			<svg
				className="w-5 h-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor">
				<rect
					x="5"
					y="2"
					width="14"
					height="20"
					rx="4"
					strokeWidth="1.5"
				/>
				<line
					x1="12"
					y1="2"
					x2="12"
					y2="22"
					strokeWidth="1.5"
				/>
				<line
					x1="5"
					y1="10"
					x2="19"
					y2="10"
					strokeWidth="1.5"
				/>
				<polyline
					points="10,6 7,6 7,9"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<line
					x1="7"
					y1="6"
					x2="11"
					y2="6"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		key: 'xButton2',
		label: 'Mouse Forward',
		sub: 'Side button (XButton2)',
		icon: (
			<svg
				className="w-5 h-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor">
				<rect
					x="5"
					y="2"
					width="14"
					height="20"
					rx="4"
					strokeWidth="1.5"
				/>
				<line
					x1="12"
					y1="2"
					x2="12"
					y2="22"
					strokeWidth="1.5"
				/>
				<line
					x1="5"
					y1="10"
					x2="19"
					y2="10"
					strokeWidth="1.5"
				/>
				<polyline
					points="14,6 17,6 17,9"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<line
					x1="17"
					y1="6"
					x2="13"
					y2="6"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
];

const DEFAULT_MAPPINGS = {
	lButtonNoUi: 'play_pause',
	mButton: 'close',
	xButton1: 'seek_back_10',
	xButton2: 'seek_fwd_10',
};

export default function MouseBindingsTab() {
	const { settings, showToast } = useApp();
	const [mappings, setMappings] = useState(null);
	const [ahkPath, setAhkPath] = useState('');
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		const saved = settings?.ahkMappings || {};
		setMappings({ ...DEFAULT_MAPPINGS, ...saved });
	}, [settings]);

	useEffect(() => {
		if (window.api?.getAhkPath) {
			window.api.getAhkPath().then(setAhkPath);
		}
	}, []);

	function update(key, value) {
		setMappings((m) => ({ ...m, [key]: value }));
		setDirty(true);
	}

	async function handleSave() {
		if (!window.api?.saveAhkMappings) return;
		setSaving(true);
		const result = await window.api.saveAhkMappings(mappings);
		setSaving(false);
		if (result.success) {
			setDirty(false);
			showToast(
				'Mouse bindings saved. Reload the AHK script to apply.',
				'success',
			);
		} else {
			showToast(`Failed to save: ${result.error}`, 'error');
		}
	}

	function handleReset() {
		setMappings({ ...DEFAULT_MAPPINGS });
		setDirty(true);
	}

	if (!mappings) return null;

	return (
		<div className="px-8 py-8 min-h-full">
			{/* Header */}
			<div className="mb-6">
				<h1 className="text-xl font-bold text-white">Mouse Bindings</h1>
				<p className="text-sm text-gray-500 mt-1">
					Configure what each mouse button does inside the CineShelf Player
					overlay. Changes update the AutoHotkey script — reload it in the AHK
					tray icon to apply.
				</p>
			</div>

			{/* AHK file path strip */}
			{ahkPath && (
				<div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 mb-7">
					<svg
						className="w-3.5 h-3.5 text-gray-500 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.75}
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					<span className="text-[11px] font-mono text-gray-500 truncate">
						{ahkPath}
					</span>
				</div>
			)}

			{/* Bindings table */}
			<div className="space-y-2 mb-8">
				{BUTTONS.map((btn) => (
					<div
						key={btn.key}
						className="flex items-center gap-4 bg-white/5 border border-white/8 rounded-xl px-5 py-4">
						{/* Mouse icon + label */}
						<div className="text-gray-400 shrink-0">{btn.icon}</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-white">{btn.label}</p>
							<p className="text-[11px] text-gray-500 mt-0.5">{btn.sub}</p>
						</div>
						{/* Action dropdown */}
						<select
							value={mappings[btn.key] || 'disabled'}
							onChange={(e) => update(btn.key, e.target.value)}
							className="bg-[#1a1a1a] border border-white/12 text-white text-sm rounded-lg px-3 py-2 min-w-[180px] focus:outline-none focus:border-white/30 cursor-pointer">
							{ACTIONS.map((a) => (
								<option
									key={a.value}
									value={a.value}>
									{a.label}
								</option>
							))}
						</select>
					</div>
				))}
			</div>

			{/* Info note about LButton passthrough */}
			<div className="bg-white/3 border border-white/8 rounded-lg px-4 py-3 mb-7 flex gap-3">
				<svg
					className="w-4 h-4 text-gray-500 shrink-0 mt-0.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor">
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.75}
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p className="text-[12px] text-gray-500 leading-relaxed">
					Left click when UI panels are visible always passes through to the
					React UI (buttons, sliders, playlist) regardless of this setting. The
					action above only applies when all panels are hidden (pure video
					view).
				</p>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-3">
				<button
					onClick={handleSave}
					disabled={saving || !dirty}
					className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors">
					{saving ? 'Saving…' : 'Save & Write AHK File'}
				</button>
				<button
					onClick={handleReset}
					className="px-4 py-2 bg-white/8 text-gray-300 text-sm rounded-lg hover:bg-white/12 transition-colors">
					Reset to Defaults
				</button>
				{dirty && (
					<span className="text-xs text-amber-400">Unsaved changes</span>
				)}
			</div>
		</div>
	);
}
