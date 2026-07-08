// One-shot: run sanitizeHistory against the live data files right now.
// Safe to run multiple times — only writes if something needs fixing.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(
	process.env.APPDATA || process.env.HOME,
	'cineshelf',
	'CineShelf',
);

const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

const { sanitizeHistory } = require('../electron/watchHistory');

if (!fs.existsSync(HISTORY_FILE)) {
	console.log('No history.json found — nothing to sanitize.');
	process.exit(0);
}
if (!fs.existsSync(LIBRARY_FILE)) {
	console.log('No library.json found — cannot recover, skipping.');
	process.exit(0);
}

// Make a backup before touching anything
const backupPath = HISTORY_FILE + '.backup';
fs.copyFileSync(HISTORY_FILE, backupPath);
console.log('Backup written to:', backupPath);

const library = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
const repaired = sanitizeHistory(HISTORY_FILE, library);

if (repaired === 0) {
	console.log('History is clean — no entries needed repair.');
} else {
	console.log(`Repaired ${repaired} entry/entries. Sanitized history written.`);
}
