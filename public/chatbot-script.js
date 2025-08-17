const API_URL = "https://juns-ai-chatbot-production.up.railway.app/chat";

let selectedLanguage = 'en'; // Default language
let isChatOpen = false;

function createMessage(content, isUser = false, isSystem = false) {
  const message = document.createElement("div");
  message.className = `bubble ${isUser ? "user" : isSystem ? "system" : "ai"}`;
  message.textContent = content;
  return message;
}

function createLanguageSelector() {
  const languageContainer = document.createElement("div");
  languageContainer.className = "language-selector";
  languageContainer.innerHTML = `
    <div class="language-title">${selectedLanguage === 'en' ? 'Choose your language' : 'Choisissez votre langue'}</div>
    <div class="language-buttons">
      <button class="lang-btn ${selectedLanguage === 'en' ? 'active' : ''}" data-lang="en">English</button>
      <button class="lang-btn ${selectedLanguage === 'fr' ? 'active' : ''}" data-lang="fr">Français</button>
    </div>
  `;
  
  // Add event listeners for language selection
  const buttons = languageContainer.querySelectorAll('.lang-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      selectedLanguage = e.target.dataset.lang;
      buttons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      // Update welcome message
      const welcomeMsg = document.querySelector('.welcome-message');
      if (welcomeMsg) {
        welcomeMsg.textContent = selectedLanguage === 'en' 
          ? 'Hello! I\'m JUN\'S AI. How can I help you today?' 
          : 'Bonjour! Je suis JUN\'S AI. Comment puis-je vous aider aujourd\'hui?';
      }
      
      // Update input placeholder
      const input = document.getElementById("chatInput");
      if (input) {
        input.placeholder = selectedLanguage === 'en' 
          ? 'Ask me anything about JUN\'S store...' 
          : 'Posez-moi n\'importe quelle question sur la boutique JUN\'S...';
      }
    });
  });
  
  return languageContainer;
}

function initChat() {
  // Create chat button
  const chatButton = document.createElement("div");
  chatButton.id = "juns-ai-button";
  chatButton.innerHTML = `
    <div id="chat-circle">
      <span>💬</span>
    </div>
  `;
  document.body.appendChild(chatButton);

  // Create chat container
  const chatContainer = document.createElement("div");
  chatContainer.id = "juns-ai-chatbox";
  chatContainer.style.display = "none";
  chatContainer.innerHTML = `
    <div class="chat-header">JUN'S AI</div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input-container">
      <input type="text" id="chatInput" placeholder="Ask me anything about JUN'S store..." />
      <button id="sendBtn">${selectedLanguage === 'en' ? 'Send' : 'Envoyer'}</button>
    </div>
  `;
  document.body.appendChild(chatContainer);

  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const sendBtn = document.getElementById("sendBtn");

  // Add language selector as first message
  const languageSelector = createLanguageSelector();
  messages.appendChild(languageSelector);

  // Add welcome message
  const welcomeMsg = createMessage(
    selectedLanguage === 'en' 
      ? 'Hello! I\'m JUN\'S AI. How can I help you today?' 
      : 'Bonjour! Je suis JUN\'S AI. Comment puis-je vous aider aujourd\'hui?',
    false,
    true
  );
  welcomeMsg.classList.add('welcome-message');
  messages.appendChild(welcomeMsg);

  // Toggle chat visibility
  chatButton.addEventListener("click", () => {
    isChatOpen = !isChatOpen;
    chatContainer.style.display = isChatOpen ? "flex" : "none";
    if (isChatOpen) {
      input.focus();
    }
  });

  // Send message function
  async function sendMessage() {
    const userMessage = input.value.trim();
    if (!userMessage) return;

    messages.appendChild(createMessage(userMessage, true));
    input.value = "";

    const loading = createMessage("...", false, false);
    loading.classList.add('loading');
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage,
          lang: selectedLanguage,
          storeUrl: window.location.origin
        }),
      });
      const data = await res.json();
      loading.remove();
      messages.appendChild(createMessage(data.reply));
      messages.scrollTop = messages.scrollHeight;
    } catch (err) {
      loading.remove();
      const errorMsg = selectedLanguage === 'en' 
        ? "❌ Error, try again." 
        : "❌ Erreur, réessayez.";
      messages.appendChild(createMessage(errorMsg));
    }
  }

  // Send on Enter key
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  // Send on button click
  sendBtn.addEventListener("click", sendMessage);
}

// Initialize chatbot on all pages
window.addEventListener("load", () => {
  // Small delay to ensure page is fully loaded
  setTimeout(() => {
    initChat();
  }, 1000);
});
