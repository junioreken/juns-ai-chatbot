const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// OpenAI setup - assumes Railway variable is injected
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// POST /chat - receive chat message
app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    const systemMessage = lang === 'fr'
      ? "Tu es JUN’S AI – un assistant de mode élégant qui répond aux questions sur les produits, les robes, les commandes et donne des conseils de style."
      : "You are JUN’S AI – a fashion-savvy assistant that helps users with questions about products, dresses, orders, and styling tips.";

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: message }
      ]
    });

    const reply = response.choices[0]?.message?.content || "Sorry, I don't know how to answer that.";

    // Simple webhook logging (expand this to send to your CRM if needed)
    console.log(`👤 Chat from: ${name || 'Anonymous'} (${email || 'No Email'})`);

    res.json({ reply });
  } catch (error) {
    console.error('❌ OpenAI error:', error.message);
    res.status(500).json({ reply: "Oops! Something went wrong with the AI." });
  }
});

// Serve index.html for all routes (frontend fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot is live at http://localhost:${PORT}`);
});
