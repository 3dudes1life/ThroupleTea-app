/* ROUND 6.0: dashboard-ready analytics bridge.
   Mirrors existing GA4 events into a normalized local payload and can optionally
   forward them to the Throuple Tea Dash once a public ingestion endpoint is supplied.
   No PII is intentionally collected and OneSignal is not accessed. */
(function(){
  if(window.__ttAnalyticsBridgeInstalled) return;
  window.__ttAnalyticsBridgeInstalled=true;

  var config=window.ThroupleTeaAnalytics||{};
  var queueKey='tt_analytics_queue_v1';
  var visitorKey='tt_visitor_id_v1';
  var sessionKey='tt_session_id_v1';

  function randomId(prefix){
    var value='';
    try{
      if(window.crypto&&crypto.randomUUID) value=crypto.randomUUID();
      else if(window.crypto&&crypto.getRandomValues){var bytes=new Uint32Array(4);crypto.getRandomValues(bytes);value=Array.from(bytes).map(function(n){return n.toString(16);}).join('');}
    }catch(e){}
    if(!value) value=Date.now().toString(36)+Math.random().toString(36).slice(2);
    return prefix+'_'+value;
  }
  function storedId(key,prefix,storage){
    try{var current=storage.getItem(key);if(current) return current;current=randomId(prefix);storage.setItem(key,current);return current;}catch(e){return randomId(prefix);}
  }
  var visitorId=storedId(visitorKey,'v',localStorage);
  var sessionId=storedId(sessionKey,'s',sessionStorage);

  function deviceType(){
    var width=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    if(width<768) return 'mobile';
    if(width<1100) return 'tablet';
    return 'desktop';
  }
  function clean(value,limit){
    if(value===undefined||value===null||value==='') return undefined;
    if(typeof value==='string') return value.replace(/\s+/g,' ').trim().slice(0,limit||300);
    if(typeof value==='number'||typeof value==='boolean') return value;
    return clean(String(value),limit);
  }
  function campaign(){
    var query=new URLSearchParams(location.search);
    var result={};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(key){var value=clean(query.get(key),120);if(value) result[key]=value;});
    return result;
  }
  function normalized(name,params){
    params=params||{};
    var payload={
      schema_version:'1.0',
      site_version:clean(config.version||'6.0.0',20),
      event_id:randomId('e'),
      event_name:clean(name,80),
      event_time:new Date().toISOString(),
      visitor_id:visitorId,
      session_id:sessionId,
      page_path:clean(params.page_path||location.pathname,300),
      page_title:clean(document.title,200),
      page_url:clean(location.href.split('#')[0],500),
      referrer:clean(document.referrer,500),
      device_type:deviceType(),
      viewport_width:Math.round(window.innerWidth||0),
      viewport_height:Math.round(window.innerHeight||0),
      installed_app:!!(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true),
      online:navigator.onLine!==false,
      campaign:campaign(),
      properties:{}
    };
    Object.keys(params).forEach(function(key){
      if(key==='page_path') return;
      var value=clean(params[key],500);
      if(value!==undefined) payload.properties[key]=value;
    });
    return payload;
  }
  function readQueue(){try{return JSON.parse(localStorage.getItem(queueKey)||'[]');}catch(e){return [];}}
  function writeQueue(items){try{localStorage.setItem(queueKey,JSON.stringify(items.slice(-(config.queueLimit||100))));}catch(e){}}
  function enqueue(payload){var items=readQueue();items.push(payload);writeQueue(items);}
  function endpointReady(){return typeof config.endpoint==='string'&&/^https:\/\//i.test(config.endpoint);}
  function headers(){var h={'Content-Type':'application/json'};if(config.publicKey) h['X-ThroupleTea-Key']=config.publicKey;return h;}
  function transmit(payload){
    if(!endpointReady()) return Promise.resolve(false);
    var body=JSON.stringify(payload);
    if(navigator.sendBeacon&&!config.publicKey){
      try{if(navigator.sendBeacon(config.endpoint,new Blob([body],{type:'application/json'}))) return Promise.resolve(true);}catch(e){}
    }
    var controller=window.AbortController?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},config.requestTimeoutMs||5000):null;
    return fetch(config.endpoint,{method:'POST',headers:headers(),body:body,keepalive:true,credentials:'omit',signal:controller?controller.signal:undefined})
      .then(function(response){if(timer) clearTimeout(timer);return response.ok;})
      .catch(function(){if(timer) clearTimeout(timer);return false;});
  }
  function deliver(payload){
    window.dispatchEvent(new CustomEvent('throupletea:analytics',{detail:payload}));
    if(config.debug&&window.console) console.info('[ThroupleTea Analytics]',payload);
    if(!endpointReady()) return;
    transmit(payload).then(function(ok){if(!ok) enqueue(payload);});
  }
  function flush(){
    if(!endpointReady()||navigator.onLine===false) return;
    var items=readQueue();if(!items.length) return;
    localStorage.removeItem(queueKey);
    items.reduce(function(chain,item){return chain.then(function(){return transmit(item).then(function(ok){if(!ok) enqueue(item);});});},Promise.resolve());
  }

  var originalGtag=window.gtag;
  if(typeof originalGtag==='function'){
    window.gtag=function(){
      var args=Array.prototype.slice.call(arguments);
      var result=originalGtag.apply(window,args);
      if(args[0]==='event'&&args[1]) deliver(normalized(args[1],args[2]||{}));
      return result;
    };
  }
  window.ttTrack=function(name,params){
    if(typeof window.gtag==='function') window.gtag('event',name,params||{});
    else deliver(normalized(name,params||{}));
  };
  window.ThroupleTeaAnalyticsBridge={track:window.ttTrack,flush:flush,getQueueSize:function(){return readQueue().length;},version:'6.1.1'};

  /* Send one Cloudflare-only page view after the bridge is ready. GA4 already
     records its own automatic page view, so this deliberately calls deliver()
     directly instead of gtag() to avoid double-counting in Google Analytics. */
  function sendInitialPageView(){
    if(window.__ttInitialPageViewSent) return;
    window.__ttInitialPageViewSent=true;
    var navigationEntry=(window.performance&&performance.getEntriesByType)?performance.getEntriesByType('navigation')[0]:null;
    deliver(normalized('page_view',{
      page_path:location.pathname,
      navigation_type:navigationEntry&&navigationEntry.type?navigationEntry.type:'navigate'
    }));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',sendInitialPageView,{once:true});
  else window.setTimeout(sendInitialPageView,0);

  window.addEventListener('online',flush);
  window.setTimeout(flush,1200);
}());


