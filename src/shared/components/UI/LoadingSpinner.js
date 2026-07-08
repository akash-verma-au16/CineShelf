import React from 'react';

export default function LoadingSpinner({ size = 'md', className = '' }) {
	const sz =
		{ sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12', xl: 'w-16 h-16' }[size] ||
		'w-8 h-8';
	return (
		<div className={`flex items-center justify-center ${className}`}>
			<div
				className={`${sz} border-2 border-white/20 border-t-white rounded-full animate-spin`}
			/>
		</div>
	);
}

export function FullPageLoader({ message }) {
	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
			<LoadingSpinner size="xl" />
			{message && <p className="text-sm">{message}</p>}
		</div>
	);
}
