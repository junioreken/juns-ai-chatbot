const axios = require('axios');

const ADMIN_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-07';
const MAX_PRODUCTS = 1000;
const MAX_METAFIELD_PRODUCTS = 120;
const METAFIELD_BATCH_SIZE = 20;

const RELEVANT_METAFIELD_NAMESPACES = ['custom', 'jun', 'details', 'global', 'theme', 'attributes'];
const RELEVANT_METAFIELD_KEYS = ['theme', 'occasion', 'event', 'style', 'use_case', 'dress_code', 'vibe', 'collection', 'recommended_event'];

const THEME_ALIASES = {
  mariage: 'wedding',
  wedding: 'wedding',
  ceremony: 'wedding',
  'wedding-guest': 'wedding',
  bride: 'wedding',
  soiree: 'night-out',
  'soirée': 'night-out',
  'night-out': 'night-out',
  nightout: 'night-out',
  party: 'cocktail',
  bureau: 'business',
  office: 'business',
  travail: 'business',
  decontracte: 'casual',
  'décontracté': 'casual',
  casual: 'casual',
  cocktail: 'cocktail',
  graduation: 'graduation',
  diplome: 'graduation',
  'remise-des-diplomes': 'graduation',
  prom: 'graduation'
};

const THEME_RULES = {
  wedding: {
    tags: ['wedding', 'bridal', 'bride', 'bridesmaid', 'maid-of-honor', 'nuptial', 'ceremony', 'reception', 'elope'],
    keywords: ['wedding', 'bridal', 'bride', 'maid of honor', 'ceremony', 'reception', 'champagne', 'lace', 'veil', 'train', 'ivory', 'bouquet', 'cathedral', 'ball gown', 'mermaid'],
    productTypes: ['wedding dress', 'bridal gown', 'bridal dress', 'bridesmaid dress'],
    metafields: ['wedding', 'bridal', 'ceremony', 'reception', 'veil', 'nuptial', 'white tie'],
    colorHints: ['ivory', 'white', 'cream', 'champagne', 'blush'],
    preferredCategories: ['dress', 'shoes', 'accessory', 'bag'],
    excludeTags: ['casual', 'streetwear', 'lounge'],
    minScore: 4
  },
  'night-out': {
    tags: ['night-out', 'nightout', 'evening', 'party', 'club', 'date-night', 'glam'],
    keywords: ['night out', 'evening', 'date night', 'party', 'club', 'sparkle', 'sequin', 'sexy', 'cutout', 'bodycon', 'mini', 'after dark', 'glam', 'dinner'],
    productTypes: ['evening dress', 'party dress', 'night-out dress'],
    metafields: ['night out', 'party', 'evening', 'date', 'after dark', 'club'],
    colorHints: ['black', 'ruby', 'metallic', 'gold', 'silver'],
    preferredCategories: ['dress', 'shoes', 'bag', 'accessory'],
    minScore: 3.2
  },
  business: {
    tags: ['business', 'office', 'workwear', 'tailored', 'professional', 'meeting'],
    keywords: ['business', 'office', 'workwear', 'professional', 'tailored', 'structured', 'boardroom', 'meeting', 'presentation', 'client call', 'polished', 'power suit'],
    productTypes: ['work dress', 'sheath dress', 'suit', 'blazer', 'shift dress'],
    metafields: ['office', 'work', 'meeting', 'professional', 'tailored'],
    colorHints: ['navy', 'black', 'taupe', 'camel', 'charcoal'],
    preferredCategories: ['dress', 'jacket', 'suit', 'skirt', 'pants'],
    excludeTags: ['sequin', 'sparkle', 'bridal'],
    minScore: 3
  },
  casual: {
    tags: ['casual', 'day', 'everyday', 'weekend', 'brunch', 'relaxed', 'daytime'],
    keywords: ['casual', 'weekend', 'brunch', 'day party', 'daytime', 'relaxed', 'flowy', 'linen', 'cotton', 'easy', 'effortless'],
    productTypes: ['day dress', 'sundress', 'shirt dress'],
    metafields: ['casual', 'day', 'brunch', 'weekend', 'everyday'],
    colorHints: ['sage', 'pastel', 'floral', 'print', 'gingham'],
    preferredCategories: ['dress', 'skirt', 'jumpsuit', 'accessory'],
    minScore: 2.4
  },
  cocktail: {
    tags: ['cocktail', 'soirée', 'semi-formal', 'evening'],
    keywords: ['cocktail', 'soirée', 'semi formal', 'martini', 'reception', 'event', 'sparkle', 'satin', 'glam', 'after party'],
    productTypes: ['cocktail dress', 'evening dress'],
    metafields: ['cocktail', 'soirée', 'semi formal', 'event'],
    colorHints: ['emerald', 'ruby', 'midnight', 'satin', 'silk'],
    preferredCategories: ['dress', 'shoes', 'bag', 'accessory'],
    minScore: 3.2
  },
  graduation: {
    tags: ['graduation', 'commencement', 'convocation', 'ceremony', 'award', 'prom'],
    keywords: ['graduation', 'commencement', 'convocation', 'ceremony', 'celebration', 'valedictorian', 'prom', 'cap and gown'],
    productTypes: ['graduation dress', 'occasion dress'],
    metafields: ['graduation', 'celebration', 'ceremony', 'prom'],
    colorHints: ['white', 'navy', 'pastel', 'royal'],
    preferredCategories: ['dress', 'shoes', 'bag'],
    minScore: 3
  },
  default: {
    tags: [],
    keywords: [],
    metafields: [],
    preferredCategories: ['dress', 'shoes', 'bag', 'accessory'],
    minScore: 1.5
  }
};

