/* Enhance recommendations logic without altering layout */
(async function(){
  if (!/\/pages\/event-dress-recommendations/i.test(location.pathname)) return;

  const params = new URLSearchParams(location.search);
  const theme = (params.get('theme') || '').toLowerCase();
  const budget = (params.get('budget') || 'no-limit').toLowerCase();

  const budgetLabel = budget==='under-80' ? 'Under $80' : budget==='under-150' ? 'Under $150' : 'No limit';
  const labelEl = document.getElementById('juns-theme-label');
  if (labelEl) labelEl.textContent = `Theme: "${theme}" · Budget: ${budgetLabel}`;

  const map = {
    beach:['beach','summer','boho','vacation','resort'],
    wedding:['wedding','bride','bridal','elegant','white','ivory','lace','satin','guest'],
    gala:['gala','evening','black-tie','luxury','formal'],
    'night-out':['night-out','night out','party','sexy','short','bold','club'],
    'night out':['night-out','night out','party','sexy','short','bold','club'],
    eid:['eid','modest','long','embroidered','classy','abaya'],
    office:['office','work','business','professional','chic','neutral'],
    business:['office','work','business','professional','chic','neutral'],
    birthday:['birthday','celebration','party','fun','bright'],
    casual:['casual','day','everyday','relaxed'],
  };
  const tags = map[theme] || [theme, theme.replace(/-/g,' ')].filter(Boolean);

  const grid = document.getElementById('juns-products-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="padding:12px;color:#666">Loading recommendations…</div>';

  async function fetchAllProducts() {
    const base = '/collections/all/products.json';
    let page = 1; const out = [];
    while (true) {
      const url = `${base}?page=${page}&limit=250`;
      const res = await fetch(url, { headers: { 'accept':'application/json' } });
      if (!res.ok) break; const data = await res.json();
      const arr = data.products || data || [];
      if (!arr.length) break; out.push(...arr); page += 1; if (page>10) break;
    }
    return out;
  }

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
    const prodTagsArr = normalizeTags(p.tags);
    const normalizedTags = prodTagsArr.map(sanitize);
    const haystack = [sanitize(p.title), sanitize(p.handle), sanitize(p.body_html)].join(' ');
    const needles = Array.from(new Set(tags.map(sanitize).filter(Boolean)));
    for (const needle of needles) {
      if (!needle) continue;
      if (normalizedTags.includes(needle)) return true;
      // Require tag word match or strong title match; avoid partial noise
      if (normalizedTags.some(t => (t === needle) || (t.includes(needle) && needle.length >= 4))) return true;
      if (haystack.includes(` ${needle} `) || haystack.startsWith(needle + ' ') || haystack.endsWith(' ' + needle) || haystack.includes('-' + needle + '-') ) return true;
    }
    return false;
  }

  try {
    const all = await fetchAllProducts();
    const filtered = all.filter(p => themeOk(p) && priceOk(p));
    if (!filtered.length) {
      grid.innerHTML = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
      return;
    }
    const html = filtered.slice(0, 60).map(p => {
      const img = (p.images && p.images[0] && p.images[0].src) || '';
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


