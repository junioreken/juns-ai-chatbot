document.addEventListener('DOMContentLoaded', function () {
  const bubble = document.createElement('div');
  bubble.id = 'chatbot-bubble';
  bubble.innerText = 'JUN’S\nAI';
  document.body.appendChild(bubble);

  const chatWindow = document.createElement('div');
  chatWindow.id = 'chatbot-window';
  chatWindow.innerHTML = `
    <div class="chat-header">JUN’S AI</div>
    <div class="chat-body"></div>
    <input type="text" id="chat-input" placeholder="Type your message..." />
  `;
  document.body.appendChild(chatWindow);

  let lang = '';
  let name = '';
  let email = '';

  const chatBody = chatWindow.querySelector('.chat-body');
  const chatInput = chatWindow.querySelector('#chat-input');

  function addMessage(content, fromAI = false) {
    const msg = document.createElement('div');
    msg.className = fromAI ? 'ai-msg' : 'user-msg';
    msg.innerText = content;
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function askAI(message) {
    addMessage(message);
    chatInput.value = '';
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    addMessage(data.reply, true);
  }

  bubble.addEventListener('click', () => {
    chatWindow.style.display = 'flex';
    bubble.style.display = 'none';

    setTimeout(() => {
      addMessage("👋 Bonjour! English or French?");
    }, 300);
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const msg = chatInput.value;
      if (!lang) {
        lang = msg.toLowerCase();
        askAI(`User chose ${lang}. Greet them.`);
        setTimeout(() => {
          askAI("Show options: Recommend a dress, Track order, Change theme, Speak to support.");
        }, 500);
        return;
      }

      if (!name || !email) {
        if (!name) {
          name = msg;
          addMessage(`Nice to meet you, ${name}! What's your email?`);
        } else {
          email = msg;
          fetch('/api/save-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email }),
          });
          askAI(`User is ${name}, email is ${email}. Continue normal chat.`);
        }
        return;
      }

      askAI(msg);
    }
  });
});
