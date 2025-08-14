const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// Shopify API setup
const shopifyApi = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-04`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

// Root
app.get("/", (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Get first 5 products
app.get("/products", async (req, res) => {
  try {
    const response = await shopifyApi.get("/products.json?limit=5");
    const products = response.data.products;

    res.json({
      success: true,
      count: products.length,
      products: products.map(p => ({
        title: p.title,
        price: p.variants[0].price,
        image: p.image?.src || "No image",
        handle: p.handle
      }))
    });
  } catch (err) {
    console.error("Error fetching products:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Recommend products based on theme (e.g. 'wedding', 'beach', etc)
app.get("/recommend", async (req, res) => {
  const theme = req.query.theme?.toLowerCase();

  if (!theme) {
    return res.status(400).json({ error: "Theme is required" });
  }

  try {
    const response = await shopifyApi.get("/products.json?limit=10");
    const allProducts = response.data.products;

    const recommended = allProducts.filter(p =>
      p.title.toLowerCase().includes(theme) ||
      (p.tags || []).some(tag => tag.toLowerCase().includes(theme))
    );

    res.json({
      theme,
      count: recommended.length,
      recommended: recommended.map(p => ({
        title: p.title,
        price: p.variants[0].price,
        image: p.image?.src || "",
        handle: p.handle
      }))
    });
  } catch (err) {
    console.error("Error in /recommend:", err.message);
    res.status(500).json({ error: "Could not recommend products" });
  }
});

// Track order by customer email
app.get("/track", async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const response = await shopifyApi.get(`/orders.json?email=${email}`);
    const orders = response.data.orders;

    if (orders.length === 0) {
      return res.status(404).json({ message: "No orders found for this email." });
    }

    const latestOrder = orders[0];

    res.json({
      orderNumber: latestOrder.name,
      financialStatus: latestOrder.financial_status,
      fulfillmentStatus: latestOrder.fulfillment_status,
      trackingNumbers: latestOrder.fulfillments?.flatMap(f => f.tracking_numbers) || [],
      trackingUrls: latestOrder.fulfillments?.flatMap(f => f.tracking_urls) || []
    });
  } catch (err) {
    console.error("Error in /track:", err.message);
    res.status(500).json({ error: "Failed to fetch order status" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
