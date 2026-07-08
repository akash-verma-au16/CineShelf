const {
	app,
	BrowserWindow,
	ipcMain,
	dialog,
	shell,
	protocol,
	net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

// Loads TMDB_API_KEY (and any other secrets) from a local .env file at the
// project root. No-op if .env is absent — e.g. in a packaged production build,
// where the user's key comes from settings.json via the Settings UI instead.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// MIME types for the protocol handler
const MIME_MAP = {
	'.mkv': 'video/x-matroska',
	'.mp4': 'video/mp4',
	'.m4v': 'video/mp4',
	'.avi': 'video/x-msvideo',
	'.mov': 'video/quicktime',
	'.wmv': 'video/x-ms-wmv',
	'.ts': 'video/mp2t',
	'.m2ts': 'video/mp2t',
	'.mts': 'video/mp2t',
	'.webm': 'video/webm',
	'.ogv': 'video/ogg',
	'.flv': 'video/x-flv',
	'.3gp': 'video/3gpp',
	'.mpg': 'video/mpeg',
	'.mpeg': 'video/mpeg',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
};

const { scanLibrary } = require('./scanner');
const {
	fetchSeriesMetadata,
	safeId,
	cacheEpisodeStills,
} = require('./metadata');
const {
	getHistory,
	updateHistory,
	clearSeriesHistory,
	sanitizeHistory,
} = require('./watchHistory');
const { scanMovies } = require('./movies/moviesScanner');
const { fetchMovieMetadata } = require('./movies/moviesMetadata');
const { buildMovieSession } = require('./movies/moviesSession');
const { scanAnime } = require('./anime/animeScanner');
const { buildAnimeSession } = require('./anime/animeSession');
const { fetchAnimeMetadata } = require('./anime/animeMetadata');
const {
	launchVLC,
	getVLCPath,
	maximizeVLCWindow,
	vlcHideFromTaskbar,
	vlcEnsureVisible,
	patchVLCInputConfig,
} = require('./player');
const windowSyncDaemon = require('./windowSyncDaemon');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// NOTE: do NOT call app.disableHardwareAcceleration() here.
// Transparent BrowserWindows require GPU compositing — disabling hardware
// acceleration makes them render as a solid opaque black rectangle.

// Fix GPU process crash (exit_code=-1073740791 / STATUS_STACK_BUFFER_OVERRUN).
// This is a Windows GS stack-guard kill triggered by NVIDIA driver code running
// inside Chromium's GPU process during DirectComposition initialisation.
// --disable-direct-composition stops Chromium from initialising the DComp path
// entirely, which prevents the driver code from being invoked. Window
// transparency is unaffected: DWM handles the layered-window compositing at the
// OS level via SetLayeredWindowAttributes, independent of Chromium's DComp path.
// --use-angle=swiftshader keeps actual GL rendering on the CPU so the NVIDIA
// driver is never called for draw calls either.
// --disable-gpu-sandbox drops the sandbox from the GPU process so the process
// can fall back gracefully if any secondary path still calls into driver code.
app.commandLine.appendSwitch('disable-direct-composition');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// ── Data paths ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(app.getPath('userData'), 'CineShelf');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const POSTERS_DIR = path.join(DATA_DIR, 'posters');
const BACKDROPS_DIR = path.join(DATA_DIR, 'backdrops');
const STILLS_DIR = path.join(DATA_DIR, 'stills');

// ── Movies data paths ─────────────────────────────────────────────────────────
const MOVIES_DIR = path.join(DATA_DIR, 'movies');
const MOVIES_LIBRARY_FILE = path.join(MOVIES_DIR, 'library.json');
const MOVIES_METADATA_FILE = path.join(MOVIES_DIR, 'metadata.json');
const MOVIES_HISTORY_FILE = path.join(MOVIES_DIR, 'history.json');

// ── Anime data paths ──────────────────────────────────────────────────────────
const ANIME_DIR = path.join(DATA_DIR, 'anime');
const ANIME_LIBRARY_FILE = path.join(ANIME_DIR, 'library.json');
const ANIME_METADATA_FILE = path.join(ANIME_DIR, 'metadata.json');
const ANIME_HISTORY_FILE = path.join(ANIME_DIR, 'history.json');

// Register scheme before app is ready
protocol.registerSchemesAsPrivileged([
	{
		scheme: 'cineshelf',
		privileges: {
			secure: true,
			standard: false,
			supportFetchAPI: true,
			corsEnabled: true,
			bypassCSP: true,
			stream: true, // required for video range-request seeking
		},
	},
]);

function ensureDirs() {
	[
		DATA_DIR,
		POSTERS_DIR,
		BACKDROPS_DIR,
		STILLS_DIR,
		MOVIES_DIR,
		ANIME_DIR,
	].forEach((d) => {
		if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
	});
}

async function downloadImageDirect(url, destPath) {
	const res = await net.fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const buf = await res.arrayBuffer();
	fs.writeFileSync(destPath, Buffer.from(buf));
}

// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
	sourceDirs: ['E:\\', 'G:\\', 'D:\\Entertainment\\'],
	moviesSourceDirs: [],
	tmdbApiKey: process.env.TMDB_API_KEY || '',
	favorites: [],
	hallOfFame: [],
	highQuality: [],
	autoResume: true,
	vlcPath: '',
	vlcHttpPort: 8080,
	vlcHttpPassword: 'cineshelf',
	ahkMappings: {
		lButtonNoUi: 'play_pause',
		mButton: 'close',
		xButton1: 'seek_back_10',
		xButton2: 'seek_fwd_10',
	},
};

