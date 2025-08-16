import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const SHOPIFY_DOMAIN = 'https://j1ncvb-1b.myshopify.com';
const SHOPIFY_TOKEN = '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';

app.get('/', (req, res) => {
  res.send("JUN'S AI Chatbot Server is Live 🚀");
});

app.post('/chat', async (req, res) => {
  const { message, theme, language } = req.body;

  try {
    // Fetch products based on the preferred theme
    const response = await fetch(`${SHOPIFY_DOMAIN}/admin/api/2023-01/products.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    const products = data.products || [];

    // Filter by title including theme
    const filtered = products.filter(p =>
      p.title.toLowerCase().includes(theme?.toLowerCase() || 'wedding')
    );

    const sample = filtered.slice(0, 3).map(p => `${p.title}: ${SHOPIFY_DOMAIN}/products/${p.handle}`).join('\n');

    // Reply using basic AI logic (can be replaced by OpenAI if desired)
    const reply = `Here are some lovely ${theme || 'wedding'} dresses:\n\n${sample || 'No themed products found yet. Please check back soon!'}`;

    res.json({ reply });
  } catch (err) {
    console.error('Error in /chat:', err);
    res.status(500).json({ reply: 'Sorry, something went wrong. Please try again later.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JUN'S AI Server running on port ${PORT}`);
});