const ACCESSORY_CATEGORIES = new Set(['bag', 'accessory', 'shoes', 'hair', 'jewelry']);
const MIN_ACCESSORY_RESULTS = Number(process.env.RECOMMEND_MIN_ACCESSORIES || 6);

async function fetchAllProducts(baseUrl, headers, cap = MAX_PRODUCTS) {
  const results = [];
  let url = baseUrl;
  let guard = 0;
  while (url && results.length < cap && guard++ < 20) {
    const res = await axios.get(url, { headers, timeout: 15000 });
    const arr = res.data?.products || [];
    for (const p of arr) {
      results.push(p);
    }
    const link = res.headers && (res.headers.link || res.headers.Link);
    if (link && /rel="next"/.test(link)) {
      const m = link.match(/<([^>]+)>; rel="next"/);
      url = m ? m[1] : null;
    } else {
      url = null;
    }
  }
  return results;
}

function chunk(arr, size) {
  const buckets = [];
  for (let i = 0; i < arr.length; i += size) {
    buckets.push(arr.slice(i, i + size));
  }
  return buckets;
}

function normalizeThemeSlug(theme) {
  const slug = String(theme || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return THEME_ALIASES[slug] || slug;
}

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((t) => String(t).toLowerCase().trim());
  return String(value)
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ');
}

function getPriceSummary(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  let min = Number.POSITIVE_INFINITY;
  let raw = '';
  for (const v of variants) {
    const val = parseFloat(String(v.price || '0').replace(/[^0-9.]/g, '')) || 0;
    if (!val) continue;
    if (val < min) {
      min = val;
      raw = v.price;
    }
  }
  if (min === Number.POSITIVE_INFINITY) {
    return { numeric: 0, raw: raw || '' };
  }
  return { numeric: min, raw: raw || String(min) };
}

function priceMatchesBudget(price, budget) {
  if (budget === 'under-80') return price <= 80;
  if (budget === 'under-150') return price <= 150;
  return true;
}

function determineCategory({ tags, title, productType, body }) {
  const hay = `${title} ${productType} ${body} ${tags.join(' ')}`;
  if (/\b(gown|dress|robe)\b/.test(hay)) return 'dress';
  if (/\b(skirt)\b/.test(hay)) return 'skirt';
  if (/\b(jumpsuit|romper)\b/.test(hay)) return 'jumpsuit';
  if (/\b(blazer|jacket|coat|trenchcoat)\b/.test(hay)) return 'jacket';
  if (/\b(suit|tailleur)\b/.test(hay)) return 'suit';
  if (/\b(pant|trouser)\b/.test(hay)) return 'pants';
  if (/\b(shoe|heel|boot|sandal)\b/.test(hay)) return 'shoes';
  if (/\b(bag|clutch|purse|handbag)\b/.test(hay)) return 'bag';
  if (/\b(accessor|earring|necklace|bracelet|belt|hair|jewel)\b/.test(hay)) return 'accessory';
  return 'other';
}

function getCategoryThreshold(theme, category) {
  const rule = THEME_RULES[theme] || THEME_RULES.default;
  const base = rule.minScore || 1.5;
  if (!category || category === 'dress' || category === 'jumpsuit' || category === 'skirt') {
    return base;
  }
  if (category === 'suit' || category === 'jacket' || category === 'pants') {
    return Math.max(1.2, base - 0.6);
  }
  if (category === 'shoes') {
    return Math.max(1.2, base - 1);
  }
  if (category === 'bag' || category === 'accessory') {
    return Math.max(1.0, base - 1.2);
  }
  return Math.max(1.1, base - 0.8);
}

function isAccessoryCategory(category) {
  return ACCESSORY_CATEGORIES.has(category);
}


