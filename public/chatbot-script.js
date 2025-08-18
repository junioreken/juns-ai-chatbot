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

function ensureShadowRoot() {
  if (JUNS_SHADOW) return JUNS_SHADOW;
  JUNS_ROOT = document.getElementById('juns-ai-root');
  if (!JUNS_ROOT) {
    JUNS_ROOT = document.createElement('div');
    JUNS_ROOT.id = 'juns-ai-root';
    document.body.appendChild(JUNS_ROOT);
  }
  JUNS_SHADOW = JUNS_ROOT.attachShadow({ mode: 'open' });
  if (ASSET_ORIGIN) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${ASSET_ORIGIN}/chatbot-style.css`;
    JUNS_SHADOW.appendChild(link);
  }
  return JUNS_SHADOW;
}

function createMessage(content, isUser = false) {
  const message = document.createElement("div");
  message.className = `bubble ${isUser ? "user" : "ai"}`;
  if (isUser) {
    message.textContent = content;
  } else {
    // Allow basic formatting and clickable links from trusted server responses
    message.innerHTML = String(content).replace(/\n/g, '<br>');
  }
  return message;
}

function initChat() {
  const root = ensureShadowRoot();
  let chatContainer = root.getElementById && root.getElementById("juns-ai-chatbox");
  if (!chatContainer) {
    chatContainer = document.createElement("div");
    chatContainer.id = "juns-ai-chatbox";
    chatContainer.style.display = "none"; // start hidden, toggled by launcher
    chatContainer.innerHTML = `
      <div class="chat-header">
        <div class="chat-title"><span class="brand">JUN’S</span><span class="sub">AI</span></div>
        <button id="juns-close" aria-label="Close">×</button>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input">
        <input type="text" id="chatInput" placeholder="Type your message..." />
        <button id="juns-send" aria-label="Send">➤</button>
      </div>
    `;
    root.appendChild(chatContainer);
  }

  const input = root.getElementById("chatInput");
  const messages = root.getElementById("chatMessages");
  const sendBtn = root.getElementById("juns-send");

  async function sendCurrentMessage() {
    if (!input.value.trim()) return;
    const userMessage = input.value.trim();
    messages.appendChild(createMessage(userMessage, true));
    input.value = "";

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

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendCurrentMessage();
  });
  if (sendBtn) sendBtn.addEventListener("click", sendCurrentMessage);

  // Handle keyboard overlap on mobile
  input.addEventListener('focus', () => {
    chatContainer.classList.add('kbd-open');
    setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 150);
  });
  input.addEventListener('blur', () => {
    chatContainer.classList.remove('kbd-open');
  });
}

function createLauncher() {
  // Bubble launcher
  const root = ensureShadowRoot();
  if (root.getElementById && root.getElementById("juns-ai-button")) return;
  const btn = document.createElement("div");
  btn.id = "juns-ai-button";
  btn.innerHTML = `<div id="chat-circle"><div class="bubble-title"><span class="brand">JUN’S</span><span class="sub">AI</span></div></div>`;
  root.appendChild(btn);

  btn.addEventListener("click", () => {
    initChat();
    const box = root.getElementById("juns-ai-chatbox");
    const closeBtn = root.getElementById("juns-close");
    if (box.style.display === "none") {
      box.style.display = "flex";
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
