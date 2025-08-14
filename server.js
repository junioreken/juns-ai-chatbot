const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (chatbot-widget.html, chatbot-widget.js, etc.)
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// OpenAI config - Railway will inject the variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// POST route for AI chat
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message in request body.' });
  }

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: "You are JUN'S AI – a fashion-savvy assistant helping customers with products, dresses, orders, and styling tips."
        },
        { role: 'user', content: message }
      ]
    });

    const aiReply = chatResponse.choices[0]?.message?.content || "I'm not sure how to answer that.";
    res.json({ reply: aiReply });

  } catch (err) {
    console.error('OpenAI error:', err);
    res.status(500).json({ reply: 'Sorry, something went wrong.' });
  }
});

// Fallback to chatbot widget
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chatbot-widget.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI Chatbot running on port ${PORT}`);
});