var yearNode = document.getElementById('year');
if (yearNode) yearNode.textContent = new Date().getFullYear();

/* One professional header system for every main/legacy page. Does not touch OneSignal. */
(function () {
  var hdr = document.querySelector('.simple-header');
  if (!hdr) return;

  var headerWrap = hdr.querySelector(':scope > .wrap') || hdr.querySelector('.wrap');
  var btn = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');

  /* Match mobile browser/PWA chrome to the header. */
  var theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.appendChild(theme);
  }
  theme.content = '#160712';

  /* Remove every older duplicate Hotline placement. */
  hdr.querySelectorAll('.nav-hotline, .hotline-row, .header-hotline').forEach(function (node) {
    node.remove();
  });

  /* Create one permanent Hotline action. */
  if (headerWrap) {
    var hotline = document.createElement('a');
    hotline.className = 'header-hotline';
    hotline.href = 'mailto:throupletea@gmail.com?subject=Throuple%20Hotline&body=Spill%20the%20tea%20here%3A%0A%0A';
    hotline.setAttribute('aria-label', 'Open the Throuple Hotline');
    hotline.innerHTML = '<span aria-hidden="true">☎️</span><span class="hotline-label">Throuple Hotline</span>';
    if (nav) headerWrap.insertBefore(hotline, nav);
    else if (btn) headerWrap.insertBefore(hotline, btn);
    else headerWrap.appendChild(hotline);
  }

  hdr.classList.add('unified-header');

  var style = document.createElement('style');
  style.id = 'throuple-tea-unified-header-v3';
  style.textContent = `
    :root{
      --tt-header-left:#1d0613;
      --tt-header-mid:#10101a;
      --tt-header-right:#041d25;
      --tt-pink:#ff005d;
      --tt-orange:#ff7a18;
      --tt-teal:#00d7e8;
    }

    html,body{background-color:#160712}

    .simple-header.unified-header{
      position:sticky!important;
      top:0!important;
      z-index:99999!important;
      margin:0!important;
      padding:0!important;
      background:
        linear-gradient(100deg,var(--tt-header-left) 0%,var(--tt-header-mid) 48%,var(--tt-header-right) 100%)!important;
      border-bottom:1px solid rgba(255,42,127,.42)!important;
      box-shadow:0 10px 34px rgba(0,0,0,.38)!important;
      backdrop-filter:saturate(150%) blur(18px)!important;
      -webkit-backdrop-filter:saturate(150%) blur(18px)!important;
    }

    .simple-header.unified-header::before{
      content:"";
      position:absolute;
      left:0;
      right:0;
      bottom:100%;
      height:max(0px,env(safe-area-inset-top));
      background:
        linear-gradient(100deg,var(--tt-header-left) 0%,var(--tt-header-mid) 48%,var(--tt-header-right) 100%);
    }

    .simple-header.unified-header > .wrap,
    .simple-header.unified-header .header-inner{
      width:min(calc(100% - 32px),1180px)!important;
      max-width:1180px!important;
      min-height:78px!important;
      height:auto!important;
      margin:0 auto!important;
      padding:10px 0!important;
      display:grid!important;
      grid-template-columns:auto minmax(0,1fr) auto!important;
      grid-template-areas:"brand nav hotline"!important;
      align-items:center!important;
      gap:22px!important;
    }

    .simple-header.unified-header .brand{
      grid-area:brand!important;
      display:flex!important;
      align-items:center!important;
      margin:0!important;
    }

    .simple-header.unified-header .brand img{
      height:50px!important;
      width:auto!important;
      display:block!important;
      border-radius:11px!important;
      box-shadow:0 0 18px rgba(255,0,93,.30)!important;
    }

    .simple-header.unified-header .simple-nav{
      grid-area:nav!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      gap:18px!important;
      flex-wrap:wrap!important;
      margin:0!important;
      padding:0!important;
      position:static!important;
      background:none!important;
      border:0!important;
    }

    .simple-header.unified-header .simple-nav a{
      margin:0!important;
      padding:7px 0!important;
      color:#fff!important;
      text-decoration:none!important;
      font-size:.9rem!important;
      font-weight:800!important;
      border:0!important;
      background:none!important;
      white-space:nowrap!important;
    }

    .simple-header.unified-header .simple-nav a:hover,
    .simple-header.unified-header .simple-nav a.active{
      color:var(--tt-pink)!important;
      text-shadow:0 0 12px rgba(255,0,93,.55)!important;
    }

    .simple-header.unified-header .header-hotline{
      grid-area:hotline!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      gap:7px!important;
      min-height:43px!important;
      padding:9px 15px!important;
      border-radius:999px!important;
      color:#fff!important;
      text-decoration:none!important;
      font-size:.9rem!important;
      font-weight:900!important;
      white-space:nowrap!important;
      background:linear-gradient(135deg,var(--tt-pink),var(--tt-orange))!important;
      box-shadow:0 7px 22px rgba(255,0,93,.30)!important;
    }

    .simple-header.unified-header .nav-toggle{display:none!important}

    @media(max-width:980px){
      .simple-header.unified-header > .wrap,
      .simple-header.unified-header .header-inner{
        width:100%!important;
        max-width:none!important;
        min-height:78px!important;
        padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px!important;
        grid-template-columns:auto minmax(0,1fr) 48px!important;
        grid-template-areas:"brand hotline toggle"!important;
        gap:10px!important;
      }

      .simple-header.unified-header .brand img{height:44px!important}

      .simple-header.unified-header .header-hotline{
        justify-self:center!important;
        width:auto!important;
        max-width:230px!important;
        min-height:42px!important;
        padding:8px 14px!important;
        font-size:.86rem!important;
      }

      .simple-header.unified-header .nav-toggle{
        grid-area:toggle!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        width:48px!important;
        height:48px!important;
        min-width:48px!important;
        min-height:48px!important;
        padding:0!important;
        margin:0!important;
        border:1px solid rgba(0,215,232,.42)!important;
        border-radius:14px!important;
        background:rgba(4,29,37,.58)!important;
        color:#fff!important;
        font-size:1.3rem!important;
        line-height:1!important;
        box-shadow:none!important;
      }

      .simple-header.unified-header .simple-nav{
        display:none!important;
        position:fixed!important;
        top:var(--header-height,78px)!important;
        left:0!important;
        right:0!important;
        max-height:calc(100dvh - var(--header-height,78px))!important;
        overflow-y:auto!important;
        padding:8px 0 calc(18px + env(safe-area-inset-bottom))!important;
        background:linear-gradient(180deg,rgba(5,8,18,.995),rgba(4,20,28,.995))!important;
        border-top:1px solid rgba(255,42,127,.30)!important;
        border-bottom:1px solid rgba(0,215,232,.22)!important;
        box-shadow:0 22px 50px rgba(0,0,0,.5)!important;
        flex-direction:column!important;
        align-items:stretch!important;
        gap:0!important;
      }

      .simple-header.unified-header.nav-open .simple-nav,
      .simple-header.unified-header .simple-nav.open{
        display:flex!important;
      }

      .simple-header.unified-header .simple-nav a{
        display:block!important;
        padding:16px 22px!important;
        font-size:1rem!important;
        border-bottom:1px solid rgba(255,255,255,.07)!important;
      }
    }

    @media(max-width:430px){
      .simple-header.unified-header > .wrap,
      .simple-header.unified-header .header-inner{
        grid-template-columns:48px minmax(0,1fr) 48px!important;
        padding-left:14px!important;
        padding-right:14px!important;
      }

      .simple-header.unified-header .brand img{height:42px!important}
      .simple-header.unified-header .header-hotline{
        max-width:188px!important;
        padding:8px 11px!important;
        font-size:.78rem!important;
        gap:5px!important;
      }
    }

    @media(max-width:355px){
      .simple-header.unified-header .hotline-label{display:none!important}
      .simple-header.unified-header .header-hotline{
        width:44px!important;
        height:44px!important;
        padding:0!important;
      }
    }

    /* ROUND 6.3: one branded app-style header on every screen. */
    .simple-header.unified-header > .wrap,
    .simple-header.unified-header .header-inner{
      grid-template-columns:auto minmax(0,1fr) 52px!important;
      grid-template-areas:"brand hotline toggle"!important;
    }

    .simple-header.unified-header .header-hotline{
      justify-self:center!important;
    }

    .simple-header.unified-header .nav-toggle{
      grid-area:toggle!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      width:48px!important;
      height:48px!important;
      min-width:48px!important;
      min-height:48px!important;
      padding:0!important;
      margin:0!important;
      border:1px solid rgba(0,215,232,.42)!important;
      border-radius:14px!important;
      background:rgba(4,29,37,.58)!important;
      color:#fff!important;
      font-size:1.3rem!important;
      line-height:1!important;
      box-shadow:none!important;
    }

    .simple-header.unified-header .simple-nav{
      display:none!important;
      position:fixed!important;
      top:var(--header-height,78px)!important;
      z-index:100000!important;
      max-height:calc(100dvh - var(--header-height,78px))!important;
      overflow-y:auto!important;
      padding:8px 0 calc(18px + env(safe-area-inset-bottom))!important;
      background:linear-gradient(180deg,rgba(5,8,18,.995),rgba(4,20,28,.995))!important;
      border:1px solid rgba(0,215,232,.22)!important;
      border-top-color:rgba(255,42,127,.30)!important;
      box-shadow:0 22px 50px rgba(0,0,0,.55)!important;
      flex-direction:column!important;
      align-items:stretch!important;
      gap:0!important;
    }

    .simple-header.unified-header.nav-open .simple-nav,
    .simple-header.unified-header .simple-nav.open{
      display:flex!important;
    }

    .simple-header.unified-header .simple-nav a{
      display:block!important;
      padding:16px 22px!important;
      font-size:1rem!important;
      border-bottom:1px solid rgba(255,255,255,.07)!important;
    }

    @media(min-width:981px){
      .simple-header.unified-header .simple-nav{
        left:auto!important;
        right:max(16px,calc((100vw - 1180px)/2))!important;
        width:min(390px,calc(100vw - 32px))!important;
        border-radius:0 0 18px 18px!important;
      }
      .simple-header.unified-header .header-hotline{
        min-width:210px!important;
      }
    }

    @media(max-width:980px){
      .simple-header.unified-header{
        position:fixed!important;
        top:0!important;
        left:0!important;
        right:0!important;
        width:100%!important;
      }
      body.tt-fixed-mobile-header{
        padding-top:var(--header-height,78px)!important;
      }
      .simple-header.unified-header .simple-nav{
        left:0!important;
        right:0!important;
        width:100%!important;
        border-left:0!important;
        border-right:0!important;
        border-radius:0!important;
      }
    }
  `;
  document.head.appendChild(style);

  if (!btn || !nav) return;
  hdr.classList.add('nav-ready');

  function updateHeaderHeight() {
    document.documentElement.style.setProperty('--header-height', hdr.offsetHeight + 'px');
    document.body.classList.toggle('tt-fixed-mobile-header', window.innerWidth <= 980);
  }

  function openNav() {
    updateHeaderHeight();
    hdr.classList.add('nav-open');
    nav.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close navigation menu');
    btn.innerHTML = '&#10005;';
  }

  function closeNav() {
    hdr.classList.remove('nav-open');
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open navigation menu');
    btn.innerHTML = '&#9776;';
  }

  updateHeaderHeight();
  window.addEventListener('resize', updateHeaderHeight);

  btn.addEventListener('click', function (event) {
    event.stopPropagation();
    hdr.classList.contains('nav-open') ? closeNav() : openNav();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeNav();
  });

  document.addEventListener('click', function (event) {
    if (hdr.classList.contains('nav-open') && !hdr.contains(event.target)) closeNav();
  });

  nav.addEventListener('click', function (event) {
    if (event.target.tagName === 'A') closeNav();
  });
}());


