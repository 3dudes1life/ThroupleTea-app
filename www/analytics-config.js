/* Throuple Tea analytics bridge configuration.
   Public website file: never place private API secrets here. */
window.ThroupleTeaAnalytics = Object.assign({
  version: '6.1.0-connected',
  endpoint: 'https://throupletea-sync-api.round-disk-6577.workers.dev/v1/analytics/event',
  publicKey: '',
  debug: false,
  queueLimit: 100,
  requestTimeoutMs: 5000
}, window.ThroupleTeaAnalytics || {});

/* Episode archive live RSS fallback.
   Page-scoped only. Does not alter analytics transport.
   If the deployed archive is behind the RSS feed, inject the newest missing card.
   Once the static archive catches up, this becomes a no-op. */
(function () {
  if (!/^\/episodes\/?$/.test(window.location.pathname)) return;

  var RSS_URL = 'https://anchor.fm/s/1087008c4/podcast/rss';

  function text(node, selector) {
    var found = node.querySelector(selector);
    return found ? (found.textContent || '').trim() : '';
  }

  function namespacedText(node, tagName) {
    var found = node.getElementsByTagName(tagName)[0];
    return found ? (found.textContent || '').trim() : '';
  }

  function cleanHtml(value) {
    var holder = document.createElement('div');
    holder.innerHTML = value || '';
    return (holder.textContent || holder.innerText || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(value, max) {
    if (value.length <= max) return value;
    return value.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  function normalizedTitle(value) {
    return cleanHtml(value)
      .replace(/\s*\|\s*S\d+\s*Ep\d+\s*$/i, '')
      .toLowerCase();
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function archiveAlreadyHas(title) {
    var wanted = normalizedTitle(title);
    return Array.prototype.some.call(
      document.querySelectorAll('#episodeGrid .archive-card h2'),
      function (heading) {
        return normalizedTitle(heading.textContent || '') === wanted;
      }
    );
  }

  function insertLiveCard(item) {
    var grid = document.getElementById('episodeGrid');
    if (!grid) return;

    var title = cleanHtml(text(item, 'title'))
      .replace(/\s*\|\s*S\d+\s*Ep\d+\s*$/i, '')
      .trim();

    if (!title || archiveAlreadyHas(title)) return;

    var description = cleanHtml(text(item, 'description'));
    var link = text(item, 'link') ||
      'https://open.spotify.com/show/6cb9Y7qcyDO1L7O15X2oL5';
    var pubDate = text(item, 'pubDate');
    var season = namespacedText(item, 'itunes:season');
    var episode = namespacedText(item, 'itunes:episode');
    var imageNode = item.getElementsByTagName('itunes:image')[0];
    var image = imageNode ? (imageNode.getAttribute('href') || '') : '';

    if (!image) {
      image = 'https://throupletea.com/podcastartwork.jpg?v=4';
    }

    var label = season && episode
      ? 'S' + season + ' Ep' + episode
      : 'Newest episode';

    var dateLabel = formatDate(pubDate);
    if (dateLabel) label += ' · ' + dateLabel;

    var card = document.createElement('a');
    card.className = 'archive-card rss-live-card';
    card.href = link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.dataset.search = (title + ' ' + description).toLowerCase();
    card.dataset.rssLive = 'true';

    var artwork = document.createElement('img');
    artwork.src = image;
    artwork.alt = title + ' episode artwork';
    artwork.loading = 'eager';
    artwork.decoding = 'async';

    var body = document.createElement('div');
    body.className = 'card-body';

    var cardLabel = document.createElement('div');
    cardLabel.className = 'card-label';
    cardLabel.textContent = label;

    var heading = document.createElement('h2');
    heading.textContent = title;

    var copy = document.createElement('p');
    copy.textContent = truncate(
      description || 'The newest episode of A Little Throuple Tea is now available.',
      165
    );

    body.appendChild(cardLabel);
    body.appendChild(heading);
    body.appendChild(copy);
    card.appendChild(artwork);
    card.appendChild(body);
    grid.insertBefore(card, grid.firstChild);

    var count = document.getElementById('episodeCount');
    if (count) {
      var match = (count.textContent || '').match(/\d+/);
      if (match) {
        count.textContent =
          String(Number(match[0]) + 1) + ' episodes and trailers';
      }
    }
  }

  function loadNewestEpisode() {
    fetch(RSS_URL, {
      cache: 'no-store',
      credentials: 'omit'
    })
      .then(function (response) {
        if (!response.ok) throw new Error('RSS request failed');
        return response.text();
      })
      .then(function (xmlText) {
        var xml = new DOMParser().parseFromString(
          xmlText,
          'application/xml'
        );

        if (xml.querySelector('parsererror')) {
          throw new Error('RSS XML could not be parsed');
        }

        var newest = xml.querySelector('channel > item');
        if (newest) insertLiveCard(newest);
      })
      .catch(function () {
        /* The static archive remains usable if RSS blocks browser access. */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      loadNewestEpisode,
      { once: true }
    );
  } else {
    loadNewestEpisode();
  }
}());
