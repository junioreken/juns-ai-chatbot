const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 8080;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // DO NOT EXPOSE in frontend!
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Handle chatbot messages
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message.' });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: "You are JUN'S AI, a helpful fashion assistant. You help users choose dresses, answer product questions, and support order issues."
        },
        { role: 'user', content: message }
      ]
    });

    const reply = response.choices[0]?.message?.content;
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ reply: "Oops! Something went wrong." });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ JUN'S AI Chatbot running on port ${PORT}`);
});
