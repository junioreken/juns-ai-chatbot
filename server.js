const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Railway will inject this
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: 'No message provided.' });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: "You are JUN'S AI, a stylish fashion assistant for helping with dresses, orders, and styling tips." },
        { role: 'user', content: message }
      ]
    });

    const reply = response.choices[0]?.message?.content || "Sorry, I didn’t catch that.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "There was an issue with the AI. Please try again later." });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // fallback page
});

app.listen(PORT, () => {
  console.log(`✅ JUN'S AI running on port ${PORT}`);
});
