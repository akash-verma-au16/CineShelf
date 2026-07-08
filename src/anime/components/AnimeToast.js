import React from 'react';
import { useAnime } from '../context/AnimeContext';

const ICONS = {
	success: (
		<svg
			className="w-5 h-5 text-green-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M5 13l4 4L19 7"
			/>
		</svg>
	),
	error: (
		<svg
			className="w-5 h-5 text-red-400"
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
	),
	warning: (
		<svg
			className="w-5 h-5 text-yellow-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
	),
	info: (
		<svg
			className="w-5 h-5 text-blue-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	),
};

export default function AnimeToast() {
	const { toast } = useAnime();

	if (!toast) return null;

	return (
		<div
			key={toast.id}
			className="
				fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]
				flex items-center gap-3 px-5 py-3 rounded-lg
				bg-[#1e1e1e] border border-white/10 shadow-2xl
				animate-slide-up text-sm text-white min-w-[260px] max-w-md
			">
			{ICONS[toast.type] || ICONS.info}
			<span>{toast.message}</span>
		</div>
	);
}
