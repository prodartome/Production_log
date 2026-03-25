// ─────────────────────────────────────────────────────────────
//  ProdTrack — Login Gate
// ─────────────────────────────────────────────────────────────

// Session flag — lives only in memory, cleared when tab closes
let _authenticated = false;

function doLogin() {
  const input = document.getElementById('login-input');
  const error = document.getElementById('login-error');
  const field = document.querySelector('.login-field');

  if (input.value === APP_PASSWORD) {
    _authenticated = true;
    const screen = document.getElementById('login-screen');
    screen.classList.add('hidden');
    // Remove from DOM after animation so it can't be inspected easily
    setTimeout(() => screen.remove(), 400);
    // Now boot the app
    bootApp();
  } else {
    // Wrong password — shake + show error
    field.classList.remove('shake');
    void field.offsetWidth; // reflow to restart animation
    field.classList.add('shake');
    error.classList.add('visible');
    input.value = '';
    input.focus();
    setTimeout(() => error.classList.remove('visible'), 2500);
  }
}

// Guard: called before any app action that touches data
function requireAuth() {
  if (!_authenticated) {
    location.reload();
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
//  ProdTrack — App Logic
// ─────────────────────────────────────────────────────────────

// ── Supabase client (lightweight REST wrapper) ────────────────
const sb = {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },

  async get(table, params = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: sb.headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async post(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: sb.headers, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async del(table, id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE', headers: sb.headers
    });
    if (!r.ok) throw new Error(await r.text());
  }
};

// ── State ─────────────────────────────────────────────────────
let workers  = [];
let products = [];
let phases   = [];
let entries  = [];
let sel = { worker: null, product: null, phase: null };
let configured = false;

// ── Boot ──────────────────────────────────────────────────────
async function bootApp() {
  startClock();
  configured = SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY';

  if (!configured) {
    document.getElementById('config-banner').style.display = 'flex';
    setStatus('not-configured', 'Not configured');
    showEmptyLog('Configure Supabase in config.js to get started');
    renderPills('worker-pills',  [], 'worker');
    renderPills('product-pills', [], 'product');
    return;
  }

  document.getElementById('config-banner').style.display = 'none';
  setStatus('connecting', 'Connecting…');

  try {
    await Promise.all([loadWorkers(), loadProducts()]);
    await loadEntries();
    setStatus('connected', 'Connected');
  } catch (e) {
    setStatus('error', 'Connection failed');
    showEmptyLog('Could not reach Supabase. Check your config.js credentials.');
    console.error(e);
  }
}

// ── Clock ─────────────────────────────────────────────────────
function startClock() {
  const tick = () => {
    const now = new Date();
    document.getElementById('live-time').textContent = now.toLocaleTimeString('en-GB');
    document.getElementById('live-date').textContent =
      now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };
  tick();
  setInterval(tick, 1000);
}

// ── Status indicator ──────────────────────────────────────────
function setStatus(state, label) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  dot.className = 'status-dot ' + state;
  lbl.textContent = label;
}

// ── Load data ─────────────────────────────────────────────────
async function loadWorkers() {
  workers = await sb.get('workers', 'order=name');
  renderPills('worker-pills', workers.map(w => ({ id: w.id, label: w.name })), 'worker');
  refreshWorkerFilter();
}

async function loadProducts() {
  products = await sb.get('products', 'order=name');
  renderPills('product-pills', products.map(p => ({ id: p.id, label: p.name })), 'product');
  refreshProductFilter();
}

async function loadPhasesForProduct(productId) {
  const container = document.getElementById('phase-pills');
  container.innerHTML = '<div class="loading-pills">Loading phases…</div>';
  phases = await sb.get('phases', `product_id=eq.${productId}&order=sort_order,name`);
  sel.phase = null;
  renderPills('phase-pills', phases.map(p => ({ id: p.id, label: p.name })), 'phase');
}

async function loadEntries() {
  document.getElementById('log-table-wrap').innerHTML =
    `<div class="loading-state"><div class="spinner"></div>Loading entries…</div>`;

  // Join via select — fetch entries with related names
  entries = await sb.get(
    'entries',
    'select=id,quantity,created_at,workers(name),products(name),phases(name)&order=created_at.desc&limit=200'
  );
  renderLog(entries);
  renderSummary(entries);
}

// ── Pill renderer ─────────────────────────────────────────────
function renderPills(containerId, items, selKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = `<div class="loading-pills muted">No ${selKey}s found in database</div>`;
    return;
  }

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (sel[selKey] === item.id ? ' active' : '');
    btn.textContent = item.label;
    btn.dataset.id = item.id;
    btn.onclick = () => selectPill(selKey, item.id, item.label, containerId, items);
    container.appendChild(btn);
  });
}

