const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// OpenAI client setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Root route
app.get('/', (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Chat endpoint
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'No message provided.' });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: "You are JUN'S AI, a stylish and helpful fashion assistant. Answer questions about store products, orders, and recommend trendy dresses. Be warm, but brief and helpful." },
        { role: 'user', content: message }
      ],
      temperature: 0.7
    });

    const botReply = response.choices?.[0]?.message?.content?.trim();

    res.json({ reply: botReply || "Sorry, I didn't understand that." });
  } catch (err) {
    console.error('OpenAI error:', err);
    res.status(500).json({ error: 'Failed to get response from AI.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
