const express = require('express');
const router = express.Router();
const { getProductsByTheme, getProductCacheState } = require('../services/shopify');

router.get('/', async (req, res) => {
  const theme = (req.query.theme || '').toLowerCase();
  const budget = (req.query.budget || 'no-limit').toLowerCase();
  if (!theme) return res.status(400).json({ error: 'Theme is required' });

  // Pagination params
  const limit = Math.min(Math.max(parseInt(req.query.limit||'30',10), 1), 60);
  const offset = Math.max(parseInt(req.query.offset||'0',10), 0);

  try {
    console.log(`🎯 Recommend API called with theme: "${theme}", budget: "${budget}"`);
    const products = await getProductsByTheme(theme, budget, limit, offset);
    console.log(`✅ Returning ${products.length} products`);
    res.json({ products });
  } catch (err) {
    if (err.code === 'CACHE_NOT_READY') {
      console.error('⏳ Recommend API waiting on product cache:', err.message);
      return res.status(503).json({
        error: 'Product catalog is warming up. Please retry shortly.',
        cache: err.cacheState || getProductCacheState()
      });
    }
    console.error('❌ Recommend API error:', err.message);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ error: 'Recommendation failed', details: err.message });
  }
});

module.exports = router;