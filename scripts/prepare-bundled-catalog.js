#!/usr/bin/env node
'use strict';

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
  const shorts = videos.filter(video => video?.kind === 'short').length;
  const full = videos.filter(video => video?.kind === 'episode').length;
  return { total: videos.length, shorts, full };
}

function richerText(...values) {
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';
}

function episodeQuality(catalog) {
  const episodes = catalog?.episodes || [];
  const rich = episodes.filter(episode =>
    String(episode?.description || '').length > String(episode?.summary || '').length + 40
  ).length;
  return episodes.length * 100 + rich;
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
        path.join(folder, 'live-data', 'content.json')
      );
    }
  }

  for (const arg of process.argv.slice(2)) files.push(path.resolve(arg));
  return [...new Set(files)];
}

function mergeEpisodeCatalog(primaryEpisodes, catalogs) {
  const byId = new Map();
  for (const catalog of catalogs) {
    for (const episode of catalog?.episodes || []) {
      if (!episode?.id) continue;
      const previous = byId.get(episode.id) || {};
      byId.set(episode.id, {
        ...previous,
        ...episode,
        summary: previous.summary || episode.summary || '',
        description: richerText(
          previous.description,
          episode.description,
          previous.summary,
          episode.summary
        )
      });
    }
  }

  return (primaryEpisodes || []).map(episode => ({
    ...(byId.get(episode.id) || {}),
    ...episode,
    description: richerText(
      byId.get(episode.id)?.description,
      episode.description,
      episode.summary
    )
  }));
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

const current = readCatalog(destinationLive) || readCatalog(destinationFallback) || null;
const counts = videoCounts(bestVideoCatalog);

if (!bestVideoCatalog || counts.total < 5) {
  console.log(`⚠️ No healthy saved video catalog found yet (${counts.total} videos).`);
  process.exitCode = 2;
} else {
  const primaryEpisodes = bestEpisodeCatalog?.episodes || current?.episodes || [];
  const episodes = mergeEpisodeCatalog(primaryEpisodes, catalogs);
  const metadataSource = bestEpisodeCatalog?.parsed || current?.parsed || bestVideoCatalog.parsed || {};

  const payload = {
    ...metadataSource,
    schemaVersion: Math.max(
      Number(metadataSource.schemaVersion || 0),
      Number(bestVideoCatalog.parsed?.schemaVersion || 0),
      6
    ),
    generatedAt: new Date().toISOString(),
    source: 'video-recovery-preserving-richest-episode-descriptions',
    descriptionSource: metadataSource.descriptionSource || 'bundled-episode-pages',
    episodes,
    videos: bestVideoCatalog.videos
  };

  fs.mkdirSync(path.dirname(destinationLive), { recursive: true });
  fs.mkdirSync(path.dirname(destinationFallback), { recursive: true });
  const text = JSON.stringify(payload, null, 2) + '\n';
  fs.writeFileSync(destinationLive, text);
  fs.writeFileSync(destinationFallback, text);

  const rich = episodes.filter(episode =>
    String(episode.description || '').length > String(episode.summary || '').length + 40
  ).length;

  console.log(`✅ Recovered videos from: ${bestVideoCatalog.file}`);
  console.log(`✅ Preserved the richest descriptions for ${episodes.length} episodes.`);
  console.log(`📖 ${rich}/${episodes.length} episodes have full show notes.`);
  console.log(`📺 ${counts.shorts} Shorts + ${counts.full} full videos bundled.`);
}
