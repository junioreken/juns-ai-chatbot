const express = require("express");
const axios = require("axios");
const router = express.Router();

const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN || "j1ncvb-1b.myshopify.com";
const ADMIN_API_VERSION = "2024-01";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;

async function fetchShopify(endpoint) {
  if (!ADMIN_TOKEN) throw new Error('Shopify admin token is not configured');
  const baseUrl = SHOP_DOMAIN.startsWith('http') ? SHOP_DOMAIN : `https://${SHOP_DOMAIN}`;
  const url = `${baseUrl}/admin/api/${ADMIN_API_VERSION}/${endpoint}`;
  const { data } = await axios.get(url, {
    headers: {
      "X-Shopify-Access-Token": ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
  });
  return data;
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

    // Enhanced GPT prompt for better understanding
    const prompt = `
You are JUN'S AI – an expert and intelligent fashion assistant for the JUN'S dress store. You understand natural language, nuances, and can adapt your responses to provide the most helpful assistance.

ADVANCED CAPABILITIES:
- Complete contextual understanding of customer questions
- Semantic analysis of requests (not just keywords)
- Personalized responses based on customer needs
- Intelligent product suggestions with justifications
- Handling of complex and multi-part questions
- Adaptation to customer's communication style

STORE DATA:

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

RESPONSE INSTRUCTIONS:
1. Analyze the complete question, not just keywords
2. Understand the real intention behind the request
3. Provide detailed and helpful responses (5-8 sentences)
4. Suggest relevant products with specific justifications
5. Mention available discounts when applicable
6. Quote policies accurately when asked
7. Be natural and conversational, not robotic
8. Anticipate possible follow-up questions
9. Adapt your formality level to match the customer's style

Always respond naturally and professionally. Show that you truly understand the customer's question and provide comprehensive, helpful assistance.
`;

    // Send to GPT with enhanced configuration
    const gptRes = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are JUN'S AI, an expert and intelligent fashion assistant for the JUN'S dress store. You understand natural language, nuances, and provide comprehensive, helpful assistance." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 800,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      }
    });

    const reply = gptRes.data.choices?.[0]?.message?.content || "Sorry, I couldn’t find any helpful info.";

    res.json({ reply });
  } catch (error) {
    console.error("GPT Chat Error:", error);
    res.status(500).json({ reply: "Something went wrong while processing your request." });
  }
});

module.exports = router;
