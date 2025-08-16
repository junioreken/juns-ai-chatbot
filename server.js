const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_API_KEY = process.env.SHOPIFY_ADMIN_API_KEY;

// Fetch Shopify products/pages
async function fetchStoreContent() {
  try {
    const products = await axios.get(`https://${SHOPIFY_DOMAIN}/admin/api/2023-01/products.json`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_API_KEY }
    });

    const pages = await axios.get(`https://${SHOPIFY_DOMAIN}/admin/api/2023-01/pages.json`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_API_KEY }
    });

    return {
      productList: products.data.products.map(p => `${p.title}: ${p.body_html?.replace(/<[^>]+>/g, '')?.slice(0, 150)}...`).join('\n'),
      pageInfo: pages.data.pages.map(p => `${p.title}: ${p.body_html?.replace(/<[^>]+>/g, '')?.slice(0, 150)}...`).join('\n')
    };
  } catch (err) {
    console.error("Shopify fetch error:", err.message);
    return { productList: "", pageInfo: "" };
  }
}

app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;

  if (!message) return res.status(400).json({ error: 'Missing message' });

  try {
    const { productList, pageInfo } = await fetchStoreContent();

    const intro = lang === 'fr'
      ? `Tu es JUN’S AI – un assistant mode bilingue. Tu aides à répondre aux questions sur les produits, les commandes, les recommandations de robes, les thèmes d’événement, et tu fournis des détails sur la boutique Shopify.\nProduits:\n${productList}\nInfos Boutique:\n${pageInfo}`
      : `You are JUN’S AI – a bilingual fashion assistant. You help with product questions, orders, dress recommendations, theme-based advice, and Shopify store info.\nProducts:\n${productList}\nStore Info:\n${pageInfo}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: intro },
        { role: 'user', content: message }
      ]
    });

    console.log(`Chat from ${name || "Guest"} (${email || "no email"})`);

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("OpenAI or Shopify Error:", error.message);
    res.status(500).json({ reply: "Oops! Something went wrong." });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chatbot-widget.html'));
});

app.listen(PORT, () => {
  console.log(`✅ JUN’S AI running on http://localhost:${PORT}`);
});
