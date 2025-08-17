/*const API_URL = "https://juns-ai-chatbot-production.up.railway.app/chat";

const pagesWithPopup = ["/", "/products", "/pages/event-dress-recommendations"];

function isPopupPage() {
  const path = window.location.pathname;
  return pagesWithPopup.some(p => path.startsWith(p));
}

function createPopup() {
  if (!isPopupPage()) return;
  const popup = document.createElement("div");
  popup.id = "juns-ai-popup";
  popup.innerHTML = `
    <strong>JUN'S AI</strong>
    <input type="text" id="themeInput" placeholder="Your dress theme? (e.g. wedding)" />
    <button id="sendTheme">🎯</button>
    <button id="closePopup">❌</button>
  `;
  document.body.appendChild(popup);
  setTimeout(() => popup.style.display = 'flex', 5000);

  document.getElementById('sendTheme').onclick = () => {
    const theme = document.getElementById('themeInput').value.trim();
    if (theme) {
      const encoded = encodeURIComponent(theme);
      window.location.href = `/pages/event-dress-recommendations?theme=${encoded}`;
    }
  };

  document.getElementById('closePopup').onclick = () => {
    popup.style.display = 'none';
    document.getElementById("juns-ai-button").style.display = "flex";
  };
}

function createChatButton() {
  const button = document.createElement("div");
  button.id = "juns-ai-button";
  button.innerHTML = `<div id="chat-circle">JUN’S<br>AI</div>`;
  document.body.appendChild(button);

  button.addEventListener("click", () => {
    const chatBox = document.getElementById("juns-ai-chatbox");
    chatBox.style.display = (chatBox.style.display === "none") ? "block" : "none";
  });
}

function createChatbox() {
  const box = document.createElement("div");
  box.id = "juns-ai-chatbox";
  box.style.display = "none";
  box.innerHTML = `
    <div class="chat-header">JUN’S AI</div>
    <div id="juns-ai-messages" class="chat-messages"></div>
    <div class="chat-input-container">
      <input type="text" id="juns-user-input" placeholder="Type your message..." />
      <button id="juns-send-btn">➤</button>
    </div>
  `;
  document.body.appendChild(box);
}

function addMessage(content, from) {
  const msgBox = document.createElement("div");
  msgBox.className = `bubble ${from}`;
  msgBox.textContent = content;
  document.getElementById("juns-ai-messages").appendChild(msgBox);
  document.getElementById("juns-ai-messages").scrollTop = document.getElementById("juns-ai-messages").scrollHeight;
}

function sendToAI(message, name, email, lang) {
  addMessage("JUN’S AI is typing...", "ai loading");

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, name, email, lang })
  })
    .then(res => res.json())
    .then(data => {
      const loading = document.querySelector(".bubble.loading");
      if (loading) loading.remove();
      addMessage(data.reply, "ai");
    })
    .catch(() => {
      const loading = document.querySelector(".bubble.loading");
      if (loading) loading.remove();
      addMessage("Oops! Something went wrong. Please try again.", "ai");
    });
}

function initChatbot() {
  createPopup();
  createChatButton();
  createChatbox();

  let userLang = null;
  let userName = "";
  let userEmail = "";

  const sendBtn = document.getElementById("juns-send-btn");
  const userInput = document.getElementById("juns-user-input");

  const askLanguage = () => {
    addMessage("👋 Welcome! Please select your language:\nEnglish 🇬🇧 or Français 🇫🇷", "ai");
  };

  const askDetails = () => {
    const langMsg = userLang === 'fr'
      ? "Quel est votre prénom ?"
      : "What is your name?";
    addMessage(langMsg, "ai");
  };

  const showSuggestions = () => {
    const suggestions = userLang === 'fr'
      ? "Voici ce que je peux faire pour vous:\n- Recommander une robe 👗\n- Suivre votre commande 📦\n- Changer de thème 🎯\n- Contacter le support 💬"
      : "Here’s what I can help with:\n- Recommend a dress 👗\n- Track your order 📦\n- Change theme 🎯\n- Speak to support 💬";
    addMessage(suggestions, "ai");
  };

  askLanguage();

  sendBtn.addEventListener("click", () => {
    const msg = userInput.value.trim();
    if (!msg) return;
    userInput.value = "";
    addMessage(msg, "user");

    if (!userLang) {
      const langGuess = msg.toLowerCase();
      if (langGuess.includes("fr")) userLang = "fr";
      else userLang = "en";
      const greet = userLang === "fr"
        ? "Bienvenue chez JUN’S AI ✨"
        : "Welcome to JUN’S AI ✨";
      addMessage(greet, "ai");
      return askDetails();
    }

    if (!userName) {
      userName = msg;
      return addMessage(userLang === "fr" ? "Quel est votre email ?" : "What is your email?", "ai");
    }

    if (!userEmail) {
      userEmail = msg;
      showSuggestions();
      return;
    }

    sendToAI(msg, userName, userEmail, userLang);
  });
}

window.addEventListener("DOMContentLoaded", initChatbot);
*/
document.addEventListener("DOMContentLoaded", function () {
  const popup = document.createElement("div");
  popup.className = "chatbot-popup";
  popup.innerHTML = `
    <span class="popup-title">JUN’S AI</span>
    <input type="text" class="theme-input" placeholder="Your dress theme? (e.g. wedding)">
    <button class="apply-theme">🎯</button>
    <button class="close-popup">❌</button>
  `;
  document.body.appendChild(popup);

  const chatBtn = document.createElement("div");
  chatBtn.className = "chatbot-bubble";
  chatBtn.textContent = "JUN’S\nAI";
  document.body.appendChild(chatBtn);

  const chatbot = document.createElement("div");
  chatbot.className = "chatbot-container";
  chatbot.innerHTML = `
    <div class="chatbot-header">JUN’S AI</div>
    <div class="chatbot-messages" id="chatbot-messages"></div>
    <div class="chatbot-input">
      <input type="text" id="chatbot-user-input" placeholder="Type your message..." />
      <button id="chatbot-send-btn">➤</button>
    </div>
  `;
  document.body.appendChild(chatbot);

  const popupInput = popup.querySelector(".theme-input");
  const applyBtn = popup.querySelector(".apply-theme");
  const closeBtn = popup.querySelector(".close-popup");
  const messagesDiv = document.getElementById("chatbot-messages");
  const input = document.getElementById("chatbot-user-input");
  const sendBtn = document.getElementById("chatbot-send-btn");

  // Open popup after 5s on homepage, product, or recommendation
  if (["/", "/products", "/recommendation"].some(path => window.location.pathname.includes(path))) {
    setTimeout(() => popup.style.display = "flex", 5000);
  }

  applyBtn.onclick = () => {
    const theme = popupInput.value.trim();
    if (theme) {
      popup.style.display = "none";
      chatbot.style.display = "flex";
      appendMessage("ai", `✨ Welcome to JUN’S AI!\nWhat is your name?`);
    }
  };

  closeBtn.onclick = () => popup.style.display = "none";
  chatBtn.onclick = () => {
    chatbot.style.display = "flex";
    chatBtn.style.display = "none";
  };

  sendBtn.onclick = async () => {
    const msg = input.value.trim();
    if (!msg) return;
    appendMessage("user", msg);
    input.value = "";

    try {
      const res = await fetch("https://juns-ai-chatbot-production.up.railway.app/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      appendMessage("ai", data.response || "Sorry, I didn’t understand that.");
    } catch (err) {
      appendMessage("ai", "Oops, server error!");
    }
  };

  function appendMessage(sender, text) {
    const msgEl = document.createElement("div");
    msgEl.className = `chatbot-message ${sender}`;
    msgEl.innerText = text;
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
});

