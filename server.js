const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_ADMIN_API_KEY = process.env.SHOPIFY_ADMIN_API_KEY;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // e.g. jun-s.myshopify.com
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: fetch Shopify products
async function fetchShopifyProducts() {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-04/products.json`;
  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_KEY,
      'Content-Type': 'application/json'
    }
  });
  return response.data.products || [];
}

// Helper: fetch Shopify order by email
async function findOrderByEmail(email) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-04/orders.json?email=${encodeURIComponent(email)}&status=any`;
  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_KEY,
      'Content-Type': 'application/json'
    }
  });
  return response.data.orders || [];
}

app.post('/chat', async (req, res) => {
  const { message, name, email, lang } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    const intro =
      lang === 'fr'
        ? "Tu es JUN’S AI – un assistant mode qui répond aux questions sur les produits, commandes, robes, recommandations et thèmes."
        : "You are JUN’S AI – a fashion-savvy assistant that helps with dresses, orders, style tips, recommendations, and theme changes.";

    // Inject Shopify data
    let contextData = '';
    const products = await fetchShopifyProducts();
    contextData += `Current products: ${products
      .slice(0, 5)
      .map((p) => p.title)
      .join(', ')}.\n`;

    if (email) {
      const orders = await findOrderByEmail(email);
      if (orders.length > 0) {
        const lastOrder = orders[0];
        contextData += `Last order status for ${email}: ${lastOrder.financial_status}, ${lastOrder.fulfillment_status}. Tracking: ${lastOrder.order_status_url}\n`;
      }
    }

    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: intro + '\n\n' + contextData },
        { role: 'user', content: message }
      ]
    });

    const reply = chatCompletion.choices[0]?.message?.content || 'Sorry, no response.';

    console.log(`👤 New chat from ${name || 'Anonymous'} (${email || 'no email'})`);
    res.json({ reply });
  } catch (error) {
    console.error('❌ AI Error:', error.message);
    res.status(500).json({ reply: 'Oops! Something went wrong.' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI is live at http://localhost:${PORT}`);
});
