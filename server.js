const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const STOREFRONT_TOKEN = process.env.STOREFRONT_TOKEN;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    const language = req.body.language || 'english';

    const systemPrompt = {
      english: 'You are JUN\'S AI, a Shopify fashion assistant. Answer clearly. If user asks for dresses or style, suggest some.',
      french: 'Tu es JUN\'S AI, un assistant de mode pour une boutique Shopify. Réponds clairement. Si on te demande une robe ou style, propose quelques suggestions.'
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt[language.toLowerCase()] },
          { role: 'user', content: userMessage }
        ]
      })
    });

    const data = await response.json();
    const botReply = data.choices?.[0]?.message?.content || "I couldn't understand that.";

    res.json({ reply: botReply });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ reply: 'Oops, server error!' });
  }
});

app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot Server is Running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI Chatbot Server running on port ${PORT}`);
});
