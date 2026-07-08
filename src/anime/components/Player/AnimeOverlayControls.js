import React, { useCallback } from 'react';

function fmt(sec) {
	if (!sec || isNaN(sec)) return '00:00:00';
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AnimeOverlayControls({
	position,
	duration,
	vlcState,
	volume,
	isMuted,
	onPlayPause,
	onStop,
	onPrev,
	onNext,
	onSeek,
	onVolumeChange,
	onToggleMute,
	hasNext,
	hasPrev,
	nextEpTitle,
	audioTracks = [],
	subtitleTracks = [],
	selectedAudioTrackId = null,
	selectedSubtitleTrackId = -1,
	aspectRatio = 'default',
	aspectRatioOptions = [],
	onSetAudioTrack,
	onSetSubtitleTrack,
	onSetAspectRatio,
	onCycleCrop,
	onAttachSubtitle,
	onMenuOpenChange,
}) {
	const progress = duration > 0 ? (position / duration) * 100 : 0;
	const [openMenu, setOpenMenu] = React.useState(null);
	const menuHostRef = React.useRef(null);

	const handleSeekClick = useCallback(
		(e) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const ratio = (e.clientX - rect.left) / rect.width;
			onSeek(Math.floor(ratio * duration));
		},
		[duration, onSeek],
	);

	const handleVolumeClick = useCallback(
		(e) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const ratio = Math.max(
				0,
				Math.min(1, (e.clientX - rect.left) / rect.width),
			);
			onVolumeChange(Math.round(ratio * 256));
		},
		[onVolumeChange],
	);

	const isPlaying = vlcState === 'playing';
	const volPct = Math.min(100, ((volume || 0) / 256) * 100);
	const currentAudioLabel =
		audioTracks.find((track) => track.id === selectedAudioTrackId)?.label ||
		'Audio';
	const currentSubtitleLabel =
		subtitleTracks.find((track) => track.id === selectedSubtitleTrackId)
			?.label || (selectedSubtitleTrackId === -1 ? 'Off' : 'Subtitles');
	const currentAspectLabel = formatAspectLabel(aspectRatio);

	React.useEffect(() => {
		function handlePointerDown(event) {
			if (!menuHostRef.current?.contains(event.target)) {
				setOpenMenu(null);
			}
		}
		document.addEventListener('mousedown', handlePointerDown);
		return () => document.removeEventListener('mousedown', handlePointerDown);
	}, []);

	React.useEffect(() => {
		onMenuOpenChange?.(openMenu !== null);
		return () => onMenuOpenChange?.(false);
	}, [openMenu, onMenuOpenChange]);

	return (
		<div
			style={{
				background: 'rgba(12,12,12,0.93)',
				borderTop: '1px solid rgba(255,255,255,0.06)',
				padding: '0 10px 6px',
				flexShrink: 0,
				userSelect: 'none',
			}}>
			{/* Progress / seek bar */}
			<div
				onClick={handleSeekClick}
				style={{
					height: 20,
					display: 'flex',
					alignItems: 'center',
					cursor: 'pointer',
					padding: '0 2px',
				}}>
				<div
					style={{
						flex: 1,
						height: 4,
						background: 'rgba(255,255,255,0.15)',
						borderRadius: 2,
						position: 'relative',
						overflow: 'visible',
					}}>
					<div
						style={{
							position: 'absolute',
							left: 0,
							top: 0,
							width: `${progress}%`,
							height: '100%',
							background: '#e50914',
							borderRadius: 2,
							transition: 'width 0.3s linear',
						}}
					/>
					<div
						style={{
							position: 'absolute',
							top: '50%',
							left: `${progress}%`,
							transform: 'translate(-50%, -50%)',
							width: 12,
							height: 12,
							background: '#fff',
							borderRadius: '50%',
							boxShadow: '0 0 4px rgba(0,0,0,0.8)',
						}}
					/>
				</div>
			</div>

			{/* Buttons row */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 2,
					height: 36,
				}}>
				{/* Play/Pause */}
				<CtrlBtn
					onClick={onPlayPause}
					title={isPlaying ? 'Pause' : 'Play'}
					large>
					{isPlaying ? (
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="currentColor">
							<rect
								x="2"
								y="1"
								width="4"
								height="12"
								rx="1"
							/>
							<rect
								x="8"
								y="1"
								width="4"
								height="12"
								rx="1"
							/>
						</svg>
					) : (
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="currentColor">
							<path d="M2 1l11 6-11 6V1z" />
						</svg>
					)}
				</CtrlBtn>

				{/* Stop */}
				<CtrlBtn
					onClick={onStop}
					title="Stop">
					<svg
						width="12"
						height="12"
						viewBox="0 0 12 12"
						fill="currentColor">
						<rect
							x="1"
							y="1"
							width="10"
							height="10"
							rx="1.5"
						/>
					</svg>
				</CtrlBtn>

				{/* Prev */}
				<CtrlBtn
					onClick={hasPrev !== false ? onPrev : undefined}
					title="Previous Episode"
					disabled={hasPrev === false}>
					<svg
						width="13"
						height="12"
						viewBox="0 0 13 12"
						fill="currentColor">
						<rect
							x="1"
							y="1"
							width="2.5"
							height="10"
							rx="1"
						/>
						<path d="M12 1L4.5 6 12 11V1z" />
					</svg>
				</CtrlBtn>

				{/* Next */}
				<CtrlBtn
					onClick={hasNext !== false ? onNext : undefined}
					title={nextEpTitle ? `Next: ${nextEpTitle}` : 'Next Episode'}
					disabled={hasNext === false}>
					<svg
						width="13"
						height="12"
						viewBox="0 0 13 12"
						fill="currentColor">
						<rect
							x="9.5"
							y="1"
							width="2.5"
							height="10"
							rx="1"
						/>
						<path d="M1 1l7.5 5L1 11V1z" />
					</svg>
				</CtrlBtn>

				{/* Divider */}
				<div
					style={{
						width: 1,
						height: 20,
						background: 'rgba(255,255,255,0.12)',
						margin: '0 4px',
					}}
				/>

				{/* Timestamp */}
				<span
					style={{
						fontFamily: 'monospace',
						fontSize: 12,
						color: '#ccc',
						whiteSpace: 'nowrap',
						letterSpacing: 0.3,
						minWidth: 110,
					}}>
					{fmt(position)}&nbsp;/&nbsp;{fmt(duration)}
				</span>

				<div style={{ flex: 1 }} />

				<div
					ref={menuHostRef}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						marginRight: 8,
					}}>
					<MenuButton
						label="Audio"
						value={currentAudioLabel}
						title="Audio tracks (V cycles)"
						open={openMenu === 'audio'}
						onToggle={() =>
							setOpenMenu((prev) => (prev === 'audio' ? null : 'audio'))
						}>
						{audioTracks.map((track) => (
							<MenuItem
								key={track.id}
								label={track.label}
								active={track.id === selectedAudioTrackId}
								onClick={() => {
									onSetAudioTrack?.(track.id);
									setOpenMenu(null);
								}}
							/>
						))}
					</MenuButton>

					<MenuButton
						label="Subs"
						value={currentSubtitleLabel}
						title="Subtitle tracks (B cycles, O off)"
						open={openMenu === 'subtitle'}
						onToggle={() =>
							setOpenMenu((prev) => (prev === 'subtitle' ? null : 'subtitle'))
						}>
						{subtitleTracks.map((track) => (
							<MenuItem
								key={track.id}
								label={track.label}
								active={track.id === selectedSubtitleTrackId}
								onClick={() => {
									onSetSubtitleTrack?.(track.id);
									setOpenMenu(null);
								}}
							/>
						))}
					</MenuButton>

					<MenuButton
						label="Aspect"
						value={currentAspectLabel}
						title="Aspect ratio (A cycles)"
						open={openMenu === 'aspect'}
						onToggle={() =>
							setOpenMenu((prev) => (prev === 'aspect' ? null : 'aspect'))
						}>
						{aspectRatioOptions.map((option) => (
							<MenuItem
								key={option}
								label={formatAspectLabel(option)}
								active={option === aspectRatio}
								onClick={() => {
									onSetAspectRatio?.(option);
									setOpenMenu(null);
								}}
							/>
						))}
					</MenuButton>

					<ActionChip
						onClick={onCycleCrop}
						title="Cycle crop (C)">
						Crop
					</ActionChip>

					<ActionChip
						onClick={onAttachSubtitle}
						title="Attach subtitle file">
						Add Sub
					</ActionChip>
				</div>

				{/* Volume mute */}
				<CtrlBtn
					onClick={onToggleMute}
					title={isMuted ? 'Unmute' : 'Mute'}>
					{isMuted || volume === 0 ? (
						<svg
							width="14"
							height="12"
							viewBox="0 0 14 12"
							fill="currentColor">
							<path d="M1 4h3l4-3v10L4 8H1V4z" />
							<path
								d="M11 4l2 2-2 2"
								stroke="currentColor"
								strokeWidth="1.5"
								fill="none"
								strokeLinecap="round"
							/>
						</svg>
					) : (
						<svg
							width="14"
							height="12"
							viewBox="0 0 14 12"
							fill="currentColor">
							<path d="M1 4h3l4-3v10L4 8H1V4z" />
							<path
								d="M9.5 3a4 4 0 010 6"
								stroke="currentColor"
								strokeWidth="1.5"
								fill="none"
								strokeLinecap="round"
							/>
							<path
								d="M11 1.5a6.5 6.5 0 010 9"
								stroke="currentColor"
								strokeWidth="1.3"
								fill="none"
								strokeLinecap="round"
								opacity="0.6"
							/>
						</svg>
					)}
				</CtrlBtn>

				{/* Volume bar */}
				<div
					onClick={handleVolumeClick}
					title={`Volume ${Math.round(volPct)}%`}
					style={{
						width: 80,
						height: 20,
						display: 'flex',
						alignItems: 'center',
						cursor: 'pointer',
						marginRight: 8,
					}}>
					<div
						style={{
							flex: 1,
							height: 4,
							background: 'rgba(255,255,255,0.15)',
							borderRadius: 2,
							position: 'relative',
						}}>
						<div
							style={{
								position: 'absolute',
								left: 0,
								top: 0,
								width: `${volPct}%`,
								height: '100%',
								background: '#4d9eff',
								borderRadius: 2,
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function formatAspectLabel(value) {
	if (!value || value === 'default') return 'Default';
	return value.replace(':', ' : ');
}

function ActionChip({ onClick, title, children }) {
	const [hovered, setHovered] = React.useState(false);
	return (
		<button
			onClick={onClick}
			title={title}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				height: 26,
				padding: '0 10px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				border: '1px solid rgba(255,255,255,0.08)',
				borderRadius: 5,
				background: hovered
					? 'rgba(255,255,255,0.08)'
					: 'rgba(255,255,255,0.03)',
				color: hovered ? '#fff' : '#d3d3d3',
				fontSize: 11,
				fontWeight: 600,
				cursor: 'pointer',
				whiteSpace: 'nowrap',
			}}>
			{children}
		</button>
	);
}

