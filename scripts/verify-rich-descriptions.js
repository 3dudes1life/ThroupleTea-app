#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  path.join(root, 'www', 'data', 'fallback.json'),
  path.join(root, 'live-data', 'content.json'),
];

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

const catalogs = files.map(load).filter(Boolean);
const best = catalogs.sort((a, b) => {
  const ar = (a.episodes || []).filter(ep => String(ep.description || '').length > String(ep.summary || '').length + 40).length;
  const br = (b.episodes || []).filter(ep => String(ep.description || '').length > String(ep.summary || '').length + 40).length;
  return br - ar;
})[0];

if (!best) {
  console.error('❌ No episode catalog found.');
  process.exit(1);
}

const rich = (best.episodes || []).filter(ep =>
  String(ep.description || '').length > String(ep.summary || '').length + 40
);

console.log(`📖 Rich episode descriptions: ${rich.length}/${(best.episodes || []).length}`);

if (rich.length < 5) {
  console.error('❌ Full episode descriptions were not preserved. Stopping before Xcode so the app cannot regress.');
  console.error('Keep the successfully-built UX7.9 folder beside this one and run the build again.');
  process.exit(1);
}

console.log('✅ Full episode descriptions are preserved.');
