const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { OpenAI } = require('openai'); // v4 SDK

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static chatbot frontend from /public folder
app.use(express.static(path.join(__dirname, 'public')));

// Route: Serve chatbot interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route: Handle chat message from frontend
app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are JUN'S AI, a helpful fashion and customer service assistant. Be friendly, clear, and helpful. You can:
          - Answer questions about orders or store policies.
          - Recommend dresses and styles based on customer input.
          - Escalate to a human if needed.`
        },
        {
          role: 'user',
          content: message
        }
      ]
    });

    const reply = response.choices[0]?.message?.content || 'Sorry, no reply.';
    res.json({ reply });
  } catch (error) {
    console.error('OpenAI Error:', error);
    res.status(500).json({ error: 'Failed to get response from AI.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
