const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatlog = document.getElementById('chatlog');
const typingIndicator = document.getElementById('typing-indicator');

let userLang = '';
let userName = '';
let userEmail = '';

function addMessage(text, sender = 'ai') {
  const msg = document.createElement('div');
  msg.className = sender === 'user' ? 'msg user' : 'msg ai';
  msg.innerText = text;
  chatlog.appendChild(msg);
  chatlog.scrollTop = chatlog.scrollHeight;
}

function askInitialQuestions() {
  addMessage("Welcome! 👋 Would you like to continue in English or French?", 'ai');
}

async function sendMessage(message) {
  addMessage(message, 'user');
  typingIndicator.style.display = 'block';

  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      name: userName,
      email: userEmail,
      lang: userLang
    })
  });

  const data = await res.json();
  typingIndicator.style.display = 'none';
  addMessage(data.reply, 'ai');
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = '';

  // Handle onboarding
  if (!userLang) {
    if (/fr/i.test(message)) {
      userLang = 'fr';
      addMessage("Bienvenue chez JUN’S AI 👗", 'ai');
      addMessage("Souhaitez-vous :\n- Recommandation de robe ?\n- Suivre une commande ?\n- Changer le thème ?", 'ai');
    } else {
      userLang = 'en';
      addMessage("Welcome to JUN’S AI 👗", 'ai');
      addMessage("Would you like to:\n- Get a dress recommendation?\n- Track an order?\n- Change your dress theme?", 'ai');
    }
    return;
  }

  // Ask name/email after first message
  if (!userName) {
    userName = message;
    addMessage(userLang === 'fr' ? "Merci ! Et votre e-mail ?" : "Thanks! And your email?");
    return;
  }
  if (!userEmail && userName) {
    userEmail = message;
    addMessage(userLang === 'fr' ? "Merci ! Que puis-je faire pour vous aujourd'hui ?" : "Thanks! What can I help you with today?");
    return;
  }

  sendMessage(message);
});

askInitialQuestions();
