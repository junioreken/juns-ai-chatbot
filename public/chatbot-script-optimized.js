// Optimized JUN'S AI Chatbot - Performance Focused
// Prevents multiple loads and reduces performance impact
if (window.JUNS_CHATBOT_LOADED) {
  console.log('JUNS Chatbot already loaded, skipping...');
} else {
  window.JUNS_CHATBOT_LOADED = true;

// Lightweight configuration
const CONFIG = {
  apiUrl: (window.JUNS_CHATBOT_API_URL || (function () {
  try {
    const sc = document.currentScript || (function () {
      const a = document.getElementsByTagName('script');
      return a[a.length - 1];
    })();
    return new URL(sc.src).origin + '/chat';
  } catch (e) {
    return 'https://juns-ai-chatbot-production.up.railway.app/chat';
  }
})()),
  lang: (() => {
    const htmlLang = document.documentElement.getAttribute('lang') || '';
    const path = window.location.pathname || '';
    return htmlLang.startsWith('fr') || path.startsWith('/fr') ? 'fr' : 'en';
  })(),
  delay: 3000, // Show after 3 seconds to not interfere with page load
  maxChecks: 5, // Reduced from continuous polling
  checkInterval: 3000 // Reduced frequency
};

// Minimal I18N
const I18N = {
  en: {
    placeholder: 'Type your message...',
    greet: "Hi 👋 I'm your JUN'S Stylist. How can I help you today?",
    quickActions: ['Show me recommendations', 'Sizing help', 'Delivery time', 'Order tracking']
  },
  fr: {
    placeholder: 'Écrivez votre message…',
    greet: "Salut 👋 Je suis votre Styliste JUN'S. Comment puis-je vous aider aujourd'hui ?",
    quickActions: ['Voir des recommandations', 'Aide taille', 'Délai de livraison', 'Suivi de commande']
  }
};

let sessionId = (function(){
  try {
    var s = localStorage.getItem('juns_session_id');
    if (!s) {
      s = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2,9);
      localStorage.setItem('juns_session_id', s);
    }
    return s;
  } catch (_) {
    return null;
  }
})();
let isVisible = false;

