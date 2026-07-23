'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const formatter = require('../www/episode-smart-formatter.js');
const catalogs = ['live-data/content.json', 'www/data/fallback.json'];
let checked = 0;
for (const catalogPath of catalogs) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(Array.isArray(catalog.episodes) && catalog.episodes.length > 0, `${catalogPath} has episodes`);
  for (const episode of catalog.episodes) {
    const source = episode.description || episode.summary || '';
    const result = formatter.parse(source);
    assert.equal(result.version, formatter.VERSION, `${episode.id} uses UX7.9.6`);
    assert.ok(result.empty || result.paragraphs.length > 0, `${episode.id} has readable intro copy`);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /<[^>]+>/, `${episode.id} contains no HTML`);
    assert.doesNotMatch(serialized, /https?:\/\//i, `${episode.id} contains no raw URL`);
    assert.doesNotMatch(serialized, /about this episode/i, `${episode.id} contains no duplicate heading`);
    assert.ok(result.topics.length <= 16, `${episode.id} topic limit is respected`);
    checked += 1;
  }
}
assert.ok(checked >= 70, 'both bundled episode catalogs were checked');
console.log(`✓ UX7.9.6 parsed ${checked} bundled episode records`);