function selectPill(selKey, id, label, containerId, items) {
  sel[selKey] = id;
  renderPills(containerId, items, selKey);

  // When product selected → load its phases
  if (selKey === 'product') {
    const tag = document.getElementById('phase-product-tag');
    tag.textContent = label;
    sel.phase = null;
    loadPhasesForProduct(id);
  }
}

// ── Quantity ──────────────────────────────────────────────────
function adjustQty(delta) {
  const el = document.getElementById('qty-input');
  let v = parseFloat(el.value) || 0;
  v = Math.max(0.1, Math.round((v + delta) * 10) / 10);
  el.value = v;
}

// ── Submit ────────────────────────────────────────────────────
async function submitEntry() {
  if (!requireAuth()) return;
  if (!configured) { showToast('Configure Supabase first', true); return; }
  if (!sel.worker)  { showToast('Select a worker', true); return; }
  if (!sel.product) { showToast('Select a product', true); return; }
  if (!sel.phase)   { showToast('Select a work phase', true); return; }

  const qty = parseFloat(document.getElementById('qty-input').value);
  if (!qty || qty <= 0) { showToast('Enter a valid quantity', true); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="btn-spinner"></div> Saving…`;

  try {
    await sb.post('entries', {
      worker_id:  sel.worker,
      product_id: sel.product,
      phase_id:   sel.phase,
      quantity:   qty
    });
    showToast('✓ Entry logged!');
    document.getElementById('qty-input').value = 1;
    await loadEntries();
  } catch (e) {
    showToast('Error saving entry', true);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Log Entry`;
  }
}

