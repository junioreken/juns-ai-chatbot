(function () {
  const allowedPaths = ['/', '/products', '/pages/event-dress-recommendations'];
  const currentPath = window.location.pathname;

  const isMobile = window.innerWidth < 768;
  const chatbotWidth = isMobile ? '90%' : '380px';
  const chatbotHeight = isMobile ? '450px' : '560px';

  // Create AI Bubble
  const button = document.createElement("div");
  button.id = "juns-ai-button";
  button.innerHTML = "<div style='font-size:12px; text-align:center; font-weight:bold;'>JUN'S<br/>AI</div>";
  Object.assign(button.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "9999",
    background: "black",
    color: "white",
    borderRadius: "50%",
    width: "56px",
    height: "56px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
  });
  document.body.appendChild(button);

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.id = "juns-chat-frame";
  iframe.src = "https://juns-ai-chatbot-production.up.railway.app";
  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "90px",
    right: "24px",
    width: chatbotWidth,
    height: chatbotHeight,
    border: "none",
    borderRadius: "12px",
    zIndex: "9999",
    display: "none",
    maxWidth: "100%"
  });
  document.body.appendChild(iframe);

  // Bubble click toggle
  button.addEventListener("click", () => {
    iframe.style.display = iframe.style.display === "none" ? "block" : "none";
  });

  // Pop-up for dress theme (homepage + product + rec page only)
  if (allowedPaths.includes(currentPath)) {
    setTimeout(() => {
      const popup = document.createElement("div");
      popup.id = "juns-ai-popup";
      popup.innerHTML = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; background: linear-gradient(to right, #f6d8e6, #fbe7c6); border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 4px 20px rgba(0,0,0,0.2); border-radius: 16px; padding: 14px 20px; z-index:99999; display:flex; align-items:center;">
          <strong style="margin-right: 10px;">JUN'S AI</strong>
          <input id="themeInput" type="text" placeholder="Event theme?" style="border:none; outline:none; background:transparent; font-size:14px; margin-right:10px;" />
          <button id="sendTheme" style="cursor:pointer;">🎯</button>
          <button id="closePopup" style="margin-left:8px; background:none; border:none; cursor:pointer;">❌</button>
        </div>
      `;
      popup.style.position = "fixed";
      popup.style.top = "20px";
      popup.style.left = "20px";
      document.body.appendChild(popup);

      document.getElementById("sendTheme").onclick = function () {
        const theme = document.getElementById("themeInput").value.trim();
        if (theme) {
          window.location.href = `/pages/event-dress-recommendations?theme=${encodeURIComponent(theme)}`;
        }
      };
      document.getElementById("closePopup").onclick = function () {
        popup.remove();
        button.style.display = "flex";
      };
    }, 5000);
  }
})();
