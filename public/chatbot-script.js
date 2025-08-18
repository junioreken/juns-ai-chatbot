// Resolve API base from the script's own src so it works cross-origin when embedded in Shopify
function getApiUrl() {
  try {
    const thisScript = document.currentScript || (function() {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    const scriptUrl = new URL(thisScript.src);
    return `${scriptUrl.origin}/api/enhanced-chat`;
  } catch (e) {
    return "/api/enhanced-chat"; // fallback to relative
  }
}

const API_URL = getApiUrl();

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
        // Ensure a persistent session id for better context
        let sessionId = localStorage.getItem("juns_session_id");
        if (!sessionId) {
          sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          localStorage.setItem("juns_session_id", sessionId);
        }

        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            lang: navigator.language && navigator.language.startsWith("fr") ? "fr" : "en",
            storeUrl: window.location.origin,
            sessionId
          }),
        });
        const data = await res.json();
        loading.remove();
        messages.appendChild(createMessage(data.reply || "Sorry, I couldn't find that."));
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
