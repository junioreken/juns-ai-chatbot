const API_URL = "https://juns-ai-chatbot-production.up.railway.app/chat";

function createMessage(content, isUser = false) {
  const message = document.createElement("div");
  message.className = `bubble ${isUser ? "user" : "ai"}`;
  message.textContent = content;
  return message;
}

function initChat() {
  const chatContainer = document.createElement("div");
  chatContainer.id = "juns-ai-chatbox";
  chatContainer.innerHTML = `
    <div class="chat-header">JUN’S AI</div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input">
      <input type="text" id="chatInput" placeholder="Type your message..." />
    </div>
  `;
  document.body.appendChild(chatContainer);

  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      const userMessage = input.value.trim();
      messages.appendChild(createMessage(userMessage, true));
      input.value = "";

      const loading = createMessage("...");
      messages.appendChild(loading);
      messages.scrollTop = messages.scrollHeight;

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage }),
        });
        const data = await res.json();
        loading.remove();
        messages.appendChild(createMessage(data.reply));
        messages.scrollTop = messages.scrollHeight;
      } catch (err) {
        loading.remove();
        messages.appendChild(createMessage("❌ Error, try again."));
      }
    }
  });
}

// Show popup after 5s only on homepage/products/recommendation
const allowedPages = ["/", "/products", "/pages/event-dress-recommendations"];
if (allowedPages.includes(window.location.pathname)) {
  window.addEventListener("load", () => {
    setTimeout(() => {
      initChat();
    }, 5000);
  });
}
