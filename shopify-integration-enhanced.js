// JUN'S AI Chatbot - Enhanced Shopify Integration Script v2.0
// This script includes all the new features: sessions, caching, analytics, and escalation

(function() {
  'use strict';
  
  // Configuration
  const CHATBOT_CONFIG = {
    apiUrl: 'https://juns-ai-chatbot-production.up.railway.app/api/enhanced-chat', // Enhanced endpoint
    analyticsUrl: 'https://juns-ai-chatbot-production.up.railway.app/api/analytics',
    healthUrl: 'https://juns-ai-chatbot-production.up.railway.app/health',
    position: 'bottom-right',
    delay: 3000,
    theme: {
      primaryColor: '#000000',
      secondaryColor: '#333333',
      textColor: '#ffffff',
      borderRadius: '20px'
    },
    features: {
      sessions: true,
      analytics: true,
      escalation: true,
      satisfaction: true
    }
  };

  // Global variables
  let selectedLanguage = 'en';
  let isChatOpen = false;
  let currentSessionId = null;
  let conversationHistory = [];

  // Create chatbot HTML
  function createChatbotHTML() {
    const chatbotHTML = `
      <div id="juns-ai-chatbot" style="display: none;">
        <!-- Chat Button -->
        <div id="juns-ai-button" class="juns-chatbot-button">
          <div class="juns-chat-circle">
            <span>💬</span>
          </div>
        </div>
        
        <!-- Chat Container -->
        <div id="juns-ai-chatbox" class="juns-chatbox">
          <div class="juns-chat-header">
            <span>JUN'S AI</span>
            <button class="juns-close-btn" onclick="closeJunsChatbot()">×</button>
          </div>
          
          <div class="juns-chat-messages" id="junsChatMessages">
            <!-- Language selector and messages will be inserted here -->
          </div>
          
          <div class="juns-chat-input-container">
            <input type="text" id="junsChatInput" placeholder="Ask me anything about JUN'S store..." />
            <button id="junsSendBtn">Send</button>
          </div>
          
          <!-- Satisfaction Rating (shown at end of conversation) -->
          <div id="junsSatisfaction" class="juns-satisfaction" style="display: none;">
            <div class="satisfaction-title">How was your experience?</div>
            <div class="satisfaction-stars">
              <span class="star" data-rating="1">⭐</span>
              <span class="star" data-rating="2">⭐</span>
              <span class="star" data-rating="3">⭐</span>
              <span class="star" data-rating="4">⭐</span>
              <span class="star" data-rating="5">⭐</span>
            </div>
            <textarea id="junsFeedback" placeholder="Additional feedback (optional)"></textarea>
            <button id="junsSubmitFeedback">Submit</button>
          </div>
        </div>
      </div>
    `;
    
    return chatbotHTML;
  }

  // Create enhanced chatbot CSS
  function createChatbotCSS() {
    const css = `
      <style>
        /* Enhanced JUN'S AI Chatbot Styles */
        #juns-ai-chatbot {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          z-index: 999999;
        }
        
        .juns-chatbot-button {
          position: fixed;
          bottom: 30px;
          right: 30px;
          z-index: 100000;
        }
        
        .juns-chat-circle {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, ${CHATBOT_CONFIG.theme.primaryColor}, ${CHATBOT_CONFIG.theme.secondaryColor});
          color: ${CHATBOT_CONFIG.theme.textColor};
          border-radius: 50%;
          text-align: center;
          line-height: 28px;
          padding-top: 6px;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
          transition: all 0.3s ease;
          animation: juns-pulse 2s infinite;
        }
        
        .juns-chat-circle:hover {
          transform: scale(1.1);
          box-shadow: 0 12px 25px rgba(0, 0, 0, 0.4);
        }
        
        @keyframes juns-pulse {
          0% { box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3); }
          50% { box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5); }
          100% { box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3); }
        }
        
        .juns-chatbox {
          position: fixed;
          bottom: 110px;
          right: 30px;
          width: 400px;
          max-height: 600px;
          background: white;
          border-radius: ${CHATBOT_CONFIG.theme.borderRadius};
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 99999;
          border: 1px solid #e0e0e0;
        }
        
        .juns-chat-header {
          background: linear-gradient(135deg, ${CHATBOT_CONFIG.theme.primaryColor}, ${CHATBOT_CONFIG.theme.secondaryColor});
          color: ${CHATBOT_CONFIG.theme.textColor};
          text-align: center;
          padding: 16px;
          font-size: 18px;
          font-weight: bold;
          border-radius: ${CHATBOT_CONFIG.theme.borderRadius} ${CHATBOT_CONFIG.theme.borderRadius} 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .juns-close-btn {
          background: none;
          border: none;
          color: ${CHATBOT_CONFIG.theme.textColor};
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .juns-chat-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #f8f9fa;
          max-height: 400px;
        }
        
        .juns-chat-input-container {
          display: flex;
          padding: 16px;
          border-top: 1px solid #e0e0e0;
          background: white;
          gap: 10px;
        }
        
        .juns-chat-input-container input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 25px;
          border: 2px solid #e0e0e0;
          font-size: 14px;
          outline: none;
          transition: border-color 0.3s ease;
        }
        
        .juns-chat-input-container input:focus {
          border-color: ${CHATBOT_CONFIG.theme.primaryColor};
        }
        
        .juns-chat-input-container button {
          background: linear-gradient(135deg, ${CHATBOT_CONFIG.theme.primaryColor}, ${CHATBOT_CONFIG.theme.secondaryColor});
          color: ${CHATBOT_CONFIG.theme.textColor};
          border: none;
          padding: 12px 20px;
          border-radius: 25px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
        }
        
        .juns-chat-input-container button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        .juns-bubble {
          max-width: 80%;
          padding: 12px 16px;
          border-radius: 20px;
          word-wrap: break-word;
          line-height: 1.5;
          font-size: 14px;
          animation: juns-fadeIn 0.3s ease;
        }
        
        @keyframes juns-fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .juns-bubble.user {
          background: linear-gradient(135deg, ${CHATBOT_CONFIG.theme.primaryColor}, ${CHATBOT_CONFIG.theme.secondaryColor});
          color: ${CHATBOT_CONFIG.theme.textColor};
          align-self: flex-end;
          border-top-right-radius: 8px;
        }
        
        .juns-bubble.ai {
          background: white;
          color: #333;
          align-self: flex-start;
          border-top-left-radius: 8px;
          border: 1px solid #e0e0e0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .juns-bubble.system {
          background: #f0f0f0;
          color: #666;
          align-self: center;
          border-radius: 15px;
          font-style: italic;
          font-size: 13px;
        }
        
        .juns-bubble.loading {
          font-style: italic;
          opacity: 0.6;
          align-self: center;
        }
        
        .juns-bubble.escalation {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
          align-self: center;
          text-align: center;
        }
        
        /* Language Selector Styles */
        .juns-language-selector {
          background: white;
          border-radius: 15px;
          padding: 16px;
          margin-bottom: 8px;
          border: 1px solid #e0e0e0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .juns-language-title {
          text-align: center;
          font-weight: 600;
          color: #333;
          margin-bottom: 12px;
          font-size: 14px;
        }
        
        .juns-language-buttons {
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        
        .juns-lang-btn {
          padding: 8px 16px;
          border: 2px solid #e0e0e0;
          background: white;
          color: #666;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 13px;
          font-weight: 500;
        }
        
        .juns-lang-btn:hover {
          border-color: ${CHATBOT_CONFIG.theme.primaryColor};
          color: ${CHATBOT_CONFIG.theme.primaryColor};
        }
        
        .juns-lang-btn.active {
          background: ${CHATBOT_CONFIG.theme.primaryColor};
          color: ${CHATBOT_CONFIG.theme.textColor};
          border-color: ${CHATBOT_CONFIG.theme.primaryColor};
        }
        
        /* Satisfaction Rating Styles */
        .juns-satisfaction {
          background: #f8f9fa;
          padding: 16px;
          border-top: 1px solid #e0e0e0;
          text-align: center;
        }
        
        .satisfaction-title {
          font-weight: 600;
          color: #333;
          margin-bottom: 12px;
          font-size: 14px;
        }
        
        .satisfaction-stars {
          margin-bottom: 12px;
        }
        
        .star {
          font-size: 24px;
          cursor: pointer;
          margin: 0 4px;
          transition: all 0.2s ease;
          opacity: 0.3;
        }
        
        .star:hover,
        .star.active {
          opacity: 1;
          transform: scale(1.2);
        }
        
        .star[data-rating="1"].active ~ .star,
        .star[data-rating="2"].active ~ .star,
        .star[data-rating="3"].active ~ .star,
        .star[data-rating="4"].active ~ .star,
        .star[data-rating="5"].active ~ .star {
          opacity: 0.3;
        }
        
        #junsFeedback {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 8px;
          margin-bottom: 12px;
          font-size: 13px;
          resize: vertical;
          min-height: 60px;
        }
        
        #junsSubmitFeedback {
          background: ${CHATBOT_CONFIG.theme.primaryColor};
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 13px;
        }
        
        /* Responsive Design */
        @media screen and (max-width: 500px) {
          .juns-chatbox {
            width: 90%;
            right: 5%;
            bottom: 100px;
            max-height: 70vh;
          }
          
          .juns-chat-circle {
            width: 50px;
            height: 50px;
            font-size: 11px;
            line-height: 24px;
            padding-top: 4px;
          }
          
          .juns-chat-messages {
            max-height: 300px;
          }
          
          .juns-language-buttons {
            flex-direction: column;
            gap: 8px;
          }
        }
        
        /* Scrollbar Styling */
        .juns-chat-messages::-webkit-scrollbar {
          width: 6px;
        }
        
        .juns-chat-messages::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        
        .juns-chat-messages::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 3px;
        }
        
        .juns-chat-messages::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      </style>
    `;
    
    return css;
  }

  // Initialize chatbot
  function initJunsChatbot() {
    // Add chatbot HTML to page
    document.body.insertAdjacentHTML('beforeend', createChatbotHTML());
    
    // Add chatbot CSS to page
    document.head.insertAdjacentHTML('beforeend', createChatbotCSS());
    
    // Initialize chatbot functionality
    initChatbotFunctionality();
    
    // Show chatbot after delay
    setTimeout(() => {
      document.getElementById('juns-ai-chatbot').style.display = 'block';
    }, CHATBOT_CONFIG.delay);
  }

  // Initialize chatbot functionality
  function initChatbotFunctionality() {
    const chatButton = document.getElementById('juns-ai-button');
    const chatContainer = document.getElementById('juns-ai-chatbox');
    const messages = document.getElementById('junsChatMessages');
    const input = document.getElementById('junsChatInput');
    const sendBtn = document.getElementById('junsSendBtn');
    
    // Add language selector
    const languageSelector = createLanguageSelector(selectedLanguage);
    messages.appendChild(languageSelector);
    
    // Add welcome message
    const welcomeMsg = createMessage(
      selectedLanguage === 'en' 
        ? 'Hello! I\'m JUN\'S AI. How can I help you today?' 
        : 'Bonjour! Je suis JUN\'S AI. Comment puis-je vous aider aujourd\'hui?',
      false,
      true
    );
    welcomeMsg.classList.add('juns-welcome-message');
    messages.appendChild(welcomeMsg);
    
    // Toggle chat visibility
    chatButton.addEventListener('click', () => {
      isChatOpen = !isChatOpen;
      chatContainer.style.display = isChatOpen ? 'flex' : 'none';
      if (isChatOpen) {
        input.focus();
      }
    });
    
    // Send message function
    async function sendMessage() {
      const userMessage = input.value.trim();
      if (!userMessage) return;
      
      // Add user message to UI
      messages.appendChild(createMessage(userMessage, true));
      input.value = '';
      
      // Add to conversation history
      conversationHistory.push({ role: 'user', content: userMessage, timestamp: new Date() });
      
      // Show loading indicator
      const loading = createMessage('...', false, false);
      loading.classList.add('loading');
      messages.appendChild(loading);
      messages.scrollTop = messages.scrollHeight;
      
      try {
        // Send to enhanced API endpoint
        const response = await fetch(CHATBOT_CONFIG.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: userMessage,
            lang: selectedLanguage,
            storeUrl: window.location.origin,
            sessionId: currentSessionId
          }),
        });
        
        const data = await response.json();
        loading.remove();
        
        // Store session ID for future requests
        if (data.sessionId && !currentSessionId) {
          currentSessionId = data.sessionId;
        }
        
        // Check if escalation is required
        if (data.escalation && data.escalation.required) {
          const escalationMsg = createMessage(data.reply, false, false);
          escalationMsg.classList.add('escalation');
          messages.appendChild(escalationMsg);
          
          // Add escalation details
          const escalationDetails = createMessage(
            `Contact: ${data.escalation.contactInfo}\nEstimated wait: ${data.escalation.estimatedWait}`,
            false,
            true
          );
          messages.appendChild(escalationDetails);
          
          // Show satisfaction rating
          setTimeout(() => {
            showSatisfactionRating();
          }, 2000);
          
        } else {
          // Normal AI response
          messages.appendChild(createMessage(data.reply));
          
          // Add to conversation history
          conversationHistory.push({ role: 'assistant', content: data.reply, timestamp: new Date() });
          
          // Show satisfaction rating after a few exchanges
          if (conversationHistory.length >= 6) {
            setTimeout(() => {
              showSatisfactionRating();
            }, 1000);
          }
        }
        
        messages.scrollTop = messages.scrollHeight;
        
      } catch (err) {
        loading.remove();
        const errorMsg = selectedLanguage === 'en' 
          ? '❌ Error, try again.' 
          : '❌ Erreur, réessayez.';
        messages.appendChild(createMessage(errorMsg));
      }
    }
    
    // Send on Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
    
    // Send on button click
    sendBtn.addEventListener('click', sendMessage);
    
    // Initialize satisfaction rating functionality
    initSatisfactionRating();
  }

  // Create message bubble
  function createMessage(content, isUser = false, isSystem = false) {
    const message = document.createElement('div');
    message.className = `juns-bubble ${isUser ? 'user' : isSystem ? 'system' : 'ai'}`;
    message.textContent = content;
    return message;
  }

  // Create language selector
  function createLanguageSelector(selectedLang) {
    const languageContainer = document.createElement('div');
    languageContainer.className = 'juns-language-selector';
    languageContainer.innerHTML = `
      <div class="juns-language-title">${selectedLang === 'en' ? 'Choose your language' : 'Choisissez votre langue'}</div>
      <div class="juns-language-buttons">
        <button class="juns-lang-btn ${selectedLang === 'en' ? 'active' : ''}" data-lang="en">English</button>
        <button class="juns-lang-btn ${selectedLang === 'fr' ? 'active' : ''}" data-lang="fr">Français</button>
      </div>
    `;
    
    // Add event listeners for language selection
    const buttons = languageContainer.querySelectorAll('.juns-lang-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newLang = e.target.dataset.lang;
        selectedLanguage = newLang;
        
        buttons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update welcome message
        const welcomeMsg = document.querySelector('.juns-welcome-message');
        if (welcomeMsg) {
          welcomeMsg.textContent = newLang === 'en' 
            ? 'Hello! I\'m JUN\'S AI. How can I help you today?' 
            : 'Bonjour! Je suis JUN\'S AI. Comment puis-je vous aider aujourd\'hui?';
        }
        
        // Update input placeholder
        const input = document.getElementById('junsChatInput');
        if (input) {
          input.placeholder = newLang === 'en' 
            ? 'Ask me anything about JUN\'S store...' 
            : 'Posez-moi n\'importe quelle question sur la boutique JUN\'S...';
        }
        
        // Update send button
        const sendBtn = document.getElementById('junsSendBtn');
        if (sendBtn) {
          sendBtn.textContent = newLang === 'en' ? 'Send' : 'Envoyer';
        }
      });
    });
    
    return languageContainer;
  }

  // Initialize satisfaction rating
  function initSatisfactionRating() {
    const stars = document.querySelectorAll('.star');
    const submitBtn = document.getElementById('junsSubmitFeedback');
    
    stars.forEach(star => {
      star.addEventListener('click', (e) => {
        const rating = parseInt(e.target.dataset.rating);
        
        // Update star display
        stars.forEach((s, index) => {
          if (index < rating) {
            s.classList.add('active');
          } else {
            s.classList.remove('active');
          }
        });
        
        // Store rating
        window.selectedRating = rating;
      });
    });
    
    // Submit feedback
    submitBtn.addEventListener('click', async () => {
      const rating = window.selectedRating;
      const feedback = document.getElementById('junsFeedback').value;
      
      if (!rating) {
        alert('Please select a rating');
        return;
      }
      
      try {
        // Submit to analytics endpoint
        await fetch(`${CHATBOT_CONFIG.analyticsUrl}/session/${currentSessionId}/satisfaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, feedback })
        });
        
        // Hide satisfaction rating
        document.getElementById('junsSatisfaction').style.display = 'none';
        
        // Show thank you message
        const messages = document.getElementById('junsChatMessages');
        const thankYou = createMessage(
          selectedLanguage === 'en' 
            ? 'Thank you for your feedback! 😊' 
            : 'Merci pour vos commentaires ! 😊',
          false,
          true
        );
        messages.appendChild(thankYou);
        
      } catch (error) {
        console.error('Failed to submit feedback:', error);
      }
    });
  }

  // Show satisfaction rating
  function showSatisfactionRating() {
    const satisfaction = document.getElementById('junsSatisfaction');
    if (satisfaction && !satisfaction.style.display === 'block') {
      satisfaction.style.display = 'block';
      
      // Scroll to bottom
      const messages = document.getElementById('junsChatMessages');
      messages.scrollTop = messages.scrollHeight;
    }
  }

  // Close chatbot function (global scope for onclick)
  window.closeJunsChatbot = function() {
    document.getElementById('juns-ai-chatbox').style.display = 'none';
    isChatOpen = false;
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJunsChatbot);
  } else {
    initJunsChatbot();
  }
})();
