const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔁 Serve static frontend files like chatbot-script.js and chatbot-style.css
app.use(express.static(path.join(__dirname, "public"))); // <-- folder where the files are

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_API_KEY;

// 🟢 Root route shows basic status or you can serve HTML later
app.get("/", (req, res) => {
  res.send("JUN'S AI Chatbot Server is Live 🚀");
});

// 🟢 Shopify product recommendation route
app.post("/recommendation", async (req, res) => {
  const { theme } = req.body;
  try {
    const response = await axios.post(
      `https://${SHOPIFY_DOMAIN}/api/2023-04/graphql.json`,
      {
        query: `
        {
          products(first: 3, query: "${theme}") {
            edges {
              node {
                title
                onlineStoreUrl
                featuredImage { url }
              }
            }
          }
        }
        `,
      },
      {
        headers: {
          "X-Shopify-Storefront-Access-Token": STOREFRONT_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    const products = response.data.data.products.edges.map(e => e.node);
    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

// 🟢 Shopify order tracking
app.post("/track-order", async (req, res) => {
  const { email } = req.body;
  try {
    const response = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2023-04/orders.json?email=${email}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_KEY,
        },
      }
    );
    res.json({ orders: response.data.orders });
  } catch (error) {
    res.status(500).json({ error: "Error fetching orders" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI Chatbot running on port ${PORT}`);
});
