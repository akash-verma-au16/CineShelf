import React, { useState, useRef, useEffect } from 'react';
import { useMovies } from '../../../context/MoviesContext';

const VIDEO_EXTS = new Set([
	'.mkv',
	'.mp4',
	'.avi',
	'.m4v',
	'.mov',
	'.ts',
	'.wmv',
	'.flv',
	'.m2ts',
	'.webm',
	'.rmvb',
	'.divx',
	'.mpg',
	'.mpeg',
]);
const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function extOf(name) {
	const idx = name.lastIndexOf('.');
	return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function formatBytes(bytes) {
	if (!bytes) return '';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function MoviesFileSystemTab() {
	const { settings, showToast } = useMovies();
	const sourceDirs = settings?.moviesSourceDirs || [];

	const [nodes, setNodes] = useState({});
	const [renamingPath, setRenamingPath] = useState(null);
	const [renameValue, setRenameValue] = useState('');
	const [renameError, setRenameError] = useState('');
	const renameInputRef = useRef(null);

	useEffect(() => {
		if (renamingPath && renameInputRef.current) {
			renameInputRef.current.focus();
			renameInputRef.current.select();
		}
	}, [renamingPath]);

	function getNode(prev, path) {
		return (
			prev[path] || {
				items: [],
				loaded: false,
				loading: false,
				expanded: false,
				error: null,
			}
		);
	}

	async function loadDir(dirPath) {
		setNodes((prev) => ({
			...prev,
			[dirPath]: { ...getNode(prev, dirPath), loading: true },
		}));
		if (!window.api?.listDir) {
			setNodes((prev) => ({
				...prev,
				[dirPath]: {
					...getNode(prev, dirPath),
					loading: false,
					loaded: true,
					items: [],
					error: 'Not available in dev mode',
				},
			}));
			return;
		}
		const result = await window.api.listDir(dirPath);
		setNodes((prev) => ({
			...prev,
			[dirPath]: {
				...getNode(prev, dirPath),
				loading: false,
				loaded: true,
				items: result.success ? result.items : [],
				error: result.success ? null : result.error,
			},
		}));
	}

	function toggleNode(dirPath) {
		setNodes((prev) => {
			const n = getNode(prev, dirPath);
			const willExpand = !n.expanded;
			const updated = { ...prev, [dirPath]: { ...n, expanded: willExpand } };
			if (willExpand && !n.loaded && !n.loading) {
				setTimeout(() => loadDir(dirPath), 0);
			}
			return updated;
		});
	}

	function reloadDir(dirPath) {
		setNodes((prev) => ({
			...prev,
			[dirPath]: { ...getNode(prev, dirPath), loaded: false, items: [] },
		}));
		loadDir(dirPath);
	}

	function startRename(item) {
		setRenameValue(item.name);
		setRenameError('');
		setRenamingPath(item.path);
	}

	function cancelRename() {
		setRenamingPath(null);
		setRenameValue('');
		setRenameError('');
	}

	async function confirmRename(item, parentPath) {
		const newName = renameValue.trim();
		if (!newName || newName === item.name) {
			cancelRename();
			return;
		}
		if (newName.includes('\\') || newName.includes('/')) {
			setRenameError('Name cannot contain path separators.');
			return;
		}
		if (!window.api?.renameItem) {
			showToast('Not available in dev mode', 'warning');
			cancelRename();
			return;
		}
		const result = await window.api.renameItem(item.path, newName);
		if (result.success) {
			showToast(`Renamed to "${newName}"`, 'success');
			cancelRename();
			if (parentPath) reloadDir(parentPath);
		} else {
			setRenameError(result.error || 'Rename failed');
		}
	}

	if (!window.api) {
		return (
			<div className="px-8 py-8">
				<h1 className="text-xl font-bold text-white mb-3">File System</h1>
				<p className="text-gray-500 text-sm">
					File system browsing is only available in the desktop app.
				</p>
			</div>
		);
	}

	return (
		<div className="px-8 py-8">
			<div className="mb-6">
				<h1 className="text-xl font-bold text-white">File System</h1>
				<p className="text-sm text-gray-500 mt-1">
					Browse movies source directories. Hover any item and click the pencil
					icon to rename files and folders directly on disk.
				</p>
			</div>

			{sourceDirs.length === 0 && (
				<div className="bg-white/5 border border-white/8 rounded-xl p-6 text-center">
					<p className="text-gray-500 text-sm">
						No source directories configured. Add them in the General tab.
					</p>
				</div>
			)}

			<div className="space-y-0.5 select-none">
				{sourceDirs.map((dir) => (
					<TreeNode
						key={dir}
						item={{ name: dir, path: dir, isDirectory: true, size: 0 }}
						depth={0}
						parentPath={null}
						nodes={nodes}
						renamingPath={renamingPath}
						renameValue={renameValue}
						renameError={renameError}
						renameInputRef={renameInputRef}
						onToggle={toggleNode}
						onReload={reloadDir}
						onRenameStart={startRename}
						onRenameChange={setRenameValue}
						onRenameConfirm={confirmRename}
						onRenameCancel={cancelRename}
					/>
				))}
			</div>
		</div>
	);
}

function TreeNode({
	item,
	depth,
	parentPath,
	nodes,
	renamingPath,
	renameValue,
	renameError,
	renameInputRef,
	onToggle,
	onReload,
	onRenameStart,
	onRenameChange,
	onRenameConfirm,
	onRenameCancel,
}) {
	const node = nodes[item.path] || {
		items: [],
		loaded: false,
		loading: false,
		expanded: false,
		error: null,
	};
	const isRenaming = renamingPath === item.path;
	const ext = extOf(item.name);
	const isVideo = VIDEO_EXTS.has(ext);
	const isImg = IMG_EXTS.has(ext);
	const isRoot = parentPath === null;

	const childProps = {
		nodes,
		renamingPath,
		renameValue,
		renameError,
		renameInputRef,
		onToggle,
		onReload,
		onRenameStart,
		onRenameChange,
		onRenameConfirm,
		onRenameCancel,
	};

	return (
		<div>
			<div
				className="group flex items-center gap-1 rounded-md hover:bg-white/[0.04] transition-colors"
				style={{
					paddingLeft: depth * 18 + 4,
					paddingTop: 2,
					paddingBottom: 2,
				}}>
				{item.isDirectory ? (
					<button
						onClick={() => onToggle(item.path)}
						className="flex items-center justify-center w-6 h-6 shrink-0 text-gray-600 hover:text-gray-300 transition-colors rounded">
						{node.loading ? (
							<svg
								className="w-3 h-3 animate-spin text-gray-500"
								viewBox="0 0 24 24"
								fill="none">
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8v8z"
								/>
							</svg>
						) : (
							<svg
								className={`w-3 h-3 transition-transform duration-150 ${node.expanded ? 'rotate-90' : ''}`}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2.5}
									d="M9 5l7 7-7 7"
								/>
							</svg>
						)}
					</button>
				) : (
					<span className="w-6 shrink-0" />
				)}

				<span className="text-sm w-5 text-center shrink-0">
					{item.isDirectory
						? node.expanded
							? '📂'
							: '📁'
						: isVideo
							? '🎬'
							: isImg
								? '🖼️'
								: '📄'}
				</span>

				<div className="flex-1 min-w-0">
					{isRenaming ? (
						<div>
							<div className="flex items-center gap-1.5">
								<input
									ref={renameInputRef}
									value={renameValue}
									onChange={(e) => onRenameChange(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') onRenameConfirm(item, parentPath);
										if (e.key === 'Escape') onRenameCancel();
									}}
									className="bg-white/10 border border-white/20 rounded px-2 text-xs py-0.5 h-6 flex-1 min-w-0 text-white focus:outline-none focus:border-white/40"
									style={{ fontFamily: 'monospace' }}
								/>
								<button
									onClick={() => onRenameConfirm(item, parentPath)}
									className="text-green-400 hover:text-green-300 transition-colors p-0.5"
									title="Confirm (Enter)">
									<svg
										className="w-4 h-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M5 13l4 4L19 7"
										/>
									</svg>
								</button>
								<button
									onClick={onRenameCancel}
									className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"
									title="Cancel (Esc)">
									<svg
										className="w-4 h-4"
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
							{renameError && (
								<p className="text-red-400 text-[10px] mt-0.5 font-sans">
									{renameError}
								</p>
							)}
						</div>
					) : (
						<span
							className={`text-sm truncate leading-6 ${
								isRoot
									? 'text-gray-300 font-semibold'
									: item.isDirectory
										? 'text-gray-200'
										: 'text-gray-400'
							}`}
							style={{ fontFamily: isRoot ? 'inherit' : 'monospace' }}>
							{item.name}
						</span>
					)}
				</div>

				{!isRenaming && !item.isDirectory && (
					<div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
						{ext && (
							<span
								className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded border tracking-wide
								${
									isVideo
										? 'bg-purple-500/15 text-purple-400 border-purple-500/25'
										: isImg
											? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
											: 'bg-white/5 text-gray-600 border-white/10'
								}`}>
								{ext.slice(1)}
							</span>
						)}
						{item.size > 0 && (
							<span className="text-[10px] text-gray-600 tabular-nums">
								{formatBytes(item.size)}
							</span>
						)}
					</div>
				)}

				{!isRenaming && item.isDirectory && node.loaded && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onReload(item.path);
						}}
						className="p-1 rounded text-gray-700 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
						title="Refresh directory">
						<svg
							className="w-3 h-3"
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
				)}

				{!isRenaming && !isRoot && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onRenameStart(item);
						}}
						className="p-1 rounded text-gray-700 hover:text-yellow-400 hover:bg-yellow-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
						title="Rename">
						<svg
							className="w-3.5 h-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
							/>
						</svg>
					</button>
				)}
			</div>

			{node.error && (
				<div style={{ paddingLeft: (depth + 1) * 18 + 28 }}>
					<p className="text-[10px] text-red-400 py-0.5 font-sans">
						{node.error}
					</p>
				</div>
			)}

			{item.isDirectory && node.expanded && node.loaded && !node.loading && (
				<div>
					{node.items.length === 0 && !node.error && (
						<div style={{ paddingLeft: (depth + 1) * 18 + 28 }}>
							<p className="text-[10px] text-gray-600 py-0.5 font-sans">
								Empty folder
							</p>
						</div>
					)}
					{node.items.map((child) => (
						<TreeNode
							key={child.path}
							item={child}
							depth={depth + 1}
							parentPath={item.path}
							{...childProps}
						/>
					))}
				</div>
			)}
		</div>
	);
}
