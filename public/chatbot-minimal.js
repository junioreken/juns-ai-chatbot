// Minimal JUN'S AI Chatbot - Ultra Lightweight
// Only loads when needed to prevent performance issues

(function() {
  'use strict';
  
  // Prevent multiple loads
  if (window.JUNS_AI_MINIMAL_LOADED) return;
  window.JUNS_AI_MINIMAL_LOADED = true;
  
  // Configuration
  const CONFIG = {
    apiUrl: '/api/enhanced-chat',
    showDelay: 5000, // Show after 5 seconds to not interfere with page load
    lang: document.documentElement.lang?.startsWith('fr') ? 'fr' : 'en'
  };
  
  // Minimal styles (injected only when needed)
  const STYLES = `
    #juns-ai-minimal {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #007bff;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,123,255,0.3);
      transition: transform 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #juns-ai-minimal:hover { transform: scale(1.05); }
    #juns-ai-minimal::before {
      content: '💬';
      font-size: 24px;
      color: white;
    }
    #juns-ai-chat {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 320px;
      height: 400px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      z-index: 1000;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .juns-chat-header {
      background: #2c3e50;
      color: white;
      padding: 12px;
      text-align: center;
      font-weight: bold;
      border-radius: 8px 8px 0 0;
      position: relative;
    }
    .juns-chat-close {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 18px;
    }
    .juns-chat-messages {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      background: #f8f9fa;
      font-size: 14px;
    }
    .juns-message {
      margin-bottom: 8px;
      display: flex;
    }
    .juns-message.user { justify-content: flex-end; }
    .juns-message.bot { justify-content: flex-start; }
    .juns-message-bubble {
      max-width: 75%;
      padding: 8px 12px;
      border-radius: 12px;
      word-wrap: break-word;
      line-height: 1.3;
    }
    .juns-message.user .juns-message-bubble {
      background: #007bff;
      color: white;
    }
    .juns-message.bot .juns-message-bubble {
      background: white;
      color: #333;
      border: 1px solid #e9ecef;
    }
    .juns-chat-input {
      padding: 12px;
      border-top: 1px solid #e9ecef;
      display: flex;
      gap: 8px;
    }
    .juns-chat-input input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 16px;
      outline: none;
      font-size: 14px;
    }
    .juns-chat-input button {
      padding: 8px 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 16px;
      cursor: pointer;
      font-size: 14px;
    }
  `;
  
  let chatVisible = false;
  let sessionId = null;
  
  // Inject styles only when needed
  function injectStyles() {
    if (!document.getElementById('juns-ai-styles')) {
      const style = document.createElement('style');
      style.id = 'juns-ai-styles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
  }
  
  // Create minimal chatbot
  function createChatbot() {
    injectStyles();
    
    const container = document.createElement('div');
    container.innerHTML = `
      <div id="juns-ai-minimal"></div>
      <div id="juns-ai-chat">
        <div class="juns-chat-header">
          JUN'S AI
          <button class="juns-chat-close" onclick="junsHideChat()">×</button>
        </div>
        <div class="juns-chat-messages" id="juns-messages">
          <div class="juns-message bot">
            <div class="juns-message-bubble">Hi 👋 I'm your JUN'S Stylist. How can I help?</div>
          </div>
        </div>
        <div class="juns-chat-input">
          <input type="text" id="juns-input" placeholder="Type your message..." onkeypress="junsHandleKeyPress(event)">
          <button onclick="junsSendMessage()">Send</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(container);
    
    // Add click handler
    document.getElementById('juns-ai-minimal').addEventListener('click', () => {
      if (chatVisible) {
        junsHideChat();
      } else {
        junsShowChat();
      }
    });
    
    // Show after delay
    setTimeout(() => {
      document.getElementById('juns-ai-minimal').style.display = 'flex';
    }, CONFIG.showDelay);
  }
  
  // Chat functions
  function junsShowChat() {
    document.getElementById('juns-ai-chat').style.display = 'flex';
    document.getElementById('juns-input').focus();
    chatVisible = true;
  }
  
  function junsHideChat() {
    document.getElementById('juns-ai-chat').style.display = 'none';
    chatVisible = false;
  }
  
  async function junsSendMessage(text = null) {
    const input = document.getElementById('juns-input');
    const message = text || input.value.trim();
    
    if (!message) return;
    
    // Add user message
    junsAddMessage(message, true);
    if (input) input.value = '';
    
    // Show loading
    const loadingId = junsAddMessage('Thinking...', false);
    
    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          lang: CONFIG.lang,
          sessionId: sessionId
        })
      });
      
      const data = await response.json();
      sessionId = data.sessionId;
      
      // Remove loading and add response
      junsRemoveMessage(loadingId);
      junsAddMessage(data.reply, false);
      
    } catch (error) {
      junsRemoveMessage(loadingId);
      junsAddMessage('Sorry, I encountered an error. Please try again.', false);
    }
  }
  
  function junsAddMessage(content, isUser = false) {
    const messages = document.getElementById('juns-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `juns-message ${isUser ? 'user' : 'bot'}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'juns-message-bubble';
    bubbleDiv.innerHTML = content;
    
    messageDiv.appendChild(bubbleDiv);
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
    
    return messageDiv;
  }
  
  function junsRemoveMessage(messageElement) {
    if (messageElement && messageElement.parentNode) {
      messageElement.parentNode.removeChild(messageElement);
    }
  }
  
  function junsHandleKeyPress(event) {
    if (event.key === 'Enter') {
      junsSendMessage();
    }
  }
  
  // Make functions global for inline handlers
  window.junsSendMessage = junsSendMessage;
  window.junsHideChat = junsHideChat;
  window.junsHandleKeyPress = junsHandleKeyPress;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatbot);
  } else {
    createChatbot();
  }
  
})();
