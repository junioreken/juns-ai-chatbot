document.addEventListener('DOMContentLoaded', function () {
  const botUI = document.createElement('div');
  botUI.innerHTML = `
    <div id="juns-chatbot">
      <iframe src="https://juns-ai-chatbot-production.up.railway.app/chatbot-widget.html" width="100%" height="100%" style="border:none;"></iframe>
    </div>
    <div id="juns-toggle">JUN’S<br>AI</div>
  `;
  document.body.appendChild(botUI);

  document.getElementById('juns-toggle').addEventListener('click', () => {
    const bot = document.getElementById('juns-chatbot');
    bot.style.display = bot.style.display === 'flex' ? 'none' : 'flex';
  });

  // Optional popup for homepage/product page only
  if (window.location.pathname === '/' || window.location.pathname.includes('product')) {
    const popup = document.createElement('div');
    popup.id = 'juns-popup';
    popup.innerHTML = `<p>👗 What kind of dress are you looking for? (e.g. wedding, party, casual)</p>`;
    document.body.appendChild(popup);

    setTimeout(() => popup.remove(), 10000);
  }
});
