/*const express = require('express');
const router = express.Router();
const { askOpenAI } = require('../services/openai');

router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const reply = await askOpenAI(message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'AI Error' });
  }
});

module.exports = router;*/

const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const SHOP_DOMAIN = "j1ncvb-1b.myshopify.com";
const ADMIN_API_VERSION = "2024-01";

async function fetchShopify(endpoint) {
  const url = `https://${SHOP_DOMAIN}/admin/api/${ADMIN_API_VERSION}/${endpoint}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API,
      "Content-Type": "application/json",
    },
  });
  return res.json();
}

router.post("/chat", async (req, res) => {
  const { message, name, email, lang } = req.body;

  try {
    // Fetch all required data
    const [productsData, policiesData, pagesData, priceRulesData] = await Promise.all([
      fetchShopify("products.json?limit=10"),
      fetchShopify("policies.json"),
      fetchShopify("pages.json"),
      fetchShopify("price_rules.json"),
    ]);

    const products = productsData.products || [];
    const policies = policiesData || {};
    const pages = pagesData.pages || [];

    // Format products
    const formattedProducts = products.map(p => {
      const price = p.variants?.[0]?.price || "N/A";
      const compare = p.variants?.[0]?.compare_at_price;
      const discountNote = compare ? ` (was $${compare})` : "";
      return `• ${p.title} – $${price}${discountNote} – Tags: [${p.tags}]
${p.body_html.replace(/<[^>]+>/g, "")}
🔗 https://${SHOP_DOMAIN}/products/${p.handle}`;
    }).join("\n\n");

    // Format policies
    const formattedPolicies = [
      policies.privacy_policy ? `🔒 Privacy: ${policies.privacy_policy.body.replace(/<[^>]+>/g, "").slice(0, 300)}...` : "",
      policies.refund_policy ? `💸 Refund: ${policies.refund_policy.body.replace(/<[^>]+>/g, "").slice(0, 300)}...` : "",
      policies.shipping_policy ? `🚚 Shipping: ${policies.shipping_policy.body.replace(/<[^>]+>/g, "").slice(0, 300)}...` : "",
    ].filter(Boolean).join("\n");

    // Format pages
    const formattedPages = pages.map(p => `📄 ${p.title}: ${p.body_html.replace(/<[^>]+>/g, "").slice(0, 300)}...`).join("\n");

    // Format discounts
    const discounts = priceRulesData.price_rules || [];
    const formattedDiscounts = discounts.map(d => {
      return `• ${d.title} – ${d.value_type === "percentage" ? `${d.value.replace('-', '')}% off` : `$${d.value} off`} – Code: ${d.title}`;
    }).join("\n");

    // Final GPT prompt
    const prompt = `
You are JUN’S AI – a personal stylist and assistant for the Shopify store https://${SHOP_DOMAIN}.

Here is the store data you MUST use when replying:

🛍️ Products:
${formattedProducts}

🎁 Discounts:
${formattedDiscounts || "No active discounts."}

📃 Policies:
${formattedPolicies}

📘 Pages:
${formattedPages}

Customer info:
- Name: ${name}
- Email: ${email}
- Language: ${lang === "fr" ? "French" : "English"}

Customer's message: "${message}"

Always respond naturally. Suggest specific products with links if relevant. Mention real discounts if available. Quote policies if asked. If the user asks about weddings, date night, or elegant themes, suggest relevant tagged products.
`;

    // Send to GPT
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are JUN’S AI, a helpful assistant for an online fashion store." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const gptData = await gptRes.json();
    const reply = gptData.choices?.[0]?.message?.content || "Sorry, I couldn’t find any helpful info.";

    res.json({ reply });
  } catch (error) {
    console.error("GPT Chat Error:", error);
    res.status(500).json({ reply: "Something went wrong while processing your request." });
  }
});

module.exports = router;
