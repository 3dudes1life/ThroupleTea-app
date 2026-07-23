
(() => {
  'use strict';

  const REMOTE_BASE = 'https://raw.githubusercontent.com/3dudes1life/ThroupleTea-app/main/live-data';
  const FALLBACK_IMAGE = './assets/podcast-artwork.jpg';
  const CONTENT_CACHE_VERSION = 14;
  const EPISODE_FORMAT_CACHE_VERSION = '7.9.6.1';
  const episodeFormatter = window.ThroupleTeaEpisodeFormatter;
  const PLAYER_PAGE = 'https://3dudes1life.github.io/ThroupleTea-app/player/';
  const PARTY_PLAYER_PAGE = 'https://3dudes1life.github.io/ThroupleTea-app/player-party/';
  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function safeJSON(key, fallback, validate = () => true) {
    const raw = safeStorageGet(key);
    if (raw === null || raw === '') return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (!validate(parsed)) throw new Error('Invalid stored value');
      return parsed;
    } catch (_) {
      safeStorageRemove(key);
      return fallback;
    }
  }

  const isArrayValue = value => Array.isArray(value);
  const isObjectValue = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const WATCH_BATCH_SIZE = 12;
  const REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

  const state = {
    content: { episodes: [], videos: [], generatedAt: null, source: 'fallback' },
    config: { links: {}, starterEpisodeIds: [], announcement: {} },
    info: { meet: {}, faq: {} },
    nativePage: { type: null, id: null },
    expandedEpisodeDescriptions: new Set(),
    favorites: new Set(safeJSON('tt:favorites', [], isArrayValue)),
    progress: safeJSON('tt:progress', {}, isObjectValue),
    lastPlayed: safeJSON('tt:last-played', {}, isObjectValue),
    currentEpisode: null,
    currentVideo: null,
    watchParty: {
      available: false,
      active: false,
      starting: false,
      participants: 1,
      videoId: null,
      suppressBroadcastUntil: 0,
      lastPlaybackSentAt: 0,
      lastPlaybackSignature: '',
      recentMessages: new Set(),
      startAttemptId: 0,
      startWatchdog: null,
    },
    activeTab: safeStorageGet('tt:tab') || 'home',
    remoteLoaded: false,
    initialized: false,
    refreshPromise: null,
    lastRefreshAttemptAt: 0,
    watchFullLimit: WATCH_BATCH_SIZE,
    deviceInfo: { loaded: false, isVirtual: false, platform: 'web' },
    bowlData: { minPlayers: 2, maxPlayers: 9, packs: [] },
    bowlFavorites: new Set(safeJSON('tt:bowl-favorites', [], isArrayValue)),
    bowl: {
      phase: 'setup',
      playerCount: Number(safeStorageGet('tt:bowl-player-count') || 3),
      playerNames: safeJSON('tt:bowl-player-names', [], isArrayValue),
      selectedPacks: new Set(safeJSON('tt:bowl-selected-packs', ['classic-chaos'], isArrayValue)),
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
  let nativePageRenderToken = 0;

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

  function videoThumbnail(video) {
    return video?.thumbnail || `https://i.ytimg.com/vi/${video?.id || ''}/hqdefault.jpg`;
  }

  function videoImageAttributes(video) {
    return `src="${escapeHTML(videoThumbnail(video))}" alt="${escapeHTML(displayTitle(video?.title || 'A Little Throuple Tea video'))}" loading="lazy" class="video-image-fallback" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"`;
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
    safeStorageSet('tt:favorites', JSON.stringify([...state.favorites]));
    haptic('MEDIUM');
    renderAll();
  }

  function setTab(tab, pushHash = true) {
    if (!['home','listen','bowl','watch','hotline','more'].includes(tab)) tab = 'home';
    state.activeTab = tab;
    safeStorageSet('tt:tab', tab);
    $$('.app-view').forEach(view => view.classList.toggle('active', view.dataset.view === tab));
    $$('.tab-bar button').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    if (pushHash && location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
    window.scrollTo({ top:0, behavior:'smooth' });
    haptic();
    if (tab === 'more') renderSaved();
    if (state.initialized) refreshRemoteData(false);
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
        <button data-open-episode="${escapeHTML(ep.id)}">Details</button>
        <button data-share-episode="${escapeHTML(ep.id)}">Share</button>
      </div>
    </article>`;
  }

  function shortVideoCard(video) {
    const newBadge = isNewVideo(video) ? `<span class="video-kind-pill new">NEW SHORT</span>` : `<span class="video-kind-pill">SHORT</span>`;
    const duration = videoDuration(video);
    return `<article class="short-video-card">
      <div class="short-video-card__thumb" data-play-video="${escapeHTML(video.id)}">
        <img ${videoImageAttributes(video)}>
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
        <img ${videoImageAttributes(video)}>
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

  function closeNativePage() {
    const modal = $('#nativePageModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('native-page-open');
    state.nativePage = { type: null, id: null };
    nativePageRenderToken += 1;
  }

  function episodeDescription(ep) {
    return richerText(ep?.description, ep?.summary);
  }

  function episodeFormatCache() {
    return safeJSON(`tt:episode-format-cache:v${EPISODE_FORMAT_CACHE_VERSION}`, {}, isObjectValue);
  }

  function saveEpisodeFormatCache(cache) {
    const entries = Object.entries(cache || {});
    const trimmed = entries.length > 80 ? Object.fromEntries(entries.slice(-80)) : (cache || {});
    safeStorageSet(`tt:episode-format-cache:v${EPISODE_FORMAT_CACHE_VERSION}`, JSON.stringify(trimmed));
  }

  function formattedEpisodeDescription(ep) {
    const source = episodeDescription(ep);
    const sourceHash = episodeFormatter?.hash ? episodeFormatter.hash(source) : String(source.length);
    const cacheKey = `${ep?.id || 'episode'}:${sourceHash}`;
    const cache = episodeFormatCache();
    const cached = cache[cacheKey];

    if (cached?.version === episodeFormatter?.VERSION && Array.isArray(cached.paragraphs)) return cached;

    const parsed = episodeFormatter?.parse ? episodeFormatter.parse(source) : {
      version: 'fallback',
      hash: sourceHash,
      paragraphs: source ? [source] : [],
      topics: [],
      closing: [],
      isLong: String(source || '').length > 650,
      wordCount: String(source || '').split(/\s+/).filter(Boolean).length,
      empty: !source
    };

    cache[cacheKey] = parsed;
    saveEpisodeFormatCache(cache);
    return parsed;
  }

  function episodeDescriptionHTML(ep) {
    const formatted = formattedEpisodeDescription(ep);
    if (formatted.empty) {
      return `<div class="episode-copy-block episode-copy-empty">
        <span class="episode-copy-label">IN THIS EPISODE</span>
        <p>The show notes are still brewing. The episode is ready whenever you are.</p>
      </div>`;
    }

    const paragraphs = formatted.paragraphs || [];
    const topics = formatted.topics || [];
    const closing = formatted.closing || [];
    const isExpanded = state.expandedEpisodeDescriptions.has(ep?.id);

    return `
      <div class="episode-description-content${formatted.isLong && !isExpanded ? ' is-collapsed' : ''}" data-description-content>
        <div class="episode-copy-block">
          <span class="episode-copy-label">IN THIS EPISODE</span>
          ${paragraphs.map(part => `<p>${escapeHTML(part)}</p>`).join('')}
        </div>
        ${topics.length ? `<div class="episode-topics-block">
          <span class="episode-copy-label">ALSO ON THE TABLE</span>
          <div class="episode-topic-grid">
            ${topics.map((item, index) => `<article class="episode-topic-card">
              <span>${String(index + 1).padStart(2, '0')}</span>
              <p>${escapeHTML(item)}</p>
            </article>`).join('')}
          </div>
        </div>` : ''}
        ${closing.length ? `<div class="episode-closing-block">
          ${closing.map(item => `<p>${escapeHTML(item)}</p>`).join('')}
        </div>` : ''}
        ${formatted.isLong && !isExpanded ? '<div class="episode-description-fade" aria-hidden="true"></div>' : ''}
      </div>
      ${formatted.isLong ? `<button class="episode-read-toggle${isExpanded ? ' is-expanded' : ''}" type="button" data-description-toggle="${escapeHTML(ep?.id || '')}" aria-expanded="${isExpanded}">
        <span>${isExpanded ? 'Read less' : 'Read more'}</span>
        <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
      </button>` : ''}
    `;
  }

  function episodeMetaItems(ep, duration) {
    const items = [];
    const label = String(ep?.label || '').trim();

    if (label) items.push(label);
    else if (ep?.season && ep?.episode) items.push(`S${ep.season} Ep${ep.episode}`);

    if (duration) items.push(duration);

    const date = ep?.published || ep?.date;
    if (date) items.push(formatDate(date));

    return [...new Set(items.filter(Boolean))];
  }

  function nativeMeetHTML() {
    const meet = state.info?.meet || {};
    const timeline = Array.isArray(meet.timeline) ? meet.timeline : [];
    const values = Array.isArray(meet.values) ? meet.values : [];

    return `<article>
      <header class="native-hero">
        <span class="eyebrow">${escapeHTML(meet.eyebrow || 'MEET THE THROUPLE')}</span>
        <h1>${escapeHTML(meet.title || 'Meet William, Caleb & Daniel')}</h1>
        <p>${escapeHTML(meet.intro || '')}</p>
        ${meet.tagline ? `<span class="native-tagline">${escapeHTML(meet.tagline)}</span>` : ''}
      </header>

      <section class="native-content-section">
        <h2>How we got here</h2>
        <div class="native-timeline">
          ${timeline.map(item => `<div class="native-timeline-item">
            <span class="native-timeline-year">${escapeHTML(item.year || '')}</span>
            <div><strong>${escapeHTML(item.title || '')}</strong><p>${escapeHTML(item.text || '')}</p></div>
          </div>`).join('')}
        </div>
      </section>

      <section class="native-content-section">
        <h2>What makes our relationship ours</h2>
        <div class="native-values-grid">
          ${values.map(item => `<article class="native-value-card">
            <strong>${escapeHTML(item.title || '')}</strong>
            <p>${escapeHTML(item.text || '')}</p>
          </article>`).join('')}
        </div>
      </section>

      <section class="native-cta-card">
        <h2>Still curious?</h2>
        <p>Send your question to the Throuple Hotline and it may become part of a future episode.</p>
        <button class="wide-gradient-button" type="button" data-native-hotline>Ask the Throuple</button>
      </section>
    </article>`;
  }

  function nativeFaqHTML() {
    const faq = state.info?.faq || {};
    const items = Array.isArray(faq.items) ? faq.items : [];

    return `<article>
      <header class="native-hero">
        <span class="eyebrow">${escapeHTML(faq.eyebrow || 'THROUPLE FAQ')}</span>
        <h1>${escapeHTML(faq.title || 'The questions people ask us.')}</h1>
        <p>${escapeHTML(faq.intro || '')}</p>
      </header>

      <div class="native-faq-list">
        ${items.map((item, index) => `<article class="native-faq-item${index === 0 ? ' open' : ''}">
          <button class="native-faq-question" type="button" aria-expanded="${index === 0 ? 'true' : 'false'}">
            <span>${escapeHTML(item.question || '')}</span>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <div class="native-faq-answer">${escapeHTML(item.answer || '')}</div>
        </article>`).join('')}
      </div>

      <section class="native-cta-card">
        <h2>Did we miss yours?</h2>
        <p>Ask it anonymously through the Hotline. The messy questions are usually the best ones.</p>
        <button class="wide-gradient-button" type="button" data-native-hotline>Open the Hotline</button>
      </section>
    </article>`;
  }

  function nativeEpisodeLoadingHTML() {
    return `<article class="episode-detail-page episode-detail-loading" aria-busy="true" aria-label="Loading episode details">
      <div class="episode-loading-art shimmer"></div>
      <div class="episode-loading-line shimmer short"></div>
      <div class="episode-loading-line shimmer title"></div>
      <div class="episode-loading-line shimmer title second"></div>
      <div class="episode-loading-chips"><span class="shimmer"></span><span class="shimmer"></span><span class="shimmer"></span></div>
      <div class="episode-loading-actions"><span class="shimmer"></span><span class="shimmer"></span></div>
      <div class="episode-loading-copy shimmer"></div>
      <p>Brewing the episode details…</p>
    </article>`;
  }

  function nativeEpisodeHTML(ep) {
    const savedSeconds = Number(state.progress[ep.id] || 0);
    const isPlaying = state.currentEpisode?.id === ep.id && !audio.paused;
    const isSaved = state.favorites.has(itemKey('episode', ep.id));
    const duration = ep.duration ? String(ep.duration)
      .replace(/^PT/, '')
      .replace(/H/, 'h ')
      .replace(/M/, 'm ')
      .replace(/S/, 's')
      .trim() : '';
    const meta = episodeMetaItems(ep, duration);
    const playLabel = isPlaying ? 'Pause episode' : savedSeconds > 15 ? `Resume at ${formatTime(savedSeconds)}` : 'Play episode';
    const playKicker = isPlaying ? 'NOW PLAYING' : savedSeconds > 15 ? 'PICK UP WHERE YOU LEFT OFF' : 'START LISTENING';

    return `<article class="episode-detail-page">
      <div class="episode-detail-art">
        <img src="${escapeHTML(ep.image || FALLBACK_IMAGE)}" alt="${escapeHTML(displayTitle(ep.title))}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
      </div>
      <span class="eyebrow">FULL EPISODE</span>
      <h1 class="episode-detail-title">${escapeHTML(displayTitle(ep.title))}</h1>
      <div class="episode-detail-meta">
        ${meta.map(item => `<span class="episode-detail-chip">${escapeHTML(item)}</span>`).join('')}
      </div>

      <div class="episode-detail-actions">
        <button class="episode-primary-action" type="button" data-detail-play="${escapeHTML(ep.id)}">
          <span class="episode-action-icon" aria-hidden="true">
            ${isPlaying
              ? '<svg viewBox="0 0 24 24"><path d="M8 6v12M16 6v12"/></svg>'
              : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
          </span>
          <span class="episode-action-copy"><small>${playKicker}</small><strong>${playLabel}</strong></span>
        </button>
        <div class="episode-secondary-actions">
          <button type="button" data-detail-favorite="${escapeHTML(ep.id)}" aria-pressed="${isSaved}">
            <svg viewBox="0 0 24 24"><path d="M12 20.5 4.6 13.4a5.2 5.2 0 0 1 7.4-7.3 5.2 5.2 0 0 1 7.4 7.3z"/></svg>
            <span>${isSaved ? 'Saved' : 'Save'}</span>
          </button>
          <button type="button" data-detail-share="${escapeHTML(ep.id)}">
            <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>
            <span>Share</span>
          </button>
        </div>
      </div>

      <section class="episode-detail-description" aria-label="Episode description">
        ${episodeDescriptionHTML(ep)}
      </section>

      <footer class="episode-detail-footer">
        <span class="episode-footer-kicker">KEEP THE TEA GOING</span>
        <h2>Got a question, confession, or chaotic life update?</h2>
        <p>Send it to the Throuple Hotline. It could become part of a future episode.</p>
        <button class="wide-gradient-button" type="button" data-native-hotline>Open the Throuple Hotline</button>
        <div class="episode-detail-end">You reached the bottom of the tea.</div>
      </footer>
    </article>`;
  }

  function wireNativePageContent() {
    $$('.native-faq-question').forEach(button => {
      button.onclick = () => {
        const item = button.closest('.native-faq-item');
        const willOpen = !item.classList.contains('open');
        item.classList.toggle('open', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
        haptic('LIGHT');
      };
    });

    $$('[data-native-hotline]').forEach(button => {
      button.onclick = () => {
        closeNativePage();
        setTab('hotline');
      };
    });

    $$('[data-detail-play]').forEach(button => {
      button.onclick = () => {
        const ep = state.content.episodes.find(item => item.id === button.dataset.detailPlay);
        if (!ep) return;
        if (!ep.audioUrl) return showToast('Audio is not available yet');
        playEpisode(ep);
        renderNativePage();
      };
    });

    $$('[data-detail-share]').forEach(button => {
      button.onclick = () => {
        const ep = state.content.episodes.find(item => item.id === button.dataset.detailShare);
        if (ep) shareItem(ep.title, ep.webUrl || state.config.links.episodes, 'Listen to this episode of A Little Throuple Tea');
      };
    });

    $$('[data-detail-favorite]').forEach(button => {
      button.onclick = () => {
        toggleFavorite('episode', button.dataset.detailFavorite);
        renderNativePage();
      };
    });

    $$('[data-description-toggle]').forEach(button => {
      button.onclick = () => {
        const episodeId = button.dataset.descriptionToggle;
        const content = button.previousElementSibling;
        const willExpand = !state.expandedEpisodeDescriptions.has(episodeId);

        if (willExpand) state.expandedEpisodeDescriptions.add(episodeId);
        else state.expandedEpisodeDescriptions.delete(episodeId);

        content?.classList.toggle('is-collapsed', !willExpand);
        content?.querySelector('.episode-description-fade')?.remove();
        if (!willExpand && content && !content.querySelector('.episode-description-fade')) {
          content.insertAdjacentHTML('beforeend', '<div class="episode-description-fade" aria-hidden="true"></div>');
        }
        button.setAttribute('aria-expanded', String(willExpand));
        button.querySelector('span').textContent = willExpand ? 'Read less' : 'Read more';
        button.classList.toggle('is-expanded', willExpand);
        if (!willExpand) content?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        haptic('LIGHT');
      };
    });
  }

  function renderNativePage(options = {}) {
    const modal = $('#nativePageModal');
    if (!modal || modal.hidden || !state.nativePage.type) return;

    const type = state.nativePage.type;
    const content = $('#nativePageContent');
    const shareButton = $('#shareNativePage');

    if (type === 'meet') {
      $('#nativePageKicker').textContent = 'ABOUT THE SHOW';
      $('#nativePageHeaderTitle').textContent = 'Meet the Throuple';
      shareButton.hidden = true;
      content.innerHTML = nativeMeetHTML();
    } else if (type === 'faq') {
      $('#nativePageKicker').textContent = 'ABOUT THE SHOW';
      $('#nativePageHeaderTitle').textContent = 'Throuple FAQ';
      shareButton.hidden = true;
      content.innerHTML = nativeFaqHTML();
    } else if (type === 'episode') {
      const ep = state.content.episodes.find(item => item.id === state.nativePage.id);
      if (!ep) { closeNativePage(); return; }

      $('#nativePageKicker').textContent = ep.label || 'FULL EPISODE';
      $('#nativePageHeaderTitle').textContent = displayTitle(ep.title);
      shareButton.hidden = false;
      shareButton.onclick = () => shareItem(ep.title, ep.webUrl || state.config.links.episodes, 'Listen to this episode of A Little Throuple Tea');

      if (options.showLoading) {
        const renderToken = ++nativePageRenderToken;
        content.innerHTML = nativeEpisodeLoadingHTML();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (renderToken !== nativePageRenderToken || modal.hidden || state.nativePage.id !== ep.id) return;
          content.innerHTML = nativeEpisodeHTML(ep);
          wireNativePageContent();
        }));
        return;
      }
      content.innerHTML = nativeEpisodeHTML(ep);
    }

    wireNativePageContent();
  }

  function openNativePage(type, id = null) {
    const modal = $('#nativePageModal');
    if (!modal) return;
    state.nativePage = { type, id };
    modal.hidden = false;
    document.body.classList.add('native-page-open');
    $('#nativePageScroll').scrollTop = 0;
    renderNativePage({ showLoading: type === 'episode' });
    haptic('LIGHT');
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
          <button class="outline-button" data-open-episode="${escapeHTML(latest.id)}">Episode details</button>
          <button class="outline-button" data-share-episode="${escapeHTML(latest.id)}"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>Share</button>
        </div>
      </div>
    </article>`;

    const progressed = state.content.episodes
      .map((ep, index) => ({
        ep,
        seconds: Number(state.progress[ep.id] || 0),
        lastPlayedAt: Number(state.lastPlayed[ep.id] || 0),
        fallbackOrder: index
      }))
      .filter(item => item.seconds > 15)
      .sort((a, b) =>
        (b.lastPlayedAt - a.lastPlayedAt)
        || (a.fallbackOrder - b.fallbackOrder)
      )[0];
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
        <img ${videoImageAttributes(latestVideo)}>
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
      <img src="${escapeHTML(ep.image || FALLBACK_IMAGE)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
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
    const visibleFullEpisodes = fullEpisodes.slice(0, state.watchFullLimit);

    $('#shortsCount').textContent = shorts.length;
    $('#fullVideosCount').textContent = fullEpisodes.length;

    $('#watchFeatured').innerHTML = featured ? `<article class="watch-featured-card">
      <div class="watch-featured-card__thumb" data-play-video="${escapeHTML(featured.id)}">
        <img ${videoImageAttributes(featured)}>
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
      : `<div class="video-card-empty"><strong>No Shorts loaded yet.</strong>Tap Refresh after the YouTube catalog update finishes.</div>`;

    $('#fullVideoGrid').innerHTML = visibleFullEpisodes.length
      ? visibleFullEpisodes.map(fullVideoCard).join('')
      : `<div class="video-card-empty"><strong>No full episodes loaded yet.</strong>Tap Refresh after the YouTube catalog update finishes.</div>`;

    const loadMore = $('#loadMoreVideos');
    if (loadMore) {
      const remaining = Math.max(0, fullEpisodes.length - visibleFullEpisodes.length);
      loadMore.hidden = remaining === 0;
      loadMore.textContent = remaining
        ? `Load ${Math.min(WATCH_BATCH_SIZE, remaining)} more episodes`
        : 'All episodes loaded';
    }
  }

  function savedBowlCardFromKey(key) {
    const separator = key.indexOf(':');
    if (separator < 1) return null;
    const packId = key.slice(0, separator);
    const cardId = key.slice(separator + 1);
    const pack = bowlPackById(packId);
    const card = pack?.cards?.find(item => item.id === cardId);
    if (!pack || !card) return null;
    return { key, pack, card };
  }

  function renderSavedBowlCards() {
    const container = $('#savedBowlList');
    const count = $('#savedBowlCount');
    if (!container || !count) return;

    const saved = [...state.bowlFavorites]
      .map(savedBowlCardFromKey)
      .filter(Boolean);

    count.textContent = saved.length;
    container.innerHTML = saved.length
      ? saved.map(({ key, pack, card }) => {
          const accent = BOWL_ACCENTS[pack.accent] || BOWL_ACCENTS.pink;
          return `<article class="saved-bowl-card" style="--saved-bowl-accent:${accent}">
            <span class="bowl-pack-pill" style="--card-accent:${accent}">${escapeHTML(pack.name).toUpperCase()}</span>
            <p>${escapeHTML(card.text)}</p>
            <small>${escapeHTML(pack.instruction || 'Read it out loud and let the chaos happen.')}</small>
            <button class="saved-bowl-remove" type="button" data-remove-bowl-card="${escapeHTML(key)}" aria-label="Remove saved Bowl card">
              <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </article>`;
        }).join('')
      : `<div class="saved-bowl-empty">Save a card during the Bowl and it will live here for the next party.</div>`;

    $$('[data-remove-bowl-card]').forEach(button => {
      button.onclick = () => {
        state.bowlFavorites.delete(button.dataset.removeBowlCard);
        safeStorageSet('tt:bowl-favorites', JSON.stringify([...state.bowlFavorites]));
        renderSavedBowlCards();
        showToast('Bowl card removed');
        haptic('LIGHT');
      };
    });
  }

  function renderSaved() {
    const items = [];
    for (const key of state.favorites) {
      const separator = key.indexOf(':');
      const type = separator >= 0 ? key.slice(0, separator) : '';
      const id = separator >= 0 ? key.slice(separator + 1) : '';
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
    renderSavedBowlCards();
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
    safeStorageSet('tt:bowl-player-count', String(state.bowl.playerCount));
    safeStorageSet('tt:bowl-player-names', JSON.stringify(state.bowl.playerNames));
    safeStorageSet('tt:bowl-selected-packs', JSON.stringify([...state.bowl.selectedPacks]));
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
      const isVirtual = Boolean(state.deviceInfo.isVirtual);
      shakeButton.disabled = isVirtual;
      shakeButton.classList.toggle('enabled', state.bowl.shakeEnabled && !isVirtual);
      shakeButton.classList.toggle('simulator-only-note', isVirtual);
      $('#shakeStatus').textContent = isVirtual
        ? 'Physical iPhone only — tap the bowl in Simulator'
        : state.bowl.shakeEnabled
          ? 'Enabled — shake when the bowl is ready'
          : 'Tap to enable on iPhone';
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

    const cardCount = state.bowl.history.length;
    $('#summaryCards').textContent = cardCount;
    $('#summaryPlayers').textContent = players.length;
    $('#summaryPacks').textContent = selected.length;
    $('#summaryCardsLabel').textContent = cardCount === 1 ? 'card drawn' : 'cards drawn';
    $('#summaryPlayersLabel').textContent = players.length === 1 ? 'player' : 'players';
    $('#summaryPacksLabel').textContent = selected.length === 1 ? 'pack mixed' : 'packs mixed';
    $('#chaosCaptain').textContent = captain;
    $('#bowlSummaryLine').textContent = cardCount
      ? `${players.length} ${players.length === 1 ? 'player' : 'players'} survived ${cardCount} ${cardCount === 1 ? 'card' : 'cards'} without ending the friendship. Probably.`
      : 'The game ended before the Bowl could expose anyone.';
  }

  function renderBowl() {
    if (!$('#bowlSetup')) return;
    state.bowl.playerCount = clampPlayerCount(state.bowl.playerCount);
    renderBowlSetup();
    renderBowlGame();
    renderBowlSummary();
    renderSavedBowlCards();
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
    const focused = document.activeElement;
    if (focused && typeof focused.blur === 'function') focused.blur();
    document.body.classList.add('bowl-game-active');
    window.scrollTo(0, 0);

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
    document.body.classList.remove('bowl-game-active');
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
    document.body.classList.remove('bowl-game-active');
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
      showToast('Saved to More');
    }
    safeStorageSet('tt:bowl-favorites', JSON.stringify([...state.bowlFavorites]));
    renderBowlGame();
    renderSavedBowlCards();
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
    if (state.deviceInfo.isVirtual) {
      showToast('Shake needs a physical iPhone — tap the bowl here');
      return;
    }
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

  async function initializeDeviceInfo() {
    try {
      const plugin = window.Capacitor?.Plugins?.Device;
      if (window.Capacitor?.isNativePlatform?.() && plugin?.getInfo) {
        const info = await plugin.getInfo();
        state.deviceInfo = {
          loaded: true,
          isVirtual: Boolean(info?.isVirtual),
          platform: info?.platform || 'ios'
        };
      } else {
        state.deviceInfo = {
          loaded: true,
          isVirtual: true,
          platform: 'web'
        };
      }
    } catch (_) {
      state.deviceInfo.loaded = true;
    }
    renderBowlSetup();
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


  let lastBowlTouchEnd = 0;
  function preventBowlDoubleTapZoom(event) {
    if (state.activeTab !== 'bowl') return;
    const now = Date.now();
    if (now - lastBowlTouchEnd < 320) event.preventDefault();
    lastBowlTouchEnd = now;
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
    document.querySelector('[data-view="bowl"]')?.addEventListener('touchend', preventBowlDoubleTapZoom, { passive: false });
  }

  function renderAll() {
    renderHome();
    renderEpisodes();
    renderVideos();
    renderSaved();
    renderStatus();
    renderBowl();
    wireDynamicButtons();
    renderNativePage();
  }

  function renderAudioDependentViews() {
    const scrollTop = window.scrollY;
    renderHome();
    renderEpisodes();
    renderSaved();
    wireDynamicButtons();
    renderNativePage();
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }));
  }

  function markEpisodePlayed(ep) {
    if (!ep?.id) return;
    state.lastPlayed[ep.id] = Date.now();
    safeStorageSet('tt:last-played', JSON.stringify(state.lastPlayed));
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
    $$('[data-open-episode]').forEach(button => button.onclick = () => openNativePage('episode', button.dataset.openEpisode));
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
      if (audio.paused) {
        markEpisodePlayed(ep);
        await audio.play();
      } else {
        audio.pause();
      }
      return;
    }
    state.currentEpisode = ep;
    markEpisodePlayed(ep);
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
    renderAudioDependentViews();
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

  function watchPartyPlugin() {
    return window.Capacitor?.Plugins?.ThroupleWatchParty || null;
  }

  function updateWatchPartyUI() {
    const modal = $('#videoPlayerModal');
    if (!modal) return;
    modal.classList.toggle('party-active', state.watchParty.active);
    modal.classList.toggle('party-starting', state.watchParty.starting);
    $('#watchPartyStatus').hidden = !state.watchParty.active;
    $('#watchPartyReactions').hidden = !state.watchParty.active;

    const participants = Math.max(1, Number(state.watchParty.participants || 1));
    $('#watchPartyParticipantCount').textContent = `${participants} ${participants === 1 ? 'person' : 'people'}`;

    const startButton = $('#startCurrentWatchParty');
    if (!startButton) return;
    startButton.disabled = Boolean(state.watchParty.starting);
    startButton.setAttribute('aria-busy', state.watchParty.starting ? 'true' : 'false');
    if (state.watchParty.active) {
      startButton.classList.add('active');
      startButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM16 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M2 21c0-4 2.4-6 6-6s6 2 6 6M13 16c4-1 8 1 8 5"/></svg>Back to Watch Party';
    } else if (state.watchParty.starting) {
      startButton.classList.remove('active');
      startButton.textContent = 'Opening SharePlay…';
    } else {
      startButton.classList.remove('active');
      startButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM16 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M2 21c0-4 2.4-6 6-6s6 2 6 6M13 16c4-1 8 1 8 5"/></svg>Start Watch Party';
    }
  }

  function postPlayerCommand(command, payload = {}) {
    const frame = $('#videoPlayerFrame');
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      source: 'throupletea-app',
      command,
      ...payload
    }, '*');
  }

  function openVideo(id, options = {}) {
    const video = state.content.videos.find(item => item.id === id);
    if (!video) return;
    haptic('MEDIUM');

    state.currentVideo = video;
    const modal = $('#videoPlayerModal');
    const stage = $('#videoPlayerStage');
    const frame = $('#videoPlayerFrame');
    const kind = videoKind(video);
    const usePartyPlayer = Boolean(state.watchParty.active || options.party);
    const playerUrl = new URL(usePartyPlayer ? PARTY_PLAYER_PAGE : PLAYER_PAGE);
    playerUrl.searchParams.set('v', video.id);
    playerUrl.searchParams.set('kind', kind);
    playerUrl.searchParams.set('title', displayTitle(video.title));
    if (usePartyPlayer) playerUrl.searchParams.set('party', '1');

    $('#videoPlayerHeaderTitle').textContent = displayTitle(video.title);
    $('#videoPlayerTitle').textContent = displayTitle(video.title);
    $('#videoPlayerKind').textContent = state.watchParty.active ? 'WATCH PARTY' : kind === 'short' ? 'WATCHING A SHORT' : 'WATCHING A FULL EPISODE';
    $('#videoPlayerMeta').textContent = videoLabel(video);
    stage.classList.toggle('is-short', kind === 'short');
    stage.classList.remove('loaded');
    frame.src = playerUrl.toString();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    updateWatchPartyUI();
  }

  function closeVideoPlayer() {
    if (state.watchParty.active) {
      showToast('Leave the Watch Party before closing');
      return;
    }
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

  function clearWatchPartyStartWatchdog() {
    if (state.watchParty.startWatchdog) {
      clearTimeout(state.watchParty.startWatchdog);
      state.watchParty.startWatchdog = null;
    }
  }

  function resetWatchPartyStart(message = '') {
    clearWatchPartyStartWatchdog();
    state.watchParty.starting = false;
    updateWatchPartyUI();
    if (state.currentVideo && !state.watchParty.active) openVideo(state.currentVideo.id);
    if (message) showToast(message);
  }

  async function reconcileWatchPartyState({ quiet = true } = {}) {
    const plugin = watchPartyPlugin();
    if (!plugin?.getState) return false;
    try {
      const current = await plugin.getState();
      const active = Boolean(current?.active);
      if (active) {
        clearWatchPartyStartWatchdog();
        state.watchParty.active = true;
        state.watchParty.starting = false;
        state.watchParty.participants = Number(current.participants || 1);
        state.watchParty.videoId = current.videoId || state.watchParty.videoId;
        updateWatchPartyUI();
        return true;
      }
      if (state.watchParty.starting) resetWatchPartyStart(quiet ? '' : 'Watch Party was not started');
      return false;
    } catch (_) {
      if (state.watchParty.starting) resetWatchPartyStart(quiet ? '' : 'SharePlay did not finish opening');
      return false;
    }
  }

  async function startWatchParty(videoId = state.currentVideo?.id) {
    const video = state.content.videos.find(item => item.id === videoId);
    if (!video) return;

    if (!window.Capacitor?.isNativePlatform?.()) {
      showToast('Watch Party requires the iPhone app');
      return;
    }

    const plugin = watchPartyPlugin();
    if (!plugin) {
      showToast('Native Watch Party bridge is not loaded');
      return;
    }

    if (state.watchParty.starting) {
      showToast('SharePlay is already opening');
      return;
    }

    if (state.watchParty.active) {
      if (state.watchParty.videoId === video.id) {
        openVideo(video.id, { party: true });
        postPlayerCommand('requestState');
        showToast('Back in the live Watch Party');
        return;
      }
      showToast('Leave the current Watch Party first');
      return;
    }

    showToast('Watch Party starts from 0:00 for everyone');
    clearWatchPartyStartWatchdog();
    const attemptId = ++state.watchParty.startAttemptId;
    state.watchParty.starting = true;
    openVideo(video.id, { party: true });
    updateWatchPartyUI();

    try {
      const availability = await plugin.isAvailable();
      if (!availability?.available) {
        state.watchParty.starting = false;
        updateWatchPartyUI();
        showToast(availability?.reason || 'SharePlay is unavailable');
        return;
      }

      await plugin.start({
        videoId: video.id,
        title: displayTitle(video.title),
        kind: videoKind(video),
        thumbnail: video.thumbnail || ''
      });

      // Presenting Apple's SharePlay sheet does not guarantee that a session
      // was actually started. Recover automatically if the sheet is canceled.
      state.watchParty.startWatchdog = setTimeout(async () => {
        if (attemptId !== state.watchParty.startAttemptId || state.watchParty.active) return;
        const becameActive = await reconcileWatchPartyState({ quiet: true });
        if (!becameActive && attemptId === state.watchParty.startAttemptId) {
          resetWatchPartyStart('Watch Party was canceled');
        }
      }, 18000);
    } catch (error) {
      if (attemptId !== state.watchParty.startAttemptId) return;
      resetWatchPartyStart('Watch Party was canceled');
    }
  }

  async function leaveWatchParty() {
    const plugin = watchPartyPlugin();
    ++state.watchParty.startAttemptId;
    clearWatchPartyStartWatchdog();
    try {
      await plugin?.leave?.();
    } catch (_) {}
    state.watchParty.active = false;
    state.watchParty.starting = false;
    state.watchParty.participants = 1;
    state.watchParty.videoId = null;
    state.watchParty.suppressBroadcastUntil = 0;
    state.watchParty.lastPlaybackSentAt = 0;
    state.watchParty.lastPlaybackSignature = '';
    state.watchParty.recentMessages.clear();
    updateWatchPartyUI();
    if (state.currentVideo) openVideo(state.currentVideo.id);
    showToast('You left the Watch Party');
  }

  async function sendPartyMessage(message) {
    if (!state.watchParty.active) return;
    const plugin = watchPartyPlugin();
    if (!plugin) return;
    const payload = {
      ...message,
      sentAt: Number(message.sentAt || Date.now()),
      messageId: message.messageId || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    };
    try {
      await plugin.sendMessage(payload);
    } catch (_) {}
  }

  function showPartyReaction(label, remote = false) {
    const stage = $('#partyReactionStage');
    if (!stage) return;
    const bubble = document.createElement('div');
    bubble.className = `party-reaction-bubble ${remote ? 'remote' : ''}`;
    bubble.textContent = label;
    bubble.style.setProperty('--drift', `${Math.round((Math.random() - .5) * 120)}px`);
    stage.appendChild(bubble);
    setTimeout(() => bubble.remove(), 2300);
    haptic(remote ? 'LIGHT' : 'MEDIUM');
  }

  function sendPartyReaction(label) {
    if (!state.watchParty.active) return;
    showPartyReaction(label, false);
    sendPartyMessage({
      type: 'reaction',
      reaction: label
    });
  }

  function handlePartyMessage(message) {
    if (!message || !message.type) return;
    const messageId = message.messageId;
    if (messageId && state.watchParty.recentMessages.has(messageId)) return;
    if (messageId) {
      state.watchParty.recentMessages.add(messageId);
      setTimeout(() => state.watchParty.recentMessages.delete(messageId), 12000);
    }

    if (message.type === 'reaction' && message.reaction) {
      showPartyReaction(message.reaction, true);
      return;
    }

    if (message.type === 'sync-request') {
      postPlayerCommand('requestState');
      return;
    }

    if (message.type === 'playback') {
      const ageSeconds = Math.max(0, (Date.now() - Number(message.sentAt || Date.now())) / 1000);
      let position = Number(message.position || 0);
      if (message.playing) position += Math.min(ageSeconds, 3);
      state.watchParty.suppressBroadcastUntil = Date.now() + 1200;
      postPlayerCommand('sync', {
        action: message.action || (message.playing ? 'play' : 'pause'),
        position,
        playing: Boolean(message.playing)
      });
    }
  }

  function handlePlayerBridgeMessage(event) {
    const data = event.data;
    if (!data || data.source !== 'throupletea-player') return;

    if (data.event === 'ready') {
      if (state.watchParty.active) {
        sendPartyMessage({ type: 'sync-request' });
      }
      return;
    }

    if (data.event !== 'state' || !state.watchParty.active) return;
    if (Date.now() < state.watchParty.suppressBroadcastUntil) return;

    const position = Number(data.position || 0);
    const playing = Boolean(data.playing);
    const action = data.action || (playing ? 'play' : 'pause');
    const signature = `${action}:${playing}:${Math.round(position)}`;
    const now = Date.now();
    const changed = signature !== state.watchParty.lastPlaybackSignature;
    const heartbeatDue = now - state.watchParty.lastPlaybackSentAt > 2500;

    if (!changed && !heartbeatDue) return;
    state.watchParty.lastPlaybackSignature = signature;
    state.watchParty.lastPlaybackSentAt = now;

    sendPartyMessage({
      type: 'playback',
      action,
      position,
      playing
    });
  }

  async function initializeWatchParty() {
    const plugin = watchPartyPlugin();
    if (!plugin || !window.Capacitor?.isNativePlatform?.()) {
      state.watchParty.available = false;
      return;
    }

    try {
      const availability = await plugin.isAvailable();
      state.watchParty.available = Boolean(availability?.available);

      plugin.addListener('sessionStarted', data => {
        clearWatchPartyStartWatchdog();
        state.watchParty.active = true;
        state.watchParty.starting = false;
        state.watchParty.participants = Number(data.participants || 1);
        state.watchParty.videoId = data.videoId;

        const video = state.content.videos.find(item => item.id === data.videoId);
        if (video) openVideo(video.id, { party: true });
        $('#videoPlayerKind').textContent = 'WATCH PARTY';
        updateWatchPartyUI();
        showToast('Watch Party is live');
      });

      plugin.addListener('participantsChanged', data => {
        state.watchParty.participants = Number(data.participants || 1);
        updateWatchPartyUI();
      });

      plugin.addListener('partyMessage', handlePartyMessage);

      plugin.addListener('sessionEnded', () => {
        ++state.watchParty.startAttemptId;
        clearWatchPartyStartWatchdog();
        state.watchParty.active = false;
        state.watchParty.starting = false;
        state.watchParty.participants = 1;
        state.watchParty.videoId = null;
        state.watchParty.suppressBroadcastUntil = 0;
        state.watchParty.lastPlaybackSentAt = 0;
        state.watchParty.lastPlaybackSignature = '';
        state.watchParty.recentMessages.clear();
        updateWatchPartyUI();
        if (state.currentVideo) openVideo(state.currentVideo.id);
        showToast('Watch Party ended');
      });

      const current = await plugin.getState();
      if (current?.active) {
        state.watchParty.active = true;
        state.watchParty.participants = Number(current.participants || 1);
        state.watchParty.videoId = current.videoId;
      }
      updateWatchPartyUI();
    } catch (_) {
      state.watchParty.available = false;
    }
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
      safeStorageSet('tt:progress', JSON.stringify(state.progress));
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
    renderAudioDependentViews();
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

  function catalogQuality(content) {
    const videos = Array.isArray(content?.videos) ? content.videos : [];
    const shorts = videos.filter(video => videoKind(video) === 'short').length;
    const full = videos.filter(video => videoKind(video) === 'episode').length;
    return videos.length * 10 + Math.min(shorts, 10) * 2 + Math.min(full, 10) * 2;
  }

  function bestCatalog(...catalogs) {
    return catalogs
      .filter(item => item?.episodes?.length)
      .sort((a, b) => catalogQuality(b) - catalogQuality(a))[0] || catalogs.find(Boolean);
  }

  function richerText(...values) {
    return values
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || '';
  }

  function mergeEpisodeMetadata(currentEpisodes, remoteEpisodes) {
    const currentById = new Map(
      (currentEpisodes || []).filter(ep => ep?.id).map(ep => [ep.id, ep])
    );

    return (remoteEpisodes || []).map(ep => {
      const saved = currentById.get(ep.id) || {};
      return {
        ...saved,
        ...ep,
        summary: ep.summary || saved.summary || '',
        description: richerText(
          ep.description,
          saved.description,
          ep.summary,
          saved.summary
        ),
        image: ep.image || saved.image || FALLBACK_IMAGE,
        webUrl: ep.webUrl || saved.webUrl || state.config.links.episodes || '',
      };
    });
  }

  function mergedRemoteContent(current, remote) {
    if (!remote?.episodes?.length) return current;

    const currentVideos = Array.isArray(current?.videos) ? current.videos : [];
    const remoteVideos = Array.isArray(remote?.videos) ? remote.videos : [];
    const remoteIsHealthy = remoteVideos.length >= 5;
    const remoteIsNotDegraded = (
      currentVideos.length < 5
      || remoteVideos.length >= Math.max(5, Math.floor(currentVideos.length * .55))
    );

    return {
      ...remote,
      episodes: mergeEpisodeMetadata(current?.episodes || [], remote.episodes),
      videos: remoteIsHealthy && remoteIsNotDegraded ? remoteVideos : currentVideos,
      catalogSafeguardUsed: !(remoteIsHealthy && remoteIsNotDegraded),
    };
  }

  async function loadInitialData() {
    const migrationVersion = Number(safeStorageGet('tt:data-migration-version') || 0);
    if (migrationVersion < 15) {
      safeStorageRemove('tt:content-cache');
      safeStorageRemove('tt:config-cache');
      safeStorageRemove('tt:episode-format-cache:v1');
      safeStorageRemove('tt:episode-format-cache:v7.9.6');
      safeStorageSet('tt:content-cache-version', '0');
      safeStorageSet('tt:data-migration-version', '15');
    }

    const [fallback, localConfig, localInfo] = await Promise.all([
      loadJSON('./data/fallback.json'),
      loadJSON('./data/app-config.json'),
      loadJSON('./data/info-content.json')
    ]);

    const storedVersion = Number(safeStorageGet('tt:content-cache-version') || 0);
    const cached = storedVersion === CONTENT_CACHE_VERSION
      ? safeJSON('tt:content-cache', null, value => value === null || isObjectValue(value))
      : null;

    if (storedVersion !== CONTENT_CACHE_VERSION) {
      safeStorageRemove('tt:content-cache');
      safeStorageSet('tt:content-cache-version', String(CONTENT_CACHE_VERSION));
    }

    const cachedConfig = safeJSON('tt:config-cache', null, value => value === null || isObjectValue(value));
    const cachedInfo = safeJSON('tt:info-cache', null, value => value === null || isObjectValue(value));
    const preferredCatalog = bestCatalog(fallback, cached) || fallback;
    state.content = {
      ...preferredCatalog,
      episodes: mergeEpisodeMetadata(fallback?.episodes || [], preferredCatalog?.episodes || [])
    };
    state.config = cachedConfig?.links ? cachedConfig : localConfig;
    state.info = cachedInfo?.meet && cachedInfo?.faq ? cachedInfo : localInfo;
    state.initialized = true;
    renderAll();
    await refreshRemoteData(false, { force: true });
  }

  async function refreshRemoteData(showFeedback = true, options = {}) {
    const force = Boolean(options.force);
    const now = Date.now();

    if (state.refreshPromise) {
      if (showFeedback) showToast('Refresh already in progress');
      return state.refreshPromise;
    }

    if (!force && now - state.lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) {
      return null;
    }

    state.lastRefreshAttemptAt = now;
    const button = $('#refreshButton');
    const moreButton = $('#moreRefresh');
    const scrollTop = window.scrollY;
    const tabAtStart = state.activeTab;
    button?.classList.add('spinning');
    moreButton?.setAttribute('disabled', 'disabled');

    state.refreshPromise = (async () => {
      try {
        const stamp = Date.now();
        const [contentResult, configResult, infoResult] = await Promise.allSettled([
          loadJSON(`${REMOTE_BASE}/content.json?v=${stamp}`),
          loadJSON(`${REMOTE_BASE}/app-config.json?v=${stamp}`),
          loadJSON(`${REMOTE_BASE}/info-content.json?v=${stamp}`)
        ]);

        if (contentResult.status === 'fulfilled' && contentResult.value?.episodes?.length) {
          state.content = mergedRemoteContent(state.content, contentResult.value);
          state.remoteLoaded = true;
          safeStorageSet('tt:content-cache-version', String(CONTENT_CACHE_VERSION));
          safeStorageSet('tt:content-cache', JSON.stringify(state.content));
        }

        if (configResult.status === 'fulfilled' && configResult.value?.links) {
          state.config = configResult.value;
          safeStorageSet('tt:config-cache', JSON.stringify(configResult.value));
        }

        if (infoResult.status === 'fulfilled' && infoResult.value?.meet && infoResult.value?.faq) {
          state.info = infoResult.value;
          safeStorageSet('tt:info-cache', JSON.stringify(infoResult.value));
        }

        renderAll();
        requestAnimationFrame(() => {
          if (state.activeTab === tabAtStart) {
            window.scrollTo({ top: scrollTop, behavior: 'auto' });
          }
        });

        if (showFeedback) {
          const videos = state.content.videos || [];
          const shorts = videos.filter(video => videoKind(video) === 'short').length;
          const full = videos.filter(video => videoKind(video) === 'episode').length;
          showToast(`${shorts} Shorts + ${full} full videos loaded`);
        }

        $('#offlineBanner').hidden = true;
        return state.content;
      } catch (_) {
        if (showFeedback) showToast('Using the freshest saved copy');
        if (!navigator.onLine) $('#offlineBanner').hidden = false;
        return state.content;
      } finally {
        button?.classList.remove('spinning');
        moreButton?.removeAttribute('disabled');
      }
    })();

    try {
      return await state.refreshPromise;
    } finally {
      state.refreshPromise = null;
    }
  }


  function bindStaticEvents() {
    $$('.tab-bar button').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
    $$('[data-tab-jump]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tabJump)));
    $$('[data-open-config]').forEach(button => button.addEventListener('click', () => openURL(state.config.links[button.dataset.openConfig])));
    $$('[data-native-page]').forEach(button => button.addEventListener('click', () => openNativePage(button.dataset.nativePage)));
    $$('[data-open-url]').forEach(button => button.addEventListener('click', () => openURL(button.dataset.openUrl)));
    $('#refreshButton').addEventListener('click', () => refreshRemoteData(true, { force: true }));
    $('#moreRefresh').addEventListener('click', () => refreshRemoteData(true, { force: true }));
    $('#episodeSearch').addEventListener('input', () => { renderEpisodes(); wireDynamicButtons(); });
    $('#loadMoreVideos').addEventListener('click', () => {
      const scrollTop = window.scrollY;
      state.watchFullLimit += WATCH_BATCH_SIZE;
      renderVideos();
      wireDynamicButtons();
      requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }));
      haptic('LIGHT');
    });
    $('#surpriseMeButton').addEventListener('click', () => {
      const playable = state.content.episodes.filter(ep => ep.audioUrl);
      if (!playable.length) return showToast('No playable episodes loaded yet');
      const episode = playable[Math.floor(Math.random() * playable.length)];
      playEpisode(episode);
      showToast('The universe chose this one');
    });
    $('#closeNativePage').addEventListener('click', closeNativePage);
    $('#closeVideoPlayer').addEventListener('click', closeVideoPlayer);
    $('#shareCurrentVideo').addEventListener('click', shareCurrentVideo);
    $('#startCurrentWatchParty').addEventListener('click', () => startWatchParty());
    $('#leaveWatchParty').addEventListener('click', leaveWatchParty);
    $$('[data-party-reaction]').forEach(button => button.addEventListener('click', () => sendPartyReaction(button.dataset.partyReaction)));
    $('#youtubeFallbackButton').addEventListener('click', openCurrentVideoOnYouTube);
    window.addEventListener('message', handlePlayerBridgeMessage);
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
      if (event.key !== 'Escape') return;
      if (!$('#nativePageModal').hidden) closeNativePage();
      else if (!$('#videoPlayerModal').hidden) closeVideoPlayer();
    });
    window.addEventListener('online', () => { $('#offlineBanner').hidden = true; refreshRemoteData(false); });
    window.addEventListener('offline', () => { $('#offlineBanner').hidden = false; });
    window.addEventListener('focus', () => { refreshRemoteData(false); reconcileWatchPartyState({ quiet: true }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshRemoteData(false); reconcileWatchPartyState({ quiet: true }); } });

    audio.addEventListener('play', () => {
      if (state.currentEpisode) markEpisodePlayed(state.currentEpisode);
      updatePlayerUI();
      renderAudioDependentViews();
    });
    audio.addEventListener('pause', () => {
      updatePlayerUI();
      renderAudioDependentViews();
    });
    let lastProgressSecond = -1;
    audio.addEventListener('timeupdate', () => {
      updatePlayerUI();
      const second = Math.floor(audio.currentTime);
      if (state.currentEpisode && second > 0 && second % 5 === 0 && second !== lastProgressSecond) {
        lastProgressSecond = second;
        state.progress[state.currentEpisode.id] = second;
        safeStorageSet('tt:progress', JSON.stringify(state.progress));
      }
    });
    audio.addEventListener('ended', () => {
      if (state.currentEpisode) {
        delete state.progress[state.currentEpisode.id];
        safeStorageSet('tt:progress', JSON.stringify(state.progress));
      }
      updatePlayerUI();
      renderAudioDependentViews();
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
  initializeDeviceInfo();
  initializeWatchParty();
  setTab(state.activeTab, false);
  loadBowlInitialData();
  loadInitialData().catch(error => {
    console.error(error);
    showToast('Could not load the bundled app data');
  });
  setInterval(() => refreshRemoteData(false), 15 * 60 * 1000);
})();