/* One-click Hotline fallback for older archive/episode links. */
(function () {
  var hash = window.location.hash.toLowerCase();
  if (hash !== '#hotline' && hash !== '#social-tea') return;

  var mailto = 'mailto:throupletea@gmail.com?subject=Throuple%20Hotline&body=Spill%20the%20tea%20here%3A%0A%0A';
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }
  window.setTimeout(function () {
    window.location.href = mailto;
  }, 120);
}());

/* Keep the weekly giveaway directly beneath the hero while preserving OneSignal IDs/events. */
(function () {
  var hero = document.querySelector('main .hero');
  var hotlineSection = document.getElementById('hotline');
  var giveaway = hotlineSection ? hotlineSection.querySelector('.giveaway') : null;
  if (!hero || !giveaway || document.querySelector('.giveaway-focus-section')) return;

  var focusSection = document.createElement('section');
  focusSection.className = 'section giveaway-focus-section';
  focusSection.setAttribute('aria-label', 'Weekly signed book giveaway');

  var wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.appendChild(giveaway);
  focusSection.appendChild(wrap);
  hero.insertAdjacentElement('afterend', focusSection);

  var style = document.createElement('style');
  style.id = 'giveaway-focus-position-v1';
  style.textContent = `
    .giveaway-focus-section{
      padding:34px 0!important;
      border-top:1px solid rgba(255,42,127,.22)!important;
      border-bottom:1px solid rgba(0,215,232,.18)!important;
      background:
        radial-gradient(circle at 18% 0%,rgba(255,0,93,.13),transparent 34%),
        radial-gradient(circle at 82% 100%,rgba(255,122,24,.10),transparent 34%),
        linear-gradient(180deg,#050812,#071321)!important;
    }
    .giveaway-focus-section .giveaway{
      max-width:900px!important;
      margin:0 auto!important;
    }
    #hotline .search-cluster{
      grid-template-columns:1fr!important;
      max-width:820px!important;
      margin:0 auto!important;
    }
    @media(max-width:680px){
      .giveaway-focus-section{padding:24px 0!important}
      .giveaway-focus-section .giveaway{padding:26px 20px!important}
    }
  `;
  document.head.appendChild(style);
}());


