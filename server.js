import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Read Shopify variables from Railway environment
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // e.g. j1ncvb-1b.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // e.g. shpat_...

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send("JUN'S AI Chatbot Server is Live 🚀");
});

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    let shopifyData = '';

    // Only fetch Shopify product data if the question needs it
    if (message.toLowerCase().includes("recommend") || message.toLowerCase().includes("product")) {
      const url = `https://${SHOPIFY_DOMAIN}/admin/api/2023-04/products.json`;

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      // Get 3 products only
      const top3 = data.products.slice(0, 3);
      shopifyData = top3.map(p => `• ${p.title}: ${p.body_html.replace(/<[^>]+>/g, '').slice(0, 100)}...`).join('\n');
    }

    // Send message to OpenAI API (use your own logic/backend proxy if needed)
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, // <- Define in Railway too
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are JUN’S AI fashion assistant. You help customers with product recommendations, order tracking, and support. If Shopify data is available, include it below.`
          },
          {
            role: "user",
            content: `${message}\n\n${shopifyData}`
          }
        ],
        temperature: 0.7
      })
    });

    const result = await openaiResponse.json();
    const reply = result.choices?.[0]?.message?.content || "Sorry, I couldn’t understand that.";

    res.json({ reply });

  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ reply: "Oops! Something went wrong on our side." });
  }
});

app.listen(PORT, () => {
  console.log(`🟢 JUN’S Chatbot backend running on port ${PORT}`);
});
