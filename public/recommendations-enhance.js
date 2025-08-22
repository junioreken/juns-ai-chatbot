/* Enhance recommendations logic without altering layout */
(async function(){
  if (!/\/pages\/event-dress-recommendations/i.test(location.pathname)) return;

  const params = new URLSearchParams(location.search);
  const theme = (params.get('theme') || '').toLowerCase();
  const budget = (params.get('budget') || 'no-limit').toLowerCase();

  const budgetLabel = budget==='under-80' ? 'Under $80' : budget==='under-150' ? 'Under $150' : 'No limit';
  const labelEl = document.getElementById('juns-theme-label');
  if (labelEl) labelEl.textContent = `Theme: "${theme}" · Budget: ${budgetLabel}`;

  // STRICT matching: only products explicitly tagged with the exact theme slug
  // Example: if theme=wedding, product must have the tag 'wedding' (case-insensitive)
  const decodedTheme = decodeURIComponent(theme || '');
  const tags = Array.from(new Set([
    decodedTheme,
    decodedTheme.replace(/-/g,' ')
  ].filter(Boolean)));

  const grid = document.getElementById('juns-products-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="padding:12px;color:#666">Loading recommendations…</div>';

  async function fetchPage(url, attempt = 1) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'accept': 'application/json',
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (!res.ok) throw new Error('bad status');
      return await res.json();
    } catch (_) {
      if (attempt >= 3) return { products: [] };
      await new Promise(r => setTimeout(r, 200 * attempt));
      return fetchPage(url, attempt + 1);
    }
  }

  async function fetchAllProducts() {
    const base = '/collections/all/products.json';
    let page = 1; const out = [];
    const seen = new Set();
    while (true) {
      const url = `${base}?page=${page}&limit=250`;
      const data = await fetchPage(url);
      const arr = data.products || data || [];
      if (!arr.length) break;
      for (const p of arr) {
        if (!seen.has(p.handle)) { seen.add(p.handle); out.push(p); }
      }
      page += 1; if (page > 10) break;
    }
    return out;
  }

  function normKey(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

  function getLowestVariantPrice(p) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (!variants.length) return 0;
    let lowest = Number.POSITIVE_INFINITY;
    for (const v of variants) {
      const val = typeof v.price === 'string' ? parseFloat(v.price.replace(/[^0-9.]/g,'')) : Number(v.price || 0);
      if (!Number.isNaN(val) && val < lowest) lowest = val;
    }
    return lowest === Number.POSITIVE_INFINITY ? 0 : lowest;
  }

  function priceOk(p) {
    if (budget==='no-limit') return true;
    const price = getLowestVariantPrice(p);
    if (budget==='under-80') return price <= 80;
    if (budget==='under-150') return price <= 150;
    return true;
  }

  function normalizeTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(t => String(t).toLowerCase().trim());
    return String(value).toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  }

  function sanitize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[_–—-]+/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function themeOk(p) {
    // STRICT by tag, but tolerate slug vs spaced and punctuation
    const productTags = normalizeTags(p.tags);
    const prodKeys = new Set(productTags.map(normKey));
    const needles = Array.from(new Set(tags.map(t=>normKey(t)).filter(Boolean)));
    return needles.some(n => prodKeys.has(n));
  }

  function isDressStrict(p) {
    const tagset = normalizeTags(p.tags).map(sanitize);
    return tagset.includes('dress') || tagset.includes('gown') || tagset.includes('robe') || tagset.includes('robes');
  }
  function isDressHeuristic(p){
    const t = sanitize(p.title);
    const pt = sanitize(p.product_type||'');
    return /\b(dress|gown|robe)\b/.test(t) || /\b(dress|gown|robe)\b/.test(pt);
  }

  try {
    const all = await fetchAllProducts();
    const anyStrictDress = all.some(isDressStrict);
    const filtered = all.filter(p => themeOk(p) && (anyStrictDress ? isDressStrict(p) : isDressHeuristic(p)) && priceOk(p));
    if (!filtered.length) {
      grid.innerHTML = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
      return;
    }
    const html = filtered.slice(0, 60).map(p => {
      const img = (p.images && p.images[0] && (p.images[0].src || p.images[0].original_src)) || '';
      const price = getLowestVariantPrice(p) || '—';
      return `<a href="/products/${p.handle}" class="j-item" style="text-decoration:none;color:inherit">
        <div class="j-card"><img src="${img}" alt="${p.title}" loading="lazy" style="width:100%;height:auto;border-radius:8px"/><div class="j-title" style="margin-top:6px;font-size:14px">${p.title}</div><div class="j-price" style="color:#111;font-weight:600">$${price}</div></div>
      </a>`;
    }).join('');
    grid.innerHTML = html;
  } catch (e) {
    grid.innerHTML = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
  }
})();


