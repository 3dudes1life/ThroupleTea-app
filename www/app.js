
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
    bowlData: { minPlayers: 2, maxPlayers: 9, packs: [] },
    bowlFavorites: new Set(JSON.parse(localStorage.getItem('tt:bowl-favorites') || '[]')),
    bowl: {
      phase: 'setup',
      playerCount: Number(localStorage.getItem('tt:bowl-player-count') || 3),
      playerNames: JSON.parse(localStorage.getItem('tt:bowl-player-names') || '[]'),
      selectedPacks: new Set(JSON.parse(localStorage.getItem('tt:bowl-selected-packs') || '["classic-chaos"]')),
      deck: [],
      history: [],
      currentCard: null,
      currentPlayerIndex: 0,
      shakeEnabled: false,
      drawing: false,
      captain: null,
    },
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
    if (!['home','listen','bowl','watch','hotline','more'].includes(tab)) tab = 'home';
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
          <button class="primary" data-play-video="${escapeHTML(video.id)}">Play</button>
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
          <button class="primary" data-play-video="${escapeHTML(featured.id)}">Play</button>
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


  const BOWL_ACCENTS = {
    pink: '#ff236f',
    orange: '#ff7a18',
    teal: '#20dce4',
    red: '#ff3d55',
    purple: '#a864ff',
  };

  function bowlPackIcon(packId) {
    const icons = {
      'classic-chaos': '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/></svg>',
      'most-likely': '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-4 2.5-6 6-6s6 2 6 6M14 15c3.4-.7 7 1 7 5"/></svg>',
      'would-you-rather': '<svg viewBox="0 0 24 24"><path d="M5 5h6v6H5zM13 13h6v6h-6z"/><path d="M11 8h5c2 0 3 1 3 3v2M13 16H8c-2 0-3-1-3-3v-2"/></svg>',
      'red-flag': '<svg viewBox="0 0 24 24"><path d="M6 21V3M7 4h11l-3 4 3 4H7"/></svg>',
      'astrology-chaos': '<svg viewBox="0 0 24 24"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/></svg>',
    };
    return icons[packId] || icons['classic-chaos'];
  }

  function bowlPackById(id) {
    return state.bowlData.packs.find(pack => pack.id === id);
  }

  function clampPlayerCount(value) {
    const min = Number(state.bowlData.minPlayers || 2);
    const max = Number(state.bowlData.maxPlayers || 9);
    return Math.max(min, Math.min(max, Number(value) || 3));
  }

  function currentPlayers() {
    const count = clampPlayerCount(state.bowl.playerCount);
    return Array.from({ length: count }, (_, index) => {
      const saved = String(state.bowl.playerNames[index] || '').trim();
      return saved || `Player ${index + 1}`;
    });
  }

  function saveBowlSetup() {
    localStorage.setItem('tt:bowl-player-count', String(state.bowl.playerCount));
    localStorage.setItem('tt:bowl-player-names', JSON.stringify(state.bowl.playerNames));
    localStorage.setItem('tt:bowl-selected-packs', JSON.stringify([...state.bowl.selectedPacks]));
  }

  function shuffleCards(cards) {
    const result = [...cards];
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function renderBowlPackGrid() {
    const grid = $('#bowlPackGrid');
    if (!grid) return;
    grid.innerHTML = state.bowlData.packs.map(pack => {
      const selected = state.bowl.selectedPacks.has(pack.id);
      const accent = BOWL_ACCENTS[pack.accent] || BOWL_ACCENTS.pink;
      return `<button class="bowl-pack-card ${selected ? 'selected' : ''}" type="button"
        data-bowl-pack="${escapeHTML(pack.id)}"
        style="--pack-accent:${accent};--pack-glow:${accent}44">
        <span class="pack-count">${pack.cards.length} cards</span>
        <span class="bowl-pack-card__icon">${bowlPackIcon(pack.id)}</span>
        <strong>${escapeHTML(pack.name)}</strong>
        <small>${escapeHTML(pack.description)}</small>
        <span class="bowl-pack-check"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>
      </button>`;
    }).join('');

    $$('[data-bowl-pack]').forEach(button => {
      button.onclick = () => {
        const id = button.dataset.bowlPack;
        if (state.bowl.selectedPacks.has(id)) {
          if (state.bowl.selectedPacks.size === 1) {
            showToast('Keep at least one pack selected');
            return;
          }
          state.bowl.selectedPacks.delete(id);
        } else {
          state.bowl.selectedPacks.add(id);
        }
        saveBowlSetup();
        renderBowlPackGrid();
        haptic('LIGHT');
      };
    });
  }

  function renderPlayerInputs() {
    const container = $('#playerInputs');
    if (!container) return;
    state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount);
    $('#playerCount').textContent = state.bowl.playerCount;
    container.innerHTML = Array.from({ length: state.bowl.playerCount }, (_, index) => `
      <label class="player-name-field">
        <span>${index + 1}</span>
        <input type="text" maxlength="24" data-player-index="${index}"
          value="${escapeHTML(state.bowl.playerNames[index] || '')}"
          placeholder="Player ${index + 1}">
      </label>
    `).join('');

    $$('[data-player-index]').forEach(input => {
      input.addEventListener('input', () => {
        state.bowl.playerNames[Number(input.dataset.playerIndex)] = input.value;
        saveBowlSetup();
      });
    });
  }

  function renderBowlSetup() {
    if (!$('#bowlSetup')) return;
    renderBowlPackGrid();
    renderPlayerInputs();
    $('#bowlSetup').hidden = state.bowl.phase !== 'setup';
    $('#bowlGame').hidden = state.bowl.phase !== 'game';
    $('#bowlSummary').hidden = state.bowl.phase !== 'summary';

    const shakeButton = $('#enableShakeButton');
    if (shakeButton) {
      shakeButton.classList.toggle('enabled', state.bowl.shakeEnabled);
      $('#shakeStatus').textContent = state.bowl.shakeEnabled ? 'Enabled — shake when the bowl is ready' : 'Tap to enable on iPhone';
    }
  }

  function renderBowlGame() {
    if (!$('#bowlGame') || state.bowl.phase !== 'game') return;
    const players = currentPlayers();
    const activePlayer = players[state.bowl.currentPlayerIndex % players.length];
    const selectedNames = [...state.bowl.selectedPacks]
      .map(id => bowlPackById(id)?.shortName)
      .filter(Boolean);

    $('#bowlPackLabel').textContent = selectedNames.length === 1 ? selectedNames[0].toUpperCase() : `${selectedNames.length} PACK MIX`;
    $('#bowlTurnLabel').textContent = `Pass to ${activePlayer}`;
    $('#bowlProgressText').textContent = `${state.bowl.history.length} card${state.bowl.history.length === 1 ? '' : 's'} drawn`;
    $('#bowlRemainingText').textContent = `${state.bowl.deck.length} remaining`;
    $('#historyCount').textContent = state.bowl.history.length;

    const historyList = $('#bowlHistoryList');
    historyList.innerHTML = state.bowl.history.length
      ? [...state.bowl.history].reverse().map((item, reverseIndex) => `
          <article class="bowl-history-item">
            <span>${escapeHTML(item.player)} · ${escapeHTML(item.packName)} · Card ${state.bowl.history.length - reverseIndex}</span>
            <p>${escapeHTML(item.text)}</p>
          </article>`).join('')
      : `<div class="bowl-history-empty">Your drawn cards will appear here.</div>`;

    const current = state.bowl.currentCard;
    const reveal = $('#bowlCardReveal');
    reveal.hidden = !current;
    $('#bowlStage').hidden = Boolean(current);
    if (current) {
      const pack = bowlPackById(current.packId);
      const accent = BOWL_ACCENTS[pack?.accent] || BOWL_ACCENTS.pink;
      reveal.style.setProperty('--card-accent', accent);
      $('#drawnPackName').textContent = (pack?.name || 'Bowl of Chaos').toUpperCase();
      $('#drawnCardNumber').textContent = `CARD ${state.bowl.history.length}`;
      $('#activePlayerChip').textContent = `${current.player} drew this`;
      $('#drawnCardText').textContent = current.text;
      $('#drawnCardInstruction').textContent = pack?.instruction || 'Read it out loud and let the chaos happen.';
      const favoriteKey = `${current.packId}:${current.id}`;
      const saved = state.bowlFavorites.has(favoriteKey);
      const favoriteButton = $('#favoriteBowlCard');
      favoriteButton.classList.toggle('bowl-favorite-active', saved);
      favoriteButton.lastChild.textContent = saved ? ' Saved' : ' Save card';
    }
  }

  function renderBowlSummary() {
    if (!$('#bowlSummary') || state.bowl.phase !== 'summary') return;
    const players = currentPlayers();
    const selected = [...state.bowl.selectedPacks];
    const captain = state.bowl.captain || players[Math.floor(Math.random() * players.length)];
    state.bowl.captain = captain;

    $('#summaryCards').textContent = state.bowl.history.length;
    $('#summaryPlayers').textContent = players.length;
    $('#summaryPacks').textContent = selected.length;
    $('#chaosCaptain').textContent = captain;
    $('#bowlSummaryLine').textContent = state.bowl.history.length
      ? `${players.length} players survived ${state.bowl.history.length} cards without ending the friendship. Probably.`
      : 'The game ended before the Bowl could expose anyone.';
  }

  function renderBowl() {
    if (!$('#bowlSetup')) return;
    state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount);
    renderBowlSetup();
    renderBowlGame();
    renderBowlSummary();
  }

  function buildBowlDeck() {
    const cards = [];
    for (const packId of state.bowl.selectedPacks) {
      const pack = bowlPackById(packId);
      if (!pack) continue;
      for (const card of pack.cards) {
        cards.push({ ...card, packId });
      }
    }
    return shuffleCards(cards);
  }

  function startBowlGame(useSameSetup = true) {
    if (!state.bowlData.packs.length) {
      showToast('The Bowl is still loading');
      return;
    }
    if (!state.bowl.selectedPacks.size) {
      showToast('Choose at least one card pack');
      return;
    }
    state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount);
    saveBowlSetup();
    state.bowl.phase = 'game';
    state.bowl.deck = buildBowlDeck();
    state.bowl.history = [];
    state.bowl.currentCard = null;
    state.bowl.currentPlayerIndex = 0;
    state.bowl.drawing = false;
    state.bowl.captain = null;
    renderBowl();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    haptic('MEDIUM');
  }

  function bowlRattleSound() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      const context = new Context();
      const duration = .34;
      const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const decay = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * decay * .32;
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = 950;
      filter.Q.value = .7;
      gain.gain.value = .35;
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(context.destination);
      source.start();
      source.onended = () => context.close();
    } catch (_) {}
  }

  async function drawBowlCard() {
    if (state.bowl.phase !== 'game' || state.bowl.drawing || state.bowl.currentCard) return;
    if (!state.bowl.deck.length) {
      endBowlGame();
      return;
    }
    state.bowl.drawing = true;
    const stage = $('#bowlStage');
    const flying = $('#bowlFlyingCard');
    stage.classList.add('shaking');
    flying.classList.remove('fly');
    void flying.offsetWidth;
    flying.classList.add('fly');
    bowlRattleSound();
    await haptic('HEAVY');
    setTimeout(async () => {
      stage.classList.remove('shaking');
      flying.classList.remove('fly');
      const players = currentPlayers();
      const card = state.bowl.deck.shift();
      const player = players[state.bowl.currentPlayerIndex % players.length];
      const pack = bowlPackById(card.packId);
      state.bowl.currentCard = { ...card, player };
      state.bowl.history.push({
        id: card.id,
        packId: card.packId,
        packName: pack?.name || 'Bowl of Chaos',
        text: card.text,
        player,
      });
      state.bowl.drawing = false;
      await haptic('MEDIUM');
      renderBowlGame();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 680);
  }

  function nextBowlCard() {
    const players = currentPlayers();
    state.bowl.currentCard = null;
    state.bowl.currentPlayerIndex = (state.bowl.currentPlayerIndex + 1) % players.length;
    if (!state.bowl.deck.length) {
      endBowlGame();
      return;
    }
    renderBowlGame();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    haptic('LIGHT');
  }

  function endBowlGame() {
    state.bowl.phase = 'summary';
    state.bowl.currentCard = null;
    state.bowl.drawing = false;
    const players = currentPlayers();
    const counts = Object.fromEntries(players.map(player => [player, 0]));
    state.bowl.history.forEach(item => { counts[item.player] = (counts[item.player] || 0) + 1; });
    const high = Math.max(...Object.values(counts), 0);
    const finalists = players.filter(player => counts[player] === high);
    state.bowl.captain = finalists[Math.floor(Math.random() * finalists.length)] || players[0];
    renderBowl();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    haptic('HEAVY');
  }

  function resetBowlSetup() {
    state.bowl.phase = 'setup';
    state.bowl.deck = [];
    state.bowl.history = [];
    state.bowl.currentCard = null;
    state.bowl.currentPlayerIndex = 0;
    state.bowl.captain = null;
    renderBowl();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleBowlFavorite() {
    const card = state.bowl.currentCard;
    if (!card) return;
    const key = `${card.packId}:${card.id}`;
    if (state.bowlFavorites.has(key)) {
      state.bowlFavorites.delete(key);
      showToast('Card removed from saved');
    } else {
      state.bowlFavorites.add(key);
      showToast('Card saved');
    }
    localStorage.setItem('tt:bowl-favorites', JSON.stringify([...state.bowlFavorites]));
    renderBowlGame();
    haptic('MEDIUM');
  }

  async function shareBowlSummary() {
    const players = currentPlayers();
    const packNames = [...state.bowl.selectedPacks]
      .map(id => bowlPackById(id)?.name)
      .filter(Boolean);
    const text = [
      'We survived the Bowl of Chaos.',
      `${players.length} players · ${state.bowl.history.length} cards`,
      `Packs: ${packNames.join(', ')}`,
      `Chaos Captain: ${state.bowl.captain || players[0]}`,
      '',
      'Play it in the A Little Throuple Tea app.'
    ].join('\n');
    await shareItem('Bowl of Chaos', state.config.links.website || 'https://throupletea.com', text);
  }

  async function enableBowlShake() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') {
          showToast('Shake permission was not enabled');
          return;
        }
      }
      state.bowl.shakeEnabled = true;
      renderBowlSetup();
      showToast('Shake to draw is on');
      haptic('MEDIUM');
    } catch (_) {
      showToast('Shake is unavailable here — tap the bowl instead');
    }
  }

  let lastShakeAt = 0;
  function handleBowlMotion(event) {
    if (!state.bowl.shakeEnabled || state.activeTab !== 'bowl' || state.bowl.phase !== 'game' || state.bowl.currentCard || state.bowl.drawing) return;
    const acceleration = event.accelerationIncludingGravity || event.acceleration;
    if (!acceleration) return;
    const force = Math.abs(acceleration.x || 0) + Math.abs(acceleration.y || 0) + Math.abs(acceleration.z || 0);
    const now = Date.now();
    if (force > 32 && now - lastShakeAt > 1300) {
      lastShakeAt = now;
      drawBowlCard();
    }
  }

  async function loadBowlInitialData() {
    try {
      const local = await loadJSON('./data/bowl-packs.json');
      if (local?.packs?.length) state.bowlData = local;
      state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount);
      const validIds = new Set(state.bowlData.packs.map(pack => pack.id));
      state.bowl.selectedPacks = new Set([...state.bowl.selectedPacks].filter(id => validIds.has(id)));
      if (!state.bowl.selectedPacks.size && state.bowlData.packs[0]) {
        state.bowl.selectedPacks.add(state.bowlData.packs[0].id);
      }
      renderBowl();
    } catch (error) {
      console.error('Bowl data failed to load', error);
    }

    try {
      const remote = await loadJSON(`${REMOTE_BASE}/bowl-packs.json?v=${Date.now()}`);
      if (remote?.packs?.length) {
        state.bowlData = remote;
        renderBowl();
      }
    } catch (_) {}
  }

  function bindBowlEvents() {
    $('#selectAllPacks')?.addEventListener('click', () => {
      const allIds = state.bowlData.packs.map(pack => pack.id);
      const allSelected = allIds.length && allIds.every(id => state.bowl.selectedPacks.has(id));
      state.bowl.selectedPacks = new Set(allSelected ? [allIds[0]] : allIds);
      saveBowlSetup();
      renderBowlPackGrid();
      showToast(allSelected ? 'Back to one pack' : 'Everything is in the bowl');
    });
    $('#removePlayer')?.addEventListener('click', () => {
      state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount - 1);
      saveBowlSetup();
      renderPlayerInputs();
      haptic('LIGHT');
    });
    $('#addPlayer')?.addEventListener('click', () => {
      state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount + 1);
      saveBowlSetup();
      renderPlayerInputs();
      haptic('LIGHT');
    });
    $('#enableShakeButton')?.addEventListener('click', enableBowlShake);
    $('#startBowlGame')?.addEventListener('click', startBowlGame);
    $('#drawFromBowl')?.addEventListener('click', drawBowlCard);
    $('#nextBowlCard')?.addEventListener('click', nextBowlCard);
    $('#endBowlGame')?.addEventListener('click', endBowlGame);
    $('#favoriteBowlCard')?.addEventListener('click', toggleBowlFavorite);
    $('#shareBowlSummary')?.addEventListener('click', shareBowlSummary);
    $('#playBowlAgain')?.addEventListener('click', () => startBowlGame(true));
    $('#changeBowlSetup')?.addEventListener('click', resetBowlSetup);
    window.addEventListener('devicemotion', handleBowlMotion);
  }

  function renderAll() {
    renderHome();
    renderEpisodes();
    renderVideos();
    renderSaved();
    renderStatus();
    renderBowl();
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
  bindBowlEvents();
  setTab(state.activeTab, false);
  loadBowlInitialData();
  loadInitialData().catch(error => {
    console.error(error);
    showToast('Could not load the bundled app data');
  });
  setInterval(() => refreshRemoteData(false), 15 * 60 * 1000);
})();
