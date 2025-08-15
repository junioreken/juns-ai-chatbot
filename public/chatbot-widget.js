(() => {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'https://your-domain/chatbot-widget.css';
  document.head.appendChild(style);

  const widget = document.createElement('div');
  widget.id = 'juns-chatbot-widget';
  widget.innerHTML = `
    <div class="chat-icon">💬</div>
    <div class="chat-window">
      <div class="chat-header">JUN'S AI Chatbot</div>
      <div class="chat-messages"></div>
      <div class="chat-input">
        <input type="text" placeholder="Ask me something..." />
        <button>Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  const icon = widget.querySelector('.chat-icon');
  const window = widget.querySelector('.chat-window');
  const input = widget.querySelector('input');
  const button = widget.querySelector('button');
  const messages = widget.querySelector('.chat-messages');

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = role;
    div.innerHTML = `<strong>${role === 'user' ? 'You' : "JUN'S AI"}:</strong> ${text}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    input.value = '';
    try {
      const res = await fetch('https://your-domain/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      addMessage('bot', data.reply || "Oops! Something went wrong.");
    } catch (err) {
      console.error(err);
      addMessage('bot', "Oops! Something went wrong.");
    }
  }

  button.onclick = sendMessage;
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  icon.onclick = () => {
    window.classList.toggle('visible');
  };

  // Auto open after 5 seconds
  setTimeout(() => {
    window.classList.add('visible');
    addMessage('bot', "Hey! Need help picking the perfect dress?");
  }, 5000);
})();
