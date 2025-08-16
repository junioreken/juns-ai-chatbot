const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// OpenAI setup using Railway variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// POST /chat route
app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;

  if (!message) return res.status(400).json({ error: 'Message missing.' });

  const intro = lang === 'fr'
    ? "Tu es JUN’S AI – un assistant mode qui répond aux questions sur les robes, les produits, les commandes, et les styles."
    : "You are JUN’S AI – a fashion-savvy assistant that helps with questions about products, dresses, orders, and styling tips.";

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: intro },
        { role: 'user', content: message }
      ]
    });

    const reply = response.choices?.[0]?.message?.content || "Sorry, I’m not sure how to answer that.";

    // Send to webhook if needed
    if (name || email) {
      try {
        await axios.post(process.env.WEBHOOK_URL, { name, email });
      } catch (webhookError) {
        console.warn('Webhook failed:', webhookError.message);
      }
    }

    res.json({ reply });
  } catch (error) {
    console.error('OpenAI Error:', error.message);
    res.status(500).json({ reply: "Oops! Something went wrong." });
  }
});

// Handle recommendation redirect
app.get('/recommendation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'recommendation.html'));
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot running on port ${PORT}`);
});
