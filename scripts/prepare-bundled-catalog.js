#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const destinationLive = path.join(root, 'live-data', 'content.json');
const destinationFallback = path.join(root, 'www', 'data', 'fallback.json');

function readCatalog(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const videos = Array.isArray(parsed.videos) ? parsed.videos : [];
    const episodes = Array.isArray(parsed.episodes) ? parsed.episodes : [];
    return { file, parsed, videos, episodes };
  } catch (_) {
    return null;
  }
}

function videoCounts(catalog) {
  const videos = catalog?.videos || [];
  const shorts = videos.filter(v => v && v.kind === 'short').length;
  const full = videos.filter(v => v && v.kind === 'episode').length;
  return { total: videos.length, shorts, full };
}

function candidateFiles() {
  const files = [
    destinationLive,
    destinationFallback,
  ];

  // The previous successful UX7.5 build is normally beside this folder in
  // Downloads. Reuse its already-downloaded full catalog automatically.
  const parents = new Set([
    path.dirname(root),
    path.dirname(path.dirname(root)),
  ]);

  for (const parent of parents) {
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('ThroupleTea-app-SUPERMAN-UX')) continue;
      const folder = path.join(parent, entry.name);
      files.push(
        path.join(folder, 'www', 'data', 'fallback.json'),
        path.join(folder, 'live-data', 'content.json'),
      );
    }
  }

  // Optional file downloaded by curl in the build command.
  for (const arg of process.argv.slice(2)) {
    files.push(path.resolve(arg));
  }

  return [...new Set(files)];
}

const catalogs = candidateFiles()
  .filter(file => fs.existsSync(file))
  .map(readCatalog)
  .filter(Boolean)
  .sort((a, b) => {
    const av = videoCounts(a).total;
    const bv = videoCounts(b).total;
    return (bv - av) || (b.episodes.length - a.episodes.length);
  });

const best = catalogs[0] || null;
const counts = videoCounts(best);

if (!best || counts.total < 5) {
  console.log(`⚠️ No healthy saved catalog found yet (${counts.total || 0} videos).`);
  process.exitCode = 2;
} else {
  fs.mkdirSync(path.dirname(destinationLive), { recursive: true });
  fs.mkdirSync(path.dirname(destinationFallback), { recursive: true });
  const payload = JSON.stringify(best.parsed, null, 2) + '\n';
  fs.writeFileSync(destinationLive, payload);
  fs.writeFileSync(destinationFallback, payload);
  console.log(`✅ Recovered catalog from: ${best.file}`);
  console.log(`📺 ${counts.shorts} Shorts + ${counts.full} full videos bundled.`);
}