function loadSettings() {
	try {
		if (fs.existsSync(SETTINGS_FILE)) {
			return {
				...DEFAULT_SETTINGS,
				...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')),
			};
		}
	} catch (e) {
		console.error('Error loading settings:', e);
	}
	return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;
// Tracks the active VLC session so player:command can route to it
let activeVLCSession = null;
let overlayUiActive = false;
let overlayNativeDialogActive = false;

function syncOverlayWindowTitle() {
	if (!overlayWindow || overlayWindow.isDestroyed()) return;
	const suffixes = [];
	if (overlayUiActive) suffixes.push('[UI]');
	if (overlayNativeDialogActive) suffixes.push('[DIALOG]');
	overlayWindow.setTitle(
		suffixes.length > 0
			? `CineShelf Player ${suffixes.join(' ')}`
			: 'CineShelf Player',
	);
}

function shouldOverlayOwnFocus() {
	return !!activeVLCSession && !overlayNativeDialogActive;
}

async function withOverlayDialogFocusReleased(openDialog) {
	const windowRef =
		overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;

	overlayNativeDialogActive = true;
	syncOverlayWindowTitle();

	if (windowRef) {
		windowRef.setIgnoreMouseEvents(true);
		windowRef.setAlwaysOnTop(false);
	}

	try {
		return await openDialog(windowRef);
	} finally {
		overlayNativeDialogActive = false;
		syncOverlayWindowTitle();

		if (windowRef && !windowRef.isDestroyed()) {
			windowRef.setIgnoreMouseEvents(false);
			windowRef.setAlwaysOnTop(true, 'screen-saver');
			setImmediate(() => {
				if (!windowRef.isDestroyed() && shouldOverlayOwnFocus()) {
					windowRef.focus();
					if (activeVLCSession?.vlcPid) {
						vlcEnsureVisible(activeVLCSession.vlcPid, 0);
					}
				}
			});
		}
	}
}

/**
 * Read the overlay window's native HWND as an integer.
 * Returns 0 if the window is not available (safe to pass to vlcEnsureVisible
 * as the insert-after value — 0 = HWND_TOP).
 */
function getOverlayHwnd() {
	if (!overlayWindow || overlayWindow.isDestroyed()) return 0;
	try {
		const buf = overlayWindow.getNativeWindowHandle();
		// Buffer is 8 bytes on 64-bit Windows; HWND fits in 32 bits.
		return buf.readUInt32LE(0);
	} catch {
		return 0;
	}
}
// Overlay window sitting on top of VLC
let overlayWindow = null;
// Interval that polls screen cursor position and forwards it to the overlay renderer
let cursorPoller = null;
// Cached init data so the renderer can pull it even if the push IPC was missed
let pendingInitData = null;

function createOverlayWindow(initData) {
	// Inject persisted mouse bindings so the overlay has them from first frame.
	// The React side merges these with its own DEFAULT_MOUSE_BINDINGS fallback.
	pendingInitData = { ...initData };
	if (cursorPoller) {
		clearInterval(cursorPoller);
		cursorPoller = null;
	}
	if (overlayWindow && !overlayWindow.isDestroyed()) {
		overlayWindow.close();
	}

	const { screen } = require('electron');
	// Use full display bounds (not workAreaSize) so the overlay covers the taskbar too
	const { x, y, width, height } = screen.getPrimaryDisplay().bounds;

	// Route to the correct overlay component based on workflow
	const overlayRoute =
		initData.workflow === 'anime' ? 'anime-player-overlay' : 'player-overlay';

	overlayWindow = new BrowserWindow({
		width,
		height,
		x,
		y,
		// AHK identifies this window by title to scope its hotkeys to the player only.
		title: 'CineShelf Player',
		frame: false,
		transparent: true,
		// Required on Windows: without this Electron renders a solid black background
		// even when transparent:true is set, because DWM needs the explicit ARGB hint.
		backgroundColor: '#00000000',
		skipTaskbar: false,
		resizable: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'overlayPreload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	// Prevent document.title changes in the React page from overriding the window
	// title — AHK relies on "CineShelf Player" to scope its hotkeys.
	overlayWindow.on('page-title-updated', (e) => e.preventDefault());

	// alwaysOnTop must be set after BrowserWindow is created.
	// Do NOT call setFullScreen() — on Windows it uses a different rendering path
	// that breaks DWM transparency. Instead we manually size the window to full bounds.
	overlayWindow.setAlwaysOnTop(true, 'screen-saver');

	// Block mouse back/forward buttons from navigating the overlay page away
	// from the correct route. `will-navigate` handles full-page navigations.
	// `did-navigate-in-page` is the paranoid backstop for hash/popstate changes
	// (the React-side history guard handles these first, but this catches any
	// edge case where the guard is temporarily exhausted).
	overlayWindow.webContents.on('will-navigate', (e) => {
		e.preventDefault();
	});
	overlayWindow.webContents.on(
		'did-navigate-in-page',
		(_, url, isMainFrame) => {
			if (!isMainFrame) return;
			const encoded = encodeURIComponent('#/' + overlayRoute);
			const isCorrectRoute =
				url.includes('#/' + overlayRoute) || url.includes(encoded);
			if (!isCorrectRoute && overlayWindow && !overlayWindow.isDestroyed()) {
				// Execute in renderer: replace current history entry with the correct route
				overlayWindow.webContents
					.executeJavaScript(
						`window.history.replaceState(null,'','#/${overlayRoute}');` +
							`window.dispatchEvent(new PopStateEvent('popstate',{state:null}));`,
					)
					.catch(() => {});
			}
		},
	);

	if (isDev) {
		overlayWindow.loadURL(`http://localhost:3000/#/${overlayRoute}`);
	} else {
		overlayWindow.loadFile(path.join(__dirname, '../build/index.html'), {
			hash: '/' + overlayRoute,
		});
	}

	overlayWindow.once('ready-to-show', () => {
		// Re-assert full-display bounds immediately after show.
		// On Windows, BrowserWindow constructor bounds may not be honoured until
		// the window is actually shown (DWM quirk) — this is what causes the
		// taskbar-height gap at the bottom on first launch.
		overlayWindow.show();
		overlayWindow.setBounds({ x, y, width, height });
		// Send initial data to overlay
		overlayWindow.webContents.send('overlay:init', pendingInitData);

		// ── Focus ownership ────────────────────────────────────────────────────
		// WM_MOUSEWHEEL and WM_KEYDOWN are dispatched to the FOREGROUND window,
		// not the topmost visual window. If VLC owns focus, all scroll/keyboard
		// events go to VLC instead of the overlay, and our mouse bindings never
		// fire. We must own the foreground focus at all times during playback.
		overlayWindow.focus();

		// Blur guard: if anything steals focus (VLC settling, PowerShell momentarily
		// activating a window, etc.), immediately reclaim it. We are always fullscreen
		// so focus must stay on the overlay for the entire session.
		const reclaimFocus = () => {
			if (!overlayWindow || overlayWindow.isDestroyed()) return;
			if (!shouldOverlayOwnFocus()) return;
			setImmediate(() => {
				if (
					overlayWindow &&
					!overlayWindow.isDestroyed() &&
					shouldOverlayOwnFocus()
				) {
					overlayWindow.focus();
				}
			});
		};
		overlayWindow.on('blur', reclaimFocus);

		// VLC starts fullscreen. Re-assert alwaysOnTop after it claims z-order,
		// then disable VLC input. Run vlcHideFromTaskbar at multiple intervals
		// because VLC recreates its fullscreen renderer window progressively —
		// a single early call misses windows created after the first 200 ms.
		const hideVLC = () => {
			if (activeVLCSession?.vlcPid) vlcHideFromTaskbar(activeVLCSession.vlcPid);
		};
		setTimeout(() => {
			if (overlayWindow && !overlayWindow.isDestroyed()) {
				if (shouldOverlayOwnFocus()) {
					overlayWindow.setAlwaysOnTop(true, 'screen-saver');
					overlayWindow.focus();
				}
			}
			hideVLC();
		}, 200);
		setTimeout(hideVLC, 600);
		setTimeout(hideVLC, 1500);
		setTimeout(hideVLC, 3500);
		// ── Cursor position poller ─────────────────────────────────────────────
		// DOM mousemove is unreliable when setIgnoreMouseEvents(true,{forward:true})
		// is active on Windows, so we poll from the main process instead.
		cursorPoller = setInterval(() => {
			if (overlayWindow && !overlayWindow.isDestroyed()) {
				overlayWindow.webContents.send(
					'overlay:cursor',
					screen.getCursorScreenPoint(),
				);
			}
		}, 80);
		// ── Window Sync Daemon ────────────────────────────────────────────────
		// Attach the background singleton daemon. It bursts vlcEnsureVisible 5
		// times on attach (covering PS startup latency) then re-applies every 3 s
		// to catch any z-order drift from VLC recreating its fullscreen windows.
		if (activeVLCSession?.vlcPid) {
			windowSyncDaemon.attach({ vlcPid: activeVLCSession.vlcPid });
		}
	});

	// ── Focus sync ───────────────────────────────────────────────────────────
	// Player is always fullscreen. When overlay gains focus re-assert alwaysOnTop
	// and raise VLC to HWND_TOP behind it.
	overlayWindow.on('focus', () => {
		if (!overlayWindow || overlayWindow.isDestroyed()) return;
		if (!shouldOverlayOwnFocus()) return;
		overlayWindow.setAlwaysOnTop(true, 'screen-saver');
		if (activeVLCSession?.vlcPid) {
			vlcEnsureVisible(activeVLCSession.vlcPid, 0);
		}
	});

	// When the overlay is closed by any means (Alt+F4, our close button, etc.),
	// kill VLC immediately so no orphan VLC window is left behind.
	overlayWindow.on('close', () => {
		if (activeVLCSession) {
			const s = activeVLCSession;
			activeVLCSession = null;
			s.sendCommand('pl_stop').catch(() => {});
			try {
				s.kill();
			} catch {}
		}
	});

	overlayWindow.on('closed', () => {
		if (cursorPoller) {
			clearInterval(cursorPoller);
			cursorPoller = null;
		}
		windowSyncDaemon.detach();
		overlayWindow = null;
	});
}

function destroyOverlayWindow() {
	pendingInitData = null;
	if (cursorPoller) {
		clearInterval(cursorPoller);
		cursorPoller = null;
	}
	if (overlayWindow && !overlayWindow.isDestroyed()) {
		overlayWindow.close();
		overlayWindow = null;
	}
}

// Renderer calls this on mount to pull init data in case the push was missed
// (race: ready-to-show fires before React useEffect registers the listener).
ipcMain.handle('overlay:get-init', () => pendingInitData);

// ── AutoHotkey lifecycle ──────────────────────────────────────────────────────
// The AHK script translates mouse events to keyboard events for the overlay.
// It runs permanently in the background (Windows startup) and is also launched
// immediately on app start so no reboot is needed after first install.

const AHK_SCRIPT = path.join(__dirname, '..', 'cineshelf-overlay.ahk');

const AHK_PATHS = [
	'C:\\Program Files\\AutoHotkey\\AutoHotkey.exe',
	'C:\\Program Files\\AutoHotkey\\AutoHotkey64.exe',
	'C:\\Program Files (x86)\\AutoHotkey\\AutoHotkey.exe',
	'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe',
	'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey32.exe',
];

function findAHK() {
	return AHK_PATHS.find((p) => fs.existsSync(p)) || null;
}

function ensureAHKRunning() {
	const ahkExe = findAHK();
	if (!ahkExe) {
		console.log('[AHK] AutoHotkey not found — skipping AHK setup.');
		return;
	}
	if (!fs.existsSync(AHK_SCRIPT)) {
		console.log('[AHK] cineshelf-overlay.ahk not found — skipping.');
		return;
	}

	// ── 1. Windows startup shortcut ──────────────────────────────────────────
	// Writes a .lnk into the user's Startup folder so the AHK script runs
	// automatically on every Windows login without any manual step.
	try {
		const startupDir = path.join(
			app.getPath('appData'),
			'Microsoft',
			'Windows',
			'Start Menu',
			'Programs',
			'Startup',
		);
		const shortcutPath = path.join(startupDir, 'CineShelf-Overlay.lnk');
		if (!fs.existsSync(shortcutPath)) {
			shell.writeShortcutLink(shortcutPath, {
				target: ahkExe,
				args: `"${AHK_SCRIPT}"`,
				description: 'CineShelf Player mouse-to-keyboard bindings',
				icon: ahkExe,
				iconIndex: 0,
			});
			console.log('[AHK] Startup shortcut created:', shortcutPath);
		}
	} catch (err) {
		console.error('[AHK] Failed to create startup shortcut:', err.message);
	}

	// ── 2. Launch immediately if not already running ──────────────────────────
	// Use WMIC to inspect the full command line of running AutoHotkey processes
	// so we match on the specific script path, not just the process name.
	// This avoids the AHK "script already running" dialog that appears when a
	// second instance is spawned while the first is still alive.
	// WMIC output contains the full CommandLine column — search for our script
	// filename. If found, the correct instance is already running; skip launch.
	const scriptBasename = path.basename(AHK_SCRIPT).toLowerCase();
	const { exec } = require('child_process');
	exec(
		`wmic process where "name='AutoHotkey.exe' or name='AutoHotkey64.exe'" get CommandLine /FORMAT:LIST`,
		(err, stdout) => {
			if (err || !stdout) {
				// WMIC unavailable (e.g. stripped Windows) — fall through to spawn.
				spawnAHK(ahkExe);
				return;
			}
			const alreadyRunning = stdout.toLowerCase().includes(scriptBasename);
			if (!alreadyRunning) {
				spawnAHK(ahkExe);
			} else {
				console.log('[AHK] Script already running — skipping launch.');
			}
		},
	);
}

function spawnAHK(ahkExe) {
	try {
		const child = spawn(ahkExe, [AHK_SCRIPT], {
			detached: true,
			stdio: 'ignore',
		});
		child.unref(); // let it outlive this process
		console.log('[AHK] Launched:', ahkExe, AHK_SCRIPT);
	} catch (err) {
		console.error('[AHK] Failed to launch AHK script:', err.message);
	}
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 900,
		minWidth: 1280,
		minHeight: 720,
		backgroundColor: '#0a0a0a',
		frame: false,
		titleBarStyle: 'hidden',
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: true,
		},
	});

	mainWindow.maximize();
	mainWindow.show();

	if (isDev) {
		mainWindow.loadURL('http://localhost:3000');
	} else {
		mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
	}

	// Trigger background scan after renderer finishes loading.
	// Stills caching runs after the scan so it never races with metadata fetches.
	// Block back/forward navigation triggered by mouse buttons 3 & 4.
	// HashRouter uses pushState (not will-navigate), so this never fires for
	// normal in-app routing — only for browser-level history events.
	mainWindow.webContents.on('will-navigate', (e) => {
		e.preventDefault();
	});

	mainWindow.webContents.once('did-finish-load', () => {
		setTimeout(() => runStartupScan().then(() => runStillsCachingTask()), 2000);
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

// ── IPC: Autostart ────────────────────────────────────────────────────────────
ipcMain.handle('app:get-autostart', () => {
	if (!app.isPackaged) return false;
	return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('app:set-autostart', (_, enable) => {
	if (!app.isPackaged) {
		return {
			success: false,
			error: 'Autostart is only available in the installed app.',
		};
	}
	app.setLoginItemSettings({ openAtLogin: enable, name: 'CineShelf' });
	return { success: true };
});

// ── AHK file generation ───────────────────────────────────────────────────────
const AHK_FILE = isDev
	? path.join(app.getAppPath(), 'cineshelf-overlay.ahk')
	: path.join(DATA_DIR, 'cineshelf-overlay.ahk');

const ACTION_AHK_KEY = {
	play_pause: '{Space}',
	seek_back_10: '{Left}',
	seek_fwd_10: '{Right}',
	seek_fwd_60: '{Up}',
	seek_back_60: '{Down}',
	close: '{Escape}',
	next_ep: 'n',
	prev_ep: 'p',
	mute: 'm',
	stop: 's',
};

function generateAhkContent(mappings) {
	const m = { ...DEFAULT_SETTINGS.ahkMappings, ...mappings };

	function toKey(action) {
		return ACTION_AHK_KEY[action] || '{Space}';
	}

	function buttonLine(button, action) {
		if (!action || action === 'disabled') {
			return `${button}::  return  ; disabled`;
		}
		const padding =
			button === 'MButton' ? '   ' : button === 'XButton1' ? '  ' : '  ';
		return `${button}::${padding}Send("${toKey(action)}")  ; ${action}`;
	}

	const lNoUiBody =
		!m.lButtonNoUi || m.lButtonNoUi === 'disabled'
			? `\t\t; bare click disabled`
			: `\t\tSend("${toKey(m.lButtonNoUi)}")  ; ${m.lButtonNoUi}`;

	return `; CineShelf Player - Mouse-to-Keyboard Bindings
; AutoHotkey v2 syntax
;
; Auto-generated by CineShelf Settings. Do not edit manually.
; To apply changes, reload this script in AutoHotkey (right-click tray icon).
;
; MAPPINGS:
;   Left click  [UI panels visible]  ->  real click (React handles it)
;   Left click  [no UI visible]      ->  ${m.lButtonNoUi || 'disabled'}
;   Middle click                     ->  ${m.mButton || 'disabled'}
;   Mouse Back  (XButton1)           ->  ${m.xButton1 || 'disabled'}
;   Mouse Fwd   (XButton2)           ->  ${m.xButton2 || 'disabled'}

#Requires AutoHotkey v2.0

; Bypass flag: true while re-delivering a click so this hotkey does not
; intercept its own synthetic Click().
cineshelfPassthrough := false

#HotIf WinActive("CineShelf Player") && !cineshelfPassthrough

LButton:: {
    ; UI panels visible? Electron appends " [UI]" to the window title when any
    ; panel (title bar, controls bar, playlist sidebar) is open.
    if InStr(WinGetTitle("A"), "[UI]") {
        ; At least one panel is open \u2014 pass the click through to React.
        cineshelfPassthrough := true
        Click()
        cineshelfPassthrough := false
    } else {
        ; All panels hidden (pure video area)
${lNoUiBody}
    }
}

${buttonLine('MButton', m.mButton)}
${buttonLine('XButton1', m.xButton1)}
${buttonLine('XButton2', m.xButton2)}

#HotIf
`;
}

ipcMain.handle('ahk:save-mappings', (_, mappings) => {
	try {
		const settings = loadSettings();
		settings.ahkMappings = { ...DEFAULT_SETTINGS.ahkMappings, ...mappings };
		saveSettings(settings);
		const content = generateAhkContent(settings.ahkMappings);
		fs.writeFileSync(AHK_FILE, content, 'utf8');
		return { success: true, ahkPath: AHK_FILE };
	} catch (e) {
		return { success: false, error: e.message };
	}
});

ipcMain.handle('ahk:get-path', () => AHK_FILE);

// ── Startup background scan ───────────────────────────────────────────────────
async function runStartupScan() {
	const settings = loadSettings();
	const dirs = settings.sourceDirs || [];
	if (!dirs.length) return;

	try {
		const accessibleDirs = dirs.filter((d) => {
			try {
				return fs.existsSync(d);
			} catch {
				return false;
			}
		});
		const inaccessibleDirs = dirs.filter((d) => !accessibleDirs.includes(d));

		// Load existing library
		let existingLibrary = null;
		if (fs.existsSync(LIBRARY_FILE)) {
			try {
				existingLibrary = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
			} catch {}
		}

		if (!accessibleDirs.length) {
			// No accessible dirs — just mark existing series unavailable and notify
			if (existingLibrary?.series) {
				const marked = {
					...existingLibrary,
					series: existingLibrary.series.map((s) => ({
						...s,
						unavailable: true,
					})),
				};
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('library:updated', marked);
				}
			}
			return;
		}

		// Scan accessible dirs
		const freshScan = await scanLibrary(accessibleDirs);

		// Preserve series from inaccessible dirs
		if (existingLibrary?.series && inaccessibleDirs.length > 0) {
			const freshIds = new Set(freshScan.series.map((s) => s.id));
			const preserved = existingLibrary.series
				.filter((s) =>
					inaccessibleDirs.some(
						(d) =>
							s.sourceDir &&
							s.sourceDir.toLowerCase().startsWith(d.toLowerCase()),
					),
				)
				.filter((s) => !freshIds.has(s.id))
				.map((s) => ({ ...s, unavailable: true }));

			if (preserved.length > 0) {
				freshScan.series = [...freshScan.series, ...preserved].sort((a, b) =>
					a.name.localeCompare(b.name),
				);
				freshScan.totalSeries = freshScan.series.length;
			}
		}

		fs.writeFileSync(LIBRARY_FILE, JSON.stringify(freshScan, null, 2));

		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('library:updated', freshScan);
		}

		// Auto-fetch metadata for new series that have no metadata yet
		if (settings.tmdbApiKey) {
			let existingMeta = {};
			if (fs.existsSync(METADATA_FILE)) {
				try {
					existingMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
				} catch {}
			}

			const needsMeta = freshScan.series.filter(
				(s) =>
					!s.unavailable &&
					(!existingMeta[s.id]?.tmdbId || !existingMeta[s.id]?.seasons),
			);

			for (const series of needsMeta) {
				try {
					const meta = await fetchSeriesMetadata(
						series.name,
						settings.tmdbApiKey,
						POSTERS_DIR,
						BACKDROPS_DIR,
					);
					// Re-read to avoid clobbering concurrent writes
					let allMeta = {};
					if (fs.existsSync(METADATA_FILE)) {
						try {
							allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
						} catch {}
					}
					allMeta[series.id] = { ...meta, id: series.id };
					fs.writeFileSync(METADATA_FILE, JSON.stringify(allMeta, null, 2));

					if (mainWindow && !mainWindow.isDestroyed()) {
						mainWindow.webContents.send('metadata:patched', allMeta[series.id]);
					}
				} catch (err) {
					console.error(
						`Startup metadata fetch error for ${series.name}:`,
						err.message,
					);
				}
			}
		}
	} catch (err) {
		console.error('Startup scan error:', err);
	}
}

// ── Background stills caching task ─────────────────────────────────────────
// Guard against concurrent invocations (e.g. automatic + manual trigger overlap)
let stillsCachingRunning = false;

async function runStillsCachingTask() {
	if (stillsCachingRunning) {
		console.log('[Stills] Already running — skipping duplicate invocation.');
		return { success: false, error: 'already_running' };
	}

	if (!net.isOnline()) {
		console.log('[Stills] Offline — skipping stills caching task.');
		return { success: false, error: 'offline' };
	}

	let allMeta = {};
	try {
		if (fs.existsSync(METADATA_FILE)) {
			allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
		}
	} catch (e) {
		console.error('[Stills] Could not read metadata.json:', e.message);
		return { success: false, error: e.message };
	}

	// Count how many stills need downloading before we start
	let missing = 0;
	for (const meta of Object.values(allMeta)) {
		if (!meta?.episodes) continue;
		for (const ep of Object.values(meta.episodes)) {
			if (
				ep.stillUrl &&
				(!ep.stillLocalPath || !fs.existsSync(ep.stillLocalPath))
			) {
				missing++;
			}
		}
	}

	if (missing === 0) {
		console.log('[Stills] All episode stills already cached — nothing to do.');
		return { success: true, total: 0, downloaded: 0, skipped: 0, failed: 0 };
	}

	console.log(
		`[Stills] Starting background stills caching — ${missing} stills to download.`,
	);
	stillsCachingRunning = true;

	try {
		const stats = await cacheEpisodeStills(
			allMeta,
			STILLS_DIR,
			(seriesId, updatedMeta) => {
				// Persist incrementally after each series so progress survives a restart
				try {
					let currentMeta = {};
					if (fs.existsSync(METADATA_FILE)) {
						currentMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
					}
					currentMeta[seriesId] = updatedMeta;
					fs.writeFileSync(METADATA_FILE, JSON.stringify(currentMeta, null, 2));
					if (mainWindow && !mainWindow.isDestroyed()) {
						mainWindow.webContents.send('metadata:patched', updatedMeta);
					}
				} catch (err) {
					console.error(
						`[Stills] Error saving stills for ${seriesId}:`,
						err.message,
					);
				}
			},
		);

		console.log(
			`[Stills] Done — downloaded: ${stats.downloaded}, skipped: ${stats.skipped}, failed: ${stats.failed} (of ${stats.total} total).`,
		);

		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('metadata:stills-cached', stats);
		}

		return { success: true, ...stats };
	} finally {
		stillsCachingRunning = false;
	}
}

app.whenReady().then(async () => {
	ensureDirs();

	// Repair any history entries that had fields stripped by the old
	// partial-overwrite bug. Cross-references the library to fill in
	// missing seriesId / season / episode / filePath. No-op when clean.
	try {
		const lib = fs.existsSync(LIBRARY_FILE)
			? JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'))
			: null;
		if (lib) sanitizeHistory(HISTORY_FILE, lib);
	} catch (e) {
		console.error('[Startup] History sanitize error:', e.message);
	}

	// Permanently clear VLC's own mouse hotkeys on every app start.
	// This is the last line of defence: even if EnableWindow(FALSE) somehow
	// fails to fully block mouse messages, VLC itself has no actions bound to
	// any mouse input, so it can never steal focus, toggle fullscreen, or
	// change volume on its own.
	patchVLCInputConfig();

	// Ensure the CineShelf AHK script is running and wired into Windows startup.
	ensureAHKRunning();

	// Serve local files (images + video) via cineshelf:/// protocol.
	// Uses triple-slash so the Windows drive letter (e.g. "C:") is placed in
	// the URL *path*, not the *authority* — Chromium would mangle "cineshelf://C:"
	// by treating "C" as the hostname and dropping the colon.
	protocol.handle('cineshelf', async (request) => {
		try {
			// URL looks like: cineshelf:///C:/path/to/file
			// Slice off 'cineshelf:///' (12 chars) to get: C:/path/to/file
			const rawPath = request.url.slice('cineshelf:///'.length);
			// Decode each segment individually so e.g. %20 → space
			const decoded = rawPath
				.split('/')
				.map((s) => decodeURIComponent(s))
				.join('/');
			const filePath = path.normalize(decoded);
			// pathToFileURL correctly handles spaces, Unicode, etc.
			const fileUrl = pathToFileURL(filePath).toString();
			const fetchOpts = {};
			const range = request.headers.get('range');
			if (range) fetchOpts.headers = { Range: range };
			const resp = await net.fetch(fileUrl, fetchOpts);
			// Patch MIME type so Chromium doesn't reject e.g. .mkv as octet-stream
			const ext = path.extname(filePath).toLowerCase();
			const mime = MIME_MAP[ext];
			if (mime && resp.headers.get('content-type')?.includes('octet-stream')) {
				const headers = new Headers(resp.headers);
				headers.set('content-type', mime);
				return new Response(resp.body, { status: resp.status, headers });
			}
			return resp;
		} catch (e) {
			console.error('Protocol handler error:', e.message);
			return new Response('', { status: 404 });
		}
	});

	createWindow();
	// Start the window sync daemon immediately so it is alive before any player
	// session opens. It idles with zero overhead until daemon.attach() is called.
	windowSyncDaemon.start();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		windowSyncDaemon.stop();
		app.quit();
	}
});

// ── IPC: Settings ─────────────────────────────────────────────────────────────
ipcMain.handle('app:get-settings', () => loadSettings());

ipcMain.handle('app:save-settings', (_, settings) => {
	saveSettings({ ...loadSettings(), ...settings });
	return { success: true };
});

// ── IPC: Dialog ───────────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-dir', async () => {
	const result = await dialog.showOpenDialog(mainWindow, {
		properties: ['openDirectory'],
		title: 'Select Media Source Directory',
	});
	return result.canceled ? null : result.filePaths[0];
});

