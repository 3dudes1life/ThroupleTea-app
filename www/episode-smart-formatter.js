(function (root, factory) {
  const formatter = factory();
  if (typeof module === 'object' && module.exports) module.exports = formatter;
  if (root) root.ThroupleTeaEpisodeFormatter = formatter;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '7.9.6';
  const TOPIC_HEADING = /^(?:plus|also|also on the table|in this episode|topics?|what we cover|we also talk about|on the table|inside this episode|we spill|we get into|we break down|also inside)\s*:?\s*$/i;
  const INTRO_HEADING = /^(?:about this episode|episode description|episode summary|show notes?|this week(?:'s episode)?|full episode)\s*:?\s*$/i;
  const CLOSING_HEADING = /^(?:keep the tea going|listen(?: now)?|watch(?: now)?|follow us|subscribe|find us|connect with us|links?)\s*:?\s*$/i;
  const BOILERPLATE = /(?:https?:\/\/|www\.|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:^|\s)@[a-z0-9_.]+|^(?:instagram|facebook|tiktok|youtube|spotify|apple podcasts?|amazon music|iheart|website|email)\s*:|(?:listen|watch|stream)(?: now)? on (?:youtube|spotify|apple podcasts?|amazon music|iheart)|wherever you (?:listen|stream)|sign up for notifications|visit (?:our )?website|follow (?:us|the show)|subscribe (?:to|for)|full video (?:is )?on|audio (?:is )?(?:available )?everywhere|new episodes? (?:drop|every)|rate and review|link in bio|copyright|all rights reserved|produced by|hosted by .*little throuple tea)/i;
  const CLOSING_SIGNAL = /^(?:thanks for listening|until next time|send (?:us )?your questions?|drop (?:us )?a question|keep those questions coming|have a question|want advice|throuple hotline)/i;
  const BULLET_PREFIX = /^[\s]*[•▪◦●○◆◇✦★☆✓✔–—-]+[\s]*/;

  function decodeEntities(value) {
    const named = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
      ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
      rdquo: '”', ldquo: '“', copy: '©', reg: '®'
    };
    return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token) => {
      if (token[0] === '#') {
        const hex = token[1]?.toLowerCase() === 'x';
        const code = parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
      }
      return Object.prototype.hasOwnProperty.call(named, token.toLowerCase()) ? named[token.toLowerCase()] : ' ';
    });
  }

  function stripMarkup(value) {
    return decodeEntities(String(value || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/(?:p|div|li|section|article|h[1-6]|ul|ol|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/gi, '$1')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, ' '));
  }

  function normalize(value) {
    let text = stripMarkup(value)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[\uFFFD\u25A1\u2610\u2753]/g, ' ')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\uFE0E\uFE0F]/g, '');

    try { text = text.replace(/\p{Extended_Pictographic}+/gu, ' '); } catch (_) {}

    return text
      .replace(/\s*\b(Plus|Also on the table|In this episode|We also talk about|What we cover|Topics|We spill|We get into|We break down|Also inside)\s*:\s*/gi, '\n$1:\n')
      .replace(/\s*\b(Keep the tea going|Listen now|Watch now|Follow us|Subscribe)\s*:\s*/gi, '\n$1:\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/([.!?])(?=[A-Z])/g, '$1 ')
      .replace(/\s+([,.;!?])/g, '$1')
      .trim();
  }

  function cleanLine(value) {
    return String(value || '')
      .replace(BULLET_PREFIX, '')
      .replace(/^[^A-Za-z0-9“"'‘]+/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function signature(value) {
    return cleanLine(value).toLowerCase().replace(/[“”‘’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function uniquePush(target, value, seen) {
    const clean = cleanLine(value);
    const key = signature(clean);
    if (!clean || clean.length < 2 || !key || seen.has(key)) return;
    if (clean.length < 12 && /(?:…|\.\.\.)$/.test(clean)) return;
    seen.add(key);
    target.push(clean);
  }

  function sentenceChunks(value, groupSize) {
    const clean = cleanLine(value);
    if (!clean) return [];
    const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/u).map(item => item.trim()).filter(Boolean);
    if (sentences.length <= groupSize) return [clean];
    const result = [];
    for (let index = 0; index < sentences.length; index += groupSize) result.push(sentences.slice(index, index + groupSize).join(' '));
    return result;
  }

  function splitLines(normalized) {
    const lines = [];
    normalized.split('\n').forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;
      if (line.includes('•')) {
        const pieces = line.split(/\s*•\s*/).filter(Boolean);
        if (pieces.length > 1) {
          pieces.forEach((piece, index) => lines.push(index === 0 && !BULLET_PREFIX.test(line) ? piece : `• ${piece}`));
          return;
        }
      }
      lines.push(line);
    });
    return lines;
  }

  function parse(value) {
    const normalized = normalize(value);
    if (!normalized) return { version: VERSION, hash: hash(value), paragraphs: [], topics: [], closing: [], isLong: false, wordCount: 0, empty: true };

    const intro = [];
    const topics = [];
    const closing = [];
    const seen = new Set();
    let mode = 'intro';

    for (const rawLine of splitLines(normalized)) {
      const line = rawLine.trim();
      const clean = cleanLine(line);
      if (!clean || INTRO_HEADING.test(clean)) continue;
      if (TOPIC_HEADING.test(clean)) { mode = 'topics'; continue; }
      if (CLOSING_HEADING.test(clean)) { mode = 'closing'; continue; }

      const isBullet = BULLET_PREFIX.test(line);
      if (BOILERPLATE.test(clean)) { mode = 'closing'; continue; }
      if (CLOSING_SIGNAL.test(clean)) mode = 'closing';
      else if (isBullet) mode = 'topics';

      if (mode === 'topics') {
        if (clean.length <= 190) uniquePush(topics, clean, seen);
        else sentenceChunks(clean, 1).forEach(item => uniquePush(topics, item, seen));
      } else if (mode === 'closing') {
        if (!BOILERPLATE.test(clean)) uniquePush(closing, clean, seen);
      } else {
        uniquePush(intro, clean, seen);
      }
    }

    let paragraphs = [];
    intro.forEach(item => sentenceChunks(item, 2).forEach(chunk => paragraphs.push(chunk)));
    if (!paragraphs.length && topics.length) paragraphs = ['This episode has plenty to unpack. Here is what made it onto the table.'];
    if (!paragraphs.length) paragraphs = [normalized];
    paragraphs = paragraphs.filter((item, index, array) => {
      const key = signature(item);
      return key && array.findIndex(other => signature(other) === key) === index;
    });

    const wordCount = [...paragraphs, ...topics, ...closing].join(' ').split(/\s+/).filter(Boolean).length;
    return {
      version: VERSION,
      hash: hash(normalized),
      paragraphs,
      topics: topics.slice(0, 16),
      closing: closing.slice(0, 3),
      isLong: wordCount > 125 || paragraphs.length > 2 || topics.length > 5 || closing.length > 1,
      wordCount,
      empty: false
    };
  }

  function hash(value) {
    const text = String(value || '');
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  return { VERSION, normalize, parse, hash };
});
