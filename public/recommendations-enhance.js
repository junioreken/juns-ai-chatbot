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

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  }

  // Create our own container if the theme doesn't provide one
  function ensureContainer(){
    let label = document.getElementById('juns-theme-label');
    let grid = document.getElementById('juns-products-grid');
    if (!label || !grid) {
      const wrap = document.getElementById('juns-reco-wrapper') || document.createElement('div');
      wrap.id = 'juns-reco-wrapper';
      wrap.style.cssText = 'max-width:1200px;margin:24px auto;padding:0 16px;';
      if (!wrap.parentNode) {
        const main = document.querySelector('main') || document.body;
        main.insertBefore(wrap, main.firstChild);
      }
      if (!label) {
        label = document.createElement('div');
        label.id = 'juns-theme-label';
        label.style.cssText = 'font:600 18px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#333;margin:6px 0 18px;text-align:center';
        wrap.appendChild(label);
      }
      if (!grid) {
        grid = document.createElement('div');
        grid.id = 'juns-products-grid';
        wrap.appendChild(grid);
      }
    }
    // Update label text
    label.textContent = `Theme: "${prettyTheme}" · Budget: ${budgetLabel}`;
    return { label, grid };
  }
  onReady(() => { ensureContainer(); });

  // STRICT matching: only products explicitly tagged with the exact theme slug
  // Example: if theme=wedding, product must have the tag 'wedding' (case-insensitive)
  const decodedTheme = decodeURIComponent(theme || '');
  const tags = Array.from(new Set([
    decodedTheme,
    decodedTheme.replace(/-/g,' ')
  ].filter(Boolean)));

  // Theme synonyms (fallback if merchant hasn't tagged with the exact theme)
  const themeSynonyms = {
    'wedding': ['wedding','bridal','bride','ceremony','guest','elegant','formal','lace','satin','ivory','white'],
    'night-out': ['night out','party','club','nightclub','evening','sexy','bold'],
    'business': ['business','office','work','professional','blazer','suit','pencil'],
    'casual': ['casual','everyday','day','cozy','relaxed','sweater','knit'],
    'cocktail': ['cocktail','semi formal','semi-formal','evening'],
    'graduation': ['graduation','grad','ceremony','commencement']
  };
  const synonymList = themeSynonyms[decodedTheme] || [];

  async function renderInto(grid) {
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
    .product-grid{display:grid;grid-template-columns:repeat(2,minmax(240px,1fr));gap:24px;}
    .product-card{background:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.08);padding:14px;display:flex;flex-direction:column;transition:transform .2s ease, box-shadow .2s ease}
    .product-card:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(0,0,0,.12)}
    .product-card img{width:100%;height:auto;border-radius:10px;object-fit:cover;aspect-ratio:4/5;background:#f6f6f6}
    .pc-title{margin-top:10px;font-size:16px;font-weight:700;letter-spacing:.2px;line-height:1.35;color:#111}
    .pc-price{margin-top:6px;color:#444;font-weight:600;font-size:14px}
    @media (max-width:960px){.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
    @media (max-width:560px){.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pc-title{font-size:14px}.pc-price{font-size:13px}}
    @media (max-width:360px){.product-grid{grid-template-columns:1fr;gap:12px}}
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

  function themeStrict(p) {
    // STRICT by tag, but tolerate slug vs spaced and punctuation
    const productTags = normalizeTags(p.tags);
    const prodKeys = new Set(productTags.map(normKey));
    const needles = Array.from(new Set(tags.map(t=>normKey(t)).filter(Boolean)));
    return needles.some(n => prodKeys.has(n));
  }

  function themeHeuristic(p){
    // Heuristic: search synonyms in tags/title/handle/body
    if (!synonymList.length) return false;
    const productTags = normalizeTags(p.tags).join(' ');
    const hay = [sanitize(p.title), sanitize(p.handle), sanitize(p.body_html), sanitize(productTags)].join(' ');
    return synonymList.some(w => new RegExp(`(?:^|\b)${sanitize(w)}(?:$|\b)`, 'i').test(hay));
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

  // Hard exclude obvious non-dress categories (bags, shoes, jewelry, jackets, skirts, tops, etc.)
  function isClearlyNotDress(p){
    const hay = [sanitize(p.title), sanitize(p.handle), sanitize(p.body_html), sanitize(Array.isArray(p.tags)?p.tags.join(','):p.tags), sanitize(p.product_type||'')].join(' ');
    const banned = [
      'bag','purse','wallet','clutch','handbag','tote','shoulder bag','crossbody',
      'shoe','shoes','heel','heels','sandal','sandals','boot','boots','sneaker','sneakers',
      'jewelry','jewelery','necklace','earring','earrings','bracelet','ring','rings','pendant',
      'jacket','jackets','coat','coats','blazer','outerwear','sweater','hoodie','sweatshirt',
      'shirt','blouse','top','tops','tee','t-shirt','trousers','pants','jeans','shorts','skirt','skirts','set '
    ];
    return banned.some(w => new RegExp(`(^|\b)${w}(s)?(\b|$)`).test(hay));
  }

  try {
    const all = await fetchAllProducts();
    const anyStrict = all.some(p => themeStrict(p));
    const filtered = all.filter(p => {
      if (isClearlyNotDress(p)) return false; // fast reject
      const passTheme = anyStrict ? themeStrict(p) : themeHeuristic(p);
      if (!passTheme) return false;
      if (!(isDressStrict(p) || isDressHeuristic(p))) return false;
      return priceOk(p);
    });
    if (!filtered.length) {
      grid.innerHTML = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
      return;
    }
    // Stable deterministic ordering
    const ordered = filtered
      .map(p => ({ p, t: String(p.title||'') }))
      .sort((a,b) => a.t.localeCompare(b.t, undefined, { sensitivity:'base' }))
      .map(x => x.p);

    const currency = (window.Shopify && (Shopify.currency?.active || Shopify.currency || '')) || '';
    const html = ordered.slice(0, 60).map(p => {
      const img = (p.images && p.images[0] && (p.images[0].src || p.images[0].original_src)) || '';
      const price = getLowestVariantPrice(p) || '—';
      return `<a href="/products/${p.handle}" class="j-item" style="text-decoration:none;color:inherit">
        <div class="product-card"><img src="${img}" alt="${p.title}" loading="lazy"/><div class="pc-title">${p.title}</div><div class="pc-price">$${price}${currency ? ` ${currency}` : ''}</div></div>
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

    // Attempt to hide large theme collection blocks that might also render products on the page
    setTimeout(() => {
      const candidates = Array.from(document.querySelectorAll('main section, main div')).filter(el => !el.closest('#juns-reco-wrapper'));
      for (const el of candidates) {
        if (el.id === 'juns-reco-wrapper') continue;
        if (el.querySelector('#juns-reco-wrapper')) continue;
        const links = el.querySelectorAll('a[href*="/products/"]');
        if (links.length >= 6) {
          el.setAttribute('data-juns-hide','1');
          el.style.display = 'none';
        }
      }
    }, 0);
  } catch (e) {
    const html = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
    if (shadow) shadow.innerHTML = `<style>${baseStyles}</style>${html}`; else host.innerHTML = html;
  }

  // Render immediately once DOM is ready, without requiring a manual refresh
  onReady(() => {
    const grid = document.getElementById('juns-products-grid');
    if (grid && !grid.getAttribute('data-juns-lock')) renderInto(grid);
  });
  // Fallback if container is injected later
  waitFor('juns-products-grid', (grid) => { if (!grid.getAttribute('data-juns-lock')) renderInto(grid); });
})();