// ── IPC: Library ──────────────────────────────────────────────────────────────
ipcMain.handle('library:scan', async (_, sourceDirs) => {
	try {
		// Separate accessible vs inaccessible dirs
		const accessibleDirs = (sourceDirs || []).filter((d) => {
			try {
				return fs.existsSync(d);
			} catch {
				return false;
			}
		});
		const inaccessibleDirs = (sourceDirs || []).filter(
			(d) => !accessibleDirs.includes(d),
		);

		// Scan only accessible dirs
		const freshScan = await scanLibrary(accessibleDirs);

		// Load existing library to preserve series from disconnected drives
		let existingLibrary = null;
		if (fs.existsSync(LIBRARY_FILE)) {
			try {
				existingLibrary = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
			} catch {}
		}

		if (existingLibrary?.series && inaccessibleDirs.length > 0) {
			const freshIds = new Set(freshScan.series.map((s) => s.id));
			const preserved = existingLibrary.series
				.filter((s) =>
					inaccessibleDirs.some(
						(d) =>
							s.sourceDir &&
							s.sourceDir.toLowerCase().startsWith(d.toLowerCase()),
					),
				)
				.filter((s) => !freshIds.has(s.id))
				.map((s) => ({ ...s, unavailable: true }));

			if (preserved.length > 0) {
				freshScan.series = [...freshScan.series, ...preserved].sort((a, b) =>
					a.name.localeCompare(b.name),
				);
				freshScan.totalSeries = freshScan.series.length;
			}
		}

		fs.writeFileSync(LIBRARY_FILE, JSON.stringify(freshScan, null, 2));
		return {
			success: true,
			library: freshScan,
			inaccessibleDirs:
				inaccessibleDirs.length > 0 ? inaccessibleDirs : undefined,
		};
	} catch (err) {
		console.error('Scan error:', err);
		return { success: false, error: err.message };
	}
});

