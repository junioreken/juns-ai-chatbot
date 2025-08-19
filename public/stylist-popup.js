/* JUN'S – Stylist Popup + Chat Adapter (Behavior only) */
(function () {
  const PATH = window.location.pathname;
  const isCartOrCheckout = /\/(cart|checkout)(\/|$)/i.test(PATH);
  const isHome = PATH === '/' || PATH === '/index.html';
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

  // --- Stylist Popup (Shadow DOM to avoid theme CSS) ---
  function showPopup() {
    if (!allowPopup) return;
    if (ss.getItem('juns_popup_shown') === '1') return;
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
    shadow.innerHTML = `<style>${styles}</style><div class="backdrop"></div><div class="card" role="dialog" aria-label="Find your perfect outfit">
      <button class="close" aria-label="Close">×</button>
      <h3>Find your perfect outfit ✨</h3>
      <p>Tell us your outing theme & budget. We’ll curate looks instantly.</p>
      <div class="chips" id="themes"></div>
      <div class="chips" id="budgets"></div>
      <div class="actions">
        <button class="primary" id="go">Show my looks →</button>
        <button class="secondary" id="dnd">Just browsing</button>
      </div>
    </div>`;

    const themes = ['Wedding','Night Out','Business','Casual','Cocktail','Graduation'];
    const budgets = ['Under $80','Under $150','No limit'];
    const themeSlugs = { 'Wedding':'wedding','Night Out':'night-out','Business':'office','Casual':'casual','Cocktail':'cocktail','Graduation':'graduation' };
    const budgetSlugs = { 'Under $80':'under-80','Under $150':'under-150','No limit':'no-limit' };

    const themesWrap = shadow.getElementById('themes');
    const budgetsWrap = shadow.getElementById('budgets');
    let chosenTheme = null; let chosenBudget = null;
    themes.forEach(t => { const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.onclick=()=>{chosenTheme=t;[...themesWrap.children].forEach(c=>c.classList.remove('active')); b.classList.add('active');}; themesWrap.appendChild(b); });
    budgets.forEach(t => { const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.onclick=()=>{chosenBudget=t;[...budgetsWrap.children].forEach(c=>c.classList.remove('active')); b.classList.add('active');}; budgetsWrap.appendChild(b); });

    // Temporarily hide chat bubble while popup is displayed to avoid overlap/click interception
    const root = getShadow();
    let hiddenBubble = false; let bubbleEl = null;
    if (root) { bubbleEl = root.getElementById('juns-ai-button'); if (bubbleEl) { bubbleEl.style.display = 'none'; hiddenBubble = true; } }

    const closeAll = (doSoftOpen) => { 
      host.remove(); 
      if (hiddenBubble && bubbleEl) bubbleEl.style.display = '';
      if (doSoftOpen) setTimeout(()=>{ if (ls.getItem('juns_dnd')==='1') return; Chat.openSoft("Hi 👋 I’m your JUN’S Stylist. Need sizing, delivery, or outfit ideas?"); }, 7000); 
    };
    shadow.querySelector('.backdrop').addEventListener('click', () => closeAll(true), { passive:true });
    shadow.querySelector('.close').addEventListener('click', () => closeAll(true));
    shadow.getElementById('dnd').addEventListener('click', () => { ls.setItem('juns_dnd','1'); closeAll(false); });
    shadow.getElementById('go').addEventListener('click', () => {
      if (!chosenTheme || !chosenBudget) return;
      ss.setItem('juns_popup_submitted','1');
      const theme = themeSlugs[chosenTheme] || chosenTheme.toLowerCase().replace(/\s+/g,'-');
      const budget = budgetSlugs[chosenBudget] || 'no-limit';
      window.location.href = `/pages/event-dress-recommendations?theme=${encodeURIComponent(theme)}&budget=${encodeURIComponent(budget)}`;
    });
  }

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


