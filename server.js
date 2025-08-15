import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Correct way to use Railway environment variable (OPENAI_API_KEY)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const suggestions = [
  "Do you want a dress recommendation?",
  "Can I help you find an outfit for a wedding?",
  "Would you like to know your order status?",
  "Looking for something elegant or casual?",
  "Want help with sizing or shipping info?"
];

const greetings = {
  en: "Hi! I'm JUN'S AI 👗 Your fashion assistant. How can I help you today?",
  fr: "Salut ! Je suis JUN'S AI 👗 votre assistante mode. Comment puis-je vous aider aujourd’hui ?"
};

app.post("/chat", async (req, res) => {
  const { message, language, name, email } = req.body;

  if (name && email) {
    console.log("Tracking user:", { name, email });
    // (Optional: send to webhook)
  }

  try {
    let prompt;

    if (message.toLowerCase() === "hi" || message.toLowerCase() === "bonjour") {
      prompt = language === "fr" ? greetings.fr : greetings.en;
    } else {
      prompt = `You are JUN'S AI, a helpful and stylish fashion assistant for a dress brand. Reply in ${language === "fr" ? "French" : "English"}. The user says: "${message}"`;
    }

    const chatResponse = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You're a smart assistant for a dress fashion brand called JUN'S, answering in a friendly tone." },
        { role: "user", content: prompt }
      ],
      model: "gpt-4o",
      temperature: 0.8
    });

    const reply = chatResponse.choices[0].message.content;

    res.json({
      reply,
      suggestions
    });

  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ reply: "Oops, something went wrong. Please try again later." });
  }
});

app.listen(8080, () => {
  console.log("✅ JUN'S AI backend running on port 8080");
});
