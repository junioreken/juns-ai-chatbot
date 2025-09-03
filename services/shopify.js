const axios = require('axios');

// Support multiple env var names for compatibility across deployments
const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
const accessToken = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;

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

async function getProductsByTheme(theme, budget = 'no-limit', limit = 60) {
  if (!shopifyDomain || !accessToken) {
    throw new Error('Shopify credentials missing');
  }
  const ADMIN_API_VERSION = '2024-01';
  const base = `https://${shopifyDomain}/admin/api/${ADMIN_API_VERSION}/products.json`;

  const out = [];
  const seen = new Set();
  // Paginate defensively (max 1000 items)
  for (let page = 1; page <= 5; page++) {
    const url = `${base}?limit=250&page=${page}`;
    const { data } = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      timeout: 12000
    });
    const arr = data?.products || [];
    if (!arr.length) break;
    for (const p of arr) {
      if (seen.has(p.handle)) continue;
      seen.add(p.handle);
      out.push(p);
    }
  }

  const themeSlug = String(theme || '').toLowerCase();
  const themeSpaced = themeSlug.replace(/-/g, ' ');

  function normalizeTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(t => String(t).toLowerCase().trim());
    return String(value).toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  }
  function minVariantPrice(p) {
    const vars = Array.isArray(p.variants) ? p.variants : [];
    let min = Number.POSITIVE_INFINITY;
    for (const v of vars) {
      const val = parseFloat(String(v.price || '0').replace(/[^0-9.]/g, '')) || 0;
      if (val && val < min) min = val;
    }
    return min === Number.POSITIVE_INFINITY ? 0 : min;
  }
  function priceOk(price) {
    if (budget === 'under-80') return price <= 80;
    if (budget === 'under-150') return price <= 150;
    return true;
  }

  // Only return products that have the exact theme tag
  const filtered = out.filter(p => {
    const tags = normalizeTags(p.tags);
    const themed = tags.includes(themeSlug) || tags.includes(themeSpaced);
    if (!themed) return false;
    
    // Additional dress-only filter
    const isDress = tags.includes('dress') || tags.includes('gown') || tags.includes('robe') || 
                   /dress|gown|robe/i.test(p.title) || /dress|gown|robe/i.test(p.product_type || '');
    if (!isDress) return false;
    
    const price = minVariantPrice(p);
    return priceOk(price);
  }).slice(0, limit);

  return filtered.map(p => ({
    title: p.title,
    image: (p.image && p.image.src) || (Array.isArray(p.images) && p.images[0] && p.images[0].src) || '',
    price: p.variants && p.variants[0] ? p.variants[0].price : '',
    handle: p.handle,
    url: `/products/${p.handle}`
  }));
}

module.exports = { getLatestOrderByEmail, getProductsByTheme };