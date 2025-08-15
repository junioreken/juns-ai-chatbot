// chatbot-widget.js

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.createElement("iframe");
  iframe.src = "https://juns-ai-chatbot-production.up.railway.app";
  iframe.id = "juns-chat-frame";
  document.body.appendChild(iframe);

  const popup = document.createElement("div");
  popup.id = "juns-ai-popup";
  popup.innerHTML = `
    <span style="font-weight: bold; margin-right: 8px;">JUN'S AI</span>
    <input type="text" id="themeInput" placeholder="Event theme? (e.g. wedding)">
    <button id="sendTheme">🎯</button>
    <button id="closePopup" style="margin-left:8px;">❌</button>
  `;
  document.body.appendChild(popup);

  const button = document.createElement("div");
  button.id = "juns-ai-button";
  button.innerHTML = `
    <div style="display:flex;flex-direction:column;text-align:center;font-weight:bold;">
      <span style="font-size:12px; line-height:12px;">JUN'S</span>
      <span style="font-size:11px; line-height:11px;">AI</span>
    </div>
  `;
  document.body.appendChild(button);

  // Load popup only on homepage, product and recommendations page
  const path = window.location.pathname;
  const showPopup = path === "/" || path.includes("/products/") || path.includes("/event-dress-recommendations");
  if (showPopup) {
    setTimeout(() => {
      popup.style.display = "flex";
    }, 5000);
  }

  document.getElementById("sendTheme").addEventListener("click", function () {
    const theme = document.getElementById("themeInput").value.trim();
    if (!theme) return;
    const encoded = encodeURIComponent(theme);
    window.location.href = `/pages/event-dress-recommendations?theme=${encoded}`;
  });

  document.getElementById("closePopup").addEventListener("click", function () {
    popup.style.display = "none";
    button.style.display = "flex";
  });

  button.addEventListener("click", function () {
    iframe.style.display = iframe.style.display === "block" ? "none" : "block";
  });
});
