'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const formatter = require('../www/episode-smart-formatter.js');
const catalogs = ['live-data/content.json', 'www/data/fallback.json'];
let checked = 0;

for (const catalogPath of catalogs) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(Array.isArray(catalog.episodes) && catalog.episodes.length > 0, `${catalogPath} has episodes`);
  assert.equal(catalog.descriptionSource, 'bundled-episode-pages', `${catalogPath} uses local full descriptions`);

  for (const episode of catalog.episodes) {
    const summary = String(episode.summary || '').trim();
    const source = String(episode.description || '').trim();
    assert.ok(source.length > summary.length + 40, `${episode.id} has a full description, not the card summary`);
    assert.doesNotMatch(source, /(?:…|\.\.\.)\s*$/, `${episode.id} does not end in a truncation ellipsis`);

    const result = formatter.parse(source);
    assert.equal(result.version, formatter.VERSION, `${episode.id} uses the current formatter`);
    assert.ok(result.paragraphs.length > 0, `${episode.id} has readable intro copy`);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /<[^>]+>/, `${episode.id} contains no HTML`);
    assert.doesNotMatch(serialized, /https?:\/\//i, `${episode.id} contains no raw URL`);
    assert.doesNotMatch(serialized, /about this episode/i, `${episode.id} contains no duplicate heading`);
    assert.ok(result.topics.length <= 16, `${episode.id} topic limit is respected`);
    checked += 1;
  }

  const rulebook = catalog.episodes.find(episode => /gay rulebook we never received/i.test(episode.title || ''));
  assert.ok(rulebook, `${catalogPath} contains Gay Rulebook`);
  assert.ok(rulebook.description.length > 900, `${catalogPath} preserves the Gay Rulebook full show notes`);
  const formattedRulebook = formatter.parse(rulebook.description);
  assert.ok(formattedRulebook.paragraphs.length >= 4, 'Gay Rulebook keeps all intro paragraphs');
  assert.ok(formattedRulebook.topics.length >= 10, 'Gay Rulebook creates Also on the Table cards');
  assert.ok(formattedRulebook.topics.includes('Sassy Astrology'), 'Gay Rulebook keeps Sassy Astrology');
  assert.ok(formattedRulebook.topics.includes('Dad Joke of the Week'), 'Gay Rulebook keeps Dad Joke of the Week');
}

assert.ok(checked >= 70, 'both bundled episode catalogs were checked');
console.log(`✓ Full-description regression test passed for ${checked} bundled episode records`);
