'use strict';
const assert = require('node:assert/strict');
const formatter = require('../www/episode-smart-formatter.js');
assert.equal(formatter.VERSION, '7.9.6.1');
{
  const result = formatter.parse(`<h2>About this episode</h2><p>This week we're talking about love, travel, and chaos. It got weird fast.</p><p>Plus:</p><ul><li>Daniel's online boyfriend</li><li>Hair removal reality check</li><li>Hawaii synchronicity</li></ul><p>Listen on Spotify: https://example.com/episode</p><p>Thanks for listening.</p>`);
  assert.deepEqual(result.paragraphs, ["This week we're talking about love, travel, and chaos. It got weird fast."]);
  assert.deepEqual(result.topics, ["Daniel's online boyfriend", 'Hair removal reality check', 'Hawaii synchronicity']);
  assert.deepEqual(result.closing, ['Thanks for listening.']);
  assert.equal(JSON.stringify(result).includes('https://'), false);
  assert.equal(JSON.stringify(result).toLowerCase().includes('about this episode'), false);
}
{
  const result = formatter.parse('We escaped to Tahoe and Reno. It was exactly what we needed. Plus: • frozen tequila • Lime scooters • casino chaos');
  assert.equal(result.paragraphs.length, 1);
  assert.deepEqual(result.topics, ['frozen tequila', 'Lime scooters', 'casino chaos']);
}
{
  const result = formatter.parse(`Episode Summary:\nWe unpack the unofficial gay rulebook. We unpack the unofficial gay rulebook.\nIn this episode:\n- Dating rules nobody explained\n- Dating rules nobody explained\n- Friendship boundaries`);
  assert.equal(result.paragraphs.length, 1);
  assert.deepEqual(result.topics, ['Dating rules nobody explained', 'Friendship boundaries']);
}
{
  const longDescription = Array.from({ length: 18 }, (_, index) => `This is sentence ${index + 1} with enough detail to make the episode description useful and readable.`).join(' ');
  const result = formatter.parse(longDescription);
  assert.equal(result.isLong, true);
  assert.ok(result.paragraphs.length > 2);
  assert.ok(result.wordCount > 125);
}
{
  const result = formatter.parse('<script>alert(1)</script><p>Actual description.</p><style>body{}</style>');
  assert.deepEqual(result.paragraphs, ['Actual description.']);
}
{
  const result = formatter.parse('Episode 4 is here! We are talking travel chaos. We spill: • Who… • TSA side-eyes • three-in-a-bed hotel math');
  assert.deepEqual(result.paragraphs, ['Episode 4 is here! We are talking travel chaos.']);
  assert.deepEqual(result.topics, ['TSA side-eyes', 'three-in-a-bed hotel math']);
}
{
  const result = formatter.parse(`<p>We finally escaped for a much-needed vacation. It was exactly what we needed.</p><p>Also on the table:</p><p>Frozen tequila</p><p>Lime scooter chaos</p><p>Follow us @throupletea</p><p>Email: throupletea@gmail.com</p><p>Until next time, throuple life does not suck.</p>`);
  assert.deepEqual(result.paragraphs, ['We finally escaped for a much-needed vacation. It was exactly what we needed.']);
  assert.deepEqual(result.topics, ['Frozen tequila', 'Lime scooter chaos']);
  assert.deepEqual(result.closing, ['Until next time, throuple life does not suck.']);
  assert.equal(JSON.stringify(result).includes('@throupletea'), false);
  assert.equal(JSON.stringify(result).includes('gmail.com'), false);
}
{
  const result = formatter.parse(`Full intro paragraph about the episode.

📞 Is this the first hotline question?
📞 Is this the second hotline question?

🌈 Main topic
🔮 Sassy Astrology
😂 Dad Joke of the Week`);
  assert.deepEqual(result.paragraphs, ['Full intro paragraph about the episode.']);
  assert.deepEqual(result.topics, [
    'Is this the first hotline question?',
    'Is this the second hotline question?',
    'Main topic',
    'Sassy Astrology',
    'Dad Joke of the Week'
  ]);
}
console.log('✓ UX7.9.6.1 smart episode formatter tests passed');
