(() => {
 const API_URL = "https://juns-ai-chatbot-production.up.railway.app/chat";


  let theme = 'wedding';
  let language = '';
  let userEmail = '';

  const createChatUI = () => {
    const style = document.createElement('style');
    style.innerHTML = `
      #juns-chatbot {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        height: 480px;
        background: white;
        border-radius: 20px;
        border: 1px solid #ccc;
        z-index: 9999;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #juns-header {
        background: black;
        color: white;
        text-align: center;
        padding: 10px;
        font-weight: bold;
      }
      #juns-messages {
        flex: 1;
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .msg-user, .msg-bot {
        max-width: 80%;
        padding: 8px 12px;
        border-radius: 20px;
        line-height: 1.3;
      }
      .msg-user {
        align-self: flex-end;
        background: #0b93f6;
        color: white;
      }
      .msg-bot {
        align-self: flex-start;
        background: #e5e5ea;
        color: black;
      }
      #juns-input-area {
        display: flex;
        border-top: 1px solid #ddd;
      }
      #juns-input {
        flex: 1;
        border: none;
        padding: 10px;
        font-size: 14px;
        outline: none;
      }
      #juns-send {
        background: black;
        color: white;
        border: none;
        padding: 10px 14px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'juns-chatbot';
    container.innerHTML = `
      <div id="juns-header">JUN’S AI</div>
      <div id="juns-messages">
        <div class="msg-bot">👋 Bonjour! English or French?</div>
      </div>
      <div id="juns-input-area">
        <input id="juns-input" placeholder="Type your message..." />
        <button id="juns-send">Send</button>
      </div>
    `;
    document.body.appendChild(container);

    document.getElementById('juns-send').onclick = async () => {
      const input = document.getElementById('juns-input');
      const text = input.value.trim();
      if (!text) return;

      addMessage(text, 'user');
      input.value = '';
      const reply = await sendToBot(text);
      addMessage(reply, 'bot');
    };
  };

  const addMessage = (text, sender) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = sender === 'user' ? 'msg-user' : 'msg-bot';
    msgDiv.textContent = text;
    document.getElementById('juns-messages').appendChild(msgDiv);
    document.getElementById('juns-messages').scrollTop = 9999;
  };

  const sendToBot = async (msg) => {
    // Detect language choice
    if (!language && msg.toLowerCase().includes('french')) {
      language = 'fr';
      return "Enchanté ! Que puis-je faire pour vous aujourd'hui ?";
    }
    if (!language && msg.toLowerCase().includes('english')) {
      language = 'en';
      return "Nice to meet you! What can I help you with today?";
    }

    // Detect theme redirect
    if (msg.toLowerCase().includes('change theme')) {
      window.location.href = "/pages/theme-selector";
      return "Redirecting to theme selection...";
    }

    // Detect order tracking
    if (msg.toLowerCase().includes('track order')) {
      return "Please enter your email so I can look it up.";
    }

    if (msg.includes('@') && !userEmail) {
      userEmail = msg;
      return `Thank you! Checking order status for ${userEmail}...`;
    }

    // Send to GPT bot
    try {
      const res = await fetch(BOT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          theme,
          language
        })
      });
      const data = await res.json();
      return data.reply || "Sorry, I didn’t understand that.";
    } catch (e) {
      return "Oops, server error!";
    }
  };

  window.addEventListener('load', () => {
    setTimeout(() => {
      createChatUI();
    }, 5000);
  });
})();
