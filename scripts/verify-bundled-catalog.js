#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'www', 'data', 'fallback.json');

try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const videos = Array.isArray(data.videos) ? data.videos : [];
  const shorts = videos.filter(v => v && v.kind === 'short').length;
  const full = videos.filter(v => v && v.kind === 'episode').length;

  console.log(`📺 Bundled catalog: ${shorts} Shorts + ${full} full videos`);

  if (videos.length < 5) {
    console.log('⚠️ Small bundled catalog. The app will still load the live GitHub catalog after launch.');
    process.exitCode = 2;
  } else {
    console.log('✅ Healthy YouTube catalog will be bundled into the iOS app.');
  }
} catch (error) {
  console.log(`⚠️ Could not verify bundled catalog: ${error.message}`);
  process.exitCode = 2;
}