function buildNormalizedProduct(product, metafieldLookup) {
  const tags = normalizeTags(product.tags);
  const priceSummary = getPriceSummary(product);
  const title = String(product.title || '').toLowerCase();
  const productType = String(product.product_type || '').toLowerCase();
  const vendor = String(product.vendor || '').toLowerCase();
  const body = stripHtml(product.body_html || '').toLowerCase();
  const productId = product.admin_graphql_api_id || (product.id ? `gid://shopify/Product/${product.id}` : null);
  const metaValues = (productId && metafieldLookup[productId]) || [];
  const metaText = Array.isArray(metaValues) ? metaValues.join(' ') : '';
  const searchText = [title, productType, vendor, body, metaText].filter(Boolean).join(' ');
  const category = determineCategory({ tags, title, productType, body });

  return {
    id: productId,
    product,
    tags,
    title,
    productType,
    vendor,
    body,
    metaText,
    searchText,
    category,
    priceNumeric: priceSummary.numeric,
    priceRaw: priceSummary.raw,
    handle: product.handle || ''
  };
}

function countMatches(list = [], haystack = '') {
  if (!Array.isArray(list) || !list.length || !haystack) return 0;
  let hits = 0;
  for (const raw of list) {
    const needle = String(raw || '').toLowerCase();
    if (!needle) continue;
    if (haystack.includes(needle)) hits += 1;
  }
  return hits;
}

function scoreProductForTheme(theme, normalized) {
  const rule = THEME_RULES[theme] || THEME_RULES.default;
  if (!rule) return 0;
  let score = 0;

  const tagBlob = normalized.tags.join(' ');

  score += countMatches(rule.tags, tagBlob) * 4;
  score += countMatches(rule.keywords, normalized.searchText) * 2;
  score += countMatches(rule.productTypes, `${normalized.productType} ${normalized.title}`) * 3;
  score += countMatches(rule.metafields, normalized.metaText) * 4;
  score += countMatches(rule.colorHints, normalized.searchText) * 0.8;

  if (rule.preferredCategories && rule.preferredCategories.length) {
    const idx = rule.preferredCategories.indexOf(normalized.category);
    if (idx !== -1) {
      score += (rule.preferredCategories.length - idx) * 1.2;
    }
  }

  if (rule.excludeTags && rule.excludeTags.some((tag) => normalized.tags.includes(tag))) {
    score -= 3.5;
  }
  if (rule.excludeKeywords && rule.excludeKeywords.some((word) => normalized.searchText.includes(word))) {
    score -= 2.5;
  }

  return Math.max(0, Number(score.toFixed(2)));
}

