const frame = document.createElement('iframe');
frame.src = '/chatbot-widget.html';
frame.id = 'juns-chat-frame';
frame.style.cssText = 'position:fixed;bottom:90px;right:24px;width:380px;height:560px;border:none;border-radius:12px;z-index:99999;display:none;';
document.body.appendChild(frame);

const button = document.createElement('div');
button.id = 'juns-ai-button';
button.style.cssText = `
  position:fixed;bottom:24px;right:24px;
  background:black;color:white;
  border-radius:50px;width:56px;height:56px;
  font-weight:bold;z-index:9999;
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-family:-apple-system;
  flex-direction:column;cursor:pointer;
`;
button.innerHTML = `<div>JUN’S</div><div style="font-size:11px;">AI</div>`;
document.body.appendChild(button);

button.addEventListener('click', () => {
  frame.style.display = frame.style.display === 'block' ? 'none' : 'block';
});