// Optimized DOM creation
function createChatbot() {
  // Create lightweight shadow DOM
  const container = document.createElement('div');
  container.id = 'juns-ai-container';
  container.innerHTML = `
    <style>
      #juns-ai-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .chat-bubble {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #007bff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,123,255,0.3);
        transition: transform 0.2s ease;
      }
      .chat-bubble:hover { transform: scale(1.05); }
      .chat-bubble::before {
        content: '💬';
        font-size: 24px;
        color: white;
      }
      .chat-window {
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      .chat-header {
        background: #2c3e50;
        color: white;
        padding: 16px;
        text-align: center;
        font-weight: bold;
      }
      .chat-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background: #f8f9fa;
      }
      .message {
        margin-bottom: 12px;
        display: flex;
      }
      .message.user { justify-content: flex-end; }
      .message.bot { justify-content: flex-start; }
      .message-bubble {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 18px;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.4;
      }
      .message.user .message-bubble {
        background: #007bff;
        color: white;
      }
      .message.bot .message-bubble {
        background: white;
        color: #333;
        border: 1px solid #e9ecef;
      }
      .chat-input {
        padding: 16px;
        border-top: 1px solid #e9ecef;
        display: flex;
        gap: 8px;
      }
      .chat-input input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #ddd;
        border-radius: 20px;
        outline: none;
        font-size: 14px;
      }
      .chat-input button {
        padding: 10px 16px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
      }
      .quick-actions {
        padding: 12px 16px;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .quick-action {
        padding: 6px 12px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 16px;
        cursor: pointer;
        font-size: 12px;
        color: #666;
        transition: all 0.2s;
      }
      .quick-action:hover {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }
      .close-btn {
        position: absolute;
        top: 12px;
        right: 12px;
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
      }
    </style>
    <div class="chat-bubble" id="chat-bubble"></div>
    <div class="chat-window" id="chat-window">
      <div class="chat-header">
        JUN'S AI
        <button class="close-btn" onclick="hideChat()">×</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="message bot">
          <div class="message-bubble">${I18N[CONFIG.lang].greet}</div>
        </div>
      </div>
      <div class="chat-input">
        <input type="text" id="message-input" placeholder="${I18N[CONFIG.lang].placeholder}" onkeypress="handleKeyPress(event)">
        <button onclick="sendMessage()">Send</button>
      </div>
      <div class="quick-actions" id="quick-actions">
        ${I18N[CONFIG.lang].quickActions.map(action => 
          `<div class="quick-action" onclick="sendQuickMessage('${action}')">${action}</div>`
        ).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  return container;
}

// Optimized message sending
async function sendMessage(text = null) {
  const input = document.getElementById('message-input');
  const message = text || input.value.trim();
  
  if (!message) return;
  
  // Add user message
  addMessage(message, true);
  if (input) input.value = '';
  
  // Show loading
  const loadingId = addMessage('Thinking...', false);
  
  try {
    const response = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        lang: CONFIG.lang,
        sessionId: sessionId,
        storeUrl: window.location.origin
      })
    });
    
    const data = await response.json();
    if (data && data.sessionId) {
      sessionId = data.sessionId;
      try { localStorage.setItem('juns_session_id', sessionId); } catch(_) {}
    }
    
    // Remove loading and add response
    removeMessage(loadingId);
    addMessage(data.reply, false);
    // If backend requests live-agent handoff, open Tawk
    try {
      if (data && data.triggerLiveChat) {
        if (typeof openLiveChat === 'function') {
          openLiveChat();
        }
      }
    } catch(_) {}
    
  } catch (error) {
    removeMessage(loadingId);
    addMessage('Sorry, I encountered an error. Please try again.', false);
    console.error('Chatbot error:', error);
  }
}

function addMessage(content, isUser = false) {
  const messages = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
  
  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'message-bubble';
  bubbleDiv.innerHTML = content;
  
  messageDiv.appendChild(bubbleDiv);
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  return messageDiv; // Return for potential removal
}

function removeMessage(messageElement) {
  if (messageElement && messageElement.parentNode) {
    messageElement.parentNode.removeChild(messageElement);
  }
}

function sendQuickMessage(message) {
  try {
    const n = String(message || '').toLowerCase();
    if (n.includes('recommend')) {
      var handle = (typeof window !== 'undefined' && window.JUNS_RECOMMENDATIONS_HANDLE)
        ? window.JUNS_RECOMMENDATIONS_HANDLE
        : 'event-dress-recommendations';
      var isFr = (document.documentElement.getAttribute('lang') || '').toLowerCase().startsWith('fr')
        || (window.location.pathname || '').startsWith('/fr');
      window.location.href = (isFr ? '/fr' : '') + '/pages/' + handle;
      return;
    }
  } catch (_) {}
  sendMessage(message);
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

function showChat() {
  const window = document.getElementById('chat-window');
  if (window) {
    window.style.display = 'flex';
    document.getElementById('message-input')?.focus();
    isVisible = true;
  }
}

function hideChat() {
  const window = document.getElementById('chat-window');
  if (window) {
    window.style.display = 'none';
    isVisible = false;
  }
}

// --- Minimal Tawk integration for live-agent handoff ---
let TAWK_LOADING = false;
let TAWK_LOADED = false;
function loadTawkOnce() {
  if (TAWK_LOADING || TAWK_LOADED) return;
  TAWK_LOADING = true;
  (function () {
    var s1 = document.createElement('script');
    var s0 = document.getElementsByTagName('script')[0];
    s1.async = true;
    // Your Tawk property ID
    s1.src = 'https://embed.tawk.to/68a6b4e77ebce11927981c0e/1j35j5a9d';
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    s1.onload = function(){ TAWK_LOADED = true; try { if (window.Tawk_API) window.Tawk_API.hideWidget(); } catch(_) {} };
    (s0 && s0.parentNode ? s0.parentNode : document.head).insertBefore(s1, s0 || null);
  })();
}

async function openLiveChat() {
  try {
    loadTawkOnce();
    let tries = 0;
    while (tries++ < 100) { // ~5s
      if (window.Tawk_API && typeof window.Tawk_API.showWidget === 'function') {
        try { window.Tawk_API.showWidget(); window.Tawk_API.maximize && window.Tawk_API.maximize(); } catch(_) {}
        try { hideChat(); } catch(_) {}
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  } catch(_) {}
}


// Lightweight Tawk detection (reduced polling)
function checkTawkAndShow() {
  let checkCount = 0;
  
  const checkInterval = setInterval(() => {
    checkCount++;
    
    // Check if Tawk is visible
    const tawkWidget = document.querySelector('#tawk-widget iframe, .tawk-widget iframe, [id*="tawk"]');
    const tawkVisible = tawkWidget && tawkWidget.style.display !== 'none';
    
    if (!tawkVisible && !isVisible) {
      showChat();
      clearInterval(checkInterval);
    }
    
    // Stop checking after max attempts
    if (checkCount >= CONFIG.maxChecks) {
      clearInterval(checkInterval);
    }
  }, CONFIG.checkInterval);
}

// Optimized initialization
function init() {
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(createAndShow, CONFIG.delay);
    });
  } else {
    setTimeout(createAndShow, CONFIG.delay);
  }
}

function createAndShow() {
  // Only create if not already present
  if (!document.getElementById('juns-ai-container')) {
    createChatbot();
    
    // Add click handler
    document.getElementById('chat-bubble').addEventListener('click', () => {
      if (isVisible) {
        hideChat();
      } else {
        showChat();
      }
    });
    
    // Check for Tawk widget
    checkTawkAndShow();
  }
}

// Global functions for inline handlers
window.sendMessage = sendMessage;
window.sendQuickMessage = sendQuickMessage;
window.handleKeyPress = handleKeyPress;
window.hideChat = hideChat;

// Start initialization
init();

} // End of JUNS_CHATBOT_LOADED check