function MenuButton({ label, value, title, open, onToggle, children }) {
	return (
		<div style={{ position: 'relative' }}>
			<ActionChip
				onClick={onToggle}
				title={title}>
				{label}: {value}
			</ActionChip>
			{open && (
				<div
					style={{
						position: 'absolute',
						right: 0,
						bottom: 'calc(100% + 8px)',
						minWidth: 220,
						maxWidth: 320,
						maxHeight: 240,
						overflowY: 'auto',
						padding: 6,
						background: 'rgba(10,10,10,0.96)',
						border: '1px solid rgba(255,255,255,0.08)',
						borderRadius: 8,
						boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
					}}>
					{children}
				</div>
			)}
		</div>
	);
}

function MenuItem({ label, active, onClick }) {
	return (
		<button
			onClick={onClick}
			style={{
				width: '100%',
				padding: '8px 10px',
				textAlign: 'left',
				border: 'none',
				borderRadius: 6,
				background: active ? 'rgba(77,158,255,0.16)' : 'transparent',
				color: active ? '#fff' : '#d0d0d0',
				fontSize: 12,
				cursor: 'pointer',
				whiteSpace: 'nowrap',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
			}}>
			{label}
		</button>
	);
}

function CtrlBtn({ onClick, title, children, large, disabled }) {
	const [hovered, setHovered] = React.useState(false);
	return (
		<button
			onClick={disabled ? undefined : onClick}
			title={title}
			disabled={disabled}
			onMouseEnter={() => !disabled && setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				width: large ? 36 : 28,
				height: 28,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background:
					hovered && !disabled ? 'rgba(255,255,255,0.1)' : 'transparent',
				border: 'none',
				borderRadius: 4,
				cursor: disabled ? 'not-allowed' : 'pointer',
				color: disabled ? '#333' : hovered ? '#fff' : '#ccc',
				transition: 'color 0.12s, background 0.12s',
				padding: 0,
				flexShrink: 0,
				opacity: disabled ? 0.35 : 1,
			}}>
			{children}
		</button>
	);
}