async function fetchProductMetafields(products) {
  if (!shopifyDomain || !accessToken) return {};
  const ids = products
    .map((p) => p.admin_graphql_api_id)
    .filter(Boolean)
    .slice(0, MAX_METAFIELD_PRODUCTS);
  if (!ids.length) return {};

  const url = `https://${shopifyDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };
  const lookup = {};

  const batches = chunk(ids, METAFIELD_BATCH_SIZE);
  for (const group of batches) {
    const query = `
      query getMetafields($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            metafields(first: 20) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
        }
      }
    `;
    try {
      const response = await axios.post(
        url,
        { query, variables: { ids: group } },
        { headers, timeout: 15000 }
      );
      const nodes = response.data?.data?.nodes || [];
      for (const node of nodes) {
        if (!node || !node.metafields) continue;
        const values = [];
        for (const edge of node.metafields.edges || []) {
          const mf = edge?.node;
          if (!mf || !mf.value) continue;
          const ns = String(mf.namespace || '').toLowerCase();
          const key = String(mf.key || '').toLowerCase();
          if (
            !RELEVANT_METAFIELD_NAMESPACES.includes(ns) &&
            !RELEVANT_METAFIELD_KEYS.includes(key)
          ) {
            continue;
          }
          values.push(String(mf.value).toLowerCase());
        }
        if (values.length) {
          lookup[node.id] = values;
        }
      }
    } catch (error) {
      console.warn('[shopify] Failed to fetch metafields batch:', error.message);
      return lookup;
    }
  }

  return lookup;
}

function formatProduct(normalized, score) {
  const product = normalized.product;
  return {
    title: product.title,
    image:
      (product.image && product.image.src) ||
      (Array.isArray(product.images) && product.images[0] && product.images[0].src) ||
      '',
    price: normalized.priceRaw,
    handle: product.handle,
    url: `/products/${product.handle}`,
    tags: normalized.tags,
    product_type: product.product_type || '',
    category: normalized.category,
    match_score: Number(score.toFixed(2))
  };
}

function fallbackByExactTag(products, themeSlug, budget, offset, limit) {
  const themeSpaced = themeSlug.replace(/-/g, ' ');
  const exactThemeTags = [themeSlug, themeSpaced].filter(Boolean);
  const matches = products.filter((product) => {
    const tags = normalizeTags(product.tags);
    const themed = exactThemeTags.some((tag) => tags.includes(tag));
    if (!themed) return false;
    const price = getPriceSummary(product).numeric;
    return priceMatchesBudget(price, budget);
  });

  const start = Math.max(parseInt(offset || 0, 10), 0);
  const windowed = matches.slice(start, start + limit);
  return windowed.map((product) => {
    const normalized = buildNormalizedProduct(product, {});
    return formatProduct(normalized, 0);
  });
}

// Support multiple env var names for compatibility across deployments
let shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_DOMAIN;
const accessToken =
  process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_API_TOKEN || process.env.SHOPIFY_ADMIN_API;

// Clean up domain format - remove https:// and trailing slashes
if (shopifyDomain) {
  shopifyDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  console.log('🔧 Cleaned Shopify domain:', shopifyDomain);
}

async function getLatestOrderByEmail(email) {
  const url = `https://${shopifyDomain}/admin/api/${ADMIN_API_VERSION}/orders.json?email=${email}&status=any`;
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

    const normalizedTheme = normalizeThemeSlug(theme);
    const base = `https://${shopifyDomain}/admin/api/${ADMIN_API_VERSION}/products.json?limit=250`;
    const headers = { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' };

    console.log(`🔍 Fetching Shopify catalog for theme "${normalizedTheme}"...`);
    const products = await fetchAllProducts(base, headers, MAX_PRODUCTS);
    console.log(`📦 Aggregated ${products.length} products from Shopify`);

    const metafieldLookup = await fetchProductMetafields(products);
    if (Object.keys(metafieldLookup).length) {
      console.log(
        `📎 Enriched ${Object.keys(metafieldLookup).length} products with metafield context`
      );
    }

    const normalizedProducts = products.map((product) =>
      buildNormalizedProduct(product, metafieldLookup)
    );
    const minScore = (THEME_RULES[normalizedTheme] && THEME_RULES[normalizedTheme].minScore) || 1.5;

    const scored = normalizedProducts
      .map((item) => ({
        normalized: item,
        score: scoreProductForTheme(normalizedTheme, item)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.normalized.priceNumeric - b.normalized.priceNumeric;
      });

    const seenHandles = new Set();
    const thresholded = [];
    for (const entry of scored) {
      const handle = entry.normalized.handle;
      if (!handle || seenHandles.has(handle)) continue;
      if (!priceMatchesBudget(entry.normalized.priceNumeric, budget)) continue;
      const categoryThreshold = Math.max(
        minScore,
        getCategoryThreshold(normalizedTheme, entry.normalized.category)
      );
      if (entry.score >= categoryThreshold) {
        thresholded.push(entry);
        seenHandles.add(handle);
      }
    }

    let accessoryCount = thresholded.reduce(
      (sum, entry) => sum + (isAccessoryCategory(entry.normalized.category) ? 1 : 0),
      0
    );
    if (accessoryCount < MIN_ACCESSORY_RESULTS) {
      const accessoryThreshold = Math.max(1.1, minScore * 0.55);
      for (const entry of scored) {
        if (thresholded.length >= MAX_PRODUCTS) break;
        const handle = entry.normalized.handle;
        if (!handle || seenHandles.has(handle)) continue;
        if (!isAccessoryCategory(entry.normalized.category)) continue;
        if (!priceMatchesBudget(entry.normalized.priceNumeric, budget)) continue;
        if (entry.score < accessoryThreshold) continue;
        thresholded.push(entry);
        seenHandles.add(handle);
        accessoryCount += 1;
        if (accessoryCount >= MIN_ACCESSORY_RESULTS) break;
      }
    }

    const sortedSelected = thresholded.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.normalized.priceNumeric - b.normalized.priceNumeric;
    });

    const start = Math.max(parseInt(offset || 0, 10), 0);
    const windowed = sortedSelected.slice(start, start + limit);
    console.log(
      `📊 Theme engine: ${sortedSelected.length} matches (${windowed.length} returned, ${accessoryCount} accessories) for "${normalizedTheme}" under budget "${budget}"`
    );

    if (windowed.length) {
      return windowed.map((entry) => formatProduct(entry.normalized, entry.score));
    }

    console.log(
      `⚠️ Theme-specific scorer found no matches for "${normalizedTheme}". Falling back to exact tag search.`
    );
    return fallbackByExactTag(products, normalizedTheme, budget, offset, limit);

  } catch (error) {
    console.error('❌ getProductsByTheme error:', error.message);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
}

module.exports = { getLatestOrderByEmail, getProductsByTheme };
