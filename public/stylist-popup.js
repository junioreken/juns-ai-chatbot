/* JUN'S – Stylist Popup + Chat Adapter (Behavior only) */
(function () {
  const PATH = window.location.pathname || '';
  const isCartOrCheckout = /\/(cart|checkout)(\/|$)/i.test(PATH);
  const isHome = (
    PATH === '/' || PATH === '/index.html' ||
    PATH === '/fr' || PATH === '/fr/' || PATH === '/fr/index.html'
  );
  const isCollection = /\/collections\//i.test(PATH) || PATH === '/collections' || PATH === '/collections/';
  const isProduct = /\/products\//i.test(PATH);
  const allowPopup = (isHome || isCollection || isProduct) && !isCartOrCheckout;

  const ss = window.sessionStorage;
  const ls = window.localStorage;

  // --- Chat adapter to existing widget (code 1) ---
  function getShadow() {
    const host = document.getElementById('juns-ai-root');
    return host && host.shadowRoot ? host.shadowRoot : null;
  }
  function ensureChat() {
    const root = getShadow();
    // trigger launcher creation if not present
    if (!root || !root.getElementById('juns-ai-button')) {
      const s = document.createElement('script');
      s.src = (function (){
        try { const u=new URL(document.currentScript.src); return `${u.origin}/chatbot-script.js`; } catch(e){ return '/chatbot-script.js'; }
      })();
      document.head.appendChild(s);
    }
  }

  const Chat = {
    openSoft(greeting) {
      const root = getShadow();
      if (!root) return;
      const btn = root.getElementById('juns-ai-button');
      if (btn) btn.click();
      if (greeting) {
        const messages = root.getElementById('chatMessages');
        if (messages) {
          const div = document.createElement('div');
          div.className = 'bubble ai';
          div.innerHTML = greeting;
          messages.appendChild(div);
          messages.scrollTop = messages.scrollHeight;
        }
      }
      // auto-minimize gently after 10s
      setTimeout(() => {
        const box = root.getElementById('juns-ai-chatbox');
        if (box && box.style.display !== 'none') {
          const btn = root.getElementById('juns-ai-button');
          if (btn) btn.click();
        }
      }, 10000);
    },
    message(text) {
      const root = getShadow();
      if (!root) return;
      const messages = root.getElementById('chatMessages');
      if (!messages) return;
      const div = document.createElement('div');
      div.className = 'bubble ai';
      div.innerHTML = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    },
    setBadge(on) {
      const root = getShadow();
      if (!root) return;
      const circle = root.querySelector('#chat-circle');
      if (!circle) return;
      let badge = root.getElementById('juns-badge');
      if (on) {
        if (!badge) {
          badge = document.createElement('span');
          badge.id = 'juns-badge';
          badge.style.cssText = 'position:absolute;right:-2px;top:-2px;width:10px;height:10px;background:#ff4d4f;border-radius:50%;box-shadow:0 0 0 2px #fff;';
          const wrap = document.createElement('div');
          wrap.style.position = 'relative';
          circle.parentElement.insertBefore(wrap, circle);
          wrap.appendChild(circle);
          wrap.appendChild(badge);
        }
      } else if (badge && badge.parentElement) {
        badge.parentElement.removeChild(badge);
      }
    },
    tooltip(text, ms = 3000) {
      const root = getShadow();
      if (!root) return;
      const circle = root.querySelector('#chat-circle');
      if (!circle) return;
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;right:84px;bottom:36px;background:#111;color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;box-shadow:0 6px 16px rgba(0,0,0,.2);z-index:2147483647;max-width:220px;';
      tip.textContent = text;
      document.body.appendChild(tip);
      setTimeout(() => tip.remove(), ms);
    }
  };
  window.JunsChatAdapter = Chat;
  // Provide unified namespace expected by other scripts
  window.JUNS = window.JUNS || {};
  window.JUNS.chat = Chat;

  // --- Stylist Popup (Shadow DOM to avoid theme CSS) ---
  function showPopup(force = false) {
    if (!allowPopup && !force) return;
    if (!force && ss.getItem('juns_popup_shown') === '1') return;
    // If already open, do nothing
    if (document.getElementById('juns-stylist-popup-root')) return;
    ensureChat();
    // Mark as shown immediately to avoid any other auto-open logic while visible
    ss.setItem('juns_popup_shown','1');

    const host = document.createElement('div');
    host.id = 'juns-stylist-popup-root';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const styles = `
      :host{all:initial}
      .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:2147483646}
      .card{position:fixed;right:16px;bottom:16px;width:min(420px,92vw);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.24);padding:18px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;z-index:2147483647}
      h3{margin:0 0 6px 0;font-size:18px;font-weight:800}
      p{margin:0 0 12px 0;color:#444;font-size:14px}
      .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
      .chip{padding:8px 12px;border:1px solid #ddd;border-radius:18px;cursor:pointer;font-size:13px}
      .chip.active{background:#111;color:#fff;border-color:#111}
      .actions{display:flex;gap:8px;margin-top:12px}
      .primary{flex:1;background:#111;color:#fff;border:none;border-radius:22px;padding:10px 14px;cursor:pointer}
      .secondary{background:transparent;border:none;color:#666;cursor:pointer}
      .close{position:absolute;right:10px;top:6px;background:transparent;border:none;font-size:18px;cursor:pointer}
    `;
    const isFr = /(^|\/)(fr)(\/|$)/i.test(location.pathname) || (document.documentElement.getAttribute('lang')||'').toLowerCase().startsWith('fr') || (window.Shopify && ((Shopify.locale||'').toLowerCase().startsWith('fr') || (Shopify.routes && String(Shopify.routes.root).startsWith('/fr'))));
    const T = isFr ? {
      title: 'Trouvez votre tenue parfaite ✨',
      subtitle: 'Dites-nous votre thème et votre budget. Nous proposerons des looks instantanément.',
      primary: 'Voir mes looks →',
      secondary: 'Je parcours seulement',
      themes: ['Mariage','Soirée','Bureau','Décontracté','Cocktail','Remise des diplômes'],
      budgets: ['Moins de 80 $','Moins de 150 $','Sans limite'],
      mapTheme: { 'Mariage':'wedding','Soirée':'night-out','Bureau':'business','Décontracté':'casual','Cocktail':'cocktail','Remise des diplômes':'graduation' },
      mapBudget: { 'Moins de 80 $':'under-80','Moins de 150 $':'under-150','Sans limite':'no-limit' },
      greet: "Bonjour 👋 Je suis votre styliste JUN’S. Besoin d’aide pour la taille, la livraison ou des idées de tenues ?"
    } : {
      title: 'Find your perfect outfit ✨',
      subtitle: 'Tell us your outing theme & budget. We’ll curate looks instantly.',
      primary: 'Show my looks →',
      secondary: 'Just browsing',
      themes: ['Wedding','Night Out','Business','Casual','Cocktail','Graduation'],
      budgets: ['Under $80','Under $150','No limit'],
      mapTheme: { 'Wedding':'wedding','Night Out':'night-out','Business':'business','Casual':'casual','Cocktail':'cocktail','Graduation':'graduation' },
      mapBudget: { 'Under $80':'under-80','Under $150':'under-150','No limit':'no-limit' },
      greet: "Hi 👋 I’m your JUN’S Stylist. Need sizing, delivery, or outfit ideas?"
    };
    shadow.innerHTML = `<style>${styles}</style><div class="backdrop"></div><div class="card" role="dialog" aria-label="${T.title}">
      <button class="close" aria-label="Close">×</button>
      <h3>${T.title}</h3>
      <p>${T.subtitle}</p>
      <div class="chips" id="themes"></div>
      <div class="chips" id="budgets"></div>
      <div class="actions">
        <button class="primary" id="go">${T.primary}</button>
        <button class="secondary" id="dnd">${T.secondary}</button>
      </div>
    </div>`;

    const themes = T.themes;
    const budgets = T.budgets;
    const themeSlugs = T.mapTheme;
    const budgetSlugs = T.mapBudget;

    const themesWrap = shadow.getElementById('themes');
    const budgetsWrap = shadow.getElementById('budgets');
    let chosenTheme = null; let chosenBudget = null;
    themes.forEach(t => { const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.onclick=()=>{chosenTheme=t;[...themesWrap.children].forEach(c=>c.classList.remove('active')); b.classList.add('active');}; themesWrap.appendChild(b); });
    budgets.forEach(t => { const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.onclick=()=>{chosenBudget=t;[...budgetsWrap.children].forEach(c=>c.classList.remove('active')); b.classList.add('active');}; budgetsWrap.appendChild(b); });

    // Temporarily hide chat bubble while popup is displayed to avoid overlap/click interception
    const root = getShadow();
    let hiddenBubble = false; let bubbleEl = null;
    if (root) { bubbleEl = root.getElementById('juns-ai-button'); if (bubbleEl) { bubbleEl.style.display = 'none'; hiddenBubble = true; } }

    let greeted = false;
    const closeAll = (doSoftOpen) => { 
      host.remove(); 
      if (hiddenBubble && bubbleEl) bubbleEl.style.display = '';
      if (doSoftOpen && !greeted) setTimeout(()=>{ if (ls.getItem('juns_dnd')==='1') return; greeted=true; Chat.openSoft(T.greet); }, 7000);
      // After closing, show a temporary pill to reopen the stylist (unless DND)
      if (ls.getItem('juns_dnd')!=='1') {
        showStylistPill();
      }
    };
    shadow.querySelector('.backdrop').addEventListener('click', () => closeAll(true), { passive:true });
    shadow.querySelector('.close').addEventListener('click', () => closeAll(true));
    shadow.getElementById('dnd').addEventListener('click', () => { ls.setItem('juns_dnd','1'); closeAll(false); });
    shadow.getElementById('go').addEventListener('click', () => {
      if (!chosenTheme || !chosenBudget) return;
      // Write stable params (slug) and clear stale caches by forcing full reload
      ss.setItem('juns_popup_submitted','1');
      const theme = themeSlugs[chosenTheme] || chosenTheme.toLowerCase().replace(/\s+/g,'-');
      const budget = budgetSlugs[chosenBudget] || 'no-limit';
      const url = `/pages/event-dress-recommendations?theme=${encodeURIComponent(theme)}&budget=${encodeURIComponent(budget)}&ts=${Date.now()}`;
      // Use replace to avoid back-button cache, and add ts to bust CDN caches
      window.location.replace(url);
    });
  }

  // Mini “Quick Stylist” pill near the chat bubble to reopen the popup
  function showStylistPill(timeoutMs = 25000) {
    // Avoid multiple pills
    if (document.getElementById('juns-stylist-pill-host')) return;
    const host = document.createElement('div');
    host.id = 'juns-stylist-pill-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:calc(92px + env(safe-area-inset-bottom, 0px));z-index:2147483646;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const css = `
      :host{all:initial}
      .pill{background:#111;color:#fff;padding:10px 12px;border-radius:999px;font: 600 12px/1 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:8px}
      .pill .dot{width:6px;height:6px;border-radius:50%;background:#62e;box-shadow:0 0 0 2px rgba(98,98,238,.25)}
      .pill:hover{opacity:.95}
    `;
    shadow.innerHTML = `<style>${css}</style><button class="pill" aria-label="Reopen Quick Stylist"><span class="dot"></span>Quick Stylist</button>`;
    const btn = shadow.querySelector('.pill');
    const close = () => { if (host && host.parentNode) host.parentNode.removeChild(host); };
    btn.addEventListener('click', () => { close(); showPopup(true); });
    if (timeoutMs > 0) setTimeout(close, timeoutMs);
  }

  // Expose stylist open API for other scripts (e.g., chatbot quick actions)
  window.JUNS.stylist = window.JUNS.stylist || {};
  window.JUNS.stylist.open = () => showPopup(true);

  // scroll nudge
  function installScrollNudge() {
    if (!allowPopup) return;
    let fired = false;
    window.addEventListener('scroll', () => {
      if (fired) return;
      const progress = (window.scrollY) / (document.body.scrollHeight - window.innerHeight);
      if (progress > 0.55) {
        fired = true;
        if (ls.getItem('juns_dnd')==='1') return;
        Chat.tooltip('Not sure what to wear? I can suggest 3 bestsellers for this theme.');
      }
    }, { passive:true });
  }

  // Product page soft helper if popup suppressed
  function productPageHelper() {
    if (!isProduct || isCartOrCheckout) return;
    if (ss.getItem('juns_popup_shown')==='1') return;
    setTimeout(()=>{ if (ls.getItem('juns_dnd')==='1') return; ensureChat(); Chat.openSoft("Hi 👋 I’m your JUN’S Stylist. Need sizing, delivery, or outfit ideas?"); }, 12000);
  }

  // Boot
  if (allowPopup) {
    setTimeout(() => { if (ls.getItem('juns_dnd')==='1') return; showPopup(); }, 1200);
    installScrollNudge();
    productPageHelper();
  }

  // Recommendations page soft upsell
  if (/\/pages\/event-dress-recommendations/i.test(PATH)) {
    if (ss.getItem('juns_popup_submitted')==='1') {
      // keep minimized with badge, gentle upsell later
      ensureChat(); Chat.setBadge(true);
      setTimeout(()=>{ Chat.message('Want me to add a matching clutch & heels to complete your look?'); }, 15000);
      ss.removeItem('juns_popup_submitted');
    }
  }
})();


