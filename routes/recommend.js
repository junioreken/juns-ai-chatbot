const express = require('express');
const router = express.Router();
const { getProductsByTheme } = require('../services/shopify');

router.get('/', async (req, res) => {
  const theme = (req.query.theme || '').toLowerCase();
  const budget = (req.query.budget || 'no-limit').toLowerCase();
  if (!theme) return res.status(400).json({ error: 'Theme is required' });

  try {
    const products = await getProductsByTheme(theme, budget, 60);
    res.json({ products });
  } catch (err) {
    console.error('Recommend API error:', err.message);
    res.status(500).json({ error: 'Recommendation failed' });
  }
});

module.exports = router;