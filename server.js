const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get products from Shopify
async function fetchProducts() {
  try {
    const response = await axios.post(
      'https://j1ncvb-1b.myshopify.com/admin/api/2023-10/graphql.json',
      {
        query: `
          {
            products(first: 10) {
              edges {
                node {
                  id
                  title
                  descriptionHtml
                  handle
                  featuredImage {
                    url
                  }
                }
              }
            }
          }
        `
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data.products.edges.map(e => e.node);
  } catch (err) {
    console.error('Shopify fetch error:', err.message);
    return [];
  }
}

// POST /chat endpoint
app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  const intro = lang === 'fr'
    ? "Tu es JUN’S AI – un assistant mode qui répond aux questions sur les produits, robes, commandes et thèmes d'événements."
    : "You are JUN’S AI – a fashion-savvy assistant that helps with products, dresses, themes, and order questions.";

  const products = await fetchProducts();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: `${intro} Here are some products:\n${products.map(p => `• ${p.title}: ${p.descriptionHtml.replace(/<[^>]*>/g, '')}`).join('\n')}` },
        { role: 'user', content: message }
      ]
    });

    const reply = completion.choices[0]?.message?.content || "Sorry, I don't know how to respond.";
    console.log(`🧾 From: ${name || 'anonymous'} (${email || 'no email'})`);

    res.json({ reply });
  } catch (e) {
    console.error('❌ OpenAI Error:', e.message);
    res.status(500).json({ reply: "Oops! Something went wrong." });
  }
});

// Fallback to index.html
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 JUN’S AI is live on port ${PORT}`));
