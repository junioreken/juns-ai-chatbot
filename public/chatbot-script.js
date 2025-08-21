// Resolve API base from the script's own src so it works cross-origin when embedded in Shopify
function getAssetInfo() {
  try {
    const thisScript = document.currentScript || (function() {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    const scriptUrl = new URL(thisScript.src);
    return {
      api: `${scriptUrl.origin}/api/enhanced-chat`,
      origin: scriptUrl.origin
    };
  } catch (e) {
    return { api: "/api/enhanced-chat", origin: "" };
  }
}

const { api: API_URL, origin: ASSET_ORIGIN } = getAssetInfo();

let JUNS_SHADOW = null; // ShadowRoot
let JUNS_ROOT = null; // Host element
let TAWK_LOADING = false;
let TAWK_LOADED = false;

function ensureShadowRoot() {
  if (JUNS_SHADOW) return JUNS_SHADOW;
  JUNS_ROOT = document.getElementById('juns-ai-root');
  if (!JUNS_ROOT) {
    JUNS_ROOT = document.createElement('div');
    JUNS_ROOT.id = 'juns-ai-root';
    document.body.appendChild(JUNS_ROOT);
  }
  // Create shadow root only once
  JUNS_SHADOW = JUNS_ROOT.shadowRoot || JUNS_ROOT.attachShadow({ mode: 'open' });
  // Inject minimal critical styles for the launcher bubble only (to avoid blocking page load)
  const style = document.createElement('style');
  style.textContent = `
    #juns-ai-button{position:fixed;bottom:30px;right:30px;z-index:2147483647}
    #chat-circle{width:60px;height:60px;background:linear-gradient(135deg,#000,#333);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.3);cursor:pointer}
    #chat-circle .bubble-title{display:flex;flex-direction:column;align-items:center;line-height:1.1}
    #chat-circle .bubble-title .brand{font-weight:800;font-size:11px}
    #chat-circle .bubble-title .sub{font-weight:700;font-size:9px;opacity:.95}
  `;
  JUNS_SHADOW.appendChild(style);
  return JUNS_SHADOW;
}

// Lazy-load full stylesheet on first interaction
function loadFullStylesOnce(root){
  return new Promise((resolve)=>{
    if (!ASSET_ORIGIN) return resolve();
    if (root.getElementById && root.getElementById('juns-ai-style-link')) return resolve();
    const link = document.createElement('link');
    link.id = 'juns-ai-style-link';
    link.rel = 'stylesheet';
    link.href = `${ASSET_ORIGIN}/chatbot-style.css`;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    root.appendChild(link);
    // Fallback resolve in case onload doesn't fire
    setTimeout(resolve, 600);
  });
}

// --- Tawk.to integration (hidden by default) ---
function loadTawkOnce() {
  if (TAWK_LOADING || TAWK_LOADED) return;
  TAWK_LOADING = true;
  (function () {
    var s1 = document.createElement("script"),
      s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    // Replace with your own Tawk property ID if needed
    s1.src = 'https://embed.tawk.to/68a6b4e77ebce11927981c0e/1j35j5a9d';
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    s1.onload = function () {
      TAWK_LOADED = true;
      try { if (typeof Tawk_API !== 'undefined') { Tawk_API.hideWidget(); } } catch(_) {}
    };
    if (s0 && s0.parentNode) s0.parentNode.insertBefore(s1, s0); else document.head.appendChild(s1);
  })();
}

async function openLiveChat() {
  // If theme provided helper, use it (will also close chatbot)
  if (window.JUNS && window.JUNS.support && typeof window.JUNS.support.open === 'function') {
    window.JUNS.support.open();
    return;
  }
  // Otherwise load Tawk ourselves
  loadTawkOnce();
  // wait briefly for Tawk to be ready
  let tries = 0;
  const maxTries = 40;
  while (tries < maxTries) {
    if (window.Tawk_API && typeof window.Tawk_API.showWidget === 'function') {
      try { window.Tawk_API.showWidget(); window.Tawk_API.maximize(); } catch(_) {}
      // Close/minimize our chatbot UI so only Tawk remains visible
      try {
        const root = ensureShadowRoot();
        const box = root && root.getElementById('juns-ai-chatbox');
        if (box) box.style.display = 'none';
      } catch(_) {}
      break;
    }
    await new Promise(r => setTimeout(r, 100));
    tries++;
  }
}

function isSupportIntent(text) {
  const t = String(text).toLowerCase();
  return /(talk|speak|chat).*(support|agent|human|person)|live\s*(agent|chat)|need\s*help\s*from\s*(someone|a\s*person)/i.test(t) || /customer\s*service/i.test(t);
}

function createMessage(content, isUser = false) {
  const message = document.createElement("div");
  message.className = `bubble ${isUser ? "user" : "ai"}`;
  if (isUser) {
    message.textContent = content;
  } else {
    // Allow basic formatting and clickable links from trusted server responses
    const html = String(content);
    // Render simple product card markup if present
    if (html.includes('<div class="product-grid"')) {
      message.innerHTML = html;
    } else {
      message.innerHTML = html.replace(/\n/g, '<br>');
    }
  }
  return message;
}

function initChat() {
  const root = ensureShadowRoot();
  // Idle prefetch of stylesheet so first open is fast but not blocking page load
  try {
    const prefetch = () => loadFullStylesOnce(root);
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 1200 });
    else setTimeout(prefetch, 1200);
  } catch(_) {}
  let chatContainer = root.getElementById && root.getElementById("juns-ai-chatbox");
  if (!chatContainer) {
    chatContainer = document.createElement("div");
    chatContainer.id = "juns-ai-chatbox";
    chatContainer.style.display = "none"; // start hidden, toggled by launcher
    chatContainer.innerHTML = `
      <div class="chat-header">
        <div class="chat-title-line" aria-label="JUN'S AI">JUN’S AI</div>
        <button id="juns-close" aria-label="Close">×</button>
      </div>
      <div class="chat-messages chat-body" id="chatMessages"></div>
      <div class="chat-input">
        <textarea id="chatInput" placeholder="Type your message..." rows="1" aria-label="Type your message"></textarea>
        <button id="juns-send" aria-label="Send">➤</button>
      </div>
      <div class="quick-actions" id="juns-quick-actions" style="display:flex;gap:8px;padding:6px 8px 10px;flex-wrap:wrap;border-top:1px solid #eee">
        <button data-action="recommend" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">Show me recommendations</button>
        <button data-action="sizing" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">Sizing help</button>
        <button data-action="delivery" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">Delivery time</button>
        <button data-action="tracking" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">Order tracking</button>
        <button data-action="complete" style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer">Complete my look</button>
      </div>
    `;
    root.appendChild(chatContainer);
  }

  const input = root.getElementById("chatInput");
  const messages = root.getElementById("chatMessages");
  const sendBtn = root.getElementById("juns-send");
  const quickActions = root.getElementById("juns-quick-actions");

  // Avoid attaching duplicate listeners on repeated opens
  if (chatContainer.dataset.bound === '1') {
    return;
  }
  chatContainer.dataset.bound = '1';

  async function sendCurrentMessage() {
    if (!input.value.trim()) return;
    const userMessage = input.value.trim();
    await sendMessageText(userMessage);
  }

  async function sendMessageText(userMessage) {
    if (!userMessage || !userMessage.trim()) return;
    messages.appendChild(createMessage(userMessage, true));
    input.value = "";

    // Frontend shortcut: live agent intent -> open Tawk and return
    if (isSupportIntent(userMessage)) {
      const connecting = '✅ Connecting you to our live assistant…';
      messages.appendChild(createMessage(connecting));
      messages.scrollTop = messages.scrollHeight;
      // Close immediately, then open Tawk discussion widget
      try {
        const root = ensureShadowRoot();
        const box = root && root.getElementById('juns-ai-chatbox');
        if (box) box.style.display = 'none';
      } catch(_) {}
      openLiveChat();
      return;
    }

    const loading = createMessage("...");
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;

    try {
      // Ensure a persistent session id for better context
      let sessionId = localStorage.getItem("juns_session_id");
      if (!sessionId) {
        sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem("juns_session_id", sessionId);
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          lang: navigator.language && navigator.language.startsWith("fr") ? "fr" : "en",
          storeUrl: window.location.origin,
          sessionId
        }),
      });
      const data = await res.json();
      loading.remove();
      messages.appendChild(createMessage(data.reply || "Sorry, I couldn't find that."));
      messages.scrollTop = messages.scrollHeight;
    } catch (err) {
      loading.remove();
      messages.appendChild(createMessage("❌ Error, try again."));
    }
  }

  // Auto-grow textarea up to 5 lines
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    const max = 5 * 20; // approx 5 lines
    input.style.height = Math.min(input.scrollHeight, max) + 'px';
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentMessage();
    }
  });
  if (sendBtn) sendBtn.addEventListener("click", sendCurrentMessage);
  if (quickActions && !quickActions.dataset.bound) {
    quickActions.dataset.bound = '1';
    quickActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'recommend') {
        if (window.JUNS && window.JUNS.stylist && typeof window.JUNS.stylist.open === 'function') {
          window.JUNS.stylist.open();
        }
        return;
      }
      if (action === 'sizing') {
        input.placeholder = 'Type your measurements...';
        input.focus();
        // Trigger backend only (no duplicate guidance bubble)
        sendMessageText('size help');
        return;
      }
      if (action === 'delivery') {
        input.placeholder = 'City, Country...';
        input.focus();
        const typed = (input.value || '').trim();
        sendMessageText(typed ? `shipping to ${typed}` : 'delivery time');
        return;
      }
      if (action === 'tracking') {
        input.placeholder = 'Tracking number...';
        input.focus();
        // Trigger backend prompt flow (no duplicate instructions)
        sendMessageText('track order');
        return;
      }
      if (action === 'complete') {
        input.placeholder = 'Optional: color preference...';
        input.focus();
        sendMessageText('complete my look');
        return;
      }
    });
  }

  // Handle keyboard overlap on mobile
  input.addEventListener('focus', () => {
    chatContainer.classList.add('kbd-open');
    setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 150);
  });
  input.addEventListener('blur', () => {
    chatContainer.classList.remove('kbd-open');
  });

  // visualViewport adjustment for iOS/Android keyboards
  if (window.visualViewport) {
    const handler = () => {
      const offset = Math.max(12, (window.visualViewport.height < window.innerHeight) ? 12 : 16);
      chatContainer.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${offset}px)`;
    };
    window.visualViewport.addEventListener('resize', handler, { passive: true });
  }
}

function createLauncher() {
  // Bubble launcher
  const root = ensureShadowRoot();
  if (root.getElementById && root.getElementById("juns-ai-button")) return;
  const btn = document.createElement("div");
  btn.id = "juns-ai-button";
  btn.innerHTML = `<div id="chat-circle"><div class="bubble-title"><span class="brand">JUN’S</span><span class="sub">AI</span></div></div>`;
  root.appendChild(btn);

  btn.addEventListener("click", async () => {
    initChat();
    const box = root.getElementById("juns-ai-chatbox");
    const closeBtn = root.getElementById("juns-close");
    if (!box || box.style.display === "none") {
      await loadFullStylesOnce(root);
      box.style.display = "flex";
      // First-time greeting per browser/session
      try {
        const greeted = localStorage.getItem('juns_greeted');
        const messages = root.getElementById('chatMessages');
        if (!greeted && messages) {
          const greeting = 'Hi 👋 I’m your JUN’S Stylist. I can help with sizing, delivery, order tracking, and outfit ideas.';
          messages.appendChild(createMessage(greeting));
          messages.scrollTop = messages.scrollHeight;
          localStorage.setItem('juns_greeted','1');
        }
      } catch (_) {}
    } else {
      box.style.display = "none";
    }
    if (closeBtn) {
      closeBtn.onclick = () => { box.style.display = "none"; };
    }
  });
}

// Always render launcher bubble (lightweight); chat opens on click
window.addEventListener("load", () => {
  createLauncher();
});
