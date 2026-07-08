import React, {
	useState,
	useEffect,
	useRef,
	useCallback,
	useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	useSensor,
	useSensors,
	closestCenter,
	useDroppable,
} from '@dnd-kit/core';
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
	horizontalListSortingStrategy,
	arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMovies } from '../../context/MoviesContext';
import MoviesCard from './MoviesCard';
import { toLocalUrl } from '../../../shared/utils/helpers';

function uid() {
	return `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cardId(movieId) {
	return `card::${movieId}`;
}

function GripIcon({ className = 'w-7 h-7' }) {
	return (
		<svg
			className={className}
			viewBox="0 0 20 20"
			fill="currentColor">
			<circle
				cx="7"
				cy="5"
				r="1.5"
			/>
			<circle
				cx="13"
				cy="5"
				r="1.5"
			/>
			<circle
				cx="7"
				cy="10"
				r="1.5"
			/>
			<circle
				cx="13"
				cy="10"
				r="1.5"
			/>
			<circle
				cx="7"
				cy="15"
				r="1.5"
			/>
			<circle
				cx="13"
				cy="15"
				r="1.5"
			/>
		</svg>
	);
}

function PencilIcon() {
	return (
		<svg
			className="w-3.5 h-3.5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
			/>
		</svg>
	);
}

function PlusIcon({ className = 'w-3.5 h-3.5' }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2.5}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 4v16m8-8H4"
			/>
		</svg>
	);
}

function XIcon({ className = 'w-3.5 h-3.5' }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M6 18L18 6M6 6l12 12"
			/>
		</svg>
	);
}

function AddMovieModal({ allMovies, metadata, allUsedIds, onAdd, onClose }) {
	const [query, setQuery] = useState('');
	const filtered = allMovies.filter((movie) => {
		const name = (metadata[movie.id]?.title || movie.name).toLowerCase();
		return (
			!allUsedIds.includes(movie.id) &&
			(!query || name.includes(query.toLowerCase()))
		);
	});

	useEffect(() => {
		const handler = (event) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
			onClick={onClose}>
			<div
				className="bg-[#181818] border border-white/10 rounded-2xl p-5 w-72 max-h-[60vh] flex flex-col gap-3 shadow-2xl"
				onClick={(event) => event.stopPropagation()}>
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-white text-sm">Add Movie to Shelf</h3>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-white transition-colors">
						<XIcon className="w-4 h-4" />
					</button>
				</div>
				<input
					className="bg-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white outline-none border border-white/10 focus:border-white/25 placeholder-gray-600 transition-colors"
					placeholder="Search movies…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					autoFocus
				/>
				<div className="overflow-y-auto flex flex-col gap-0.5 -mx-1">
					{filtered.map((movie) => (
						<button
							key={movie.id}
							className="text-left px-3 py-2 rounded-lg hover:bg-white/8 text-sm text-gray-300 hover:text-white transition-colors"
							onClick={() => {
								onAdd(movie.id);
								onClose();
							}}>
							{metadata[movie.id]?.title || movie.name}
						</button>
					))}
					{filtered.length === 0 && (
						<p className="text-gray-600 text-sm text-center py-4">
							{query ? 'No results' : 'All movies already placed in a shelf'}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function EmptyDropZone({ rowId, isOver }) {
	const { setNodeRef } = useDroppable({
		id: `empty::${rowId}`,
		data: { type: 'emptyRow', rowId },
	});
	return (
		<div
			ref={setNodeRef}
			className={`mx-6 h-24 border-2 border-dashed rounded-xl flex items-center justify-center text-sm transition-all duration-200 ${isOver ? 'border-[#e50914]/70 bg-[#e50914]/8 text-[#e50914]/70' : 'border-white/10 text-gray-600'}`}>
			{isOver ? 'Drop here' : 'Drag movies here or use + Add Movie'}
		</div>
	);
}

function DraggableCard({ movie, rowId, isDragActive, onRemove }) {
	const id = cardId(movie.id);
	const {
		setNodeRef,
		transform,
		transition,
		isDragging,
		attributes,
		listeners,
	} = useSortable({ id, data: { type: 'card', movieId: movie.id, rowId } });
	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			className="group/card relative shrink-0 cursor-grab active:cursor-grabbing"
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0 : 1,
				touchAction: 'none',
				userSelect: 'none',
				pointerEvents: isDragActive && !isDragging ? 'none' : undefined,
			}}>
			<div
				className="absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded flex items-center justify-center bg-black/70 border border-white/20 opacity-0 group-hover/card:opacity-100 pointer-events-none transition-opacity duration-150"
				title="Drag to move or reorder">
				<GripIcon className="w-3.5 h-3.5 text-white/80" />
			</div>
			<button
				className="absolute top-1.5 left-10 z-10 w-6 h-6 rounded flex items-center justify-center bg-black/70 border border-white/20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 hover:bg-red-600/80 hover:border-red-400/50"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => {
					event.stopPropagation();
					onRemove(rowId, movie.id);
				}}
				title="Remove from shelf">
				<XIcon className="w-3 h-3 text-white/80" />
			</button>
			<MoviesCard movie={movie} />
		</div>
	);
}

function SortableRow({
	row,
	allMovies,
	metadata,
	allUsedIds,
	onTitleChange,
	onDelete,
	onAddMovie,
	onRemove,
	isCardOver,
	isDragActive,
}) {
	const {
		setNodeRef,
		transform,
		transition,
		isDragging,
		attributes,
		listeners,
	} = useSortable({ id: row.id, data: { type: 'row' } });
	const [editing, setEditing] = useState(false);
	const [titleVal, setTitleVal] = useState(row.title);
	const [showAddModal, setShowAddModal] = useState(false);

	useEffect(() => {
		if (!editing) setTitleVal(row.title);
	}, [row.title, editing]);

	const commitTitle = () => {
		onTitleChange(row.id, titleVal.trim() || 'Untitled');
		setEditing(false);
	};

	const moviesInRow = row.movieIds
		.map((id) => allMovies.find((movie) => movie.id === id))
		.filter(Boolean);
	const cardIds = row.movieIds.map(cardId);

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition: transition || 'transform 200ms ease',
			}}
			className={`mb-8 group/row ${isDragging ? 'opacity-40 pointer-events-none' : ''}`}>
			<div className="flex items-center gap-2 pl-4 pr-6 mb-3">
				<button
					{...attributes}
					{...listeners}
					className="flex-shrink-0 p-1.5 rounded cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors touch-none"
					title="Drag to reorder shelf">
					<GripIcon className="w-4 h-4" />
				</button>
				{editing ? (
					<input
						className="bg-transparent border-b-2 border-[#e50914] text-white font-bold text-xl outline-none px-1 py-0.5 min-w-0 w-48 tracking-wide"
						value={titleVal}
						onChange={(event) => setTitleVal(event.target.value)}
						onBlur={commitTitle}
						onKeyDown={(event) => {
							if (event.key === 'Enter' || event.key === 'Escape')
								commitTitle();
						}}
						autoFocus
					/>
				) : (
					<h2
						className="text-xl font-bold text-white tracking-wide cursor-text hover:text-gray-200 transition-colors"
						onClick={() => {
							setTitleVal(row.title);
							setEditing(true);
						}}
						title="Click to rename">
						{row.title}
					</h2>
				)}
				<div className="flex items-center gap-1 ml-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200">
					{!editing && (
						<button
							onClick={() => {
								setTitleVal(row.title);
								setEditing(true);
							}}
							className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
							title="Rename shelf">
							<PencilIcon />
						</button>
					)}
					<button
						onClick={() => setShowAddModal(true)}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
						<PlusIcon className="w-3 h-3" />
						Add Movie
					</button>
					<button
						onClick={() => onDelete(row.id)}
						className="p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
						title="Delete shelf">
						<XIcon />
					</button>
				</div>
				{moviesInRow.length > 0 && (
					<span className="ml-auto text-xs text-gray-600 opacity-0 group-hover/row:opacity-100 transition-opacity">
						{moviesInRow.length} movies
					</span>
				)}
			</div>

			<SortableContext
				items={cardIds}
				strategy={horizontalListSortingStrategy}>
				{moviesInRow.length > 0 ? (
					<div className="flex gap-3 overflow-x-auto scrollbar-hide pl-6 pr-12 pb-2 pt-1">
						{moviesInRow.map((movie) => (
							<DraggableCard
								key={movie.id}
								movie={movie}
								rowId={row.id}
								isDragActive={isDragActive}
								onRemove={onRemove}
							/>
						))}
					</div>
				) : (
					<EmptyDropZone
						rowId={row.id}
						isOver={isCardOver}
					/>
				)}
			</SortableContext>

			{showAddModal && (
				<AddMovieModal
					allMovies={allMovies}
					metadata={metadata}
					allUsedIds={allUsedIds}
					onAdd={(id) => onAddMovie(row.id, id)}
					onClose={() => setShowAddModal(false)}
				/>
			)}
		</div>
	);
}

function CardOverlay({ movie }) {
	const { metadata } = useMovies();
	const meta = metadata[movie.id];
	const posterSrc = meta?.posterPath ? toLocalUrl(meta.posterPath) : null;
	return (
		<div
			className="rounded-md overflow-hidden shadow-2xl ring-2 ring-[#e50914]/60"
			style={{
				width: 160,
				height: 240,
				transform: 'rotate(2deg)',
				cursor: 'grabbing',
			}}>
			{posterSrc ? (
				<img
					src={posterSrc}
					alt={movie.name}
					className="w-full h-full object-cover"
				/>
			) : (
				<div className="w-full h-full bg-[#2a2a2a] flex items-center justify-center text-xs text-gray-400 px-2 text-center">
					{meta?.title || movie.name}
				</div>
			)}
		</div>
	);
}

export default function MoviesCustomRowsSection() {
	const {
		library,
		metadata,
		customRows: storedRows,
		saveCustomRows,
	} = useMovies();
	const allMovies = library?.movies || [];
	const [rows, setRows] = useState(() => storedRows || []);
	const [activeItem, setActiveItem] = useState(null);
	const [overRowId, setOverRowId] = useState(null);
	const activeCardRowRef = useRef(null);

	const firstRender = useRef(true);
	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		saveCustomRows(rows);
	}, [rows, saveCustomRows]);

	const storedRef = useRef(storedRows);
	useEffect(() => {
		if (JSON.stringify(storedRef.current) !== JSON.stringify(storedRows)) {
			storedRef.current = storedRows;
			setRows(storedRows || []);
		}
	}, [storedRows]);

	const allUsedIds = useMemo(() => rows.flatMap((row) => row.movieIds), [rows]);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);

	const addRow = useCallback(() => {
		setRows((prev) => [
			...prev,
			{ id: uid(), title: 'New Shelf', movieIds: [] },
		]);
	}, []);

	const deleteRow = useCallback((rowId) => {
		setRows((prev) => prev.filter((row) => row.id !== rowId));
	}, []);

	const changeTitle = useCallback((rowId, title) => {
		setRows((prev) =>
			prev.map((row) => (row.id === rowId ? { ...row, title } : row)),
		);
	}, []);

	const addMovieTo = useCallback((rowId, movieId) => {
		setRows((prev) =>
			prev.map((row) => {
				if (row.id === rowId) {
					return row.movieIds.includes(movieId)
						? row
						: { ...row, movieIds: [...row.movieIds, movieId] };
				}
				return {
					...row,
					movieIds: row.movieIds.filter((id) => id !== movieId),
				};
			}),
		);
	}, []);

	const removeMovieFrom = useCallback((rowId, movieId) => {
		setRows((prev) =>
			prev.map((row) =>
				row.id === rowId
					? { ...row, movieIds: row.movieIds.filter((id) => id !== movieId) }
					: row,
			),
		);
	}, []);

	function onDragStart({ active }) {
		const data = active.data.current;
		setActiveItem({ id: active.id, ...data });
		if (data?.type === 'card') activeCardRowRef.current = data.rowId;
	}

	function onDragOver({ active, over }) {
		if (!over) {
			setOverRowId(null);
			return;
		}
		const activeData = active.data.current;
		if (activeData?.type !== 'card') return;
		const overData = over.data.current;
		let targetRowId = null;
		if (overData?.type === 'card') targetRowId = overData.rowId;
		else if (overData?.type === 'row') targetRowId = over.id;
		else if (overData?.type === 'emptyRow') targetRowId = overData.rowId;
		if (!targetRowId) return;
		setOverRowId(targetRowId);
	}

	function onDragEnd({ active, over }) {
		setActiveItem(null);
		setOverRowId(null);
		const activeData = active.data.current;

		if (activeData?.type === 'row') {
			if (!over || active.id === over.id) return;
			setRows((prev) => {
				const oldIdx = prev.findIndex((row) => row.id === active.id);
				const newIdx = prev.findIndex((row) => row.id === over.id);
				if (oldIdx === -1 || newIdx === -1) return prev;
				return arrayMove(prev, oldIdx, newIdx);
			});
			return;
		}

		if (activeData?.type === 'card') {
			if (!over) return;
			const currentRowId = activeCardRowRef.current;
			const overData = over.data.current;
			const targetRowId = overData?.rowId || null;
			const activeMovieId = activeData.movieId;
			const overMovieId = overData?.movieId;

			if (targetRowId && targetRowId !== currentRowId) {
				setRows((prev) => {
					const srcRow = prev.find((row) => row.id === currentRowId);
					const dstRow = prev.find((row) => row.id === targetRowId);
					if (!srcRow || !dstRow) return prev;
					if (dstRow.movieIds.includes(activeMovieId)) return prev;

					let newDstIds;
					if (overData?.type === 'card' && overData.rowId === targetRowId) {
						const overIdx = dstRow.movieIds.indexOf(overMovieId);
						newDstIds = [...dstRow.movieIds];
						newDstIds.splice(
							overIdx >= 0 ? overIdx : newDstIds.length,
							0,
							activeMovieId,
						);
					} else {
						newDstIds = [...dstRow.movieIds, activeMovieId];
					}

					return prev.map((row) => {
						if (row.id === currentRowId)
							return {
								...row,
								movieIds: row.movieIds.filter((id) => id !== activeMovieId),
							};
						if (row.id === targetRowId) return { ...row, movieIds: newDstIds };
						return row;
					});
				});
				activeCardRowRef.current = targetRowId;
				return;
			}

			if (overMovieId && activeMovieId !== overMovieId) {
				setRows((prev) => {
					const row = prev.find((entry) => entry.id === currentRowId);
					if (!row) return prev;
					const oldIdx = row.movieIds.indexOf(activeMovieId);
					const newIdx = row.movieIds.indexOf(overMovieId);
					if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
					return prev.map((entry) =>
						entry.id === currentRowId
							? {
									...entry,
									movieIds: arrayMove(entry.movieIds, oldIdx, newIdx),
								}
							: entry,
					);
				});
			}
		}
	}

	function onDragCancel() {
		setActiveItem(null);
		setOverRowId(null);
	}

	const activeMovie =
		activeItem?.type === 'card'
			? allMovies.find((movie) => movie.id === activeItem.movieId)
			: null;
	const isDragActive = activeItem?.type === 'card';
	const rowIds = rows.map((row) => row.id);

	if (rows.length === 0) {
		return (
			<div className="px-6 mb-8">
				<div className="border border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
					<p className="text-gray-500 text-sm">
						No custom shelves yet — organise your movies your way
					</p>
					<button
						onClick={addRow}
						className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-white text-sm font-medium border border-white/15 hover:border-white/30 transition-all">
						<PlusIcon className="w-4 h-4" />
						Create your first shelf
					</button>
				</div>
			</div>
		);
	}

	return (
		<div>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={onDragStart}
				onDragOver={onDragOver}
				onDragEnd={onDragEnd}
				onDragCancel={onDragCancel}>
				<SortableContext
					items={rowIds}
					strategy={verticalListSortingStrategy}>
					{rows.map((row) => (
						<SortableRow
							key={row.id}
							row={row}
							allMovies={allMovies}
							metadata={metadata}
							allUsedIds={allUsedIds}
							onTitleChange={changeTitle}
							onDelete={deleteRow}
							onAddMovie={addMovieTo}
							onRemove={removeMovieFrom}
							isCardOver={overRowId === row.id}
							isDragActive={isDragActive}
						/>
					))}
				</SortableContext>

				{createPortal(
					<DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
						{activeItem?.type === 'card' && activeMovie ? (
							<CardOverlay movie={activeMovie} />
						) : activeItem?.type === 'row' ? (
							<div className="flex items-center gap-2 px-4 py-2.5 bg-[#1e1e1e] border border-white/15 rounded-xl text-white font-bold text-xl shadow-2xl backdrop-blur-md cursor-grabbing">
								<GripIcon className="w-4 h-4 text-gray-400" />
								{rows.find((row) => row.id === activeItem.id)?.title || 'Row'}
							</div>
						) : null}
					</DragOverlay>,
					document.body,
				)}
			</DndContext>

			<div className="flex items-center px-6 mb-8 mt-2">
				<button
					onClick={addRow}
					className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-white/15 text-gray-500 hover:text-white hover:border-white/35 hover:bg-white/5 transition-all text-sm">
					<PlusIcon className="w-3.5 h-3.5" />
					New Shelf
				</button>
			</div>
		</div>
	);
}
