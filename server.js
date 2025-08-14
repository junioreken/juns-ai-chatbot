import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI using Railway-provided environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `You're JUN'S AI — a friendly fashion assistant for a Shopify store. Greet users, ask their name/email if it's their first time, then assist with store-related questions like orders, dress recommendations, or escalation.` },
        { role: 'user', content: message }
      ],
      temperature: 0.7
    });

    const reply = chatResponse.choices[0]?.message?.content;
    res.json({ response: reply || "Sorry, I couldn't generate a response." });

  } catch (error) {
    console.error('❌ OpenAI error:', error);
    res.status(500).json({ response: "Sorry, something went wrong with the AI response." });
  }
});

// Optional: Home route
app.get('/', (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
