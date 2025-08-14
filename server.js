const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// === OpenAI Configuration ===
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Chatbot Endpoint ===
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are JUN’S AI Chatbot — a helpful assistant for a fashion store. You help with:
          - Answering questions about orders and items
          - Recommending stylish dresses
          - Tracking orders via /track endpoint
          - Escalating to a human when needed`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI Error:", err.message);
    res.status(500).json({ error: "Chatbot failed to respond." });
  }
});

// === Order Tracking Endpoint (/track) ===
app.post("/track", async (req, res) => {
  const { orderId } = req.body;
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
  const ADMIN_API_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    const response = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2023-04/orders.json?name=${orderId}`,
      {
        headers: {
          "X-Shopify-Access-Token": ADMIN_API_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const order = response.data.orders[0];
    if (!order) {
      return res.json({ status: "Order not found." });
    }

    const status = order.fulfillment_status || "Not fulfilled yet";
    const tracking = order.fulfillments?.[0]?.tracking_number || "No tracking available";

    res.json({ status, tracking });
  } catch (err) {
    console.error("Tracking error:", err.message);
    res.status(500).json({ error: "Unable to fetch order status." });
  }
});

// === Start Server ===
app.listen(port, () => {
  console.log(`✅ JUN'S AI Chatbot server running on port ${port}`);
});
