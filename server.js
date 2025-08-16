const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify Info (stored as Railway environment variables)
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_API_TOKEN = process.env.SHOPIFY_API_TOKEN;

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Shopify: Get products (basic info)
async function getShopifyProducts() {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2023-04/products.json`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_API_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  return data.products || [];
}

// Shopify: Get order status by order number or email
async function getOrderStatus(orderNumberOrEmail) {
  const ordersUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2023-04/orders.json?status=any`;
  const res = await fetch(ordersUrl, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_API_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  const match = data.orders.find(order =>
    order.name === orderNumberOrEmail || order.email === orderNumberOrEmail
  );

  if (match) {
    return `Order #${match.name} is currently: ${match.fulfillment_status || 'Processing'}`;
  }

  return `No order found for ${orderNumberOrEmail}.`;
}

// POST /api/chat - Chatbot endpoint
app.post('/api/chat', async (req, res) => {
  const { message, theme = "wedding", language = "en", name, email } = req.body;

  if (!message) return res.status(400).json({ error: 'Missing message' });

  try {
    // Log customer info (can also call webhook here)
    console.log(`Chat from ${name || 'guest'} (${email || 'no email'})`);

    // Fetch store products to inform GPT
    const products = await getShopifyProducts();
    const productDescriptions = products.map(p => `${p.title}: ${p.body_html.replace(/<[^>]*>/g, '')}`).join('\n');

    // Language-specific greeting
    const systemPrompt = language === 'fr'
      ? `Tu es JUN'S AI – un assistant pour une boutique Shopify de mode. Tu aides les clients à recommander des robes (${theme}), suivre leurs commandes, ou répondre à des questions sur les produits. Voici les produits :\n${productDescriptions}`
      : `You are JUN'S AI – a helpful assistant for a fashion Shopify store. You help customers with dress recommendations (theme: ${theme}), order tracking, or product questions. Here are the products:\n${productDescriptions}`;

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    const reply = chatResponse.choices[0]?.message?.content || "Sorry, I couldn't find an answer.";
    res.json({ reply });

  } catch (err) {
    console.error("❌ Chatbot error:", err);
    res.status(500).json({ reply: "Oops! Something went wrong on our side." });
  }
});

// GET / (optional message)
app.get('/', (req, res) => {
  res.send("✅ JUN'S AI Chatbot Server is Live 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI Chatbot is running on port ${PORT}`);
});
