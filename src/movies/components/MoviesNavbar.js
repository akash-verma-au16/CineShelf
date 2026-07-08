import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMovies } from '../context/MoviesContext';

export default function MoviesNavbar() {
	const navigate = useNavigate();
	const location = useLocation();
	const { loading, scanLibrary } = useMovies();
	const [scrolled, setScrolled] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const isBrowse = location.pathname === '/browse';

	useEffect(() => {
		const el = document.querySelector('#main-scroll');
		if (!el) return;
		const handler = () => setScrolled(el.scrollTop > 40);
		el.addEventListener('scroll', handler);
		return () => el.removeEventListener('scroll', handler);
	}, []);

	useEffect(() => {
		if (isBrowse) {
			setSearchQuery('');
		}
	}, [isBrowse]);

	function handleSearch(e) {
		const q = e.target.value;
		setSearchQuery(q);
		if (q.trim()) {
			navigate(`/browse?workflow=movies&q=${encodeURIComponent(q.trim())}`);
		}
	}

	function handleSearchKey(e) {
		if (e.key === 'Enter' && searchQuery.trim()) {
			navigate(
				`/browse?workflow=movies&q=${encodeURIComponent(searchQuery.trim())}`,
			);
		}
		if (e.key === 'Escape') {
			setSearchQuery('');
			navigate('/movies');
		}
	}

	const showSolid = scrolled;

	return (
		<nav
			className={`
				fixed top-0 left-0 right-0 z-50 flex items-center h-14 px-6 gap-6
				transition-all duration-300
				${showSolid ? 'bg-[#0a0a0a]/95 backdrop-blur-md shadow-lg' : 'bg-gradient-to-b from-black/70 to-transparent'}
				titlebar-drag
			`}>
			<button
				className="titlebar-no-drag flex items-center gap-2 shrink-0"
				onClick={() => navigate('/movies')}>
				<span className="text-[#e50914] text-2xl font-black tracking-tight leading-none">
					CINE<span className="text-white">SHELF</span>
				</span>
			</button>

			<div className="titlebar-no-drag flex items-center gap-1 text-sm">
				<NavLink
					active={
						location.pathname === '/' ||
						location.pathname.startsWith('/series/')
					}
					onClick={() => navigate('/')}>
					TV Shows
				</NavLink>
				<NavLink
					active={location.pathname.startsWith('/movies')}
					onClick={() => navigate('/movies')}>
					Movies
				</NavLink>
				<NavLink
					active={location.pathname.startsWith('/anime')}
					onClick={() => navigate('/anime')}>
					Anime
				</NavLink>
				<NavLink
					active={location.pathname === '/browse'}
					onClick={() => navigate('/browse?workflow=movies')}>
					Browse
				</NavLink>
			</div>

			<div className="flex-1" />

			{!isBrowse && (
				<div className="titlebar-no-drag relative flex items-center">
					<svg
						className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<input
						type="text"
						placeholder="Search movies…"
						value={searchQuery}
						onChange={handleSearch}
						onKeyDown={handleSearchKey}
						className="
							bg-white/10 border border-white/15 rounded-md pl-9 pr-4 py-1.5
							text-sm text-white placeholder-gray-500
							focus:outline-none focus:bg-white/15 focus:border-white/30
							w-48 focus:w-64 transition-all duration-300
						"
					/>
				</div>
			)}

			<button
				className="titlebar-no-drag btn-icon text-gray-400 hover:text-white"
				onClick={scanLibrary}
				title="Rescan movie library"
				disabled={loading.scanning}>
				<svg
					className={`w-5 h-5 ${loading.scanning ? 'animate-spin' : ''}`}
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
			</button>

			<button
				className="titlebar-no-drag btn-icon text-gray-400 hover:text-white"
				onClick={() => navigate('/settings/movies')}
				title="Movie Settings">
				<svg
					className="w-5 h-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor">
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
					/>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
					/>
				</svg>
			</button>

			<div className="titlebar-no-drag flex items-center gap-1 ml-2">
				<WinBtn
					color="text-gray-500 hover:text-yellow-400"
					onClick={() => window.api?.minimizeWindow()}>
					<svg
						className="w-3 h-3"
						viewBox="0 0 12 12">
						<rect
							x="2"
							y="5.5"
							width="8"
							height="1"
							fill="currentColor"
						/>
					</svg>
				</WinBtn>
				<WinBtn
					color="text-gray-500 hover:text-green-400"
					onClick={() => window.api?.maximizeWindow()}>
					<svg
						className="w-3 h-3"
						viewBox="0 0 12 12">
						<rect
							x="2"
							y="2"
							width="8"
							height="8"
							rx="1"
							stroke="currentColor"
							strokeWidth="1"
							fill="none"
						/>
					</svg>
				</WinBtn>
				<WinBtn
					color="text-gray-500 hover:text-red-500"
					onClick={() => window.api?.closeWindow()}>
					<svg
						className="w-3 h-3"
						viewBox="0 0 12 12">
						<line
							x1="2"
							y1="2"
							x2="10"
							y2="10"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
						<line
							x1="10"
							y1="2"
							x2="2"
							y2="10"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</WinBtn>
			</div>
		</nav>
	);
}

function NavLink({ active, onClick, children }) {
	return (
		<button
			onClick={onClick}
			className={`px-3 py-1.5 rounded text-sm font-medium transition-colors duration-150 ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
			{children}
		</button>
	);
}

function WinBtn({ color, onClick, children }) {
	return (
		<button
			onClick={onClick}
			className={`w-7 h-7 flex items-center justify-center rounded transition-colors duration-150 ${color}`}>
			{children}
		</button>
	);
}
