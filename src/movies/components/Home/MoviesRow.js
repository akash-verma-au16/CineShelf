import React, { useRef, useState, useEffect } from 'react';
import MoviesCard from './MoviesCard';

export default function MoviesRow({
	title,
	movies,
	compact = false,
	emptyMessage,
}) {
	const scrollRef = useRef(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	function updateButtons() {
		const el = scrollRef.current;
		if (!el) return;
		setCanScrollLeft(el.scrollLeft > 8);
		setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
	}

	useEffect(() => {
		updateButtons();
	}, [movies]);

	function scroll(dir) {
		const el = scrollRef.current;
		if (!el) return;
		const firstChild = el.children[0];
		const cardWidth = firstChild
			? firstChild.getBoundingClientRect().width + 12
			: 172;
		const visibleCards = Math.floor(el.clientWidth / cardWidth);
		const scrollCards = Math.max(1, visibleCards - 2);
		el.scrollBy({
			left:
				dir === 'left' ? -(scrollCards * cardWidth) : scrollCards * cardWidth,
			behavior: 'smooth',
		});
	}

	if (!movies || movies.length === 0) {
		if (emptyMessage) {
			return (
				<section className="mb-8">
					<h2 className="row-title">{title}</h2>
					<p className="ml-12 text-sm text-gray-500">{emptyMessage}</p>
				</section>
			);
		}
		return null;
	}

	return (
		<section className="mb-8 group/row">
			<h2 className="row-title">{title}</h2>
			<div className="relative">
				{canScrollLeft && (
					<ScrollBtn
						dir="left"
						onClick={() => scroll('left')}
					/>
				)}
				<div
					ref={scrollRef}
					className="flex gap-3 overflow-x-auto scrollbar-hide pl-6 pr-12 pb-2 pt-1"
					onScroll={updateButtons}>
					{movies.map((movie) => (
						<div key={movie.id}>
							<MoviesCard
								movie={movie}
								compact={compact}
							/>
						</div>
					))}
				</div>
				{canScrollRight && (
					<ScrollBtn
						dir="right"
						onClick={() => scroll('right')}
					/>
				)}
			</div>
		</section>
	);
}

function ScrollBtn({ dir, onClick }) {
	const isLeft = dir === 'left';
	return (
		<button
			onClick={onClick}
			className={`absolute top-0 bottom-0 z-20 ${isLeft ? 'left-0' : 'right-0'} w-16 flex items-center ${isLeft ? 'justify-start pl-2' : 'justify-end pr-2'} opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 text-white`}
			style={{
				background: isLeft
					? 'linear-gradient(to right, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.5) 55%, transparent 100%)'
					: 'linear-gradient(to left, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.5) 55%, transparent 100%)',
			}}>
			<span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 transition-colors duration-150 border border-white/15 shadow-lg backdrop-blur-sm">
				<svg
					className={`w-4 h-4 ${isLeft ? 'rotate-180' : ''}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2.5}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9 5l7 7-7 7"
					/>
				</svg>
			</span>
		</button>
	);
}
