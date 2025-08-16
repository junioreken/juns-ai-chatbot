const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // serve your HTML/CSS/JS

// Environment Variables from Railway
const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const STOREFRONT_TOKEN = process.env.STOREFRONT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// GPT Endpoint
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are JUN'S AI assistant for a fashion Shopify store. Help users choose wedding dresses, track orders, or ask style questions." },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I didn't understand that.";
    res.json({ reply });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ reply: "Oops! Something went wrong on our side." });
  }
});

// Shopify Product Fetch
app.get('/products', async (req, res) => {
  try {
    const response = await fetch(`https://${SHOP_DOMAIN}/admin/api/2023-04/products.json`, {
      headers: {
        "X-Shopify-Access-Token": STOREFRONT_TOKEN,
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();
    res.json(data.products);
  } catch (error) {
    console.error("Product fetch error:", error);
    res.status(500).json({ error: "Unable to fetch products" });
  }
});

// Order tracking (via order ID or email)
app.post('/track', async (req, res) => {
  const { email } = req.body;

  try {
    const response = await fetch(`https://${SHOP_DOMAIN}/admin/api/2023-04/orders.json?email=${email}`, {
      headers: {
        "X-Shopify-Access-Token": STOREFRONT_TOKEN,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    if (data.orders?.length > 0) {
      const order = data.orders[0];
      res.json({ status: order.fulfillment_status || 'unfulfilled', orderNumber: order.name });
    } else {
      res.json({ status: 'not found' });
    }
  } catch (err) {
    console.error("Track error:", err);
    res.status(500).json({ error: "Tracking failed" });
  }
});

// Server running
app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI Chatbot Server is Live on port ${PORT}`);
});
