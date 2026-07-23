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

function episodeQuality(catalog) {
  const episodes = catalog?.episodes || [];
  const descriptionCount = episodes.filter(ep => String(ep?.description || '').length > String(ep?.summary || '').length).length;
  return episodes.length * 100 + descriptionCount;
}

function candidateFiles() {
  const files = [destinationLive, destinationFallback];
  const parents = new Set([path.dirname(root), path.dirname(path.dirname(root))]);

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

  for (const arg of process.argv.slice(2)) files.push(path.resolve(arg));
  return [...new Set(files)];
}

function mergeEpisodeMetadata(primaryEpisodes, backupEpisodes) {
  const backups = new Map(
    (backupEpisodes || []).filter(ep => ep?.id).map(ep => [ep.id, ep])
  );

  return (primaryEpisodes || []).map(ep => {
    const backup = backups.get(ep.id) || {};
    return {
      ...backup,
      ...ep,
      description: ep.description || backup.description || ep.summary || backup.summary || '',
      summary: ep.summary || backup.summary || ep.description || backup.description || '',
    };
  });
}

const catalogs = candidateFiles()
  .filter(file => fs.existsSync(file))
  .map(readCatalog)
  .filter(Boolean);

const bestVideoCatalog = [...catalogs].sort(
  (a, b) => videoCounts(b).total - videoCounts(a).total
)[0] || null;

const bestEpisodeCatalog = [...catalogs].sort(
  (a, b) => episodeQuality(b) - episodeQuality(a)
)[0] || null;

const current = readCatalog(destinationLive) || readCatalog(destinationFallback) || {};
const counts = videoCounts(bestVideoCatalog);

if (!bestVideoCatalog || counts.total < 5) {
  console.log(`⚠️ No healthy saved video catalog found yet (${counts.total || 0} videos).`);
  process.exitCode = 2;
} else {
  const primaryEpisodes = bestEpisodeCatalog?.episodes || current.episodes || [];
  const backupEpisodes = current.episodes || [];
  const episodes = mergeEpisodeMetadata(primaryEpisodes, backupEpisodes);

  const payload = {
    ...(current.parsed || bestEpisodeCatalog?.parsed || bestVideoCatalog.parsed || {}),
    schemaVersion: Math.max(
      Number(current.parsed?.schemaVersion || 0),
      Number(bestEpisodeCatalog?.parsed?.schemaVersion || 0),
      Number(bestVideoCatalog.parsed?.schemaVersion || 0),
      3
    ),
    generatedAt: new Date().toISOString(),
    source: 'certificate-safe-merged-catalog',
    episodes,
    videos: bestVideoCatalog.videos,
  };

  fs.mkdirSync(path.dirname(destinationLive), { recursive: true });
  fs.mkdirSync(path.dirname(destinationFallback), { recursive: true });
  const text = JSON.stringify(payload, null, 2) + '\n';
  fs.writeFileSync(destinationLive, text);
  fs.writeFileSync(destinationFallback, text);

  console.log(`✅ Recovered videos from: ${bestVideoCatalog.file}`);
  console.log(`✅ Preserved episode details from: ${bestEpisodeCatalog?.file || 'current build'}`);
  console.log(`📺 ${counts.shorts} Shorts + ${counts.full} full videos bundled.`);
  console.log(`🎙️ ${episodes.length} native episode detail pages preserved.`);
}
