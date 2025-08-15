const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    const intro = lang === 'fr'
      ? "Tu es JUN’S AI – un assistant mode qui aide à répondre aux questions sur les produits, commandes, robes et conseils de style."
      : "You are JUN’S AI – a fashion-savvy assistant that helps answer questions about products, dresses, orders, and styling tips.";

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: intro },
        { role: 'user', content: message }
      ]
    });

    const reply = response.choices[0]?.message?.content || "Sorry, I don't know how to answer that.";

    // Example webhook logging (name/email)
    console.log(`New chat from ${name || 'anonymous'} (${email || 'no email'})`);

    res.json({ reply });
  } catch (error) {
    console.error('OpenAI error:', error);
    res.status(500).json({ reply: "Oops! Something went wrong." });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot is live at http://localhost:${PORT}`);
});
