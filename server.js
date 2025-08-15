const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (chatbot UI)
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// POST route for AI replies
app.post('/chat', async (req, res) => {
  const { message, language } = req.body;

  const systemPrompt = language === 'fr'
    ? "Tu es JUN'S AI – un assistant de mode utile pour répondre aux questions sur les produits, les robes, les commandes et les conseils de style."
    : "You are JUN'S AI – a helpful fashion assistant that answers questions about products, dresses, orders, and style tips.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const aiReply = completion.choices[0]?.message?.content || "Sorry, I didn’t get that.";
    res.json({ reply: aiReply });

  } catch (err) {
    console.error("OpenAI error:", err.message);
    res.status(500).json({ reply: "Oops, something went wrong." });
  }
});

// Serve index.html as fallback
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ JUN'S AI Chatbot running at http://localhost:${PORT}`);
});
