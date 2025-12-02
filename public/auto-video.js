/* Auto‑play all videos site‑wide, keep them looping and resumed.
   Works across browsers by forcing muted+playsinline and retrying on policy blocks. */
(function () {
  const videos = new Set();

  function forceAttrs(v) {
    try {
      v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
      v.loop = true; v.setAttribute('loop', '');
      v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.autoplay = true; v.setAttribute('autoplay', '');
      if (!v.getAttribute('preload')) v.preload = 'auto';
    } catch (error) {
      console.warn('[auto-video] Failed to enforce video attributes:', error);
    }
  }

  function tryPlay(v) {
    forceAttrs(v);
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => scheduleRetry(v));
    }
  }

  function scheduleRetry(v) {
    if (!videos.has(v)) return;
    setTimeout(() => {
      if (!videos.has(v)) return;
      if (document.visibilityState === 'visible') tryPlay(v);
      else scheduleRetry(v);
    }, 1000);
  }

  function attach(v) {
    if (!v || videos.has(v)) return;
    videos.add(v);
    forceAttrs(v);
    // Keep playing forever
    v.addEventListener('pause', () => tryPlay(v));
    v.addEventListener('ended', () => tryPlay(v));
    v.addEventListener('emptied', () => tryPlay(v));
    v.addEventListener('canplay', () => tryPlay(v));
    tryPlay(v);
  }

  function scan() {
    document.querySelectorAll('video').forEach(attach);
  }

  // Observe dynamic videos
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') {
        m.addedNodes && m.addedNodes.forEach((n) => {
          if (n && n.tagName === 'VIDEO') attach(n);
          else if (n && n.querySelectorAll) n.querySelectorAll('video').forEach(attach);
        });
      }
    }
  });

  function boot() {
    scan();
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // If autoplay is blocked, resume on first user gesture
  ['click','touchstart','keydown'].forEach(evt => {
    window.addEventListener(evt, () => { videos.forEach(tryPlay); }, { once: false, passive: true });
  });

  const start = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(boot, { timeout: 1500 });
    else setTimeout(boot, 800);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();