/* Device-aware install guidance and installed-mode messaging. No service-worker registration is added here. */
(function(){
  function platformCopy(){
    var ua=navigator.userAgent||'';
    var standalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
    if(standalone) return 'You are already using the saved app experience.';
    var ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(ios) return 'On iPhone or iPad Safari: tap Share, then Add to Home Screen.';
    if(/Macintosh/.test(ua)&&/Safari/.test(ua)&&!/Chrome|Chromium/.test(ua)) return 'On Mac Safari: choose File, then Add to Dock.';
    if(/Android/.test(ua)) return 'On Android Chrome: open the browser menu and choose Install app or Add to Home screen.';
    if(/Edg|Chrome|Chromium/.test(ua)) return 'In Chrome or Edge: use the Install option in the address bar or browser menu.';
    return 'Use your browser menu to save or install this site when that option is available.';
  }
  document.querySelectorAll('[data-install-help]').forEach(function(el){el.textContent=platformCopy();});
  document.documentElement.classList.toggle('is-installed-app', window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true);
}());

/* One delegated analytics listener avoids duplicate event handlers. */
(function(){
  document.addEventListener('click',function(e){
    var el=e.target.closest('a,button'); if(!el) return;
    var label=(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,100);
    var href=el.getAttribute('href')||'';
    var eventName='cta_click';
    if(href.startsWith('mailto:')) eventName='email_click';
    else if(href.startsWith('tel:')) eventName='phone_click';
    else if(/spotify|apple|youtube|amazon|iheart/i.test(href)) eventName='podcast_platform_click';
    else if(el.id==='push-subscribe-btn') eventName='push_entry_click';
    else if(el.id==='newsletter-trigger'||el.id==='newsletter-float') eventName='newsletter_open';
    if(typeof window.gtag==='function') window.gtag('event',eventName,{event_label:label,link_url:href||undefined});
  },{passive:true});
}());

