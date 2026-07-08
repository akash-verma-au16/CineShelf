import React, { useEffect } from 'react';

/** Generic modal overlay */
export default function Modal({
	isOpen,
	onClose,
	title,
	children,
	maxWidth = 'max-w-2xl',
}) {
	useEffect(() => {
		const handle = (e) => {
			if (e.key === 'Escape') onClose();
		};
		if (isOpen) document.addEventListener('keydown', handle);
		return () => document.removeEventListener('keydown', handle);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center p-6"
			onClick={(e) => e.target === e.currentTarget && onClose()}>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

			{/* Panel */}
			<div
				className={`relative ${maxWidth} w-full bg-[#181818] rounded-xl shadow-2xl border border-white/10 overflow-hidden`}>
				{/* Header */}
				{title && (
					<div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
						<h2 className="text-lg font-semibold text-white">{title}</h2>
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-white transition-colors">
							<svg
								className="w-5 h-5"
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
				)}
				{/* Body */}
				<div className="p-6">{children}</div>
			</div>
		</div>
	);
}
