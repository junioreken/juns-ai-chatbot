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
    const gptRes = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are JUN’S AI, a helpful assistant for an online fashion store." },
        { role: "user", content: prompt },
      ],
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
