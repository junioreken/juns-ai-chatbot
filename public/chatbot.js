const chatMessages = document.getElementById("chatMessages");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const typingIndicator = document.getElementById("typingIndicator");

let selectedLanguage = "";

function addMessage(text, isUser = false) {
  const message = document.createElement("div");
  message.classList.add("message");
  message.classList.add(isUser ? "user-message" : "bot-message");
  message.innerText = text;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  typingIndicator.innerText = "JUN'S AI is typing...";
}

function hideTyping() {
  typingIndicator.innerText = "";
}

function sendMessage(message) {
  if (!message.trim()) return;

  addMessage(message, true);
  userInput.value = "";
  showTyping();

  fetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      lang: selectedLanguage || "en",
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      hideTyping();
      addMessage(data.reply || "Oops, something went wrong.");
    })
    .catch(() => {
      hideTyping();
      addMessage("Oops, something went wrong.");
    });
}

sendButton.addEventListener("click", () => sendMessage(userInput.value));
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage(userInput.value);
});

function askLanguage() {
  addMessage("Hi! Would you like to chat in English or French?");

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.gap = "8px";
  wrapper.style.marginBottom = "10px";

  const fr = document.createElement("button");
  fr.innerText = "French";
  fr.style.background = "#007aff";
  fr.style.color = "white";
  fr.style.border = "none";
  fr.style.borderRadius = "16px";
  fr.style.padding = "8px 12px";
  fr.style.cursor = "pointer";

  const en = document.createElement("button");
  en.innerText = "English";
  en.style.background = "#007aff";
  en.style.color = "white";
  en.style.border = "none";
  en.style.borderRadius = "16px";
  en.style.padding = "8px 12px";
  en.style.cursor = "pointer";

  wrapper.appendChild(fr);
  wrapper.appendChild(en);
  chatMessages.appendChild(wrapper);

  fr.onclick = () => {
    selectedLanguage = "fr";
    wrapper.remove();
    sendMessage("Bonjour, pouvez-vous m’aider à trouver une robe ?");
  };

  en.onclick = () => {
    selectedLanguage = "en";
    wrapper.remove();
    sendMessage("Hi, can you help me find a dress?");
  };

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

askLanguage();
