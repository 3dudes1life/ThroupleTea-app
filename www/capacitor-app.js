(() => {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  document.documentElement.classList.toggle('capacitor-native', isNative);

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    const raw = link.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;

    const url = new URL(raw, window.location.href);

    // Keep packaged pages and in-page sections inside the app.
    if (url.origin === window.location.origin) {
      return;
    }

    // Let phone/email links use iOS.
    if (url.protocol === 'mailto:' || url.protocol === 'tel:' || url.protocol === 'sms:') {
      return;
    }

    // Open external services in Safari instead of replacing the app.
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      event.preventDefault();
      window.open(url.href, '_blank', 'noopener,noreferrer');
    }
  }, true);
})();
