document.addEventListener("DOMContentLoaded", function () {
  const container = document.createElement("div");
  container.id = "chatbot-container";
  container.innerHTML = `
    <div id="chatbot-window">
      <div id="chatbot-messages"></div>
      <div id="chatbot-input">
        <input type="text" placeholder="Type your message..." id="chatbot-text" />
        <button onclick="sendChatMessage()">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
});

function addMessage(msg, type = 'ai') {
  const chatBox = document.getElementById("chatbot-messages");
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = msg;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

let preferredTheme = "wedding";
let language = "english";

function sendChatMessage() {
  const input = document.getElementById("chatbot-text");
  const userText = input.value.trim();
  if (!userText) return;

  addMessage(userText, 'user');
  input.value = "";

  fetch("https://juns-ai-chatbot-production.up.railway.app/chat", {
    method: "POST",
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: userText,
      theme: preferredTheme,
      language
    })
  })
    .then(res => res.json())
    .then(data => {
      addMessage(data.reply || "Sorry, I didn’t understand that.", 'ai');
    })
    .catch(() => {
      addMessage("Sorry, something went wrong. Try again later.", 'ai');
    });
}
