'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = fs.readFileSync('www/app.js', 'utf8');
const css = fs.readFileSync('www/app.css', 'utf8');
const html = fs.readFileSync('www/index.html', 'utf8');
const build = fs.readFileSync('BUILD_UX7.9.6_AND_OPEN_XCODE.command', 'utf8');
const checks = [
  [html.indexOf('episode-smart-formatter.js') < html.indexOf('app.js'), 'formatter loads before app.js'],
  [app.includes('formattedEpisodeDescription'), 'smart formatter is integrated'],
  [app.includes('data-description-toggle'), 'Read More / Read Less is wired'],
  [app.includes('ALSO ON THE TABLE'), 'topic cards are rendered'],
  [app.includes('KEEP THE TEA GOING'), 'polished footer is rendered'],
  [app.includes('episode-format-cache'), 'cleaned descriptions are cached'],
  [app.includes('nativeEpisodeLoadingHTML'), 'native loading state exists'],
  [app.includes('Resume at ${formatTime(savedSeconds)}'), 'resume state is polished'],
  [css.includes('UX7.9.6 — smart native Episode Detail'), 'UX7.9.6 styles exist'],
  [css.includes('.episode-topic-card'), 'topic cards are styled'],
  [css.includes('.episode-read-toggle'), 'read toggle is styled'],
  [build.includes('UX7.9.6'), 'build identifies UX7.9.6'],
  [build.includes('npm test'), 'build runs tests']
];
for (const [passed, message] of checks) assert.ok(passed, message);
assert.equal((app.match(/ABOUT THIS EPISODE/g) || []).length, 0, 'duplicate About this episode labels are removed');
console.log('✓ UX7.9.6 integration verification passed');
