const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const STOREFRONT_TOKEN = process.env.STOREFRONT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const language = req.body.language || "english";

    // Shopify product data fetching
    const shopifyRes = await fetch(`https://${SHOP_DOMAIN}/admin/api/2023-04/products.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": STOREFRONT_API_TOKEN,
      },
    });

    const productData = await shopifyRes.json();
    const productsText = productData.products
      ?.map((p) => `${p.title}: ${p.body_html?.replace(/<[^>]*>/g, "").slice(0, 200)}`)
      .join("\n") || "No products found.";

    // GPT prompt creation
    const prompt = `
You are JUN'S AI Assistant. You help customers find dresses and answer any questions about the store.
Language: ${language}
User: ${userMessage}
Store data:\n${productsText}
Answer politely, concisely and suggest exact matching dresses if possible.
`;

    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GPT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are JUN'S fashion assistant AI." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const gptData = await gptResponse.json();
    const reply = gptData.choices?.[0]?.message?.content?.trim() || "Désolé, je n'ai pas compris.";

    return res.json({ reply });
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ reply: "Oops, server error!" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI Chatbot Server is Live on port ${PORT}`);
});
