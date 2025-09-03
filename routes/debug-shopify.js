const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', async (req, res) => {
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;
  
  console.log('🔍 Debug Shopify connection...');
  console.log('Domain:', shopifyDomain);
  console.log('Token exists:', !!accessToken);
  console.log('Token length:', accessToken ? accessToken.length : 0);
  
  if (!shopifyDomain || !accessToken) {
    return res.json({ 
      error: 'Missing credentials',
      domain: shopifyDomain,
      hasToken: !!accessToken
    });
  }
  
  try {
    const url = `https://${shopifyDomain}/admin/api/2023-07/products.json?limit=1`;
    console.log('🔍 Testing URL:', url);
    
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Success! Got response:', response.status);
    console.log('📦 Products count:', response.data?.products?.length || 0);
    
    res.json({
      success: true,
      status: response.status,
      productCount: response.data?.products?.length || 0,
      firstProduct: response.data?.products?.[0]?.title || 'No products'
    });
    
  } catch (error) {
    console.error('❌ Shopify API Error:', error.message);
    if (error.response) {
      console.error('❌ Status:', error.response.status);
      console.error('❌ Data:', error.response.data);
    }
    
    res.json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

module.exports = router;
