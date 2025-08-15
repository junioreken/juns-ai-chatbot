let lang = null;
let name = null;
let email = null;
let greetingSent = false;

document.getElementById('chat-icon').addEventListener('click', () => {
  document.getElementById('chatbox').classList.toggle('hidden');
});

function chooseLanguage(selectedLang) {
  lang = selectedLang;
  document.getElementById('chat-popup').style.display = 'none';
  document.getElementById('chatbox').classList.remove('hidden');
  showAIMessage(lang === 'fr' ? "Bienvenue chez JUN’S! Que puis-je faire pour vous aujourd'hui?" : "Welcome to JUN’S! What would you like to do today?");
  showSuggestions();
}

function showSuggestions() {
  const suggestions = [
    lang === 'fr' ? "Souhaitez-vous une recommandation de robe?" : "Do you want a dress recommendation?",
    lang === 'fr' ? "Suivre ma commande" : "Track my order",
    lang === 'fr' ? "Changer le thème de robe" : "Change my dress theme",
    lang === 'fr' ? "Parler au support" : "Speak to support"
  ];
  suggestions.forEach(s => showAIMessage(s));
  if (!name) askNameEmail();
}

function askNameEmail() {
  setTimeout(() => {
    showAIMessage(lang === 'fr' ? "Quel est votre nom ?" : "What’s your name?");
  }, 1000);
  setTimeout(() => {
    showAIMessage(lang === 'fr' ? "Et votre email ?" : "And your email?");
  }, 2500);
}

function showAIMessage(text) {
  const chat = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'message ai';
  msg.innerText = text;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function showUserMessage(text) {
  const chat = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'message user';
  msg.innerText = text;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  showUserMessage(text);
  input.value = '';
  document.getElementById('typing-indicator').classList.remove('hidden');

  fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, name, email, lang })
  })
    .then(res => res.json())
    .then(data => {
      document.getElementById('typing-indicator').classList.add('hidden');
      showAIMessage(data.reply);

      if (!name && text.includes('@')) {
        email = text;
      } else if (!name) {
        name = text;
      }
    })
    .catch(err => {
      console.error(err);
      showAIMessage("Oops! Something went wrong.");
    });
}

// Auto popup only on homepage, product, or recommendation pages
const validPaths = ['/', '/products', '/recommendation'];
if (validPaths.some(path => window.location.pathname.includes(path))) {
  setTimeout(() => {
    document.getElementById('chat-popup').classList.remove('hidden');
  }, 5000);
}
