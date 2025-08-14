const express = require("express");
const OpenAI = require("openai");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Setup OpenAI client (Railway will inject OPENAI_API_KEY as env var)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Serve your chatbot UI
app.use(express.static("public"));

// API endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: userMessage }],
    });

    const response = chatCompletion.choices[0]?.message?.content || "No response";
    res.json({ response });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.status(500).json({ response: "Sorry, something went wrong with the AI response." });
  }
});

// Root route fallback
app.get("/", (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
