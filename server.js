const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_API_KEY;

// 🟢 Test server route
app.get("/", (req, res) => {
  res.send("JUN'S AI Chatbot Server is Live 🚀");
});

// 🟢 Product recommendation route
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
                id
                title
                description
                onlineStoreUrl
                featuredImage {
                  url
                }
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
    const products = response.data.data.products.edges.map((edge) => edge.node);
    res.json({ products });
  } catch (error) {
    console.error("Product Recommendation Error:", error.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// 🟢 Order tracking route
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
    const orders = response.data.orders;
    res.json({ orders });
  } catch (error) {
    console.error("Order Tracking Error:", error.message);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 JUN'S AI is live at http://localhost:${PORT}`);
});
