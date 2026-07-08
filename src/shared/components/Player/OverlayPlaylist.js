import React, { useState, useEffect, useRef } from 'react';

function fmtDur(sec) {
	if (!sec || isNaN(sec)) return '';
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtProgress(position, duration) {
	if (!position || !duration || duration <= 0) return null;
	const pct = Math.min(100, Math.round((position / duration) * 100));
	return pct;
}

// ── Season Accordion ──────────────────────────────────────────────────────────
function SeasonAccordion({
	seasonData,
	mode = 'tv',
	isOpen,
	onToggle,
	currentEpisodeId,
	history,
	onPlayEpisode,
	transitioning,
}) {
	const listRef = useRef(null);
	const { season, episodes } = seasonData;

	useEffect(() => {
		if (!isOpen || !listRef.current) return;
		const currentEl = listRef.current.querySelector('[data-current="true"]');
		if (currentEl) {
			setTimeout(() => {
				currentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 120);
		}
	}, [isOpen, currentEpisodeId]);

	const completedCount = episodes.filter(
		(ep) => history[ep.episodeId]?.completed,
	).length;
	const hasCurrentEp = episodes.some((ep) => ep.episodeId === currentEpisodeId);
	const isMoviesMode = mode === 'movies';
	const currentMovie = episodes.find((ep) => ep.episodeId === currentEpisodeId);
	const seasonLabel = seasonData.title
		? `Season ${season}: ${seasonData.title}`
		: `Season ${season}`;

	return (
		<div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
			<button
				onClick={onToggle}
				style={{
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					padding: '9px 14px',
					background: isOpen
						? 'rgba(229,9,20,0.08)'
						: hasCurrentEp
							? 'rgba(255,255,255,0.03)'
							: 'transparent',
					border: 'none',
					cursor: 'pointer',
					gap: 10,
					textAlign: 'left',
					transition: 'background 0.15s',
				}}>
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
					style={{
						flexShrink: 0,
						transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
						transition: 'transform 0.18s ease',
					}}>
					<path
						d="M3 2l4 3-4 3"
						stroke={isOpen ? '#e50914' : '#666'}
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span
					style={{
						fontSize: 11,
						fontWeight: 600,
						letterSpacing: 0.7,
						textTransform: 'uppercase',
						color: isOpen ? '#fff' : hasCurrentEp ? '#ccc' : '#666',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{isMoviesMode
						? currentMovie?.title || episodes[0]?.title || 'Now Playing'
						: seasonLabel}
				</span>
				{hasCurrentEp && (
					<span
						style={{
							fontSize: 9,
							fontWeight: 700,
							letterSpacing: 0.5,
							color: '#e50914',
							textTransform: 'uppercase',
							background: 'rgba(229,9,20,0.15)',
							padding: '2px 6px',
							borderRadius: 3,
							flexShrink: 0,
						}}>
						{isMoviesMode ? 'Now Playing' : 'Now Playing'}
					</span>
				)}
				<div style={{ flex: 1 }} />
				<span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>
					{completedCount}/{episodes.length}
				</span>
			</button>
			<div
				ref={listRef}
				style={{
					overflow: 'hidden',
					maxHeight: isOpen ? '9999px' : 0,
					transition: isOpen
						? 'max-height 0.35s ease-in'
						: 'max-height 0.2s ease-out',
				}}>
				{episodes.map((ep) => (
					<EpisodeRow
						key={ep.episodeId}
						ep={ep}
						isCurrent={ep.episodeId === currentEpisodeId}
						hist={history[ep.episodeId]}
						onClick={() => !transitioning && onPlayEpisode(ep)}
					/>
				))}
			</div>
		</div>
	);
}

// ── Episode Row ───────────────────────────────────────────────────────────────
function EpisodeRow({ ep, isCurrent, hist, onClick }) {
	const [hovered, setHovered] = useState(false);
	const [imgError, setImgError] = useState(false);

	const progress = hist
		? fmtProgress(hist.position, hist.duration || ep.duration)
		: null;
	const isCompleted = hist?.completed;
	const hasStill = !imgError && (ep.stillPath || ep.stillUrl);
	const stillSrc = ep.stillPath
		? `cineshelf:///${ep.stillPath.replace(/\\/g, '/')}`
		: ep.stillUrl || null;

	return (
		<div
			data-current={isCurrent ? 'true' : undefined}
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				padding: '8px 12px 8px 14px',
				gap: 10,
				cursor: 'pointer',
				background: isCurrent
					? 'rgba(229,9,20,0.13)'
					: hovered
						? 'rgba(255,255,255,0.04)'
						: 'transparent',
				borderLeft: `3px solid ${isCurrent ? '#e50914' : 'transparent'}`,
				transition: 'background 0.1s',
				userSelect: 'none',
				minHeight: 58,
			}}>
			{/* Thumbnail */}
			<div
				style={{
					width: 80,
					height: 46,
					borderRadius: 4,
					background: 'rgba(255,255,255,0.06)',
					flexShrink: 0,
					position: 'relative',
					overflow: 'hidden',
				}}>
				{hasStill ? (
					<img
						src={stillSrc}
						alt=""
						onError={() => setImgError(true)}
						style={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							display: 'block',
						}}
					/>
				) : (
					<div
						style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						<svg
							width="20"
							height="20"
							viewBox="0 0 20 20"
							fill="none">
							<rect
								x="2"
								y="3"
								width="16"
								height="14"
								rx="2"
								stroke="rgba(255,255,255,0.15)"
								strokeWidth="1.5"
							/>
							<path
								d="M8 7l5 3-5 3V7z"
								fill="rgba(255,255,255,0.2)"
							/>
						</svg>
					</div>
				)}
				{/* Progress bar on thumbnail */}
				{progress !== null && !isCompleted && progress > 0 && (
					<div
						style={{
							position: 'absolute',
							bottom: 0,
							left: 0,
							right: 0,
							height: 3,
							background: 'rgba(0,0,0,0.5)',
						}}>
						<div
							style={{
								height: '100%',
								width: `${progress}%`,
								background: '#e50914',
								borderRadius: 2,
							}}
						/>
					</div>
				)}
				{/* Completed tick */}
				{isCompleted && (
					<div
						style={{
							position: 'absolute',
							top: 3,
							right: 3,
							width: 16,
							height: 16,
							background: '#1db954',
							borderRadius: '50%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						<svg
							width="8"
							height="8"
							viewBox="0 0 8 8"
							fill="none">
							<path
								d="M1.5 4l2 2 3-3"
								stroke="#fff"
								strokeWidth="1.4"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
				)}
				{/* Now playing indicator */}
				{isCurrent && (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							background: 'rgba(229,9,20,0.25)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						<svg
							width="18"
							height="18"
							viewBox="0 0 18 18"
							fill="none">
							<circle
								cx="9"
								cy="9"
								r="8"
								fill="rgba(229,9,20,0.6)"
							/>
							<path
								d="M7 6l5 3-5 3V6z"
								fill="white"
							/>
						</svg>
					</div>
				)}
			</div>

			{/* Text column */}
			<div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'baseline',
						gap: 5,
						marginBottom: 3,
					}}>
					<span
						style={{
							fontSize: 10,
							color: isCurrent ? '#e50914' : '#555',
							fontFamily: 'monospace',
							fontWeight: 700,
							flexShrink: 0,
						}}>
						E{String(ep.episode).padStart(2, '0')}
					</span>
					<span
						style={{
							fontSize: 12,
							color: isCurrent ? '#fff' : hovered ? '#ddd' : '#bbb',
							fontWeight: isCurrent ? 600 : 400,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							lineHeight: 1.3,
						}}>
						{ep.title || `Episode ${ep.episode}`}
					</span>
				</div>
				{ep.overview && (
					<p
						style={{
							margin: 0,
							fontSize: 10,
							color: '#555',
							lineHeight: 1.4,
							overflow: 'hidden',
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
						}}>
						{ep.overview}
					</p>
				)}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						marginTop: ep.overview ? 3 : 0,
					}}>
					{ep.duration > 0 && (
						<span
							style={{ fontSize: 10, color: '#444', fontFamily: 'monospace' }}>
							{fmtDur(ep.duration)}
						</span>
					)}
					{progress !== null && !isCompleted && progress > 0 && (
						<span style={{ fontSize: 10, color: '#666' }}>
							{progress}% watched
						</span>
					)}
					{isCompleted && (
						<span style={{ fontSize: 10, color: '#1db954' }}>Watched</span>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Main Playlist Component ───────────────────────────────────────────────────
export default function OverlayPlaylist({
	allSeasons,
	mode = 'tv',
	currentEpisodeId,
	currentSeason,
	history,
	onPlayEpisode,
	transitioning,
}) {
	const [openSeasons, setOpenSeasons] = useState(new Set());
	const containerRef = useRef(null);

	// Auto-open the season containing the currently playing episode
	useEffect(() => {
		if (!currentEpisodeId || !allSeasons.length) return;
		const active = allSeasons.find((s) =>
			s.episodes.some((ep) => ep.episodeId === currentEpisodeId),
		);
		if (active) {
			// Replace the entire Set — collapse all other seasons, open only the active one
			setOpenSeasons(new Set([active.season]));
		}
	}, [currentEpisodeId, allSeasons]);

	const toggleSeason = (season) => {
		setOpenSeasons((prev) => {
			const next = new Set(prev);
			if (next.has(season)) next.delete(season);
			else next.add(season);
			return next;
		});
	};

	const totalEps = allSeasons.reduce(
		(acc, s) => acc + (s.episodes?.length || 0),
		0,
	);
	const watchedEps = allSeasons.reduce((acc, s) => {
		return (
			acc +
			(s.episodes || []).filter((ep) => history[ep.episodeId]?.completed).length
		);
	}, 0);
	const flatEpisodes = allSeasons.flatMap((season) => season.episodes || []);
	const currentItem =
		flatEpisodes.find((ep) => ep.episodeId === currentEpisodeId) || null;
	const isMoviesMode = mode === 'movies';

	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				background: 'rgba(10,10,10,0.97)',
				borderLeft: '1px solid rgba(255,255,255,0.07)',
				overflow: 'hidden',
			}}>
			{/* Header */}
			<div
				style={{
					padding: '11px 14px 10px',
					borderBottom: '1px solid rgba(255,255,255,0.07)',
					flexShrink: 0,
					background: 'rgba(255,255,255,0.02)',
				}}>
				<div
					style={{
						fontSize: 11,
						fontWeight: 700,
						color: '#ccc',
						letterSpacing: 0.8,
						textTransform: 'uppercase',
						marginBottom: 3,
					}}>
					Playlist
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					{isMoviesMode ? (
						<>
							<span style={{ fontSize: 10, color: '#444' }}>Now Playing</span>
							<span style={{ fontSize: 10, color: '#333' }}>·</span>
							<span
								style={{
									fontSize: 10,
									color: '#444',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}>
								{currentItem?.title || 'Movie'}
							</span>
						</>
					) : (
						<>
							<span style={{ fontSize: 10, color: '#444' }}>
								{allSeasons.length} season{allSeasons.length !== 1 ? 's' : ''}
							</span>
							<span style={{ fontSize: 10, color: '#333' }}>·</span>
							<span style={{ fontSize: 10, color: '#444' }}>
								{watchedEps}/{totalEps} watched
							</span>
						</>
					)}
				</div>
			</div>

			{/* Accordion list */}
			<div
				ref={containerRef}
				style={{
					flex: 1,
					overflowY: 'auto',
					overflowX: 'hidden',
					scrollbarWidth: 'thin',
					scrollbarColor: '#2a2a2a transparent',
				}}>
				{allSeasons.length === 0 ? (
					<div
						style={{
							padding: 24,
							textAlign: 'center',
							color: '#444',
							fontSize: 12,
						}}>
						No episodes available
					</div>
				) : (
					allSeasons.map((s) => (
						<SeasonAccordion
							key={s.season}
							seasonData={s}
							mode={mode}
							isOpen={openSeasons.has(s.season)}
							onToggle={() => toggleSeason(s.season)}
							currentEpisodeId={currentEpisodeId}
							history={history}
							onPlayEpisode={onPlayEpisode}
							transitioning={transitioning}
						/>
					))
				)}
			</div>
		</div>
	);
}
