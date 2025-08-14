const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Root route (for Railway health check)
app.get('/', (req, res) => {
  res.send('🎉 JUN\'S AI Chatbot Backend is Running!');
});

// Chatbot endpoint
app.post('/chat', async (req, res) => {
  const { message, name, email } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `
You are JUN’S AI Chatbot, the assistant for a fashion dropshipping store called JUN’S.

You assist users with:
1. 💬 Questions about store, orders, shipping, or sizing.
2. 👗 Dress recommendations based on user preferences (style, color, occasion, season).
3. 🧾 Guiding users to provide their name and email.
4. 🆘 Offering to connect with a live person if they want human support.

Respond in a helpful, stylish, and friendly tone.
If the user just said "hey" or "hello", greet them back and ask how you can assist.

If they ask for a dress recommendation, follow up with questions like:
- “What’s the occasion?”
- “Preferred color or style?”
- “Do you want a classy or casual look?”

Make responses short and readable for a small chat bubble. Do not mention OpenAI or that you're an AI model.
          `
        },
        {
          role: 'user',
          content: message
        }
      ]
    });

    const botMessage = chatResponse.choices[0].message.content.trim();
    res.json({ reply: botMessage });

  } catch (error) {
    console.error('OpenAI error:', error);
    res.status(500).json({ error: 'An error occurred while processing your message.' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