ipcMain.handle('library:get', () => {
	try {
		if (fs.existsSync(LIBRARY_FILE)) {
			const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
			// Dynamically mark series as unavailable when their source dir is inaccessible
			if (library.series) {
				const dirCache = new Map();
				library.series = library.series.map((s) => {
					if (!s.sourceDir) return s;
					const key = s.sourceDir.toLowerCase();
					if (!dirCache.has(key)) {
						dirCache.set(key, !fs.existsSync(s.sourceDir));
					}
					const unavailable = dirCache.get(key);
					return unavailable
						? { ...s, unavailable: true }
						: { ...s, unavailable: false };
				});
			}
			return library;
		}
	} catch (e) {
		console.error('Error reading library:', e);
	}
	return null;
});

// ── IPC: Metadata ─────────────────────────────────────────────────────────────
ipcMain.handle('metadata:get-all', () => {
	try {
		if (fs.existsSync(METADATA_FILE)) {
			return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
		}
	} catch (e) {
		console.error('Error reading metadata:', e);
	}
	return {};
});

ipcMain.handle(
	'metadata:fetch-series',
	async (_, { seriesId, seriesName, apiKey }) => {
		try {
			const meta = await fetchSeriesMetadata(
				seriesName,
				apiKey,
				POSTERS_DIR,
				BACKDROPS_DIR,
			);
			let allMeta = {};
			if (fs.existsSync(METADATA_FILE)) {
				allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
			}
			allMeta[seriesId] = { ...meta, id: seriesId };
			fs.writeFileSync(METADATA_FILE, JSON.stringify(allMeta, null, 2));
			return { success: true, metadata: allMeta[seriesId] };
		} catch (err) {
			console.error('Metadata fetch error:', err);
			return { success: false, error: err.message };
		}
	},
);

// ── IPC: History ──────────────────────────────────────────────────────────────
ipcMain.handle('history:get', () => getHistory(HISTORY_FILE));

ipcMain.handle('history:update', (_, entry) => {
	updateHistory(HISTORY_FILE, entry);
	return { success: true };
});

ipcMain.handle('history:mark-watched', (_, { key, duration }) => {
	updateHistory(HISTORY_FILE, {
		key,
		position: duration || 0,
		duration: duration || 0,
		completed: true,
		lastWatched: new Date().toISOString(),
	});
	return { success: true };
});

ipcMain.handle('history:clear-series', (_, seriesId) => {
	const updated = clearSeriesHistory(HISTORY_FILE, seriesId);
	return { success: true, history: updated };
});

