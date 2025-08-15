const chatBox = document.getElementById('chat-box');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const typingIndicator = document.getElementById('typing-indicator');

let language = '';
let greeted = false;

function appendMessage(content, sender = 'bot') {
  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  msg.innerText = content;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showTyping(show = true) {
  typingIndicator.style.display = show ? 'block' : 'none';
}

function sendToWebhook(name, email) {
  fetch('https://hooks.zapier.com/hooks/catch/123456/abcde/', {
    method: 'POST',
    body: JSON.stringify({ name, email }),
    headers: { 'Content-Type': 'application/json' }
  });
}

async function sendMessage(message) {
  showTyping(true);
  try {
    const response = await fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, language }),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    showTyping(false);
    appendMessage(data.reply, 'bot');

    if (!greeted) {
      greeted = true;
      setTimeout(() => {
        appendMessage(
          language === 'fr'
            ? "Souhaitez-vous une recommandation de robe, suivre votre commande, ou poser une question ?"
            : "Would you like a dress recommendation, track your order, or ask something?"
        );
      }, 1000);
    }
  } catch (error) {
    showTyping(false);
    appendMessage("Oops, something went wrong.", 'bot');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  appendMessage(message, 'user');
  input.value = '';
  sendMessage(message);
});

// Initial language selection
appendMessage("Hi! Would you like to chat in English or French?");
appendMessage("Type 'English' or 'French' to continue.", 'bot');

const handleInitialLanguage = setInterval(() => {
  const last = [...chatBox.querySelectorAll('.user')].pop();
  if (!language && last) {
    const msg = last.innerText.toLowerCase();
    if (msg.includes('french') || msg.includes('français')) {
      language = 'fr';
      clearInterval(handleInitialLanguage);
      appendMessage("Parfait ! Je suis JUN’S AI. Comment puis-je vous aider aujourd’hui ?");
    } else if (msg.includes('english') || msg.includes('anglais')) {
      language = 'en';
      clearInterval(handleInitialLanguage);
      appendMessage("Great! I'm JUN’S AI. How can I assist you today?");
    }
  }
}, 1000);
