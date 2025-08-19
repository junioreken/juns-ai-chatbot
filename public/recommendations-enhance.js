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
    beach:['beach','summer','boho'],
    wedding:['wedding','elegant','white','lace','satin'],
    gala:['gala','evening','black-tie','luxury'],
    'night-out':['sexy','night-out','short','bold'],
    eid:['modest','long','embroidered','classy'],
    office:['chic','professional','neutral','office'],
    business:['chic','professional','neutral','office'],
    birthday:['fun','bright','celebration'],
    casual:['casual']
  };
  const tags = map[theme] || [theme];

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

  function priceOk(p) {
    const price = parseFloat((p.variants && p.variants[0] && p.variants[0].price) || '0');
    if (budget==='under-80') return price <= 80;
    if (budget==='under-150') return price <= 150;
    if (budget==='no-limit') return true;
    return true;
  }

  function themeOk(p) {
    const prodTags = (p.tags || '').toLowerCase();
    return tags.some(t => prodTags.includes(t));
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
      const price = (p.variants && p.variants[0] && p.variants[0].price) || '—';
      return `<a href="/products/${p.handle}" class="j-item" style="text-decoration:none;color:inherit">
        <div class="j-card"><img src="${img}" alt="${p.title}" loading="lazy" style="width:100%;height:auto;border-radius:8px"/><div class="j-title" style="margin-top:6px;font-size:14px">${p.title}</div><div class="j-price" style="color:#111;font-weight:600">$${price}</div></div>
      </a>`;
    }).join('');
    grid.innerHTML = html;
  } catch (e) {
    grid.innerHTML = '<div style="padding:12px;color:#666">No matching dresses found.</div>';
  }
})();


