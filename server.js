const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Simple memory per session (not persistent)
const chatMemory = [];

app.post('/chat', async (req, res) => {
  try {
    const { message, language } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    // Basic webhook logic: capture name/email from message
    const nameMatch = message.match(/(my name is|je m'appelle)\s([a-zA-Z]+)/i);
    const emailMatch = message.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/);

    if (nameMatch || emailMatch) {
      const name = nameMatch ? nameMatch[2] : '';
      const email = emailMatch ? emailMatch[0] : '';
      if (name || email) {
        await fetch('https://hooks.zapier.com/hooks/catch/123456/abcde/', {
          method: 'POST',
          body: JSON.stringify({ name, email }),
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Build conversation history
    chatMemory.push({ role: 'user', content: message });

    const completion = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            language === 'fr'
              ? "Tu es JUN'S AI, un assistant amical pour un site de vêtements. Aide les clients à trouver des robes, suivre leurs commandes, ou répondre à leurs questions en français. Sois bref, utile et élégant."
              : "You are JUN'S AI, a friendly assistant for a fashion site. Help customers find dresses, track orders, or answer questions in English. Be concise, helpful, and elegant.",
        },
        ...chatMemory.slice(-10),
      ],
      temperature: 0.7,
    });

    const reply = completion.data.choices[0].message.content;
    chatMemory.push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ reply: 'Oops, something went wrong.' });
  }
});

app.listen(port, () => {
  console.log(`✅ JUN'S AI Chatbot running on port ${port}`);
});
