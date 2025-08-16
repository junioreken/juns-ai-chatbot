const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const { OPENAI_API_KEY, SHOPIFY_API_KEY, SHOPIFY_STORE_DOMAIN } = process.env;

app.post('/api/ask', async (req, res) => {
  const { message, context } = req.body;

  try {
    // Shopify product fetch (optional: enhance with search/filter)
    const productRes = await axios.post(
      `https://${SHOPIFY_STORE_DOMAIN}/api/2023-07/graphql.json`,
      {
        query: `
          {
            products(first: 10) {
              edges {
                node {
                  title
                  handle
                  description
                }
              }
            }
          }
        `
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_API_KEY,
        },
      }
    );

    const products = productRes.data.data.products.edges.map(e => e.node);

    const chatPrompt = `
You are JUN’S AI Assistant on a Shopify fashion store.
Current message: "${message}"
Store products: ${products.map(p => `${p.title}: ${p.description}`).join('\n')}
Respond in a helpful, iMessage-style, elegant tone. If the user asks for a product or theme, suggest one of the real products by title, and provide a link to: https://${SHOPIFY_STORE_DOMAIN}/products/{product-handle}.
`;

    const aiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: chatPrompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ reply: aiRes.data.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).send('AI or Shopify error');
  }
});

app.post('/api/save-user', async (req, res) => {
  const { name, email } = req.body;
  try {
    await axios.post('https://your-webhook-url.com', { name, email });
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.use(express.static('public'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 JUN’S AI is live at http://localhost:${PORT}`);
});
