'use strict';

/**
 * WindowSyncDaemon
 *
 * Keeps VLC raised behind the Electron overlay so both panels stay in sync.
 * There is only ONE player state: fullscreen. The overlay and VLC are either
 * both open (fullscreen) or both closed. Minimize and windowed modes are gone.
 *
 * This module fires vlcEnsureVisible(pid, 0) in a burst on attach, then every
 * FORCE_SYNC_MS to catch any z-order drift from VLC recreating its windows.
 *
 * Lifecycle
 *   daemon.start()   Once at app startup. Idle loop until attach.
 *   daemon.attach()  When VLC + overlay are both open. Arms the burst.
 *   daemon.detach()  When the player closes. Returns to idle.
 *   daemon.stop()    On app quit.
 */

const { vlcEnsureVisible } = require('./player');

const POLL_MS       = 200;  // Tick interval
const MAX_RETRIES   = 5;    // Burst fires on attach (covers PS startup latency)
const FORCE_SYNC_MS = 3000; // Periodic re-apply to catch z-order drift

class WindowSyncDaemon {
constructor() {
this._vlcPid          = null;
this._pollTimer       = null;
this._active          = false;
this._burstCount      = 0;
this._lastForceSyncMs = 0;
}

start() {
if (this._pollTimer) return;
this._pollTimer = setInterval(() => this._tick(), POLL_MS);
console.log('[WinSync] Daemon started');
}

stop() {
if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
this._active = false;
this._vlcPid = null;
console.log('[WinSync] Daemon stopped');
}

/**
 * Attach a player session.
 * @param {{ vlcPid: number }} opts
 */
attach({ vlcPid }) {
this._vlcPid          = vlcPid;
this._burstCount      = 0;
this._lastForceSyncMs = 0;
this._active          = true;
console.log('[WinSync] Session attached — VLC PID:', vlcPid);
}

detach() {
this._active = false;
this._vlcPid = null;
console.log('[WinSync] Session detached');
}

_tick() {
if (!this._active || !this._vlcPid) return;

const now          = Date.now();
const forceSyncDue = (now - this._lastForceSyncMs) >= FORCE_SYNC_MS;
const inBurst      = this._burstCount < MAX_RETRIES;

if (!inBurst && !forceSyncDue) return;

// Always fullscreen: insertAfter = 0 (HWND_TOP).
// vlcEnsureVisible has IsWindow + IsIconic guards — safe to call repeatedly.
vlcEnsureVisible(this._vlcPid, 0);
this._burstCount++;

if (forceSyncDue) {
this._lastForceSyncMs = now;
this._burstCount      = 1; // re-arm burst after each force-sync
}
}
}

const daemon = new WindowSyncDaemon();
module.exports = daemon;
