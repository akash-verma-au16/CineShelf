import React from 'react';

export default function OverlayTitleBar({
	seriesName,
	episodeTitle,
	episodeLabel,
	onClose,
}) {
	return (
		<div
			className="overlay-titlebar"
			style={{
				display: 'flex',
				alignItems: 'center',
				height: 34,
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
					marginRight: 4,
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
					CineShelf Player
				</span>
			</div>

			<div
				style={{
					width: 1,
					height: 16,
					background: 'rgba(255,255,255,0.1)',
					margin: '0 2px',
				}}
			/>

			{/* Title */}
			<span
				style={{
					flex: 1,
					fontSize: 12,
					color: '#ddd',
					fontFamily: 'sans-serif',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}>
				{episodeLabel && (
					<span style={{ color: '#888', marginRight: 6 }}>
						[{episodeLabel}]
					</span>
				)}
				{seriesName}
				{episodeTitle ? ` — ${episodeTitle}` : ''}
			</span>

			{/* Window controls — close only */}
			<div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
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
				height: 22,
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
