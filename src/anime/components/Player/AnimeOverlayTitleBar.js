import React from 'react';

// Type badge colors for episode classification
const TYPE_COLORS = {
	canon: {
		bg: 'rgba(229,9,20,0.2)',
		border: 'rgba(229,9,20,0.5)',
		text: '#ff6b6b',
	},
	mixed: {
		bg: 'rgba(255,165,0,0.18)',
		border: 'rgba(255,165,0,0.45)',
		text: '#ffaa33',
	},
	filler: {
		bg: 'rgba(100,100,100,0.2)',
		border: 'rgba(100,100,100,0.4)',
		text: '#888',
	},
};

function getEpisodeType(type) {
	return (type || 'canon').toLowerCase();
}

export default function AnimeOverlayTitleBar({
	seriesName,
	filterDesc,
	episodeNumber,
	episodeType,
	episodeTitle,
	onClose,
}) {
	const normalizedEpisodeType = getEpisodeType(episodeType);
	const typeColor = TYPE_COLORS[normalizedEpisodeType] || TYPE_COLORS.canon;

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				height: 36,
				background: 'rgba(14,14,14,0.92)',
				borderBottom: '1px solid rgba(255,255,255,0.06)',
				padding: '0 8px',
				gap: 8,
				flexShrink: 0,
				userSelect: 'none',
			}}>
			{/* App icon */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					marginRight: 2,
					flexShrink: 0,
				}}>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none">
					<rect
						x="2"
						y="3"
						width="20"
						height="14"
						rx="2"
						fill="#e50914"
					/>
					<path
						d="M8 7l8 5-8 5V7z"
						fill="white"
					/>
				</svg>
				<span style={{ fontSize: 11, color: '#aaa', fontFamily: 'sans-serif' }}>
					CineShelf
				</span>
			</div>

			<div
				style={{
					width: 1,
					height: 16,
					background: 'rgba(255,255,255,0.1)',
					margin: '0 2px',
					flexShrink: 0,
				}}
			/>

			{/* Series name */}
			<span
				style={{
					fontSize: 12,
					fontWeight: 600,
					color: '#fff',
					fontFamily: 'sans-serif',
					whiteSpace: 'nowrap',
					flexShrink: 0,
				}}>
				{seriesName}
			</span>

			{/* Episode number + type badge */}
			{episodeNumber != null && (
				<>
					<span style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>·</span>
					<span
						style={{
							fontSize: 11,
							color: '#999',
							fontFamily: 'sans-serif',
							flexShrink: 0,
						}}>
						Ep {episodeNumber}
					</span>
					{episodeType && (
						<span
							style={{
								fontSize: 9,
								fontWeight: 700,
								letterSpacing: 0.5,
								textTransform: 'uppercase',
								color: typeColor.text,
								background: typeColor.bg,
								border: `1px solid ${typeColor.border}`,
								padding: '2px 6px',
								borderRadius: 3,
								flexShrink: 0,
							}}>
							{normalizedEpisodeType}
						</span>
					)}
				</>
			)}

			{/* Episode title */}
			{episodeTitle && (
				<span
					style={{
						fontSize: 11,
						color: '#bbb',
						fontFamily: 'sans-serif',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						flex: 1,
						minWidth: 0,
					}}>
					— {episodeTitle}
				</span>
			)}

			{/* Filter description */}
			{filterDesc && (
				<span
					style={{
						fontSize: 10,
						color: '#555',
						fontFamily: 'sans-serif',
						whiteSpace: 'nowrap',
						flexShrink: 0,
						marginLeft: 'auto',
						paddingRight: 6,
					}}>
					{filterDesc}
				</span>
			)}

			{/* Close button */}
			<div style={{ display: 'flex', gap: 2, marginLeft: 4, flexShrink: 0 }}>
				<TitleBtn
					onClick={onClose}
					title="Close Player"
					color="#999"
					hoverColor="#ff4444"
					hoverBg="rgba(255,60,60,0.2)">
					<svg
						width="10"
						height="10"
						viewBox="0 0 10 10">
						<path
							d="M1.5 1.5l7 7M8.5 1.5l-7 7"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</TitleBtn>
			</div>
		</div>
	);
}

function TitleBtn({ onClick, title, children, color, hoverColor, hoverBg }) {
	const [hovered, setHovered] = React.useState(false);
	return (
		<button
			onClick={onClick}
			title={title}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				width: 28,
				height: 24,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: hovered && hoverBg ? hoverBg : 'transparent',
				border: 'none',
				borderRadius: 3,
				cursor: 'pointer',
				color: hovered ? hoverColor || color : color,
				transition: 'color 0.15s, background 0.15s',
				padding: 0,
			}}>
			{children}
		</button>
	);
}