ipcMain.handle('history:clear-season', (_, { seriesId, season }) => {
	try {
		const history = getHistory(HISTORY_FILE);
		const updated = {};
		for (const [key, entry] of Object.entries(history)) {
			if (!(entry?.seriesId === seriesId && entry?.season === season)) {
				updated[key] = entry;
			}
		}
		fs.writeFileSync(HISTORY_FILE, JSON.stringify(updated, null, 2));
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('history:batch-update', (_, entries) => {
	try {
		if (!Array.isArray(entries))
			return { success: false, error: 'Not an array' };
		const history = getHistory(HISTORY_FILE);
		for (const entry of entries) {
			if (!entry?.key) continue;
			history[entry.key] = { ...(history[entry.key] || {}), ...entry };
		}
		fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

// ── IPC: Tags / Favorites ─────────────────────────────────────────────────────
ipcMain.handle('settings:toggle-favorite', (_, seriesId) => {
	const s = loadSettings();
	const idx = s.favorites.indexOf(seriesId);
	if (idx >= 0) s.favorites.splice(idx, 1);
	else s.favorites.push(seriesId);
	saveSettings(s);
	return s.favorites;
});

ipcMain.handle('settings:toggle-hall-of-fame', (_, seriesId) => {
	const s = loadSettings();
	const idx = s.hallOfFame.indexOf(seriesId);
	if (idx >= 0) s.hallOfFame.splice(idx, 1);
	else s.hallOfFame.push(seriesId);
	saveSettings(s);
	return s.hallOfFame;
});

ipcMain.handle('settings:toggle-high-quality', (_, seriesId) => {
	const s = loadSettings();
	const idx = s.highQuality.indexOf(seriesId);
	if (idx >= 0) s.highQuality.splice(idx, 1);
	else s.highQuality.push(seriesId);
	saveSettings(s);
	return s.highQuality;
});

// ── IPC: Window controls ──────────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
	if (mainWindow?.isMaximized()) mainWindow.unmaximize();
	else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:fullscreen', () => {
	mainWindow?.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.handle(
	'window:is-fullscreen',
	() => mainWindow?.isFullScreen() ?? false,
);

// ── IPC: Misc ─────────────────────────────────────────────────────────────────

// Open the file with whatever the system default app is (e.g. VLC, MPC, WMP)
ipcMain.handle('shell:open-path', async (_, filePath) => {
	if (!filePath) return;
	try {
		const err = await shell.openPath(filePath);
		if (err) {
			// Fallback: use Windows 'start' command which always respects file associations
			spawn('cmd', ['/c', 'start', '', filePath], {
				detached: true,
				shell: false,
			});
		}
	} catch (e) {
		// Last resort fallback
		spawn('cmd', ['/c', 'start', '', filePath], {
			detached: true,
			shell: false,
		});
	}
});

// Show the file highlighted in Explorer
ipcMain.handle('shell:show-in-folder', (_, filePath) => {
	if (filePath) shell.showItemInFolder(filePath);
});

// Probe a video file — returns codec info without ffprobe dependency
// Uses basic byte-sniffing to detect common problem codecs
ipcMain.handle('video:probe', (_, filePath) => {
	try {
		if (!fs.existsSync(filePath)) return { error: 'File not found' };
		const ext = path.extname(filePath).toLowerCase();
		const stat = fs.statSync(filePath);
		// Read first 64KB to sniff codec signatures
		const fd = fs.openSync(filePath, 'r');
		const buf = Buffer.alloc(65536);
		fs.readSync(fd, buf, 0, 65536, 0);
		fs.closeSync(fd);
		const hex = buf.toString('hex', 0, 16);
		// HEVC/H.265 NAL unit type 32/33 in Annex B starts with 00 00 00 01 28 or 4e
		// In MKV, look for HEVC codec ID string: 'V_MPEGH/ISO/HEVC'
		const bufStr = buf.toString('latin1');
		const isHEVC =
			bufStr.includes('V_MPEGH/ISO/HEVC') ||
			bufStr.includes('hev1') ||
			bufStr.includes('hvc1');
		const isAV1 = bufStr.includes('V_AV1') || bufStr.includes('av01');
		const isVP9 = bufStr.includes('V_VP9');
		const isDTS = bufStr.includes('A_DTS');
		const isAC3 = bufStr.includes('A_AC3') || bufStr.includes('A_EAC3');
		const isTrueHD = bufStr.includes('A_TRUEHD');
		const isH264 =
			bufStr.includes('V_MPEG4/ISO/AVC') || bufStr.includes('avc1');
		// Determine if Chromium can likely play it
		// Chromium can play: H.264+AAC/MP3, VP8/VP9, AV1 in MKV/MP4/WebM
		// Chromium CANNOT play: HEVC (on Windows without widevine CDM), DTS, AC3, TrueHD
		const problematic = [];
		if (isHEVC) problematic.push('H.265/HEVC video');
		if (isDTS) problematic.push('DTS audio');
		if (isAC3) problematic.push('AC3/E-AC3 audio');
		if (isTrueHD) problematic.push('TrueHD audio');
		return {
			ext,
			size: stat.size,
			codecs: { isHEVC, isAV1, isVP9, isDTS, isAC3, isTrueHD, isH264 },
			likelyPlayable: problematic.length === 0,
			problematic,
		};
	} catch (e) {
		return { error: e.message };
	}
});

ipcMain.handle('fs:get-data-dir', () => DATA_DIR);

// ── IPC: Data editing ─────────────────────────────────────────────────────────

ipcMain.handle('data:patch-metadata-entry', (_, { id, updates }) => {
	try {
		let allMeta = {};
		if (fs.existsSync(METADATA_FILE)) {
			allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
		}
		allMeta[id] = { ...(allMeta[id] || {}), ...updates, id };
		fs.writeFileSync(METADATA_FILE, JSON.stringify(allMeta, null, 2));
		return { success: true, metadata: allMeta[id] };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('data:save-history-entry', (_, entry) => {
	try {
		if (!entry?.key) return { success: false, error: 'No key provided' };
		const history = getHistory(HISTORY_FILE);
		history[entry.key] = { ...(history[entry.key] || {}), ...entry };
		fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('data:delete-history-entry', (_, key) => {
	try {
		const history = getHistory(HISTORY_FILE);
		delete history[key];
		fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('data:get-info', () => {
	const files = [
		{ name: 'settings.json', label: 'Settings', path: SETTINGS_FILE },
		{ name: 'library.json', label: 'Library Index', path: LIBRARY_FILE },
		{ name: 'metadata.json', label: 'Metadata Cache', path: METADATA_FILE },
		{ name: 'history.json', label: 'Watch History', path: HISTORY_FILE },
	];
	const posterCount = fs.existsSync(POSTERS_DIR)
		? fs.readdirSync(POSTERS_DIR).filter((f) => !f.endsWith('.tmp')).length
		: 0;
	const backdropCount = fs.existsSync(BACKDROPS_DIR)
		? fs.readdirSync(BACKDROPS_DIR).filter((f) => !f.endsWith('.tmp')).length
		: 0;
	const stillsCount = fs.existsSync(STILLS_DIR)
		? fs.readdirSync(STILLS_DIR).filter((f) => !f.endsWith('.tmp')).length
		: 0;
	return {
		dataDir: DATA_DIR,
		postersDir: POSTERS_DIR,
		backdropsDir: BACKDROPS_DIR,
		stillsDir: STILLS_DIR,
		posterCount,
		backdropCount,
		stillsCount,
		files: files.map((f) => {
			let size = 0,
				exists = false,
				modified = null;
			try {
				if (fs.existsSync(f.path)) {
					const stat = fs.statSync(f.path);
					size = stat.size;
					modified = stat.mtime.toISOString();
					exists = true;
				}
			} catch {}
			return {
				name: f.name,
				label: f.label,
				path: f.path,
				size,
				exists,
				modified,
			};
		}),
	};
});

// ── IPC: Stills caching ─────────────────────────────────────────────────────
ipcMain.handle('metadata:cache-stills', () => runStillsCachingTask());

// ── IPC: Image management ─────────────────────────────────────────────────────

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

ipcMain.handle(
	'metadata:fetch-image-alternatives',
	async (_, { tmdbId, seasonNumber, apiKey, seriesId }) => {
		try {
			let backdrops = [];
			let posters = [];
			let stills = [];

			if (seasonNumber === null || seasonNumber === undefined) {
				const res = await net.fetch(
					`${TMDB_API}/tv/${tmdbId}/images?api_key=${apiKey}&include_image_language=en,null`,
				);
				const data = await res.json();
				backdrops = (data.backdrops || [])
					.filter((b) => b.file_path)
					.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
					.slice(0, 20)
					.map((b) => ({
						url: `${TMDB_IMG}/w1280${b.file_path}`,
						thumb: `${TMDB_IMG}/w300${b.file_path}`,
						vote: b.vote_average,
					}));
				posters = (data.posters || [])
					.filter((p) => p.file_path)
					.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
					.slice(0, 20)
					.map((p) => ({
						url: `${TMDB_IMG}/w500${p.file_path}`,
						thumb: `${TMDB_IMG}/w154${p.file_path}`,
						vote: p.vote_average,
					}));
			} else {
				const res = await net.fetch(
					`${TMDB_API}/tv/${tmdbId}/season/${seasonNumber}/images?api_key=${apiKey}&include_image_language=en,null`,
				);
				const data = await res.json();
				backdrops = (data.backdrops || [])
					.filter((b) => b.file_path)
					.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
					.slice(0, 12)
					.map((b) => ({
						url: `${TMDB_IMG}/w1280${b.file_path}`,
						thumb: `${TMDB_IMG}/w300${b.file_path}`,
						vote: b.vote_average,
					}));
				posters = (data.posters || [])
					.filter((p) => p.file_path)
					.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
					.slice(0, 12)
					.map((p) => ({
						url: `${TMDB_IMG}/w500${p.file_path}`,
						thumb: `${TMDB_IMG}/w154${p.file_path}`,
						vote: p.vote_average,
					}));
				if (seriesId) {
					let allMeta = {};
					if (fs.existsSync(METADATA_FILE)) {
						try {
							allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
						} catch {}
					}
					const m = allMeta[seriesId];
					if (m?.episodes) {
						stills = Object.entries(m.episodes)
							.filter(
								([key, ep]) =>
									key.startsWith(`${seasonNumber}-`) && ep.stillUrl,
							)
							.map(([key, ep]) => ({
								url: ep.stillUrl.replace('/w300/', '/w780/'),
								thumb: ep.stillUrl,
								epNum: parseInt(key.split('-')[1], 10),
								label: `E${String(parseInt(key.split('-')[1], 10)).padStart(2, '0')} — ${ep.title || ''}`,
							}))
							.sort((a, b) => a.epNum - b.epNum);
					}
				}
			}
			return { success: true, backdrops, posters, stills };
		} catch (err) {
			return {
				success: false,
				error: err.message,
				backdrops: [],
				posters: [],
				stills: [],
			};
		}
	},
);

ipcMain.handle(
	'metadata:set-image',
	async (_, { seriesId, seasonNumber, imageType, imageUrl }) => {
		try {
			let allMeta = {};
			if (fs.existsSync(METADATA_FILE)) {
				allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
			}
			const m = allMeta[seriesId];
			if (!m) return { success: false, error: 'Series not found in metadata' };
			const sid = safeId(m.title || seriesId);
			let destPath;
			if (seasonNumber === null || seasonNumber === undefined) {
				destPath =
					imageType === 'poster'
						? path.join(POSTERS_DIR, `${sid}.jpg`)
						: path.join(BACKDROPS_DIR, `${sid}.jpg`);
			} else {
				destPath =
					imageType === 'poster'
						? path.join(POSTERS_DIR, `${sid}_s${seasonNumber}.jpg`)
						: path.join(BACKDROPS_DIR, `${sid}_s${seasonNumber}.jpg`);
			}
			await downloadImageDirect(imageUrl, destPath);
			if (seasonNumber === null || seasonNumber === undefined) {
				if (imageType === 'poster') m.posterPath = destPath;
				else m.backdropPath = destPath;
			} else {
				if (!m.seasons) m.seasons = {};
				const sk = String(seasonNumber);
				if (!m.seasons[sk]) m.seasons[sk] = {};
				if (imageType === 'poster') m.seasons[sk].posterPath = destPath;
				else m.seasons[sk].backdropPath = destPath;
			}
			allMeta[seriesId] = m;
			fs.writeFileSync(METADATA_FILE, JSON.stringify(allMeta, null, 2));
			return { success: true, metadata: allMeta[seriesId] };
		} catch (err) {
			return { success: false, error: err.message };
		}
	},
);

// ── IPC: File system browsing & renaming ─────────────────────────────────────

ipcMain.handle('fs:list-dir', (_, dirPath) => {
	try {
		if (!fs.existsSync(dirPath))
			return { success: false, error: 'Path does not exist' };
		const stat = fs.statSync(dirPath);
		if (!stat.isDirectory())
			return { success: false, error: 'Not a directory' };
		const entries = fs.readdirSync(dirPath, { withFileTypes: true });
		const items = entries
			.map((entry) => {
				const fullPath = path.join(dirPath, entry.name);
				let size = 0,
					modifiedAt = null;
				try {
					const s = fs.statSync(fullPath);
					size = s.size;
					modifiedAt = s.mtime.toISOString();
				} catch {}
				return {
					name: entry.name,
					path: fullPath,
					isDirectory: entry.isDirectory(),
					size,
					modifiedAt,
				};
			})
			.sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
				return a.name.localeCompare(b.name, undefined, {
					numeric: true,
					sensitivity: 'base',
				});
			});
		return { success: true, items };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('fs:rename-item', (_, { oldPath, newName }) => {
	try {
		if (!fs.existsSync(oldPath))
			return { success: false, error: 'Source not found' };
		const parentDir = path.dirname(oldPath);
		const newPath = path.join(parentDir, newName);
		if (fs.existsSync(newPath))
			return {
				success: false,
				error: 'A file or folder with that name already exists',
			};
		fs.renameSync(oldPath, newPath);
		return { success: true, newPath };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

// ── IPC: External player (VLC) ─────────────────────────────────────────────────

ipcMain.handle('player:check', () => {
	const settings = loadSettings();
	const found = getVLCPath(settings.vlcPath);
	return { found: !!found, path: found };
});

ipcMain.handle(
	'player:launch',
	async (
		event,
		{ filePath, seekSeconds, episodeId, seriesId, season, episode },
	) => {
		// Check file exists before launching — handles disconnected external drives
		if (!fs.existsSync(filePath)) {
			const driveMatch = filePath.match(/^([A-Za-z]:[/\\])/);
			const driveHint = driveMatch
				? ` Drive ${driveMatch[1].toUpperCase()} may not be connected.`
				: '';
			return {
				success: false,
				error: `File not found.${driveHint} Please reconnect your external drive and try again.`,
			};
		}

		const settings = loadSettings();
		try {
			// TMDB runtime hint — used as duration fallback until VLC reports it
			let durationHint = 0;

			// Build full series data for the overlay playlist: all seasons → episodes
			// enriched with metadata (title, runtime, still image).
			// VLC only plays ONE file at a time — React drives all episode navigation.
			let seriesNameStr = '';
			let allSeasonsData = []; // [{ season, episodes: [{...}] }]
			try {
				let library = null;
				let allMeta = {};
				if (fs.existsSync(LIBRARY_FILE)) {
					library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
				}
				if (fs.existsSync(METADATA_FILE)) {
					allMeta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
				}
				const seriesMeta = allMeta[seriesId] || {};
				seriesNameStr = seriesMeta.title || '';

				// Runtime hint for current episode
				const curRuntime =
					seriesMeta?.episodes?.[`${season}-${episode}`]?.runtime;
				if (curRuntime) durationHint = curRuntime * 60;

				const serLib = library?.series?.find((s) => s.id === seriesId);
				if (serLib?.seasons) {
					allSeasonsData = serLib.seasons
						.slice()
						.sort((a, b) => a.number - b.number)
						.map((s) => ({
							season: s.number,
							episodes: (s.episodes || [])
								.slice()
								.sort((a, b) => a.episode - b.episode)
								.map((ep) => {
									const epMeta =
										seriesMeta?.episodes?.[`${ep.season}-${ep.episode}`] || {};
									return {
										episodeId: ep.id,
										filePath: ep.filePath,
										seriesId,
										season: ep.season,
										episode: ep.episode,
										title: epMeta.title || `Episode ${ep.episode}`,
										duration: epMeta.runtime ? epMeta.runtime * 60 : 0,
										overview: epMeta.overview || '',
										stillPath: epMeta.stillLocalPath || null,
										stillUrl: epMeta.stillUrl || null,
									};
								}),
						}));
				}
			} catch (e) {
				console.error('[player:launch] Series data build error:', e.message);
			}

			const startVLC = async (fp, epInfo, seek) => {
				return launchVLC({
					filePath: fp,
					episodeInfo: epInfo,
					vlcPath: settings.vlcPath,
					seekSeconds: seek || 0,
					httpPort: settings.vlcHttpPort || 8080,
					httpPassword: settings.vlcHttpPassword || 'cineshelf',
					onPositionUpdate: ({ position, duration, state, volume }) => {
						const update = {
							position,
							duration: duration || durationHint,
							state,
							episodeId: epInfo.episodeId,
							seriesId: epInfo.seriesId,
							season: epInfo.season,
							episode: epInfo.episode,
							volume,
						};
						if (mainWindow && !mainWindow.isDestroyed()) {
							mainWindow.webContents.send('player:position-update', update);
						}
						if (overlayWindow && !overlayWindow.isDestroyed()) {
							overlayWindow.webContents.send('overlay:state', update);
						}
					},
					onProgressSave: (position, duration) => {
						try {
							const dur = duration || durationHint;
							const completed = dur > 0 && position / dur >= 0.9;
							updateHistory(HISTORY_FILE, {
								key: epInfo.episodeId,
								seriesId: epInfo.seriesId,
								season: epInfo.season,
								episode: epInfo.episode,
								position: Math.floor(position),
								duration: Math.floor(dur),
								completed,
								lastWatched: new Date().toISOString(),
							});
						} catch (err) {
							console.error('[VLC] Mid-session save error:', err.message);
						}
					},
				});
			};

			const epInfo = { episodeId, seriesId, season, episode };
			const result = await startVLC(filePath, epInfo, seekSeconds);

			if (result.error) {
				return { success: false, error: result.error };
			}

			// Store session so player:command IPC can send commands to active VLC
			activeVLCSession = result;

			createOverlayWindow({
				currentEpisodeId: episodeId,
				seriesId,
				seriesName: seriesNameStr,
				season,
				allSeasons: allSeasonsData,
				history: getHistory(HISTORY_FILE),
			});

			// Wait for VLC to close, then do final history save and notify renderer.
			// Since VLC only plays one file at a time, all episode IDs come from epInfo.
			// The exited promise carries the final position/duration VLC reported.
			// NOTE: overlay:play-episode kills VLC early for episode switches — in that
			// case VLC closes naturally and we just write whatever position it had.
			result.exited.then(({ position, duration, action, error }) => {
				activeVLCSession = null;
				windowSyncDaemon.detach();
				destroyOverlayWindow();

				const finalPos = Math.floor(position || 0);
				const finalDur = Math.floor(duration || durationHint);

				// Final authoritative history write
				try {
					const completed = finalDur > 0 && finalPos / finalDur >= 0.9;
					updateHistory(HISTORY_FILE, {
						key: epInfo.episodeId,
						seriesId: epInfo.seriesId,
						season: epInfo.season,
						episode: epInfo.episode,
						position: finalPos,
						duration: finalDur,
						completed,
						lastWatched: new Date().toISOString(),
					});
				} catch (err) {
					console.error('[VLC] Final save error:', err.message);
				}

				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('player:closed', {
						episodeId: epInfo.episodeId,
						seriesId: epInfo.seriesId,
						season: epInfo.season,
						episode: epInfo.episode,
						position: finalPos,
						duration: finalDur,
						action,
						error,
					});
				}
			});

			return { success: true, sessionId: result.sessionId };
		} catch (err) {
			return { success: false, error: err.message };
		}
	},
);

// Send a command to the currently active VLC session (play/pause, seek, next, etc.)
ipcMain.handle('player:command', async (_, { cmd, val }) => {
	if (!activeVLCSession?.sendCommand) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.sendCommand(cmd, val);
});

// ── IPC: Overlay episode switch ───────────────────────────────────────────────
// Injects the new file into the running VLC session via in_enqueue + pl_play&id=N.
// VLC is NEVER killed or relaunched during an episode switch.
ipcMain.handle(
	'overlay:play-episode',
	async (
		_,
		{
			episodeId: newEpId,
			filePath: newFilePath,
			seriesId: newSeriesId,
			season: newSeason,
			episode: newEpisode,
			seekSeconds: newSeek,
			prevPosition,
			prevDuration,
			prevEpisodeId,
		},
	) => {
		// ── 1. Save history for the episode that was just playing ─────────────
		if (prevEpisodeId && prevPosition !== undefined) {
			try {
				const dur = prevDuration || 0;
				const completed = dur > 0 && prevPosition / dur >= 0.9;
				updateHistory(HISTORY_FILE, {
					key: prevEpisodeId,
					position: Math.floor(prevPosition),
					duration: Math.floor(dur),
					completed,
					lastWatched: new Date().toISOString(),
				});
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('player:position-update', {
						episodeId: prevEpisodeId,
						position: Math.floor(prevPosition),
						duration: Math.floor(dur),
						completed,
					});
				}
			} catch (e) {
				console.error('[overlay:play-episode] History save error:', e.message);
			}
		}

		// ── 2. Inject into running VLC session — never kill it ────────────────
		if (!activeVLCSession) {
			return { success: false, error: 'No active VLC session' };
		}

		const resolvedSeek =
			typeof newSeek === 'number' && Number.isFinite(newSeek) ? newSeek : 0;

		const result = await activeVLCSession.enqueueAndPlay(
			newFilePath,
			{
				episodeId: newEpId,
				seriesId: newSeriesId,
				season: newSeason,
				episode: newEpisode,
			},
			resolvedSeek,
		);

		if (result.success) {
			// Force an explicit reset seek for non-resume switches so VLC doesn't
			// carry over the previous episode timestamp.
			if (resolvedSeek <= 0) {
				await activeVLCSession.sendCommand('seek', 0);
			}

			// VLC drops fullscreen when switching files — restore its window position.
			// Mirror the same calls made at initial VLC launch in createOverlayWindow.
			const vlcPid = activeVLCSession?.vlcPid;
			if (vlcPid) {
				setTimeout(() => {
					if (activeVLCSession?.vlcPid === vlcPid) {
						vlcHideFromTaskbar(vlcPid);
						maximizeVLCWindow(vlcPid);
						windowSyncDaemon.attach({ vlcPid });
					}
				}, 350);
			}
			if (overlayWindow && !overlayWindow.isDestroyed()) {
				overlayWindow.webContents.send('overlay:episode-changed', {
					currentEpisodeId: newEpId,
					season: newSeason,
				});
			}
			return { ok: true };
		} else {
			// Tell React to roll back its optimistic state update
			if (overlayWindow && !overlayWindow.isDestroyed()) {
				overlayWindow.webContents.send('overlay:episode-error', {
					message: result.error || 'Failed to switch episode',
				});
			}
			// Un-pause VLC if the optimistic pause left it in paused state
			const status = await activeVLCSession.getStatus().catch(() => null);
			if (status?.state === 'paused') {
				await activeVLCSession.sendCommand('pl_pause');
			}
			return { ok: false, error: result.error };
		}
	},
);

// Fire-and-forget: silently enqueue the next episode file into VLC's playlist
// so it's ready to play instantly when the user switches to it.
ipcMain.handle('overlay:preload-episode', async (_, { filePath }) => {
	if (!activeVLCSession) return { ok: false };
	await activeVLCSession.preloadEpisode(filePath).catch(() => {});
	return { ok: true };
});

// ── IPC: Overlay window controls ─────────────────────────────────────────────

ipcMain.handle('overlay:command', async (_, { cmd, val }) => {
	if (!activeVLCSession?.sendCommand) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.sendCommand(cmd, val);
});

ipcMain.handle('overlay:get-playback-details', async () => {
	if (!activeVLCSession?.getPlaybackDetails) {
		return { success: false, error: 'No active VLC session' };
	}
	const details = await activeVLCSession.getPlaybackDetails();
	return details
		? { success: true, details }
		: { success: false, error: 'Unable to read playback details' };
});

ipcMain.handle('overlay:cycle-audio-track', async () => {
	if (!activeVLCSession?.cycleAudioTrack) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.cycleAudioTrack();
});

ipcMain.handle('overlay:cycle-subtitle-track', async () => {
	if (!activeVLCSession?.cycleSubtitleTrack) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.cycleSubtitleTrack();
});

ipcMain.handle('overlay:set-audio-track', async (_, trackId) => {
	if (!activeVLCSession?.setAudioTrack) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.setAudioTrack(trackId);
});

ipcMain.handle('overlay:set-subtitle-track', async (_, trackId) => {
	if (!activeVLCSession?.setSubtitleTrack) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.setSubtitleTrack(trackId);
});

ipcMain.handle('overlay:cycle-aspect-ratio', async () => {
	if (!activeVLCSession?.cycleAspectRatio) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.cycleAspectRatio();
});

ipcMain.handle('overlay:set-aspect-ratio', async (_, aspectRatio) => {
	if (!activeVLCSession?.setAspectRatio) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.setAspectRatio(aspectRatio);
});

ipcMain.handle('overlay:cycle-crop', async () => {
	if (!activeVLCSession?.cycleCrop) {
		return { success: false, error: 'No active VLC session' };
	}
	return activeVLCSession.cycleCrop();
});

ipcMain.handle('overlay:attach-subtitle', async () => {
	if (!activeVLCSession?.attachSubtitle) {
		return { success: false, error: 'No active VLC session' };
	}

	const currentFilePath = activeVLCSession.getCurrentFilePath?.();
	const result = await withOverlayDialogFocusReleased(async (windowRef) => {
		const parentWindow = windowRef || mainWindow;
		return dialog.showOpenDialog(parentWindow, {
			properties: ['openFile'],
			title: 'Attach Subtitle File',
			defaultPath: currentFilePath ? path.dirname(currentFilePath) : undefined,
			filters: [
				{
					name: 'Subtitle Files',
					extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt'],
				},
				{ name: 'All Files', extensions: ['*'] },
			],
		});
	});

	if (result.canceled || !result.filePaths?.[0]) {
		return { success: false, canceled: true };
	}

	return activeVLCSession.attachSubtitle(result.filePaths[0]);
});

ipcMain.handle('overlay:passthrough', () => {
	// VLC is fully disabled (EnableWindow false + WS_EX_NOACTIVATE), so we never
	// need to pass events through to it. The overlay always receives all mouse
	// input so that mouse button bindings fire everywhere, including the video area.
	if (overlayWindow && !overlayWindow.isDestroyed()) {
		overlayWindow.setIgnoreMouseEvents(false);
	}
});

// AHK reads the window title to decide whether any UI panel is visible.
// Title suffix '[UI]' = at least one panel open → pass clicks through as real clicks.
// No suffix = all panels hidden → translate left-click to Space (play/pause).
ipcMain.handle('overlay:set-ui-active', (_, active) => {
	overlayUiActive = !!active;
	if (overlayWindow && !overlayWindow.isDestroyed()) {
		syncOverlayWindowTitle();
	}
});

ipcMain.handle('overlay:close', () => {
	// Grab + clear the session reference immediately to prevent double-kill
	// from the 'close' event listener that also fires when the window shuts.
	const session = activeVLCSession;
	activeVLCSession = null;
	if (session) {
		// Stop playback gracefully then kill the process
		session.sendCommand('pl_stop').catch(() => {});
		try {
			session.kill();
		} catch {}
	}
	destroyOverlayWindow();
});

// ── IPC: Movies ───────────────────────────────────────────────────────────────

ipcMain.handle('movies:scan', async (_, sourceDirs) => {
	try {
		const accessibleDirs = (sourceDirs || []).filter((d) => {
			try {
				return fs.existsSync(d);
			} catch {
				return false;
			}
		});
		const result = await scanMovies(accessibleDirs);
		fs.writeFileSync(MOVIES_LIBRARY_FILE, JSON.stringify(result, null, 2));
		return { success: true, library: result };
	} catch (err) {
		console.error('[Movies] Scan error:', err);
		return { success: false, error: err.message };
	}
});

ipcMain.handle('movies:get-library', () => {
	try {
		if (fs.existsSync(MOVIES_LIBRARY_FILE)) {
			return JSON.parse(fs.readFileSync(MOVIES_LIBRARY_FILE, 'utf8'));
		}
	} catch (e) {
		console.error('[Movies] Error reading library:', e);
	}
	return null;
});

ipcMain.handle('movies:get-metadata', () => {
	try {
		if (fs.existsSync(MOVIES_METADATA_FILE)) {
			return JSON.parse(fs.readFileSync(MOVIES_METADATA_FILE, 'utf8'));
		}
	} catch (e) {
		console.error('[Movies] Error reading metadata:', e);
	}
	return {};
});

ipcMain.handle(
	'movies:fetch-metadata',
	async (_, { movieId, movieName, year, apiKey }) => {
		try {
			const meta = await fetchMovieMetadata(
				movieName,
				year,
				apiKey,
				POSTERS_DIR,
				BACKDROPS_DIR,
			);
			let allMeta = {};
			if (fs.existsSync(MOVIES_METADATA_FILE)) {
				try {
					allMeta = JSON.parse(fs.readFileSync(MOVIES_METADATA_FILE, 'utf8'));
				} catch {}
			}
			allMeta[movieId] = { ...meta, id: movieId };
			fs.writeFileSync(MOVIES_METADATA_FILE, JSON.stringify(allMeta, null, 2));
			return { success: true, metadata: allMeta[movieId] };
		} catch (err) {
			console.error('[Movies] Metadata fetch error:', err);
			return { success: false, error: err.message };
		}
	},
);

ipcMain.handle('movies:get-history', () => {
	try {
		if (fs.existsSync(MOVIES_HISTORY_FILE)) {
			return JSON.parse(fs.readFileSync(MOVIES_HISTORY_FILE, 'utf8'));
		}
	} catch {}
	return {};
});

ipcMain.handle('movies:update-history', (_, entry) => {
	try {
		let history = {};
		if (fs.existsSync(MOVIES_HISTORY_FILE)) {
			try {
				history = JSON.parse(fs.readFileSync(MOVIES_HISTORY_FILE, 'utf8'));
			} catch {}
		}
		history[entry.key] = { ...(history[entry.key] || {}), ...entry };
		fs.writeFileSync(MOVIES_HISTORY_FILE, JSON.stringify(history, null, 2));
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('movies:get-data-info', () => {
	try {
		const files = [
			{ name: 'library.json', path: MOVIES_LIBRARY_FILE },
			{ name: 'metadata.json', path: MOVIES_METADATA_FILE },
			{ name: 'history.json', path: MOVIES_HISTORY_FILE },
		].map((f) => {
			let size = 0,
				exists = false,
				modified = null;
			try {
				if (fs.existsSync(f.path)) {
					const stat = fs.statSync(f.path);
					size = stat.size;
					modified = stat.mtime.toISOString();
					exists = true;
				}
			} catch {}
			return { name: f.name, size, exists, modified };
		});
		return { dataDir: MOVIES_DIR, files };
	} catch (err) {
		return { dataDir: MOVIES_DIR, files: [] };
	}
});

ipcMain.handle('movies:delete-history', (_, key) => {
	try {
		if (!fs.existsSync(MOVIES_HISTORY_FILE)) return { success: true };
		const history = JSON.parse(fs.readFileSync(MOVIES_HISTORY_FILE, 'utf8'));
		delete history[key];
		fs.writeFileSync(MOVIES_HISTORY_FILE, JSON.stringify(history, null, 2));
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle(
	'movies:launch',
	async (_, { movieId, filePath, seekSeconds }) => {
		if (!fs.existsSync(filePath)) {
			const driveMatch = filePath.match(/^([A-Za-z]:[/\\])/);
			const driveHint = driveMatch
				? ` Drive ${driveMatch[1].toUpperCase()} may not be connected.`
				: '';
			return { success: false, error: `File not found.${driveHint}` };
		}

		const settings = loadSettings();
		try {
			let library = null;
			let allMeta = {};
			if (fs.existsSync(MOVIES_LIBRARY_FILE)) {
				try {
					library = JSON.parse(fs.readFileSync(MOVIES_LIBRARY_FILE, 'utf8'));
				} catch {}
			}
			if (fs.existsSync(MOVIES_METADATA_FILE)) {
				try {
					allMeta = JSON.parse(fs.readFileSync(MOVIES_METADATA_FILE, 'utf8'));
				} catch {}
			}

			const movie = library?.movies?.find((m) => m.id === movieId) || {
				id: movieId,
				name: movieId,
				filePath,
			};
			const meta = allMeta[movieId] || null;

			const initData = buildMovieSession({
				movie,
				metadata: meta,
				initialSeek: seekSeconds || 0,
				settings,
			});

			// Re-use episodeId convention: use movieId as key for history tracking
			const epInfo = {
				episodeId: movieId,
				seriesId: movieId,
				season: 1,
				episode: 1,
			};

			const durationHint = meta?.runtime ? meta.runtime * 60 : 0;

			const result = await launchVLC({
				filePath,
				episodeInfo: epInfo,
				vlcPath: settings.vlcPath,
				seekSeconds: seekSeconds || 0,
				httpPort: settings.vlcHttpPort || 8080,
				httpPassword: settings.vlcHttpPassword || 'cineshelf',
				onPositionUpdate: ({ position, duration, state, volume }) => {
					const update = {
						position,
						duration: duration || durationHint,
						state,
						episodeId: movieId,
						volume,
					};
					if (mainWindow && !mainWindow.isDestroyed())
						mainWindow.webContents.send('player:position-update', update);
					if (overlayWindow && !overlayWindow.isDestroyed())
						overlayWindow.webContents.send('overlay:state', update);
				},
				onProgressSave: (position, duration) => {
					try {
						const dur = duration || durationHint;
						const completed = dur > 0 && position / dur >= 0.9;
						let history = {};
						if (fs.existsSync(MOVIES_HISTORY_FILE)) {
							try {
								history = JSON.parse(
									fs.readFileSync(MOVIES_HISTORY_FILE, 'utf8'),
								);
							} catch {}
						}
						history[movieId] = {
							key: movieId,
							position: Math.floor(position),
							duration: Math.floor(dur),
							completed,
							lastWatched: new Date().toISOString(),
						};
						fs.writeFileSync(
							MOVIES_HISTORY_FILE,
							JSON.stringify(history, null, 2),
						);
					} catch (err) {
						console.error('[Movies/VLC] Mid-session save error:', err.message);
					}
				},
			});

			if (result.error) return { success: false, error: result.error };

			activeVLCSession = result;

			createOverlayWindow({
				...initData,
				// Map movies overlay init to what the overlay window expects
				currentEpisodeId: movieId,
				seriesId: movieId,
				seriesName: initData.seriesName,
				season: 1,
				allSeasons: [
					{
						season: 1,
						episodes: initData.playlist.map((p, i) => ({
							episodeId: p.key,
							filePath: p.filePath,
							seriesId: p.key,
							season: 1,
							episode: i + 1,
							title: p.title,
							duration: 0,
							overview: '',
							stillPath: meta?.backdropPath || null,
						})),
					},
				],
				history: {},
			});

			result.exited.then(({ position, duration }) => {
				activeVLCSession = null;
				windowSyncDaemon.detach();
				destroyOverlayWindow();

				const finalPos = Math.floor(position || 0);
				const finalDur = Math.floor(duration || durationHint);
				try {
					const completed = finalDur > 0 && finalPos / finalDur >= 0.9;
					let history = {};
					if (fs.existsSync(MOVIES_HISTORY_FILE)) {
						try {
							history = JSON.parse(
								fs.readFileSync(MOVIES_HISTORY_FILE, 'utf8'),
							);
						} catch {}
					}
					history[movieId] = {
						key: movieId,
						position: finalPos,
						duration: finalDur,
						completed,
						lastWatched: new Date().toISOString(),
					};
					fs.writeFileSync(
						MOVIES_HISTORY_FILE,
						JSON.stringify(history, null, 2),
					);
				} catch (err) {
					console.error('[Movies/VLC] Final save error:', err.message);
				}

				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('movies:closed', {
						movieId,
						position: finalPos,
						duration: finalDur,
					});
				}
			});

			return { success: true };
		} catch (err) {
			return { success: false, error: err.message };
		}
	},
);

// ── IPC: Anime ────────────────────────────────────────────────────────────────

ipcMain.handle('anime:scan', async (_, sourceDirs) => {
	try {
		const accessibleDirs = (sourceDirs || []).filter((d) => {
			try {
				return fs.existsSync(d);
			} catch {
				return false;
			}
		});
		const result = await scanAnime(accessibleDirs);
		fs.writeFileSync(ANIME_LIBRARY_FILE, JSON.stringify(result, null, 2));
		return { success: true, library: result };
	} catch (err) {
		console.error('[Anime] Scan error:', err);
		return { success: false, error: err.message };
	}
});

ipcMain.handle('anime:get-library', () => {
	try {
		if (fs.existsSync(ANIME_LIBRARY_FILE)) {
			return JSON.parse(fs.readFileSync(ANIME_LIBRARY_FILE, 'utf8'));
		}
	} catch (e) {
		console.error('[Anime] Error reading library:', e);
	}
	return null;
});

ipcMain.handle('anime:get-metadata', () => {
	try {
		if (fs.existsSync(ANIME_METADATA_FILE)) {
			return JSON.parse(fs.readFileSync(ANIME_METADATA_FILE, 'utf8'));
		}
	} catch (e) {
		console.error('[Anime] Error reading metadata:', e);
	}
	return {};
});

function readAnimeLibrary() {
	try {
		if (fs.existsSync(ANIME_LIBRARY_FILE)) {
			return JSON.parse(fs.readFileSync(ANIME_LIBRARY_FILE, 'utf8'));
		}
	} catch {}
	return null;
}

function readAnimeMetadata() {
	try {
		if (fs.existsSync(ANIME_METADATA_FILE)) {
			return JSON.parse(fs.readFileSync(ANIME_METADATA_FILE, 'utf8'));
		}
	} catch {}
	return {};
}

function readAnimeHistoryRaw() {
	try {
		if (fs.existsSync(ANIME_HISTORY_FILE)) {
			return JSON.parse(fs.readFileSync(ANIME_HISTORY_FILE, 'utf8'));
		}
	} catch {}
	return {};
}

function buildAnimeHistoryLookup(library) {
	const lookup = new Map();
	for (const series of library?.series || []) {
		for (const episode of series.episodes || []) {
			lookup.set(episode.id, episode.id);
			lookup.set(
				`anime:${episode.seriesId}-ep${episode.episodeNumberStr}`,
				episode.id,
			);
		}
	}
	return lookup;
}

function normalizeAnimeHistory(history, library) {
	const lookup = buildAnimeHistoryLookup(library);
	const normalized = {};
	for (const [key, entry] of Object.entries(history || {})) {
		const normalizedKey = lookup.get(key) || entry?.episodeId || key;
		normalized[normalizedKey] = {
			...(normalized[normalizedKey] || {}),
			...entry,
			key: normalizedKey,
		};
	}
	return normalized;
}

function readNormalizedAnimeHistory(library = readAnimeLibrary()) {
	return normalizeAnimeHistory(readAnimeHistoryRaw(), library);
}

function writeAnimeHistory(history) {
	fs.writeFileSync(ANIME_HISTORY_FILE, JSON.stringify(history, null, 2));
	return history;
}

ipcMain.handle('anime:get-history', () => {
	try {
		const library = readAnimeLibrary();
		const history = readNormalizedAnimeHistory(library);
		writeAnimeHistory(history);
		return history;
	} catch {}
	return {};
});

ipcMain.handle('anime:update-history', (_, entry) => {
	try {
		if (!entry?.key) return { success: false, error: 'No key provided' };
		const library = readAnimeLibrary();
		const history = readNormalizedAnimeHistory(library);
		history[entry.key] = {
			...(history[entry.key] || {}),
			...entry,
			key: entry.key,
		};
		writeAnimeHistory(history);
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('anime:patch-metadata', (_, { id, updates }) => {
	try {
		let allMeta = {};
		if (fs.existsSync(ANIME_METADATA_FILE)) {
			allMeta = JSON.parse(fs.readFileSync(ANIME_METADATA_FILE, 'utf8'));
		}
		allMeta[id] = { ...(allMeta[id] || {}), ...updates, id };
		fs.writeFileSync(ANIME_METADATA_FILE, JSON.stringify(allMeta, null, 2));
		mainWindow?.webContents.send('anime:metadata-patched', {
			seriesId: id,
			meta: allMeta[id],
		});
		return { success: true, metadata: allMeta[id] };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('anime:save-history-entry', (_, entry) => {
	try {
		if (!entry?.key) return { success: false, error: 'No key provided' };
		const library = readAnimeLibrary();
		const history = readNormalizedAnimeHistory(library);
		history[entry.key] = {
			...(history[entry.key] || {}),
			...entry,
			key: entry.key,
		};
		writeAnimeHistory(history);
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('anime:get-data-info', () => {
	try {
		const files = [
			{ name: 'library.json', path: ANIME_LIBRARY_FILE },
			{ name: 'metadata.json', path: ANIME_METADATA_FILE },
			{ name: 'history.json', path: ANIME_HISTORY_FILE },
		].map((f) => {
			let size = 0,
				exists = false,
				modified = null;
			try {
				if (fs.existsSync(f.path)) {
					const stat = fs.statSync(f.path);
					size = stat.size;
					modified = stat.mtime.toISOString();
					exists = true;
				}
			} catch {}
			return { name: f.name, size, exists, modified };
		});
		return { dataDir: ANIME_DIR, files };
	} catch (err) {
		return { dataDir: ANIME_DIR, files: [] };
	}
});

ipcMain.handle('anime:delete-history', (_, key) => {
	try {
		const library = readAnimeLibrary();
		const history = readNormalizedAnimeHistory(library);
		delete history[key];
		writeAnimeHistory(history);
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

// Atomic bulk delete — mirrors TV's history:clear-series so clearSeriesHistory
// in AnimeContext is a single file write instead of N individual writes.
ipcMain.handle('anime:clear-series-history', (_, seriesId) => {
	try {
		const library = readAnimeLibrary();
		const history = readNormalizedAnimeHistory(library);
		const updated = {};
		for (const [key, entry] of Object.entries(history)) {
			if (entry?.seriesId !== seriesId) {
				updated[key] = entry;
			}
		}
		writeAnimeHistory(updated);
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
});

ipcMain.handle('anime:fetch-metadata', async (_, { seriesId, seriesName }) => {
	try {
		ensureDirs();
		const result = await fetchAnimeMetadata(
			seriesName,
			POSTERS_DIR,
			BACKDROPS_DIR,
		);
		// Read / merge existing metadata file
		let meta = {};
		try {
			if (fs.existsSync(ANIME_METADATA_FILE)) {
				meta = JSON.parse(fs.readFileSync(ANIME_METADATA_FILE, 'utf8'));
			}
		} catch {}
		meta[seriesId] = { ...result, id: seriesId };
		fs.writeFileSync(ANIME_METADATA_FILE, JSON.stringify(meta, null, 2));
		// Push patch event to renderer so context updates without a full reload
		mainWindow?.webContents.send('anime:metadata-patched', {
			seriesId,
			meta: meta[seriesId],
		});
		return { success: true, meta: meta[seriesId] };
	} catch (err) {
		console.error('[anime:fetch-metadata] error:', err.message);
		return { success: false, error: err.message };
	}
});

ipcMain.handle(
	'anime:launch',
	async (_, { seriesId, episodeId, filters, seekSeconds }) => {
		try {
			const library = readAnimeLibrary();
			const series = library?.series?.find((s) => s.id === seriesId);
			if (!series)
				return {
					success: false,
					error: `Series '${seriesId}' not found in library.`,
				};

			const settings = loadSettings();
			const allMeta = readAnimeMetadata();
			const seriesMeta = allMeta[seriesId] || {};

			const initData = buildAnimeSession({
				series,
				episodeId,
				filters: filters || { canon: true, mixed: true, filler: false },
				initialSeek: seekSeconds || 0,
				settings,
				metadata: seriesMeta,
			});

			const episodeList = initData.allSeasons.flatMap(
				(seasonData) => seasonData.episodes || [],
			);
			if (!episodeList.length) {
				return {
					success: false,
					error: 'No visible episodes match the current filter.',
				};
			}

			const startItem =
				episodeList.find(
					(item) => item.episodeId === initData.currentEpisodeId,
				) || episodeList[0];
			if (!startItem?.filePath) {
				return {
					success: false,
					error: 'Could not determine start file path.',
				};
			}

			if (!fs.existsSync(startItem.filePath)) {
				const driveMatch = startItem.filePath.match(/^([A-Za-z]:[/\\])/);
				const driveHint = driveMatch
					? ` Drive ${driveMatch[1].toUpperCase()} may not be connected.`
					: '';
				return { success: false, error: `File not found.${driveHint}` };
			}

			const epInfo = {
				episodeId: startItem.episodeId,
				seriesId,
				season: startItem.season,
				episode: startItem.episode,
				filePath: startItem.filePath,
			};
			let durationHint = 0;

			const result = await launchVLC({
				filePath: startItem.filePath,
				episodeInfo: epInfo,
				vlcPath: settings.vlcPath,
				seekSeconds: initData.initialSeek,
				httpPort: settings.vlcHttpPort || 8080,
				httpPassword: settings.vlcHttpPassword || 'cineshelf',
				onPositionUpdate: ({ position, duration, state, volume }) => {
					const update = {
						position,
						duration: duration || durationHint,
						state,
						episodeId: epInfo.episodeId,
						seriesId: epInfo.seriesId,
						season: epInfo.season,
						episode: epInfo.episode,
						volume,
					};
					if (mainWindow && !mainWindow.isDestroyed()) {
						mainWindow.webContents.send('anime:position-update', update);
					}
					if (overlayWindow && !overlayWindow.isDestroyed()) {
						overlayWindow.webContents.send('overlay:state', update);
					}
				},
				onProgressSave: (position, duration) => {
					try {
						const dur = duration || durationHint;
						const completed = dur > 0 && position / dur >= 0.9;
						updateHistory(ANIME_HISTORY_FILE, {
							key: epInfo.episodeId,
							seriesId: epInfo.seriesId,
							season: epInfo.season,
							episode: epInfo.episode,
							filePath: epInfo.filePath,
							position: Math.floor(position),
							duration: Math.floor(dur),
							completed,
							lastWatched: new Date().toISOString(),
						});
					} catch (err) {
						console.error('[Anime/VLC] Mid-session save error:', err.message);
					}
				},
			});

			if (result.error) {
				return { success: false, error: result.error };
			}

			activeVLCSession = { ...result, workflow: 'anime' };

			const historySnapshot = readNormalizedAnimeHistory(library);
			createOverlayWindow({ ...initData, history: historySnapshot });

			result.exited.then(({ position, duration, action, error }) => {
				activeVLCSession = null;
				windowSyncDaemon.detach();
				destroyOverlayWindow();

				const finalPos = Math.floor(position || 0);
				const finalDur = Math.floor(duration || durationHint);

				try {
					const completed = finalDur > 0 && finalPos / finalDur >= 0.9;
					updateHistory(ANIME_HISTORY_FILE, {
						key: epInfo.episodeId,
						seriesId: epInfo.seriesId,
						season: epInfo.season,
						episode: epInfo.episode,
						filePath: epInfo.filePath,
						position: finalPos,
						duration: finalDur,
						completed,
						lastWatched: new Date().toISOString(),
					});
				} catch (err) {
					console.error('[Anime/VLC] Final save error:', err.message);
				}

				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('anime:closed', {
						episodeId: epInfo.episodeId,
						seriesId: epInfo.seriesId,
						season: epInfo.season,
						episode: epInfo.episode,
						position: finalPos,
						duration: finalDur,
						action,
						error,
					});
				}
			});

			return { success: true, sessionId: result.sessionId };
		} catch (err) {
			return { success: false, error: err.message };
		}
	},
);

// ── IPC: Anime episode switch ─────────────────────────────────────────────────
// Called by AnimePlayerOverlay when the user selects a different episode.
// Saves history for the outgoing episode, injects the new file into running VLC
// (never kills/relaunches), then notifies the overlay about the episode change.
ipcMain.handle(
	'anime:play-episode',
	async (
		_,
		{
			episodeId: newEpId,
			filePath: newFilePath,
			seriesId: newSeriesId,
			season: newSeason,
			episode: newEpisode,
			seekSeconds: newSeek,
			prevPosition,
			prevDuration,
			prevEpisodeId,
		},
	) => {
		if (prevEpisodeId && prevPosition !== undefined) {
			try {
				const dur = prevDuration || 0;
				const completed = dur > 0 && prevPosition / dur >= 0.9;
				updateHistory(ANIME_HISTORY_FILE, {
					key: prevEpisodeId,
					position: Math.floor(prevPosition),
					duration: Math.floor(dur),
					completed,
					lastWatched: new Date().toISOString(),
				});
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('anime:position-update', {
						episodeId: prevEpisodeId,
						position: Math.floor(prevPosition),
						duration: Math.floor(dur),
						completed,
					});
				}
			} catch (e) {
				console.error('[anime:play-episode] History save error:', e.message);
			}
		}

		if (!activeVLCSession) {
			return { success: false, error: 'No active VLC session' };
		}

		const resolvedSeek =
			typeof newSeek === 'number' && Number.isFinite(newSeek) ? newSeek : 0;

		const result = await activeVLCSession.enqueueAndPlay(
			newFilePath,
			{
				episodeId: newEpId,
				seriesId: newSeriesId,
				season: newSeason,
				episode: newEpisode,
			},
			resolvedSeek,
		);

		if (result.success) {
			if (resolvedSeek <= 0) {
				await activeVLCSession.sendCommand('seek', 0);
			}

			const vlcPid = activeVLCSession?.vlcPid;
			if (vlcPid) {
				setTimeout(() => {
					if (activeVLCSession?.vlcPid === vlcPid) {
						vlcHideFromTaskbar(vlcPid);
						maximizeVLCWindow(vlcPid);
						windowSyncDaemon.attach({ vlcPid });
					}
				}, 350);
			}

			if (overlayWindow && !overlayWindow.isDestroyed()) {
				overlayWindow.webContents.send('overlay:episode-changed', {
					currentEpisodeId: newEpId,
					season: newSeason,
				});
			}
			return { ok: true };
		} else {
			if (overlayWindow && !overlayWindow.isDestroyed()) {
				overlayWindow.webContents.send('overlay:episode-error', {
					message: result.error || 'Failed to switch episode',
				});
			}
			const status = await activeVLCSession.getStatus().catch(() => null);
			if (status?.state === 'paused') {
				await activeVLCSession.sendCommand('pl_pause');
			}
			return { ok: false, error: result.error };
		}
	},
);
