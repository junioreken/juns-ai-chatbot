const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', async (req, res) => {
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;
  
  if (!shopifyDomain || !accessToken) {
    return res.json({ error: 'Missing credentials' });
  }
  
  try {
    const url = `https://${shopifyDomain}/admin/api/2023-07/products.json?limit=10`;
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    const products = response.data?.products || [];
    const productList = products.map(p => ({
      id: p.id,
      title: p.title,
      product_type: p.product_type,
      tags: p.tags,
      handle: p.handle,
      variants: p.variants?.map(v => ({
        price: v.price,
        title: v.title
      }))
    }));
    
    res.json({
      success: true,
      totalProducts: products.length,
      products: productList
    });
    
  } catch (error) {
    res.json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

module.exports = router;
