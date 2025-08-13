const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic root route to check if server is alive
app.get("/", (req, res) => {
  res.send("🚀 JUN’S AI Chatbot Server is running!");
});

// Your AI or Shopify routes here
// Example placeholder:
app.post("/ask-ai", async (req, res) => {
  res.json({ message: "AI response would go here." });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
