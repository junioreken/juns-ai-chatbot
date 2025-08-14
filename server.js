const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve chatbot UI

// OpenAI config
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Root route for testing
app.get('/', (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Main chat route
app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ reply: "Message missing from request." });
  }

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // or 'gpt-4'
      messages: [
        { role: 'system', content: "You are JUN'S fashion AI chatbot. Greet users, ask for their name and email, and help with dress recommendations, order questions, or connect them to a human if needed." },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
    });

    const reply = chatResponse.choices[0]?.message?.content || "I'm not sure how to answer that.";

    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ reply: "Sorry, something went wrong with the AI response." });
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ JUN'S AI backend is live on port ${port}`);
});