/* Friendly network-state notice; avoids registering a competing service worker. */
(function(){
  var node;
  function show(message){
    if(!node){node=document.createElement('div');node.className='network-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.appendChild(node);}
    node.textContent=message;node.hidden=false;
  }
  function hide(){if(node) node.hidden=true;}
  window.addEventListener('offline',function(){show('You are offline. Already-loaded pages may still be available.');});
  window.addEventListener('online',function(){show('You are back online.');window.setTimeout(hide,2500);});
  if(!navigator.onLine) show('You are offline. Already-loaded pages may still be available.');
}());

/* Mark current navigation item for visual and screen-reader context. */
(function(){
  var path=location.pathname.replace(/\/index\.html$/,'/'); var projectBase=(location.hostname.endsWith('github.io')?('/'+path.split('/').filter(Boolean)[0]+'/'):'/');
  document.querySelectorAll('#mainNav a').forEach(function(a){
    try{var ap=new URL(a.href,location.origin).pathname.replace(/\/index\.html$/,'/');if(ap!=='/'&&path.startsWith(ap)){a.classList.add('active');a.setAttribute('aria-current','page');}else if((path==='/'||path===projectBase)&&(ap==='/'||ap===projectBase)){a.classList.add('active');a.setAttribute('aria-current','page');}}catch(e){}
  });
}());

/* Deeper, deduplicated engagement analytics. This does not alter OneSignal behavior. */
(function(){
  function send(name,params){
    if(typeof window.gtag==='function') window.gtag('event',name,params||{});
  }
  function once(key,name,params){
    try{
      if(sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key,'1');
    }catch(e){}
    send(name,params);
  }

  document.addEventListener('click',function(event){
    var link=event.target.closest('a[href]');
    if(!link) return;
    try{
      var url=new URL(link.href,location.href);
      if(/^https?:$/.test(url.protocol) && url.origin!==location.origin){
        send('outbound_click',{
          link_url:url.href,
          link_domain:url.hostname,
          link_text:(link.getAttribute('aria-label')||link.textContent||'').trim().replace(/\s+/g,' ').slice(0,100)
        });
      }
    }catch(e){}
  },{passive:true});

  document.addEventListener('submit',function(event){
    var form=event.target;
    send('form_submit',{
      form_id:form.id||undefined,
      form_name:form.getAttribute('name')||undefined,
      form_action:form.getAttribute('action')||undefined
    });
  },true);

  document.addEventListener('play',function(event){
    var media=event.target;
    if(!media || !/^(AUDIO|VIDEO)$/.test(media.tagName)) return;
    send(media.tagName==='AUDIO'?'podcast_play':'video_play',{
      media_src:media.currentSrc||media.getAttribute('src')||undefined,
      page_path:location.pathname
    });
  },true);

  var marks=[25,50,75,90];
  function scrollDepth(){
    var doc=document.documentElement;
    var available=Math.max(1,doc.scrollHeight-window.innerHeight);
    var percent=Math.round((window.scrollY/available)*100);
    marks.forEach(function(mark){
      if(percent>=mark) once('tt_scroll_'+location.pathname+'_'+mark,'scroll_depth',{percent_scrolled:mark,page_path:location.pathname});
    });
  }
  var ticking=false;
  window.addEventListener('scroll',function(){
    if(ticking) return;
    ticking=true;
    window.requestAnimationFrame(function(){scrollDepth();ticking=false;});
  },{passive:true});

  window.addEventListener('beforeinstallprompt',function(){
    once('tt_install_available','pwa_install_available',{page_path:location.pathname});
  });
  window.addEventListener('appinstalled',function(){
    send('pwa_installed',{page_path:location.pathname});
  });
  if(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true){
    once('tt_standalone_launch','pwa_standalone_launch',{page_path:location.pathname});
  }
}());


/* ROUND 4: accessible episode sharing and form feedback. */
(function(){
  function toast(message){
    var old=document.querySelector('.copy-status-toast'); if(old) old.remove();
    var node=document.createElement('div'); node.className='copy-status-toast'; node.setAttribute('role','status'); node.setAttribute('aria-live','polite'); node.textContent=message; document.body.appendChild(node);
    window.setTimeout(function(){node.remove();},2400);
  }
  document.addEventListener('click',async function(event){
    var btn=event.target.closest('[data-copy-episode]'); if(!btn) return;
    var url=location.href.split('#')[0];
    try{
      if(navigator.share){
        await navigator.share({title:document.title,url:url});
        if(typeof window.gtag==='function') window.gtag('event','episode_share',{method:'native',page_path:location.pathname});
        return;
      }
      await navigator.clipboard.writeText(url);
      btn.classList.add('is-copied'); btn.textContent='Link Copied!'; toast('Episode link copied.');
      window.setTimeout(function(){btn.classList.remove('is-copied');btn.textContent='Copy Episode Link';},2200);
      if(typeof window.gtag==='function') window.gtag('event','episode_share',{method:'clipboard',page_path:location.pathname});
    }catch(error){
      if(error && error.name==='AbortError') return;
      toast('Copy the address from your browser to share this episode.');
    }
  });
  document.addEventListener('submit',function(event){
    var form=event.target; if(!(form instanceof HTMLFormElement)) return;
    var submit=form.querySelector('button[type="submit"],input[type="submit"]');
    if(!submit || submit.disabled) return;
    submit.dataset.originalLabel=submit.value||submit.textContent||'';
    submit.setAttribute('aria-busy','true');
    window.setTimeout(function(){
      if(!document.contains(submit)) return;
      submit.removeAttribute('aria-busy');
    },5000);
  },true);
}());


/* ROUND 4.1: guarantee the two homepage hero lines fit Safari's real rendered width. */
(function(){
  function fitHeroLines(){
    var lines=document.querySelectorAll('.hero h1 .hero-line');
    if(!lines.length) return;
    lines.forEach(function(line){
      line.style.fontSize='';
      line.style.letterSpacing='';
      var available=line.parentElement ? line.parentElement.clientWidth : line.clientWidth;
      if(!available) return;
      var size=parseFloat(window.getComputedStyle(line).fontSize);
      var minSize=16;
      var guard=80;
      while(line.scrollWidth > available && size > minSize && guard-- > 0){
        size-=0.5;
        line.style.fontSize=size+'px';
      }
      if(line.scrollWidth > available){
        line.style.letterSpacing='-0.075em';
        guard=24;
        while(line.scrollWidth > available && size > minSize && guard-- > 0){
          size-=0.25;
          line.style.fontSize=size+'px';
        }
      }
    });
  }
  var queued=false;
  function queueFit(){
    if(queued) return;
    queued=true;
    window.requestAnimationFrame(function(){queued=false;fitHeroLines();});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',queueFit);
  else queueFit();
  window.addEventListener('resize',queueFit,{passive:true});
  window.addEventListener('orientationchange',queueFit,{passive:true});
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
}());


/* ROUND 5.0: named listener-growth events for the analytics dashboard. */
(function(){
  document.addEventListener('click',function(event){
    var el=event.target.closest('[data-growth-event]'); if(!el) return;
    var name=el.getAttribute('data-growth-event'); if(!name) return;
    var href=el.getAttribute('href')||'';
    var params={page_path:location.pathname,link_url:href||undefined,link_text:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,100)};
    if(el.dataset.episode) params.episode_slug=el.dataset.episode;
    if(typeof window.gtag==='function') window.gtag('event',name,params);
  },{passive:true});
}());
