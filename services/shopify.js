const axios = require('axios');

const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;

async function getLatestOrderByEmail(email) {
  const url = `https://${shopifyDomain}/admin/api/2023-07/orders.json?email=${email}&status=any`;
  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });
  return response.data.orders[0];
}

async function getProductsByTheme(theme) {
  const url = `https://${shopifyDomain}/admin/api/2023-07/products.json`;
  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  const filtered = response.data.products.filter(p =>
    p.tags.some(tag => tag.toLowerCase().includes(theme.toLowerCase()))
  );

  return filtered.map(p => ({
    title: p.title,
    image: p.image?.src,
    price: p.variants[0]?.price,
    url: `/products/${p.handle}`
  }));
}

module.exports = { getLatestOrderByEmail, getProductsByTheme };