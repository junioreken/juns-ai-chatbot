const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const theme = (req.query.theme || '').toLowerCase();
  const budget = (req.query.budget || 'no-limit').toLowerCase();
  
  console.log(`🔍 Test endpoint called with theme: "${theme}", budget: "${budget}"`);
  
  if (!theme) {
    return res.status(400).json({ error: 'Theme is required' });
  }

  // Mock products for testing
  const mockProducts = [
    {
      id: 1,
      title: `Beautiful ${theme} Dress`,
      price: 120,
      image: 'https://via.placeholder.com/600x800/FFB6C1/FFFFFF?text=Wedding+Dress',
      url: '/products/test-dress-1'
    },
    {
      id: 2,
      title: `Elegant ${theme} Gown`,
      price: 180,
      image: 'https://via.placeholder.com/600x800/DDA0DD/FFFFFF?text=Cocktail+Dress',
      url: '/products/test-dress-2'
    },
    {
      id: 3,
      title: `Stylish ${theme} Outfit`,
      price: 95,
      image: 'https://via.placeholder.com/600x800/98FB98/FFFFFF?text=Casual+Dress',
      url: '/products/test-dress-3'
    }
  ];

  console.log(`✅ Returning ${mockProducts.length} mock products for theme: ${theme}`);
  
  res.json({ 
    products: mockProducts,
    theme: theme,
    budget: budget,
    debug: true
  });
});

module.exports = router;
