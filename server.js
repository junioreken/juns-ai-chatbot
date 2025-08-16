const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Shopify API config (from Railway variables)
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // e.g., https://j1ncvb-1b.myshopify.com
const SHOPIFY_API_TOKEN = process.env.SHOPIFY_API_TOKEN;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot Server is Running");
});

app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    // Use intro with Shopify context
    const intro = lang === 'fr'
      ? `Tu es JUN’S AI – un assistant mode francophone pour le site Shopify ${SHOPIFY_DOMAIN}. Tu peux répondre aux questions sur les robes, les commandes, les recommandations basées sur le thème, et aider à naviguer le site.`
      : `You are JUN’S AI – a fashion-savvy assistant for the Shopify store ${SHOPIFY_DOMAIN}. You can help with dresses, product details, tracking orders, recommending outfits by theme, and more.`

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: intro },
        { role: "user", content: message }
      ]
    });

    const reply = response.choices[0]?.message?.content || "Sorry, I don’t know how to answer that.";

    console.log(`🧠 Message from ${name || 'anonymous'} (${email || 'no email'})`);

    res.json({ reply });
  } catch (err) {
    console.error("OpenAI error:", err.message);
    res.status(500).json({ reply: "Oops! Something went wrong on our side." });
  }
});

// (Optional) Endpoint for getting Shopify products (can be used later)
app.get('/products', async (req, res) => {
  try {
    const result = await axios.get(`${SHOPIFY_DOMAIN}/admin/api/2023-07/products.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    res.json(result.data);
  } catch (error) {
    console.error('❌ Shopify error:', error.message);
    res.status(500).json({ error: 'Failed to fetch products from Shopify' });
  }
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot Server is live on http://localhost:${PORT}`);
});
