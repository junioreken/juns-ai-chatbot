const express = require('express');
const router = express.Router();
const { getLatestOrderByEmail } = require('../services/shopify');

router.get('/:email', async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const order = await getLatestOrderByEmail(email);
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Order lookup failed' });
  }
});

module.exports = router;