import React from 'react';

/** Thin progress bar showing watch completion */
export default function ProgressBar({ progress = 0, className = '' }) {
	const pct = Math.min(100, Math.max(0, progress));
	return (
		<div
			className={`h-1 bg-white/20 rounded-full overflow-hidden ${className}`}>
			<div
				className="h-full bg-[#e50914] rounded-full transition-all duration-300"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}
