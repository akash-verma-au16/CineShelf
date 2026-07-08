import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// ── TV workflow ────────────────────────────────────────────────────────────────
import { TVProvider } from './tv/context/TVContext';
import TVNavbar from './tv/components/TVNavbar';
import TVToast from './tv/components/TVToast';
import TVHomeScreen from './tv/components/Home/TVHomeScreen';
import TVSeriesDetail from './tv/components/Detail/TVSeriesDetail';
import TVSearchPage from './tv/components/Search/TVSearchPage';
import TVSettingsPage from './tv/components/Settings/TVSettingsPage';

// ── Movies workflow ────────────────────────────────────────────────────────────
import { MoviesProvider } from './movies/context/MoviesContext';
import MoviesNavbar from './movies/components/MoviesNavbar';
import MoviesHomeScreen from './movies/components/Home/MoviesHomeScreen';
import MovieDetail from './movies/components/Detail/MovieDetail';
import MoviesSettingsPage from './movies/components/Settings/MoviesSettingsPage';

// ── Shared intersection points ─────────────────────────────────────────────────
import SettingsPage from './settings/SettingsPage';
import BrowsePage from './browse/BrowsePage';

// ── Shared player overlay ─────────────────────────────────────────────────────
import PlayerOverlay from './shared/components/Player/PlayerOverlay';

// ── Anime workflow ────────────────────────────────────────────────────────────
import { AnimeProvider } from './anime/context/AnimeContext';
import AnimeNavbar from './anime/components/AnimeNavbar';
import AnimeHomeScreen from './anime/components/Home/AnimeHomeScreen';
import AnimeSeriesDetail from './anime/components/Detail/AnimeSeriesDetail';
import AnimePlayerOverlay from './anime/components/Player/AnimePlayerOverlay';
import AnimeToast from './anime/components/AnimeToast';
const pageVariants = {
	initial: { opacity: 0, y: 18 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -10 },
};
const pageTransition = { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] };

function PageWrap({ children }) {
	return (
		<motion.div
			variants={pageVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			transition={pageTransition}>
			{children}
		</motion.div>
	);
}

// Renders the correct navbar based on the current route
function RouteAwareNavbar() {
	const location = useLocation();
	if (location.pathname === '/browse') {
		const workflow = new URLSearchParams(location.search).get('workflow');
		if (workflow === 'anime') return <AnimeNavbar />;
		if (workflow === 'movies') return <MoviesNavbar />;
		return <TVNavbar />;
	}
	if (location.pathname.startsWith('/anime')) return <AnimeNavbar />;
	if (location.pathname.startsWith('/movies')) return <MoviesNavbar />;
	return <TVNavbar />;
}

function AppRoutes() {
	const location = useLocation();

	// Scroll main content area to top on every route change
	useEffect(() => {
		document
			.getElementById('main-scroll')
			?.scrollTo({ top: 0, behavior: 'instant' });
	}, [location.pathname]);

	return (
		<AnimatePresence
			mode="wait"
			initial={false}>
			<Routes
				location={location}
				key={location.pathname}>
				{/* ── TV Shows ────────────────────────────────────────────── */}
				<Route
					path="/"
					element={
						<PageWrap>
							<TVHomeScreen />
						</PageWrap>
					}
				/>
				<Route
					path="/series/:id"
					element={
						<PageWrap>
							<TVSeriesDetail />
						</PageWrap>
					}
				/>
				<Route
					path="/search"
					element={
						<PageWrap>
							<TVSearchPage />
						</PageWrap>
					}
				/>
				<Route
					path="/tv/settings"
					element={
						<PageWrap>
							<TVSettingsPage />
						</PageWrap>
					}
				/>
				{/* ── Shared intersection points ───────────────────────────── */}
				<Route
					path="/settings"
					element={
						<PageWrap>
							<SettingsPage />
						</PageWrap>
					}
				/>
				<Route
					path="/settings/movies"
					element={
						<PageWrap>
							<SettingsPage defaultWorkflow="movies" />
						</PageWrap>
					}
				/>
				<Route
					path="/settings/anime"
					element={
						<PageWrap>
							<SettingsPage defaultWorkflow="anime" />
						</PageWrap>
					}
				/>
				<Route
					path="/browse"
					element={
						<PageWrap>
							<BrowsePage />
						</PageWrap>
					}
				/>
				{/* ── Movies ──────────────────────────────────────────────── */}
				<Route
					path="/movies"
					element={
						<PageWrap>
							<MoviesHomeScreen />
						</PageWrap>
					}
				/>
				<Route
					path="/movies/:id"
					element={
						<PageWrap>
							<MovieDetail />
						</PageWrap>
					}
				/>
				<Route
					path="/movies/settings"
					element={
						<PageWrap>
							<MoviesSettingsPage />
						</PageWrap>
					}
				/>
				{/* ── Anime (scaffold) ────────────────────────────────────── */}
				<Route
					path="/anime"
					element={
						<PageWrap>
							<AnimeHomeScreen />
						</PageWrap>
					}
				/>
				<Route
					path="/anime/:id"
					element={
						<PageWrap>
							<AnimeSeriesDetail />
						</PageWrap>
					}
				/>
			</Routes>
		</AnimatePresence>
	);
}

// HashRouter works with both file:// (production) and http://localhost:3000 (dev)
export default function App() {
	// The overlay window loads this same bundle at /#/player-overlay.
	// Render the overlay directly — no Navbar, no AppProvider needed.
	if (window.location.hash === '#/player-overlay') {
		return (
			<HashRouter>
				<Routes>
					<Route
						path="/player-overlay"
						element={<PlayerOverlay />}
					/>
				</Routes>
			</HashRouter>
		);
	}

	// Anime player overlay — same mechanism, separate component and hash route.
	if (window.location.hash === '#/anime-player-overlay') {
		return (
			<HashRouter>
				<Routes>
					<Route
						path="/anime-player-overlay"
						element={<AnimePlayerOverlay />}
					/>
				</Routes>
			</HashRouter>
		);
	}

	return (
		<HashRouter>
			<TVProvider>
				<MoviesProvider>
					<AnimeProvider>
						<div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden">
							<RouteAwareNavbar />
							<main
								id="main-scroll"
								className="flex-1 overflow-y-auto overflow-x-hidden"
								style={{ scrollBehavior: 'smooth' }}>
								<AppRoutes />
							</main>
							<TVToast />
							<AnimeToast />
						</div>
					</AnimeProvider>
				</MoviesProvider>
			</TVProvider>
		</HashRouter>
	);
}
