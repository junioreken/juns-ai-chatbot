const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Configuration, OpenAIApi } = require('openai');

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// OpenAI Config
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Root endpoint
app.get('/', (req, res) => {
  res.send("🎉 JUN'S AI Chatbot Backend is Running!");
});

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;

    const prompt = `
You are JUN'S AI chatbot. You assist with:
1. Order tracking.
2. Answering product or store questions.
3. Recommending dresses based on user preferences.
4. Escalating to live support if needed.

User: ${userMessage}
AI:`;

    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt,
      max_tokens: 150,
    });

    const reply = completion.data.choices[0]?.text?.trim() || "Sorry, I didn’t understand that.";
    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ reply: "Oops! Something went wrong. Please try again." });
  }
});

// Order tracking endpoint
app.post('/track', async (req, res) => {
  const { orderId, email } = req.body;
  // TODO: Add Shopify API logic here
  res.json({ status: "Order tracking coming soon!" });
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
