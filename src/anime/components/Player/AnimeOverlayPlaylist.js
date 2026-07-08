import React, { useState, useEffect, useRef } from 'react';

function fmtProgress(position, duration) {
	if (!position || !duration || duration <= 0) return null;
	return Math.min(100, Math.round((position / duration) * 100));
}

const TYPE_BADGE = {
	canon: {
		bg: 'rgba(229,9,20,0.18)',
		border: 'rgba(229,9,20,0.4)',
		text: '#ff6b6b',
		label: 'Canon',
	},
	mixed: {
		bg: 'rgba(255,165,0,0.16)',
		border: 'rgba(255,165,0,0.4)',
		text: '#ffaa33',
		label: 'Mixed',
	},
	filler: {
		bg: 'rgba(80,80,80,0.2)',
		border: 'rgba(100,100,100,0.35)',
		text: '#777',
		label: 'Filler',
	},
	default: {
		bg: 'rgba(229,9,20,0.18)',
		border: 'rgba(229,9,20,0.4)',
		text: '#ff6b6b',
		label: 'Canon',
	},
};

function getEpisodeType(item) {
	return (item?.episodeType || item?.type || 'canon').toLowerCase();
}

function EpisodeRow({ item, isCurrent, hist, onClick, transitioning }) {
	const [hovered, setHovered] = useState(false);
	const progress = hist ? fmtProgress(hist.position, hist.duration) : null;
	const isCompleted = hist?.completed;
	const badge = TYPE_BADGE[getEpisodeType(item)] || TYPE_BADGE.default;

	return (
		<div
			data-current={isCurrent ? 'true' : undefined}
			onClick={() => !transitioning && onClick(item)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: 'flex',
				flexDirection: 'column',
				padding: '8px 14px',
				cursor: 'pointer',
				background: isCurrent
					? 'rgba(229,9,20,0.12)'
					: hovered
						? 'rgba(255,255,255,0.04)'
						: 'transparent',
				borderLeft: `3px solid ${isCurrent ? '#e50914' : 'transparent'}`,
				transition: 'background 0.1s',
				userSelect: 'none',
				gap: 4,
				minHeight: 52,
				justifyContent: 'center',
			}}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
				<span
					style={{
						fontSize: 11,
						fontFamily: 'monospace',
						color: isCurrent ? '#e50914' : '#777',
						flexShrink: 0,
						minWidth: 32,
					}}>
					{item.episodeNumberStr || String(item.episode).padStart(3, '0')}
				</span>

				<span
					style={{
						fontSize: 9,
						fontWeight: 700,
						letterSpacing: 0.4,
						textTransform: 'uppercase',
						color: badge.text,
						background: badge.bg,
						border: `1px solid ${badge.border}`,
						padding: '1px 5px',
						borderRadius: 3,
						flexShrink: 0,
					}}>
					{badge.label}
				</span>

				<span
					style={{
						fontSize: 12,
						color: isCurrent ? '#fff' : hovered ? '#ddd' : '#bbb',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						flex: 1,
						minWidth: 0,
					}}>
					{item.title || `Episode ${item.episode}`}
				</span>

				{isCompleted && (
					<svg
						width="12"
						height="12"
						viewBox="0 0 12 12"
						fill="none"
						style={{ flexShrink: 0 }}>
						<circle
							cx="6"
							cy="6"
							r="5"
							fill="rgba(80,200,80,0.2)"
							stroke="rgba(80,200,80,0.5)"
							strokeWidth="1"
						/>
						<path
							d="M3.5 6l2 2 3-3.5"
							stroke="#4ec44e"
							strokeWidth="1.3"
							strokeLinecap="round"
							strokeLinejoin="round"
							fill="none"
						/>
					</svg>
				)}
			</div>

			{progress != null && !isCompleted && (
				<div
					style={{
						height: 2,
						background: 'rgba(255,255,255,0.1)',
						borderRadius: 1,
						marginTop: 2,
						marginLeft: 38,
						position: 'relative',
					}}>
					<div
						style={{
							position: 'absolute',
							left: 0,
							top: 0,
							width: `${progress}%`,
							height: '100%',
							background: '#e50914',
							borderRadius: 1,
						}}
					/>
				</div>
			)}
		</div>
	);
}

export default function AnimeOverlayPlaylist({
	allSeasons,
	currentEpisodeId,
	history,
	onPlayEpisode,
	transitioning,
	filterDesc,
}) {
	const listRef = useRef(null);
	const playlist = allSeasons.flatMap((season) => season.episodes || []);

	useEffect(() => {
		if (!listRef.current) return;
		const currentEl = listRef.current.querySelector('[data-current="true"]');
		if (currentEl) {
			setTimeout(() => {
				currentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 120);
		}
	}, [currentEpisodeId]);

	const completedCount = playlist.filter(
		(item) => history[item.episodeId]?.completed,
	).length;

	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				background: 'rgba(10,10,10,0.96)',
				borderLeft: '1px solid rgba(255,255,255,0.06)',
				overflow: 'hidden',
			}}>
			<div
				style={{
					padding: '10px 14px 8px',
					borderBottom: '1px solid rgba(255,255,255,0.06)',
					flexShrink: 0,
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						marginBottom: filterDesc ? 4 : 0,
					}}>
					<span
						style={{
							fontSize: 10,
							fontWeight: 700,
							letterSpacing: 0.8,
							textTransform: 'uppercase',
							color: '#666',
						}}>
						Playlist
					</span>
					<span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>
						{completedCount}/{playlist.length}
					</span>
				</div>
				{filterDesc && (
					<div style={{ fontSize: 10, color: '#555' }}>{filterDesc}</div>
				)}
			</div>

			<div
				ref={listRef}
				style={{
					flex: 1,
					overflowY: 'auto',
					overflowX: 'hidden',
				}}>
				{playlist.map((item) => (
					<EpisodeRow
						key={item.episodeId}
						item={item}
						isCurrent={item.episodeId === currentEpisodeId}
						hist={history[item.episodeId]}
						onClick={onPlayEpisode}
						transitioning={transitioning}
					/>
				))}
			</div>
		</div>
	);
}
