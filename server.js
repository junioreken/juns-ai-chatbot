const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (chatbot-widget.js, index.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// OpenAI config
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Use Railway's injected variable
});

// Handle POST requests from chatbot widget
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message in request body.' });
  }

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // or 'gpt-4' if you prefer
      messages: [
        { role: 'system', content: "You are JUN'S AI – a fashion-savvy assistant that helps users with questions about products, dresses, orders, and styling tips." },
        { role: 'user', content: message }
      ]
    });

    const aiReply = chatResponse.choices[0]?.message?.content || "I'm not sure how to answer that.";
    res.json({ reply: aiReply });

  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ reply: "Sorry, something went wrong with the AI response." });
  }
});

// Fallback for other GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot Backend is Running on port ${PORT}`);
});
