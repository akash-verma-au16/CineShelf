const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(
	process.env.APPDATA || process.env.HOME,
	'cineshelf',
	'CineShelf',
);

const histFile = path.join(DATA_DIR, 'history.json');
const libFile = path.join(DATA_DIR, 'library.json');

const hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
const lib = JSON.parse(fs.readFileSync(libFile, 'utf8'));

const keys = Object.keys(hist);
const epKeys = keys.filter((k) => !k.startsWith('series:'));
const serKeys = keys.filter((k) => k.startsWith('series:'));

console.log('TOTAL ENTRIES:', keys.length);
console.log('EPISODE ENTRIES:', epKeys.length);
console.log('SERIES ENTRIES:', serKeys.length);
console.log('');
console.log('=== Sample episode entries ===');
epKeys.slice(0, 3).forEach((k) => console.log(JSON.stringify(hist[k])));
console.log('');

// Build a lookup map from library: episodeId -> episode data
const libLookup = {};
for (const series of lib.series || []) {
	for (const season of series.seasons || []) {
		for (const ep of season.episodes || []) {
			libLookup[ep.id] = {
				seriesId: series.id,
				season: ep.season,
				episode: ep.episode,
				filePath: ep.filePath,
			};
		}
	}
}
console.log('Library episodes indexed:', Object.keys(libLookup).length);
console.log('');

const noSeriesId = epKeys.filter((k) => !hist[k].seriesId);
const noSeason = epKeys.filter(
	(k) => hist[k].season === undefined || hist[k].season === null,
);
const noEpNum = epKeys.filter(
	(k) => hist[k].episode === undefined || hist[k].episode === null,
);
const noFilePath = epKeys.filter((k) => !hist[k].filePath);
const noKey = epKeys.filter((k) => !hist[k].key);
const posZeroCompleted = epKeys.filter(
	(k) => hist[k].completed && hist[k].position === 0,
);

console.log('=== Corruption report ===');
console.log('Missing seriesId:', noSeriesId.length);
console.log('Missing season:', noSeason.length);
console.log('Missing episode number:', noEpNum.length);
console.log('Missing filePath:', noFilePath.length);
console.log('Missing key field (self-reference):', noKey.length);
console.log('completed=true with position=0:', posZeroCompleted.length);

if (noSeriesId.length > 0) {
	console.log('\nCorrupt samples (missing seriesId):');
	noSeriesId
		.slice(0, 3)
		.forEach((k) => console.log(' ', JSON.stringify(hist[k])));
}

// Check how many corrupt entries can be recovered from library
const recoverable = noSeriesId.filter((k) => libLookup[k]);
const unrecoverable = noSeriesId.filter((k) => !libLookup[k]);
console.log(
	'\nOf those missing seriesId, recoverable from library:',
	recoverable.length,
);
console.log('Unrecoverable (not in library):', unrecoverable.length);
