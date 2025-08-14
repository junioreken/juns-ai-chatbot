const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Main route for testing
app.get("/", (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Chat route
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful AI assistant for JUN'S fashion brand. Answer questions about store items, orders, and recommend dresses with elegance.",
          },
          { role: "user", content: message },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error.response?.data || error.message);
    res.status(500).json({ error: "Error fetching response" });
  }
});

// Order Tracking Endpoint
app.post("/order-status", async (req, res) => {
  const { orderNumber, email } = req.body;

  // Replace this mock response with Shopify API integration later
  res.json({
    status: "Shipped",
    trackingLink: "https://track.junsfashion.com/123456",
    message: `Order ${orderNumber} is on the way!`,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
