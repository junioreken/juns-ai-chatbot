(function () {
  const serverUrl = "juns-ai-chatbot-production.up.railway.app"; 

  const style = document.createElement("style");
  style.innerHTML = `
    .chatbot-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #000;
      color: white;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      font-size: 30px;
      text-align: center;
      line-height: 60px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }

    .chatbot-window {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 10px;
      border: 1px solid #ccc;
      display: flex;
      flex-direction: column;
      font-family: sans-serif;
      z-index: 9999;
      box-shadow: 0 8px 20px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    .chatbot-header {
      background-color: #000;
      color: white;
      padding: 15px;
      font-size: 18px;
      font-weight: bold;
    }

    .chatbot-messages {
      flex: 1;
      padding: 10px;
      overflow-y: auto;
      font-size: 14px;
    }

    .chatbot-input {
      display: flex;
      border-top: 1px solid #ddd;
    }

    .chatbot-input input {
      flex: 1;
      padding: 10px;
      border: none;
      outline: none;
    }

    .chatbot-input button {
      background: black;
      color: white;
      border: none;
      padding: 0 20px;
      cursor: pointer;
    }

    .chatbot-bubble-message {
      position: fixed;
      top: 20px;
      left: 20px;
      background: #000;
      color: white;
      padding: 12px 20px;
      border-radius: 20px;
      font-size: 15px;
      animation: fadeIn 1s ease-in-out;
      z-index: 9999;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);

  const button = document.createElement("div");
  button.className = "chatbot-button";
  button.innerHTML = "💬";
  document.body.appendChild(button);

  const bubbleMsg = document.createElement("div");
  bubbleMsg.className = "chatbot-bubble-message";
  bubbleMsg.innerText = "👗 Need help choosing a dress?";
  document.body.appendChild(bubbleMsg);

  setTimeout(() => {
    bubbleMsg.remove();
  }, 6000);

  const chatWindow = document.createElement("div");
  chatWindow.className = "chatbot-window";
  chatWindow.style.display = "none";
  chatWindow.innerHTML = `
    <div class="chatbot-header">JUN'S AI Chatbot</div>
    <div class="chatbot-messages" id="chatbotMessages"></div>
    <div class="chatbot-input">
      <input type="text" id="chatbotInput" placeholder="Ask me something...">
      <button id="chatbotSend">Send</button>
    </div>
  `;
  document.body.appendChild(chatWindow);

  button.onclick = () => {
    chatWindow.style.display = chatWindow.style.display === "none" ? "flex" : "none";
  };

  const messagesEl = document.getElementById("chatbotMessages");
  const inputEl = document.getElementById("chatbotInput");
  const sendBtn = document.getElementById("chatbotSend");

  const appendMessage = (sender, text) => {
    const msg = document.createElement("div");
    msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const sendMessage = async () => {
    const userInput = inputEl.value.trim();
    if (!userInput) return;
    appendMessage("You", userInput);
    inputEl.value = "";

    try {
      const res = await fetch(`${serverUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput }),
      });
      const data = await res.json();
      appendMessage("JUN'S AI", data.response || "No reply.");
    } catch (err) {
      appendMessage("JUN'S AI", "Oops! Something went wrong.");
    }
  };

  sendBtn.onclick = sendMessage;
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
  });
})();
