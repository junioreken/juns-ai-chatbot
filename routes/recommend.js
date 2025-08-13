const express = require('express');
const router = express.Router();
const { getProductsByTheme } = require('../services/shopify');

router.get('/', async (req, res) => {
  const theme = req.query.theme;
  if (!theme) return res.status(400).json({ error: 'Theme is required' });

  try {
    const products = await getProductsByTheme(theme);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Recommendation failed' });
  }
});

module.exports = router;