const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// OpenAI & Shopify Keys
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

// Home route
app.get("/", (req, res) => {
  res.send("✅ JUN'S AI Chatbot is live");
});

// Chat with GPT
app.get("/api/chat", async (req, res) => {
  const userMessage = req.query.message;

  if (!userMessage) return res.status(400).send({ error: "No message provided" });

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are JUN'S AI, a helpful fashion assistant and Shopify support bot." },
          { role: "user", content: userMessage }
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.send({ reply });
  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    res.status(500).send({ error: "Chatbot error" });
  }
});

// Dress recommendation based on theme
app.get("/api/recommend", async (req, res) => {
  const theme = req.query.theme || '';

  try {
    const response = await axios.get(`https://${SHOP_DOMAIN}/admin/api/2023-01/products.json`, {
      headers: {
        "X-Shopify-Access-Token": ADMIN_API_TOKEN,
        "Content-Type": "application/json"
      }
    });

    const allProducts = response.data.products || [];

    const filtered = allProducts.filter(product =>
      product.title.toLowerCase().includes(theme.toLowerCase()) ||
      product.body_html.toLowerCase().includes(theme.toLowerCase())
    );

    res.json({ theme, count: filtered.length, products: filtered });
  } catch (error) {
    console.error("Shopify error:", error.response?.data || error.message);
    res.status(500).json({ error: "Shopify API error" });
  }
});

// Order lookup example
app.get("/api/order/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const response = await axios.get(`https://${SHOP_DOMAIN}/admin/api/2023-01/orders/${orderId}.json`, {
      headers: {
        "X-Shopify-Access-Token": ADMIN_API_TOKEN
      }
    });

    res.json({ order: response.data.order });
  } catch (error) {
    console.error("Order error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Launch app
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ JUN'S AI Chatbot running on port ${PORT}`);
});
