
(() => {
  'use strict';

  const REMOTE_BASE = 'https://raw.githubusercontent.com/3dudes1life/ThroupleTea-app/main/live-data';
  const FALLBACK_IMAGE = './assets/podcast-artwork.jpg';
  const PLAYER_PAGE = 'https://3dudes1life.github.io/ThroupleTea-app/player/';
  const state = {
    content: { episodes: [], videos: [], generatedAt: null, source: 'fallback' },
    config: { links: {}, starterEpisodeIds: [], announcement: {} },
    favorites: new Set(JSON.parse(localStorage.getItem('tt:favorites') || '[]')),
    progress: JSON.parse(localStorage.getItem('tt:progress') || '{}'),
    currentEpisode: null,
    currentVideo: null,
    activeTab: localStorage.getItem('tt:tab') || 'home',
    remoteLoaded: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const audio = $('#audioPlayer');
  const miniPlayer = $('#miniPlayer');
  const toast = $('#toast');

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[ch]);

  function stripEmojiForMeta(text = '') {
    return String(text).trim();
  }

  function displayTitle(text = '') {
    return String(text)
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\uFE0E\uFE0F]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = Math.floor(value % 60);
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  }

  function videoKind(video) {
    if (video.kind === 'short' || video.kind === 'episode') return video.kind;
    const duration = Number(video.durationSeconds || 0);
    if (duration > 0) return duration < 180 ? 'short' : 'episode';
    return /(^|\s)#?shorts?(\s|$)/i.test(video.title || '') ? 'short' : 'episode';
  }

  function videoDuration(video) {
    const seconds = Number(video.durationSeconds || 0);
    if (!seconds) return video.durationText || '';
    return formatTime(seconds);
  }

  function isNewVideo(video) {
    const timestamp = new Date(video.published || '').getTime();
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000;
  }

  function videoLabel(video) {
    const bits = [];
    const duration = videoDuration(video);
    if (duration) bits.push(duration);
    if (video.published) bits.push(formatDate(video.published));
    return bits.join(' · ');
  }

  function itemKey(type, id) { return `${type}:${id}`; }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  async function haptic(style = 'LIGHT') {
    try {
      const plugin = window.Capacitor?.Plugins?.Haptics;
      if (window.Capacitor?.isNativePlatform?.() && plugin) await plugin.impact({ style });
    } catch (_) {}
  }

  async function openURL(url) {
    if (!url) return;
    await haptic();
    try {
      const browser = window.Capacitor?.Plugins?.Browser;
      if (window.Capacitor?.isNativePlatform?.() && browser && /^https?:/i.test(url)) {
        await browser.open({ url, presentationStyle: 'fullscreen', toolbarColor: '#080610' });
        return;
      }
    } catch (_) {}
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function shareItem(title, url, text = '') {
    await haptic();
    try {
      const nativeShare = window.Capacitor?.Plugins?.Share;
      if (window.Capacitor?.isNativePlatform?.() && nativeShare) {
        await nativeShare.share({ title, text: text || title, url });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text: text || title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('Share canceled');
    }
  }

  function toggleFavorite(type, id) {
    const key = itemKey(type, id);
    if (state.favorites.has(key)) {
      state.favorites.delete(key);
      showToast('Removed from saved');
    } else {
      state.favorites.add(key);
      showToast('Saved');
    }
    localStorage.setItem('tt:favorites', JSON.stringify([...state.favorites]));
    haptic('MEDIUM');
    renderAll();
  }

  function setTab(tab, pushHash = true) {
    if (!['home','listen','watch','hotline','more'].includes(tab)) tab = 'home';
    state.activeTab = tab;
    localStorage.setItem('tt:tab', tab);
    $$('.app-view').forEach(view => view.classList.toggle('active', view.dataset.view === tab));
    $$('.tab-bar button').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    if (pushHash && location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
    window.scrollTo({ top:0, behavior:'smooth' });
    haptic();
    if (tab === 'more') renderSaved();
    refreshRemoteData(false);
  }

  function episodeMeta(ep) {
    if (ep.label) return ep.label;
    const bits = [];
    if (ep.season) bits.push(`S${ep.season}`);
    if (ep.episode) bits.push(`Ep ${ep.episode}`);
    if (ep.date) bits.push(formatDate(ep.date));
    return bits.join(' · ') || 'A Little Throuple Tea';
  }

  function favoriteButton(type, id) {
    const saved = state.favorites.has(itemKey(type, id));
    return `<button class="favorite-button ${saved ? 'saved' : ''}" data-favorite-type="${type}" data-favorite-id="${escapeHTML(id)}" aria-label="${saved ? 'Remove from saved' : 'Save'}">
      <svg viewBox="0 0 24 24"><path d="M12 21s-7-4.6-9.2-9C1.1 8.4 3.1 5 6.7 5c2.1 0 3.6 1.2 4.3 2.3C11.7 6.2 13.2 5 15.3 5c3.6 0 5.6 3.4 3.9 7-2.2 4.4-7.2 9-7.2 9z"/></svg>
    </button>`;
  }

  function episodeCard(ep, compact = false) {
    const savedSeconds = Number(state.progress[ep.id] || 0);
    const resume = savedSeconds > 15 ? `<div class="resume-line">Resume at ${formatTime(savedSeconds)}</div>` : '';
    return `<article class="episode-card" data-episode-id="${escapeHTML(ep.id)}">
      <img src="${escapeHTML(ep.image || FALLBACK_IMAGE)}" alt="" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
      <div class="episode-card__copy">
        <div class="card-meta">${escapeHTML(episodeMeta(ep))}</div>
        <h3>${escapeHTML(displayTitle(ep.title))}</h3>
        ${compact ? '' : `<p>${escapeHTML(ep.summary || '')}</p>`}
        ${resume}
      </div>
      ${favoriteButton('episode', ep.id)}
      <div class="card-actions">
        ${ep.audioUrl ? `<button class="primary" data-play-episode="${escapeHTML(ep.id)}">${state.currentEpisode?.id === ep.id && !audio.paused ? 'Pause' : savedSeconds > 15 ? 'Resume' : 'Play'}</button>` : ''}
        <button data-open-url="${escapeHTML(ep.webUrl || state.config.links.episodes || '')}">Details</button>
        <button data-share-episode="${escapeHTML(ep.id)}">Share</button>
      </div>
    </article>`;
  }

  function shortVideoCard(video) {
    const newBadge = isNewVideo(video) ? `<span class="video-kind-pill new">NEW SHORT</span>` : `<span class="video-kind-pill">SHORT</span>`;
    const duration = videoDuration(video);
    return `<article class="short-video-card">
      <div class="short-video-card__thumb" data-play-video="${escapeHTML(video.id)}">
        <img src="${escapeHTML(video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`)}" alt="" loading="lazy">
        <div class="play-badge"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
        ${duration ? `<span class="video-duration-pill">${escapeHTML(duration)}</span>` : ''}
      </div>
      <div class="short-video-card__body">
        ${newBadge}
        <h3>${escapeHTML(displayTitle(video.title))}</h3>
        <div class="video-actions">
          <button class="primary" data-play-video="${escapeHTML(video.id)}">Watch</button>
          <button data-share-video="${escapeHTML(video.id)}">Share</button>
        </div>
      </div>
      ${favoriteButton('video', video.id)}
    </article>`;
  }

  function fullVideoCard(video) {
    const newBadge = isNewVideo(video) ? `<span class="video-kind-pill new">NEW EPISODE</span>` : `<span class="video-kind-pill">FULL EPISODE</span>`;
    const duration = videoDuration(video);
    return `<article class="full-video-card">
      <div class="full-video-card__thumb" data-play-video="${escapeHTML(video.id)}">
        <img src="${escapeHTML(video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`)}" alt="" loading="lazy">
        <div class="play-badge"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
        ${duration ? `<span class="video-duration-pill">${escapeHTML(duration)}</span>` : ''}
      </div>
      <div class="full-video-card__body">
        ${newBadge}
        <h3>${escapeHTML(displayTitle(video.title))}</h3>
        <p>${escapeHTML(videoLabel(video))}</p>
        <div class="video-actions">
          <button class="primary" data-play-video="${escapeHTML(video.id)}">Play in app</button>
          <button data-share-video="${escapeHTML(video.id)}">Share</button>
        </div>
      </div>
      ${favoriteButton('video', video.id)}
    </article>`;
  }

  function videoCard(video) {
    return videoKind(video) === 'short' ? shortVideoCard(video) : fullVideoCard(video);
  }

  function renderHome() {
    const latest = state.content.episodes[0];
    const hero = $('#homeHero');
    if (!latest) {
      hero.innerHTML = `<div class="empty-state">The tea is brewing. Pull down or tap refresh.</div>`;
      return;
    }
    const savedSeconds = Number(state.progress[latest.id] || 0);
    hero.innerHTML = `<article class="hero-card">
      <div class="hero-card__art"><img src="${escapeHTML(latest.image || FALLBACK_IMAGE)}" alt="" onerror="this.src='${FALLBACK_IMAGE}'"></div>
      <div class="hero-card__body">
        <div class="hero-card__meta"><span class="live-pill">LATEST EPISODE</span><span class="card-meta">${escapeHTML(episodeMeta(latest))}</span></div>
        <h1>${escapeHTML(displayTitle(latest.title))}</h1>
        <p>${escapeHTML(latest.summary || '')}</p>
        <div class="action-row">
          ${latest.audioUrl ? `<button class="gradient-button" data-play-episode="${escapeHTML(latest.id)}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${savedSeconds > 15 ? `Resume ${formatTime(savedSeconds)}` : 'Play episode'}</button>` : ''}
          <button class="outline-button" data-open-url="${escapeHTML(latest.webUrl || state.config.links.episodes || '')}">Episode page</button>
          <button class="outline-button" data-share-episode="${escapeHTML(latest.id)}"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>Share</button>
        </div>
      </div>
    </article>`;

    const progressed = state.content.episodes
      .map(ep => ({ ep, seconds: Number(state.progress[ep.id] || 0) }))
      .filter(item => item.seconds > 15)
      .sort((a, b) => b.seconds - a.seconds)[0];
    const continueSection = $('#continueSection');
    if (progressed) {
      continueSection.hidden = false;
      $('#continueCard').innerHTML = episodeCard(progressed.ep, true);
    } else {
      continueSection.hidden = true;
      $('#continueCard').innerHTML = '';
    }

    const latestVideo = state.content.videos[0];
    $('#homeVideo').innerHTML = latestVideo ? `<article class="feature-video" data-play-video="${escapeHTML(latestVideo.id)}">
      <div class="feature-video__thumb">
        <img src="${escapeHTML(latestVideo.thumbnail || `https://i.ytimg.com/vi/${latestVideo.id}/hqdefault.jpg`)}" alt="">
        <div class="play-badge"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
      </div>
      <div class="feature-video__copy">
        <span class="card-meta">${escapeHTML(formatDate(latestVideo.published))}</span>
        <h3>${escapeHTML(displayTitle(latestVideo.title))}</h3>
        <button class="small-button" data-play-video="${escapeHTML(latestVideo.id)}">Watch now</button>
      </div>
    </article>` : `<div class="empty-state">Latest YouTube videos will appear after the first live-data refresh.</div>`;

    const starterIds = state.config.starterEpisodeIds || [];
    let starters = starterIds.map(id => state.content.episodes.find(ep => ep.id.includes(id))).filter(Boolean);
    if (!starters.length) starters = state.content.episodes.slice(0, 4);
    $('#starterRail').innerHTML = starters.map(ep => `<article class="rail-card">
      <img src="${escapeHTML(ep.image || FALLBACK_IMAGE)}" alt="" loading="lazy">
      <div class="rail-card__body">
        <span class="card-meta">${escapeHTML(episodeMeta(ep))}</span>
        <h3>${escapeHTML(displayTitle(ep.title))}</h3>
        <button class="small-button" data-play-episode="${escapeHTML(ep.id)}">${ep.audioUrl ? 'Play episode' : 'Open episode'}</button>
      </div>
    </article>`).join('');

    const a = state.config.announcement || {};
    $('#announcementCard').innerHTML = `<article class="announcement">
      <span class="eyebrow">${escapeHTML(a.eyebrow || 'LIVE CONTENT')}</span>
      <h2>${escapeHTML(a.headline || 'Fresh tea, no weekly app rebuild.')}</h2>
      <p>${escapeHTML(a.message || '')}</p>
      ${a.ctaUrl ? `<button class="outline-button" data-open-url="${escapeHTML(a.ctaUrl)}">${escapeHTML(a.ctaLabel || 'Open')}</button>` : ''}
    </article>`;
  }

  function renderEpisodes() {
    const query = ($('#episodeSearch')?.value || '').trim().toLowerCase();
    const list = state.content.episodes.filter(ep => `${ep.title} ${ep.summary} ${ep.label}`.toLowerCase().includes(query));
    $('#episodeList').innerHTML = list.length ? list.map(ep => episodeCard(ep)).join('') : `<div class="empty-state">No episode matched that search.</div>`;
  }

  function renderVideos() {
    const videos = [...(state.content.videos || [])];
    const shorts = videos.filter(video => videoKind(video) === 'short');
    const fullEpisodes = videos.filter(video => videoKind(video) === 'episode');
    const featured = videos[0] || null;

    $('#shortsCount').textContent = shorts.length;
    $('#fullVideosCount').textContent = fullEpisodes.length;

    $('#watchFeatured').innerHTML = featured ? `<article class="watch-featured-card">
      <div class="watch-featured-card__thumb" data-play-video="${escapeHTML(featured.id)}">
        <img src="${escapeHTML(featured.thumbnail || `https://i.ytimg.com/vi/${featured.id}/hqdefault.jpg`)}" alt="">
        <div class="play-badge"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
        ${videoDuration(featured) ? `<span class="video-duration-pill">${escapeHTML(videoDuration(featured))}</span>` : ''}
      </div>
      <div class="watch-featured-card__body">
        <span class="video-kind-pill ${isNewVideo(featured) ? 'new' : ''}">${isNewVideo(featured) ? 'LATEST DROP' : videoKind(featured) === 'short' ? 'SHORT' : 'FULL EPISODE'}</span>
        <h2>${escapeHTML(displayTitle(featured.title))}</h2>
        <p>${escapeHTML(videoLabel(featured))}</p>
        <div class="watch-featured-actions">
          <button class="primary" data-play-video="${escapeHTML(featured.id)}">Play in app</button>
          <button class="secondary" data-share-video="${escapeHTML(featured.id)}">Share</button>
        </div>
      </div>
      ${favoriteButton('video', featured.id)}
    </article>` : `<div class="video-card-empty"><strong>The Watch page is refreshing.</strong>Your full YouTube catalog will appear after the live-data updater runs.</div>`;

    $('#shortsRail').innerHTML = shorts.length
      ? shorts.map(shortVideoCard).join('')
      : `<div class="video-card-empty"><strong>No Shorts loaded yet.</strong>Run the live-data workflow once after uploading UX4.</div>`;

    $('#fullVideoGrid').innerHTML = fullEpisodes.length
      ? fullEpisodes.map(fullVideoCard).join('')
      : `<div class="video-card-empty"><strong>No full episodes loaded yet.</strong>Run the live-data workflow once after uploading UX4.</div>`;
  }

  function renderSaved() {
    const items = [];
    for (const key of state.favorites) {
      const [type, id] = key.split(':');
      if (type === 'episode') {
        const ep = state.content.episodes.find(x => x.id === id);
        if (ep) items.push(episodeCard(ep, true));
      } else if (type === 'video') {
        const video = state.content.videos.find(x => x.id === id);
        if (video) items.push(videoCard(video));
      }
    }
    $('#savedCount').textContent = items.length;
    $('#savedList').innerHTML = items.length ? items.join('') : `<div class="empty-state">Tap the heart on an episode or video to keep it here.</div>`;
  }

  function renderStatus() {
    const generated = state.content.generatedAt ? formatDate(state.content.generatedAt) : 'bundled copy';
    $('#dataStatus').textContent = state.remoteLoaded
      ? `Live data refreshed ${generated}. The app checks again whenever it opens.`
      : `Using the bundled or saved copy while live data connects.`;
  }

  function renderAll() {
    renderHome();
    renderEpisodes();
    renderVideos();
    renderSaved();
    renderStatus();
    wireDynamicButtons();
  }

  function wireDynamicButtons() {
    $$('[data-play-episode]').forEach(button => {
      button.onclick = () => {
        const ep = state.content.episodes.find(x => x.id === button.dataset.playEpisode);
        if (!ep) return;
        if (!ep.audioUrl) return openURL(ep.webUrl);
        playEpisode(ep);
      };
    });
    $$('[data-open-url]').forEach(button => button.onclick = () => openURL(button.dataset.openUrl));
    $$('[data-share-episode]').forEach(button => button.onclick = () => {
      const ep = state.content.episodes.find(x => x.id === button.dataset.shareEpisode);
      if (ep) shareItem(ep.title, ep.webUrl || state.config.links.episodes, 'Listen to this episode of A Little Throuple Tea');
    });
    $$('[data-share-video]').forEach(button => button.onclick = () => {
      const video = state.content.videos.find(x => x.id === button.dataset.shareVideo);
      if (video) shareItem(video.title, video.url || `https://youtu.be/${video.id}`, 'Watch this from A Little Throuple Tea');
    });
    $$('[data-play-video]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      openVideo(button.dataset.playVideo);
    });
    $$('[data-favorite-type]').forEach(button => button.onclick = () => toggleFavorite(button.dataset.favoriteType, button.dataset.favoriteId));
  }

  async function playEpisode(ep) {
    if (state.currentEpisode?.id === ep.id) {
      if (audio.paused) await audio.play();
      else audio.pause();
      return;
    }
    state.currentEpisode = ep;
    audio.src = ep.audioUrl;
    $('#playerArtwork').src = FALLBACK_IMAGE;
    $('#playerTitle').textContent = displayTitle(ep.title);
    miniPlayer.hidden = false;
    const saved = Number(state.progress[ep.id] || 0);
    audio.addEventListener('loadedmetadata', () => {
      if (saved > 0 && saved < audio.duration - 15) audio.currentTime = saved;
      updatePlayerUI();
    }, { once:true });
    try {
      await audio.play();
      setupMediaSession(ep);
    } catch (_) {
      showToast('Tap play again to start audio');
    }
    renderAll();
  }

  function setupMediaSession(ep) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle(ep.title),
        artist: 'William, Caleb + Daniel',
        album: 'A Little Throuple Tea',
        artwork: [{ src: ep.image || new URL(FALLBACK_IMAGE, location.href).href, sizes:'512x512', type:'image/jpeg' }]
      });
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('seekbackward', details => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 15)); });
      navigator.mediaSession.setActionHandler('seekforward', details => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 30)); });
    } catch (_) {}
  }

  function updatePlayerUI() {
    if (!state.currentEpisode) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    $('#playerTime').textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
    $('#playerSeek').value = duration ? (audio.currentTime / duration) * 100 : 0;
    miniPlayer.classList.toggle('playing', !audio.paused);
  }

  async function openVideo(id) {
    const video = state.content.videos.find(item => item.id === id);
    if (!video) return;
    await haptic('MEDIUM');

    state.currentVideo = video;
    const modal = $('#videoPlayerModal');
    const stage = $('#videoPlayerStage');
    const frame = $('#videoPlayerFrame');
    const kind = videoKind(video);
    const playerUrl = new URL(PLAYER_PAGE);
    playerUrl.searchParams.set('v', video.id);
    playerUrl.searchParams.set('kind', kind);
    playerUrl.searchParams.set('title', displayTitle(video.title));

    $('#videoPlayerHeaderTitle').textContent = displayTitle(video.title);
    $('#videoPlayerTitle').textContent = displayTitle(video.title);
    $('#videoPlayerKind').textContent = kind === 'short' ? 'WATCHING A SHORT' : 'WATCHING A FULL EPISODE';
    $('#videoPlayerMeta').textContent = videoLabel(video);
    stage.classList.toggle('is-short', kind === 'short');
    frame.src = playerUrl.toString();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeVideoPlayer() {
    const modal = $('#videoPlayerModal');
    $('#videoPlayerFrame').src = 'about:blank';
    modal.hidden = true;
    document.body.style.overflow = '';
    state.currentVideo = null;
  }

  function shareCurrentVideo() {
    const video = state.currentVideo;
    if (!video) return;
    shareItem(displayTitle(video.title), video.url || `https://youtu.be/${video.id}`, 'Watch this from A Little Throuple Tea');
  }

  function openCurrentVideoOnYouTube() {
    const video = state.currentVideo;
    if (!video) return;
    openURL(video.url || `https://www.youtube.com/watch?v=${video.id}`);
  }


  function emailHotline() {
    const email = state.config.links.email || 'throupletea@gmail.com';
    const subject = 'Throuple Tea Submission';
    const body = [
      'Name or nickname:',
      '',
      'Keep me anonymous on the podcast: Yes / No',
      '',
      'My question or story:',
      '',
      '',
      'Sent from the A Little Throuple Tea app'
    ].join('\n');
    location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function closePlayer() {
    if (state.currentEpisode && Number.isFinite(audio.currentTime) && audio.currentTime > 0) {
      state.progress[state.currentEpisode.id] = Math.floor(audio.currentTime);
      localStorage.setItem('tt:progress', JSON.stringify(state.progress));
    }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.currentEpisode = null;
    miniPlayer.hidden = true;
    miniPlayer.classList.remove('playing');
    $('#playerTitle').textContent = 'Episode';
    $('#playerTime').textContent = '0:00 / 0:00';
    $('#playerSeek').value = 0;
    $('#playerArtwork').src = FALLBACK_IMAGE;
    renderAll();
  }

  async function loadJSON(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache:'no-store', signal:controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadInitialData() {
    const [fallback, localConfig] = await Promise.all([
      loadJSON('./data/fallback.json'),
      loadJSON('./data/app-config.json')
    ]);
    const cached = localStorage.getItem('tt:content-cache');
    const cachedConfig = localStorage.getItem('tt:config-cache');
    state.content = cached ? JSON.parse(cached) : fallback;
    state.config = cachedConfig ? JSON.parse(cachedConfig) : localConfig;
    renderAll();
    await refreshRemoteData(false);
  }

  async function refreshRemoteData(showFeedback = true) {
    const button = $('#refreshButton');
    button?.classList.add('spinning');
    try {
      const stamp = Date.now();
      const [content, config] = await Promise.all([
        loadJSON(`${REMOTE_BASE}/content.json?v=${stamp}`),
        loadJSON(`${REMOTE_BASE}/app-config.json?v=${stamp}`)
      ]);
      if (content?.episodes?.length) {
        state.content = content;
        state.remoteLoaded = true;
        localStorage.setItem('tt:content-cache', JSON.stringify(content));
      }
      if (config?.links) {
        state.config = config;
        localStorage.setItem('tt:config-cache', JSON.stringify(config));
      }
      renderAll();
      if (showFeedback) showToast('Fresh tea loaded');
      $('#offlineBanner').hidden = true;
    } catch (error) {
      if (showFeedback) showToast('Using the freshest saved copy');
      if (!navigator.onLine) $('#offlineBanner').hidden = false;
    } finally {
      button?.classList.remove('spinning');
    }
  }


  function bindStaticEvents() {
    $$('.tab-bar button').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
    $$('[data-tab-jump]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tabJump)));
    $$('[data-open-config]').forEach(button => button.addEventListener('click', () => openURL(state.config.links[button.dataset.openConfig])));
    $$('[data-open-url]').forEach(button => button.addEventListener('click', () => openURL(button.dataset.openUrl)));
    $('#refreshButton').addEventListener('click', () => refreshRemoteData(true));
    $('#moreRefresh').addEventListener('click', () => refreshRemoteData(true));
    $('#episodeSearch').addEventListener('input', () => { renderEpisodes(); wireDynamicButtons(); });
    $('#surpriseMeButton').addEventListener('click', () => {
      const playable = state.content.episodes.filter(ep => ep.audioUrl);
      if (!playable.length) return showToast('No playable episodes loaded yet');
      const episode = playable[Math.floor(Math.random() * playable.length)];
      playEpisode(episode);
      showToast('The universe chose this one');
    });
    $('#closeVideoPlayer').addEventListener('click', closeVideoPlayer);
    $('#shareCurrentVideo').addEventListener('click', shareCurrentVideo);
    $('#youtubeFallbackButton').addEventListener('click', openCurrentVideoOnYouTube);
    $('#videoPlayerFrame').addEventListener('load', () => {
      $('#videoPlayerStage')?.classList.add('loaded');
    });
    $('#emailHotline').addEventListener('click', emailHotline);
    $('#closePlayerButton').addEventListener('click', closePlayer);
    $('#playPauseButton').addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
    $('#rewindButton').addEventListener('click', () => audio.currentTime = Math.max(0, audio.currentTime - 15));
    $('#forwardButton').addEventListener('click', () => audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 30));
    $('#playerSeek').addEventListener('input', event => {
      if (Number.isFinite(audio.duration)) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#videoPlayerModal').hidden) closeVideoPlayer();
    });
    window.addEventListener('online', () => { $('#offlineBanner').hidden = true; refreshRemoteData(false); });
    window.addEventListener('offline', () => { $('#offlineBanner').hidden = false; });
    window.addEventListener('focus', () => refreshRemoteData(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRemoteData(false); });

    audio.addEventListener('play', () => { updatePlayerUI(); renderAll(); });
    audio.addEventListener('pause', () => { updatePlayerUI(); renderAll(); });
    audio.addEventListener('timeupdate', () => {
      updatePlayerUI();
      if (state.currentEpisode && Math.floor(audio.currentTime) % 5 === 0) {
        state.progress[state.currentEpisode.id] = Math.floor(audio.currentTime);
        localStorage.setItem('tt:progress', JSON.stringify(state.progress));
      }
    });
    audio.addEventListener('ended', () => {
      if (state.currentEpisode) {
        delete state.progress[state.currentEpisode.id];
        localStorage.setItem('tt:progress', JSON.stringify(state.progress));
      }
      updatePlayerUI();
      renderAll();
    });

    try {
      const appPlugin = window.Capacitor?.Plugins?.App;
      appPlugin?.addListener?.('appStateChange', ({ isActive }) => { if (isActive) refreshRemoteData(false); });
      const networkPlugin = window.Capacitor?.Plugins?.Network;
      networkPlugin?.addListener?.('networkStatusChange', status => {
        $('#offlineBanner').hidden = status.connected;
        if (status.connected) refreshRemoteData(false);
      });
      const statusBar = window.Capacitor?.Plugins?.StatusBar;
      statusBar?.setStyle?.({ style:'DARK' }).catch(() => {});
      statusBar?.setBackgroundColor?.({ color:'#080610' }).catch(() => {});
      window.Capacitor?.Plugins?.SplashScreen?.hide?.().catch(() => {});
    } catch (_) {}
  }

  const initialHash = location.hash.replace('#','');
  if (initialHash) state.activeTab = initialHash;
  bindStaticEvents();
  setTab(state.activeTab, false);
  loadInitialData().catch(error => {
    console.error(error);
    showToast('Could not load the bundled app data');
  });
  setInterval(() => refreshRemoteData(false), 15 * 60 * 1000);
})();
