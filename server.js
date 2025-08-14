const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serves chatbot UI

// ✅ Get API Key from Railway variable (not from .env)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // ✅ This must match the variable name in Railway
});

// Test route
app.get('/', (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Chat route
app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ reply: "Message is missing." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: "You are JUN'S fashion AI assistant. Greet the customer, ask for their name and email, and help them with dress recommendations, order tracking, or connect to a human if needed.",
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.7,
    });

    const aiReply = response.choices?.[0]?.message?.content ?? "I'm not sure how to answer that.";

    res.json({ reply: aiReply });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ reply: "Something went wrong. Please try again later." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`✅ JUN'S AI backend running on port ${port}`);
});
