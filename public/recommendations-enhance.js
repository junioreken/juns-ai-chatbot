/* Enhance recommendations logic without altering layout */
(function(){
  if (!/\/pages\/event-dress-recommendations/i.test(location.pathname)) return;

  function waitFor(elId, cb){
    const el = document.getElementById(elId);
    if (el) return cb(el);
    const mo = new MutationObserver(()=>{
      const e = document.getElementById(elId);
      if (e){ mo.disconnect(); cb(e); }
    });
    mo.observe(document.documentElement || document.body, { childList:true, subtree:true });
  }

  const params = new URLSearchParams(location.search);
  const theme = (params.get('theme') || '').toLowerCase();
  const budget = (params.get('budget') || 'no-limit').toLowerCase();

  const budgetLabel = budget==='under-80' ? 'Under $80' : budget==='under-150' ? 'Under $150' : 'No limit';
  const prettyTheme = theme.replace(/-/g,' ');
  const labelEl = document.getElementById('juns-theme-label');
  if (labelEl) labelEl.textContent = `Theme: "${prettyTheme}" · Budget: ${budgetLabel}`;

  // STRICT matching: only products explicitly tagged with the exact theme slug
  // Example: if theme=wedding, product must have the tag 'wedding' (case-insensitive)
  const decodedTheme = decodeURIComponent(theme || '');
  const tags = Array.from(new Set([
    decodedTheme,
    decodedTheme.replace(/-/g,' ')
  ].filter(Boolean)));

  waitFor('juns-products-grid', async (grid) => {
  // Lock container and render inside an isolated Shadow DOM to avoid theme scripts injecting extra products
  grid.setAttribute('data-juns-lock','1');
  grid.innerHTML = '';
  const host = document.createElement('div');
  host.id = 'juns-products-shadow';
  const supportsShadow = !!host.attachShadow;
  let shadow = null;
  if (supportsShadow) {
    shadow = host.attachShadow({ mode: 'open' });
    grid.appendChild(host);
  } else {
    grid.appendChild(host);
  }
  const baseStyles = `
    :host{all:initial}
    .product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
    .product-card{background:#fff;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.08);padding:10px;display:flex;flex-direction:column}
    .product-card img{width:100%;height:auto;border-radius:8px;object-fit:cover}
    .pc-title{margin-top:6px;font-size:14px;line-height:1.35;color:#111}
    .pc-price{color:#111;font-weight:600}
    @media (max-width:480px){.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  const setLoading = () => {
    const html = '<div style="padding:12px;color:#666">Loading recommendations…</div>';
    if (shadow) shadow.innerHTML = `<style>${baseStyles}</style>${html}`; else host.innerHTML = html;
  };
  setLoading();

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
    const ts = Date.now();
    while (true) {
      const url = `${base}?page=${page}&limit=250&_=${ts}`;
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
    const filtered = all.filter(p => themeOk(p) && isDressStrict(p) && priceOk(p));
    if (!filtered.length) {
      grid.innerHTML = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
      return;
    }
    const html = filtered.slice(0, 60).map(p => {
      const img = (p.images && p.images[0] && (p.images[0].src || p.images[0].original_src)) || '';
      const price = getLowestVariantPrice(p) || '—';
      return `<a href="/products/${p.handle}" class="j-item" style="text-decoration:none;color:inherit">
        <div class="product-card"><img src="${img}" alt="${p.title}" loading="lazy"/><div class="pc-title">${p.title}</div><div class="pc-price">$${price}</div></div>
      </a>`;
    }).join('');
    const finalHtml = `<div class="product-grid">${html}</div>`;
    if (shadow) shadow.innerHTML = `<style>${baseStyles}</style>${finalHtml}`; else host.innerHTML = finalHtml;

    // Guard against other theme scripts injecting unrelated products
    const mo = new MutationObserver(() => {
      if (grid.firstElementChild !== host) {
        grid.replaceChildren(host);
      }
    });
    mo.observe(grid, { childList:true });
  } catch (e) {
    const html = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
    if (shadow) shadow.innerHTML = `<style>${baseStyles}</style>${html}`; else host.innerHTML = html;
  }
  });
})();


