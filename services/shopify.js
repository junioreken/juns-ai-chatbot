const axios = require('axios');

async function fetchAllProducts(baseUrl, headers, cap=1000){
  const results=[];
  let url=baseUrl;
  let guard=0;
  while(url && results.length < cap && guard++ < 20){
    const res = await axios.get(url, { headers, timeout: 15000 });
    const arr = res.data?.products || [];
    for(const p of arr){ results.push(p); }
    const link = res.headers && (res.headers.link || res.headers.Link);
    if(link && /rel="next"/.test(link)){
      const m = link.match(/<([^>]+)>; rel="next"/);
      url = m ? m[1] : null;
    } else {
      url = null;
    }
  }
  return results;
}

// Support multiple env var names for compatibility across deployments
let shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
const accessToken = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;

// Clean up domain format - remove https:// and trailing slashes
if (shopifyDomain) {
  shopifyDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  console.log('🔧 Cleaned Shopify domain:', shopifyDomain);
}

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

async function getProductsByTheme(theme, budget = 'no-limit', limit = 60, offset = 0) {
  try {
    if (!shopifyDomain || !accessToken) {
      throw new Error('Shopify credentials missing');
    }
  const ADMIN_API_VERSION = '2023-07';
  const base = `https://${shopifyDomain}/admin/api/${ADMIN_API_VERSION}/products.json`;

  // Fetch products from Shopify (paginated)
  const out = [];
  const seen = new Set();
  const ADMIN_LIMIT = 250;
  const firstUrl = `${base}?limit=${ADMIN_LIMIT}`;
  try {
    console.log(`🔍 Fetching products (paginated) from: ${firstUrl}`);
    const headers = { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' };
    const arr = await fetchAllProducts(firstUrl, headers, 1000);
    console.log(`📦 Aggregated ${arr.length} products from Shopify`);
    for (const p of arr) {
      if (seen.has(p.handle)) continue;
      seen.add(p.handle);
      out.push(p);
    }
  } catch (error) {
    console.error(`❌ Error fetching products: `, error.message);
    if (error.response) {
      console.error(`❌ Response status: ${error.response.status}`);
      console.error(`❌ Response data: `, error.response.data);
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

  console.log(`🔍 Filtering ${out.length} products for exact theme tag: "${themeSlug}" (spaced: "${themeSpaced}")`);
  
  // Use exact theme tag matching - no synonyms
  const exactThemeTags = [themeSlug, themeSpaced];
  console.log(`🔍 Looking for exact theme tags: [${exactThemeTags.join(', ')}]`);
  
  const filtered = out.filter(p => {
    const tags = normalizeTags(p.tags);
    const themed = exactThemeTags.some(exactTag => tags.includes(exactTag));
    if (!themed) return false;
    const price = minVariantPrice(p);
    return priceOk(price);
  });

  // Window for pagination (offset+limit) while keeping both dresses and accessories)
  const start = Math.max(parseInt(offset||0,10), 0);
  const windowed = filtered.slice(start, start + limit);
  console.log(`📊 Final result: ${windowed.length} products match exact theme tag "${themeSlug}" and budget "${budget}"`);

  // If no products match, return some products for debugging (remove this later)
  if (filtered.length === 0) {
    console.log(`⚠️ No products have exact theme tag "${themeSlug}". Showing first 5 products for debugging:`);
    const debugProducts = out.slice(0, 5).map(p => {
      const tags = normalizeTags(p.tags);
      console.log(`🔍 ${p.title} - Tags: [${tags.join(', ')}]`);
      return {
        title: p.title,
        image: (p.image && p.image.src) || (Array.isArray(p.images) && p.images[0] && p.images[0].src) || '',
        price: p.variants && p.variants[0] ? p.variants[0].price : '',
        handle: p.handle,
        url: `/products/${p.handle}`,
        tags: tags,
        product_type: p.product_type || ''
      };
    });
    return debugProducts;
  }

  return windowed.map(p => ({
    title: p.title,
    image: (p.image && p.image.src) || (Array.isArray(p.images) && p.images[0] && p.images[0].src) || '',
    price: p.variants && p.variants[0] ? p.variants[0].price : '',
    handle: p.handle,
    url: `/products/${p.handle}`,
    tags: normalizeTags(p.tags),
    product_type: p.product_type || ''
  }));
  
  } catch (error) {
    console.error('❌ getProductsByTheme error:', error.message);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
}

module.exports = { getLatestOrderByEmail, getProductsByTheme };