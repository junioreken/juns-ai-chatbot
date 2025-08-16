const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Homepage route (for Railway/Vercel ping test)
app.get('/', (req, res) => {
  res.send(`<h2>JUN'S AI Chatbot Server is Live 🚀</h2>`);
});

// AI Chat Endpoint
app.post('/api/chat', async (req, res) => {
  const { message, theme, language } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  // 👇 GPT response simulation
  const reply = `(${language === 'fr' ? 'FR' : 'EN'}) [${theme || 'default'}] You said: "${message}". Here’s a stylish answer from JUN’S AI! 💬👗`;

  res.json({ reply });
});

// Theme Change Redirection Logic (if needed)
app.post('/api/change-theme', (req, res) => {
  const { selectedTheme } = req.body;

  if (!selectedTheme) {
    return res.status(400).json({ error: 'Theme missing' });
  }

  // Example: redirect URL
  const redirectURL = `/pages/theme-${selectedTheme.toLowerCase()}`;
  res.json({ redirect: redirectURL });
});

// Order Tracking (optional example)
app.post('/api/track-order', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  // You would replace this with real Shopify Storefront API logic
  res.json({
    status: 'Processing',
    eta: '3-5 business days',
    email,
    message: `Order for ${email} is being prepared.`
  });
});

app.listen(PORT, () => {
  console.log(`✅ JUN'S Chatbot backend live at http://localhost:${PORT}`);
});
