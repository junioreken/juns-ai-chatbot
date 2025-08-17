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
  const { message, name, email, lang, storeUrl } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    // Enhanced system prompt with more context about JUN'S store
    const systemPrompt = lang === 'fr'
      ? `Tu es JUN'S AI – un assistant mode francophone expert pour la boutique Shopify JUN'S (${SHOPIFY_DOMAIN || storeUrl}).

Tu peux aider avec :
- Questions sur les robes et vêtements de mode
- Informations sur les commandes et le suivi
- Recommandations de tenues par thème ou occasion
- Politiques de retour et d'échange
- Informations sur la livraison et les frais
- Questions sur la taille et le guide des tailles
- Informations sur les collections et nouveautés
- Aide à la navigation du site

Réponds toujours en français de manière professionnelle et amicale. Si tu ne sais pas quelque chose, dis-le honnêtement et guide le client vers le support client.`
      : `You are JUN'S AI – a fashion-savvy AI assistant for the JUN'S Shopify store (${SHOPIFY_DOMAIN || storeUrl}).

You can help with:
- Questions about dresses and fashion items
- Order tracking and status
- Outfit recommendations by theme or occasion
- Return and exchange policies
- Shipping information and costs
- Size guides and fitting advice
- Collection information and new arrivals
- Site navigation help

Always respond professionally and warmly. If you don't know something, be honest and guide the customer to customer support.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const reply = response.choices[0]?.message?.content || 
      (lang === 'fr' ? "Désolé, je ne sais pas comment répondre à cela." : "Sorry, I don't know how to answer that.");

    console.log(`🧠 Message from ${name || 'anonymous'} (${email || 'no email'}) in ${lang || 'en'}`);

    res.json({ reply });
  } catch (err) {
    console.error("OpenAI error:", err.message);
    const errorMsg = lang === 'fr' 
      ? "Oups! Quelque chose s'est mal passé de notre côté." 
      : "Oops! Something went wrong on our side.";
    res.status(500).json({ reply: errorMsg });
  }
});

// Enhanced endpoint for getting Shopify products with better error handling
app.get('/products', async (req, res) => {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_API_TOKEN) {
    return res.status(400).json({ error: 'Shopify configuration missing' });
  }

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

// New endpoint to get store information
app.get('/store-info', async (req, res) => {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_API_TOKEN) {
    return res.status(400).json({ error: 'Shopify configuration missing' });
  }

  try {
    const result = await axios.get(`${SHOPIFY_DOMAIN}/admin/api/2023-07/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    res.json(result.data);
  } catch (error) {
    console.error('❌ Shopify store info error:', error.message);
    res.status(500).json({ error: 'Failed to fetch store information' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    shopify_configured: !!(SHOPIFY_DOMAIN && SHOPIFY_API_TOKEN)
  });
});

app.listen(PORT, () => {
  console.log(`🎉 JUN'S AI Chatbot Server is live on http://localhost:${PORT}`);
  console.log(`🏪 Shopify Domain: ${SHOPIFY_DOMAIN || 'Not configured'}`);
  console.log(`🔑 OpenAI: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
});
