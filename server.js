const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_API_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => res.send("JUN'S AI Chatbot Server is Live 🚀"));

app.post('/recommend', async (req, res) => {
  const { theme } = req.body;

  const query = {
    query: `
      {
        products(first: 4, query: "tag:${theme}") {
          edges {
            node {
              title
              handle
              images(first: 1) { edges { node { url } } }
            }
          }
        }
      }
    `
  };

  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/api/2023-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify(query)
  });

  const json = await response.json();
  const products = json.data.products.edges.map(edge => edge.node);
  res.json(products);
});

app.post('/track', async (req, res) => {
  const { email } = req.body;
  // Integrate with Shopify Order API or Klaviyo/Lifetimely if using.
  res.json({ status: "success", message: `Tracking info for ${email} will be sent via email.` });
});

app.listen(process.env.PORT || 8080, () => {
  console.log("✅ JUN'S AI Chatbot is live");
});
