// watch.js
// Pulls videos from your channel and splits them into:
// - Shorts: duration < 180 seconds
// - Full episodes: duration >= 180 seconds

const API_KEY = 'AIzaSyCakGcpxrr8UU5V4dqKhwGz-IGpxlrSl-0';  // <- REPLACE THIS
const CHANNEL_ID = 'UCswzye8bcm8bByqLlW0QaFQ';
const MAX_RESULTS = 50; // enough for your current catalog

const shortsGrid   = document.getElementById('shorts-grid');
const episodesGrid = document.getElementById('episodes-grid');
const shortsNote   = document.getElementById('shorts-note');
const shortsError  = document.getElementById('shorts-error');
const episodesNote = document.getElementById('episodes-note');
const episodesError= document.getElementById('episodes-error');

// Utility: parse ISO 8601 YouTube duration (PT#M#S) -> seconds
function parseDurationToSeconds(iso) {
  // Examples: PT59S, PT1M2S, PT10M, PT1H2M10S
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const mins  = parseInt(match[2] || '0', 10);
  const secs  = parseInt(match[3] || '0', 10);
  return hours * 3600 + mins * 60 + secs;
}

async function fetchVideos() {
  try {
    // 1. Get list of recent videos from channel
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?` +
      `key=${API_KEY}` +
      `&channelId=${CHANNEL_ID}` +
      `&part=snippet,id` +
      `&order=date` +
      `&maxResults=${MAX_RESULTS}` +
      `&type=video`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items) {
      throw new Error('No videos returned from YouTube API.');
    }

    const videoIds = searchData.items
      .filter(item => item.id && item.id.videoId)
      .map(item => item.id.videoId);

    if (videoIds.length === 0) {
      throw new Error('No video IDs found for this channel.');
    }

    // 2. Get details (including duration) for all videos
    const detailsUrl =
      `https://www.googleapis.com/youtube/v3/videos?` +
      `key=${API_KEY}` +
      `&id=${videoIds.join(',')}` +
      `&part=contentDetails,snippet`;

    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    const shorts = [];
    const episodes = [];

    for (const item of detailsData.items || []) {
      const durationIso = item.contentDetails?.duration;
      const snippet = item.snippet;
      const videoId = item.id;

      if (!durationIso || !snippet || !videoId) continue;

      const seconds = parseDurationToSeconds(durationIso);
      const title   = snippet.title;
      const publishedAt = new Date(snippet.publishedAt);

      const videoObj = { id: videoId, title, seconds, publishedAt };

      if (seconds < 180) {
        shorts.push(videoObj);
      } else {
        episodes.push(videoObj);
      }
    }

    // Sort newest -> oldest
    shorts.sort((a,b) => b.publishedAt - a.publishedAt);
    episodes.sort((a,b) => b.publishedAt - a.publishedAt);

    renderVideos(shortsGrid, shorts, 'short');
    renderVideos(episodesGrid, episodes, 'episode');

    shortsNote.textContent   = shorts.length
      ? `Showing ${shorts.length} short${shorts.length === 1 ? '' : 's'} under 3 minutes.`
      : `No shorts found yet — check back soon.`;

    episodesNote.textContent = episodes.length
      ? `Showing ${episodes.length} full episode${episodes.length === 1 ? '' : 's'}.`
      : `No full episodes found yet — check back soon.`;

  } catch (err) {
    console.error(err);
    const msg = 'Oops, we couldn’t load videos from YouTube right now. Try refreshing in a bit.';
    if (shortsError) {
      shortsError.style.display = 'block';
      shortsError.textContent = msg;
    }
    if (episodesError) {
      episodesError.style.display = 'block';
      episodesError.textContent = msg;
    }
  }
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function renderVideos(container, videos, type) {
  if (!container) return;
  container.innerHTML = '';

  videos.forEach(video => {
    const card = document.createElement('article');
    card.className = 'video-card';

    const thumb = document.createElement('div');
    thumb.className = 'video-thumb';
    thumb.innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${video.id}"
        title="${video.title.replace(/"/g, '&quot;')}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;

    const meta = document.createElement('div');
    meta.className = 'video-meta';

    const titleEl = document.createElement('h3');
    titleEl.className = 'video-title';
    titleEl.textContent = video.title;

    const extra = document.createElement('div');
    extra.className = 'video-extra';

    const dur = document.createElement('span');
    dur.textContent = formatDuration(video.seconds);

    const date = document.createElement('span');
    date.textContent = video.publishedAt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    extra.appendChild(dur);
    extra.appendChild(date);

    meta.appendChild(titleEl);
    meta.appendChild(extra);

    card.appendChild(thumb);
    card.appendChild(meta);

    container.appendChild(card);
  });
}

// Kick it off
fetchVideos();