// ── Log rendering ─────────────────────────────────────────────
function renderLog(data) {
  const wrap = document.getElementById('log-table-wrap');
  const count = data.length;
  document.getElementById('log-count').textContent = `${count} entr${count === 1 ? 'y' : 'ies'}`;

  if (!count) {
    wrap.innerHTML = `<div class="empty-state">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      <div>No entries yet</div><div class="sub">Fill the form and hit Log Entry</div>
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Worker</th>
          <th>Product</th>
          <th>Phase</th>
          <th>Qty</th>
          <th>Date</th>
          <th>Time</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${data.map((e, i) => {
          const dt = new Date(e.created_at);
          return `<tr>
            <td class="row-num">${count - i}</td>
            <td class="name-cell">${e.workers?.name ?? '—'}</td>
            <td><span class="badge">${e.products?.name ?? '—'}</span></td>
            <td class="phase-cell">${e.phases?.name ?? '—'}</td>
            <td class="qty-cell">${e.quantity}</td>
            <td class="date-cell">${dt.toLocaleDateString('en-GB')}</td>
            <td class="date-cell">${dt.toLocaleTimeString('en-GB')}</td>
            <td><button class="delete-row-btn" onclick="deleteEntry('${e.id}')" title="Delete">✕</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function showEmptyLog(msg) {
  document.getElementById('log-table-wrap').innerHTML =
    `<div class="empty-state"><div>${msg}</div></div>`;
  document.getElementById('log-count').textContent = '— entries';
}

// ── Delete entry ──────────────────────────────────────────────
async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  try {
    await sb.del('entries', id);
    showToast('Entry deleted');
    await loadEntries();
  } catch (e) {
    showToast('Error deleting', true);
  }
}

// ── Filters ───────────────────────────────────────────────────
function refreshWorkerFilter() {
  const sel = document.getElementById('filter-worker');
  const val = sel.value;
  sel.innerHTML = '<option value="">All workers</option>' +
    workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  sel.value = val;
}

function refreshProductFilter() {
  const sel = document.getElementById('filter-product');
  const val = sel.value;
  sel.innerHTML = '<option value="">All products</option>' +
    products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  sel.value = val;
}

function applyFilters() {
  const wid = document.getElementById('filter-worker').value;
  const pid = document.getElementById('filter-product').value;
  let filtered = entries;
  if (wid) filtered = filtered.filter(e => e.workers && String(e.workers.id ?? '') === wid ||
    workers.find(w => w.id == wid)?.name === e.workers?.name);
  if (pid) filtered = filtered.filter(e => e.products && String(e.products.id ?? '') === pid ||
    products.find(p => p.id == pid)?.name === e.products?.name);

  // Re-filter by matching names since we don't have IDs directly in joined result
  const wName = workers.find(w => w.id == wid)?.name;
  const pName = products.find(p => p.id == pid)?.name;
  filtered = entries.filter(e => {
    const wOk = !wid || e.workers?.name === wName;
    const pOk = !pid || e.products?.name === pName;
    return wOk && pOk;
  });

  renderLog(filtered);
}

// ── Today's summary cards ─────────────────────────────────────
function renderSummary(data) {
  const today = new Date().toLocaleDateString('en-GB');
  const todayEntries = data.filter(e =>
    new Date(e.created_at).toLocaleDateString('en-GB') === today
  );

  const container = document.getElementById('summary-cards');
  if (!todayEntries.length) {
    container.innerHTML = '<div class="summary-empty">No entries today yet</div>';
    return;
  }

  // Group by product
  const byProduct = {};
  todayEntries.forEach(e => {
    const pName = e.products?.name ?? 'Unknown';
    if (!byProduct[pName]) byProduct[pName] = { total: 0, phases: {} };
    byProduct[pName].total += e.quantity;
    const ph = e.phases?.name ?? 'Unknown';
    byProduct[pName].phases[ph] = (byProduct[pName].phases[ph] || 0) + e.quantity;
  });

  container.innerHTML = Object.entries(byProduct).map(([prod, data]) => `
    <div class="summary-card">
      <div class="summary-card-title">${prod}</div>
      <div class="summary-card-total">${data.total}</div>
      <div class="summary-card-phases">
        ${Object.entries(data.phases).map(([ph, qty]) =>
          `<div class="summary-phase-row"><span>${ph}</span><span>${qty}</span></div>`
        ).join('')}
      </div>
    </div>
  `).join('');
}

// ── Export XLSX ───────────────────────────────────────────────
function exportXLSX() {
  if (!entries.length) { showToast('Nothing to export yet', true); return; }

  const wb = XLSX.utils.book_new();

  // Sheet 1 — Full log
  const logRows = [['#', 'Worker', 'Product', 'Phase', 'Quantity', 'Date', 'Time']];
  entries.forEach((e, i) => {
    const dt = new Date(e.created_at);
    logRows.push([
      i + 1,
      e.workers?.name ?? '',
      e.products?.name ?? '',
      e.phases?.name ?? '',
      e.quantity,
      dt.toLocaleDateString('en-GB'),
      dt.toLocaleTimeString('en-GB')
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(logRows);
  ws1['!cols'] = [{wch:5},{wch:14},{wch:16},{wch:18},{wch:10},{wch:12},{wch:10}];
  styleXLSXHeader(ws1, logRows[0].length);
  XLSX.utils.book_append_sheet(wb, ws1, 'Full Log');

  // Sheet 2 — Summary by worker + product + phase
  const totals = {};
  entries.forEach(e => {
    const key = `${e.workers?.name}|||${e.products?.name}|||${e.phases?.name}`;
    totals[key] = (totals[key] || 0) + e.quantity;
  });
  const sumRows = [['Worker', 'Product', 'Phase', 'Total Qty']];
  Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, qty]) => {
      const [w, p, ph] = key.split('|||');
      sumRows.push([w, p, ph, qty]);
    });
  const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
  ws2['!cols'] = [{wch:14},{wch:16},{wch:18},{wch:12}];
  styleXLSXHeader(ws2, 4);
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  // Sheet per product
  const byProduct = {};
  entries.forEach(e => {
    const pName = e.products?.name ?? 'Unknown';
    if (!byProduct[pName]) byProduct[pName] = [];
    byProduct[pName].push(e);
  });
  Object.entries(byProduct).forEach(([pName, rows]) => {
    const sheetRows = [['Worker', 'Phase', 'Quantity', 'Date', 'Time']];
    rows.forEach(e => {
      const dt = new Date(e.created_at);
      sheetRows.push([
        e.workers?.name ?? '',
        e.phases?.name ?? '',
        e.quantity,
        dt.toLocaleDateString('en-GB'),
        dt.toLocaleTimeString('en-GB')
      ]);
    });
    // Total row
    const total = rows.reduce((s, e) => s + e.quantity, 0);
    sheetRows.push(['TOTAL', '', total, '', '']);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!cols'] = [{wch:14},{wch:18},{wch:10},{wch:12},{wch:10}];
    styleXLSXHeader(ws, 5);
    // Safe sheet name (max 31 chars)
    XLSX.utils.book_append_sheet(wb, ws, pName.substring(0, 31));
  });

  const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  XLSX.writeFile(wb, `prodtrack_${date}.xlsx`);
  showToast('📥 Exported!');
}

function styleXLSXHeader(ws, cols) {
  for (let c = 0; c < cols; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: '0E0F13' } },
        fill: { fgColor: { rgb: 'E8FF4A' } },
        alignment: { horizontal: 'center' }
      };
    }
  }
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, warn = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = warn ? '#ff5252' : '#4affb4';
  el.style.color = warn ? '#fff' : '#0e0f13';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Start clock immediately (shows on login screen too) ───────
window.addEventListener('DOMContentLoaded', () => startClock());
