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

  // Reset dropdowns
  const phaseDropdown = document.getElementById('phase-select');
  if (phaseDropdown) phaseDropdown.innerHTML = '<option value="">— select a product first —</option>';
  const workerDropdown = document.getElementById('worker-select');
  if (workerDropdown) workerDropdown.innerHTML = '<option value="">Loading…</option>';

  if (!configured) {
    document.getElementById('config-banner').style.display = 'flex';
    setStatus('not-configured', 'Not configured');
    showEmptyLog('Configure Supabase in config.js to get started');
    const wdd = document.getElementById('worker-select');
    if (wdd) wdd.innerHTML = '<option value="">— not configured —</option>';
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
  const all = await sb.get('workers', 'order=name');
  // Filter: show workers where active is true OR active field doesn't exist
  workers = all.filter(w => w.active !== false);
  if (!workers.length) workers = all;
  const dropdown = document.getElementById('worker-select');
  if (dropdown) {
    dropdown.innerHTML = '<option value="">— select worker —</option>' +
      workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }
  refreshWorkerFilter();
}

function selectWorkerFromDropdown(workerId) {
  sel.worker = workerId ? parseInt(workerId) : null;
}

async function loadProducts() {
  products = await sb.get('products', 'order=name');
  renderPills('product-pills', products.map(p => ({ id: p.id, label: p.name })), 'product');
  refreshProductFilter();
}

async function loadPhasesForProduct(productId) {
  const dropdown = document.getElementById('phase-select');
  dropdown.innerHTML = '<option value="">Loading…</option>';
  dropdown.disabled = true;
  phases = await sb.get('phases', `product_id=eq.${productId}&order=sort_order,name`);
  sel.phase = null;
  dropdown.disabled = false;
  if (!phases.length) {
    dropdown.innerHTML = '<option value="">No phases found</option>';
    return;
  }
  dropdown.innerHTML = '<option value="">— select phase —</option>' +
    phases.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

async function loadEntries() {
  document.getElementById('log-table-wrap').innerHTML =
    `<div class="loading-state"><div class="spinner"></div>Loading entries…</div>`;

  // Join via select — fetch entries with related names
  entries = await sb.get(
    'entries',
    'select=id,quantity,created_at,workers(name),products(name),phases(name,mrpe_partno)&order=created_at.desc&limit=200'
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

  // When product selected → load its phases into dropdown
  if (selKey === 'product') {
    const tag = document.getElementById('phase-product-tag');
    tag.textContent = label;
    sel.phase = null;
    const dropdown = document.getElementById('phase-select');
    dropdown.innerHTML = '<option value="">— loading… —</option>';
    loadPhasesForProduct(id);
  }
}

// Called when phase dropdown changes
function selectPhaseFromDropdown(phaseId) {
  sel.phase = phaseId ? parseInt(phaseId) : null;
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
  // Also read worker from dropdown in case sel.worker not set
  const workerDd = document.getElementById('worker-select');
  if (workerDd && workerDd.value && !sel.worker) sel.worker = parseInt(workerDd.value);
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
          <th>Part No</th>
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
            <td class="date-cell">${e.phases?.mrpe_partno ?? '—'}</td>
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

// ─────────────────────────────────────────────────────────────
//  Page Navigation
// ─────────────────────────────────────────────────────────────

function switchPage(pageId, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  if (btn) btn.classList.add('active');
  // Load planner image when switching to planner tab
  if (pageId === 'planner') loadPlannerImage();
}

// ─────────────────────────────────────────────────────────────
//  Weekly Planner — persistent image via Supabase Storage
// ─────────────────────────────────────────────────────────────

const PLANNER_BUCKET = 'planner';
const PLANNER_FILE   = 'weekly-plan.jpg';

// Load saved planner image on page open
async function loadPlannerImage() {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${PLANNER_BUCKET}/${PLANNER_FILE}`;
  // Check if image exists by trying to fetch headers
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) displayPlannerImage(url + '?t=' + Date.now());
  } catch(e) {
    // No image saved yet — show drop zone
  }
}

function displayPlannerImage(url) {
  const area = document.getElementById('planner-image-area');
  area.innerHTML = `
    <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;">
      <img src="${url}" class="planner-img-display" alt="Weekly Plan">
      <div style="position:absolute;top:1rem;right:1rem;display:flex;gap:.5rem;">
        <label style="background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.2);border-radius:4px;color:#fff;padding:.35rem .8rem;cursor:pointer;font-family:Barlow,sans-serif;font-size:.55rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">
          ↑ Replace
          <input type="file" accept="image/*" style="display:none" onchange="handlePlannerFile(this)">
        </label>
      </div>
    </div>`;
}

function handlePlannerDrop(e) {
  e.preventDefault();
  document.getElementById('planner-drop-zone')?.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) uploadPlannerImage(file);
}

function handlePlannerFile(input) {
  const file = input.files[0];
  if (file) uploadPlannerImage(file);
}

async function uploadPlannerImage(file) {
  const area = document.getElementById('planner-image-area');
  area.innerHTML = `<div class="loading-state"><div class="spinner"></div>Saving image…</div>`;

  try {
    // Upload to Supabase Storage — overwrites existing file
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${PLANNER_BUCKET}/${PLANNER_FILE}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': file.type,
          'x-upsert': 'true',          // overwrite if exists
          'Cache-Control': '3600',
        },
        body: file,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const url = `${SUPABASE_URL}/storage/v1/object/public/${PLANNER_BUCKET}/${PLANNER_FILE}`;
    displayPlannerImage(url + '?t=' + Date.now());
    showToast('✓ Planner image saved!');
  } catch(e) {
    area.innerHTML = `<div class="empty-state"><div style="color:var(--danger)">Failed to save: ${e.message}</div></div>`;
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────────────
//  MRPeasy Stock Integration
// ─────────────────────────────────────────────────────────────

let stockData = [];
let stockFiltered = [];

async function loadStock() {
  const setupEl = document.getElementById('mrpeasy-setup');
  const tableEl = document.getElementById('stock-table-wrap');

  setupEl.innerHTML = `<div class="loading-state"><div class="spinner"></div>Loading stock from MRPeasy…</div>`;

  try {
    // Call Supabase Edge Function proxy (credentials stored in Supabase Secrets)
    const res = await fetch(MRPEASY_PROXY_URL + '?endpoint=stock/inventory', {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json',
      }
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error ?? `Proxy error ${res.status}`);
    }

    stockData = Array.isArray(json) ? json : (json.data || json.items || Object.values(json));
    stockFiltered = [...stockData];

    renderStockTable(stockFiltered);
    setupEl.style.display = 'none';
    tableEl.style.display = 'block';
    showToast('✓ Loaded ' + stockData.length + ' stock items');

  } catch (err) {
    setupEl.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p style="color:var(--danger);max-width:26rem;text-align:center">${err.message}</p>
      <button class="submit-btn" style="margin-top:.5rem;padding:.6rem 1.4rem;width:auto" onclick="loadStock()">Retry</button>
      <p class="mrpeasy-hint">Make sure the Edge Function is deployed and secrets are set</p>`;
  }
}

function renderStockTable(items) {
  const tbody = document.getElementById('stock-tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">No items found</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const onHand    = parseFloat(item.on_hand    ?? item.quantity   ?? item.qty ?? 0);
    const booked    = parseFloat(item.booked     ?? item.reserved   ?? 0);
    const available = parseFloat(item.available  ?? (onHand - booked));
    const expected  = parseFloat(item.expected   ?? item.incoming   ?? 0);
    const avgCost   = parseFloat(item.avg_cost   ?? item.unit_cost  ?? 0);
    const totalVal  = parseFloat(item.total_cost ?? item.total_value ?? (onHand * avgCost));

    const qtyClass = available <= 0 ? 'stock-qty-zero' : available < 5 ? 'stock-qty-low' : 'stock-qty-ok';

    return `<tr>
      <td class="date-cell">${item.item_id ?? item.article_id ?? item.id ?? '—'}</td>
      <td class="name-cell" style="white-space:normal;max-width:14rem">${item.name ?? item.title ?? item.description ?? '—'}</td>
      <td>${item.unit ?? item.unit_of_measure ?? '—'}</td>
      <td>${onHand.toLocaleString('en-GB', {maximumFractionDigits:2})}</td>
      <td class="date-cell">${booked.toLocaleString('en-GB', {maximumFractionDigits:2})}</td>
      <td class="${qtyClass}">${available.toLocaleString('en-GB', {maximumFractionDigits:2})}</td>
      <td class="date-cell">${expected.toLocaleString('en-GB', {maximumFractionDigits:2})}</td>
      <td class="date-cell">${avgCost > 0 ? '€' + avgCost.toFixed(2) : '—'}</td>
      <td class="qty-cell">${totalVal > 0 ? '€' + totalVal.toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'}</td>
    </tr>`;
  }).join('');
}

function filterStock(query) {
  const q = query.toLowerCase();
  stockFiltered = stockData.filter(item =>
    (item.name ?? item.title ?? '').toLowerCase().includes(q) ||
    String(item.item_id ?? item.id ?? '').includes(q)
  );
  renderStockTable(stockFiltered);
}

function exportStockXLSX() {
  if (!stockFiltered.length) { showToast('No stock data to export', true); return; }

  const rows = [['Item #','Name','Unit','On Hand','Booked','Available','Expected','Avg Cost','Total Value']];
  stockFiltered.forEach(item => {
    const onHand  = parseFloat(item.on_hand ?? item.quantity ?? 0);
    const booked  = parseFloat(item.booked  ?? 0);
    const avail   = parseFloat(item.available ?? (onHand - booked));
    const exp     = parseFloat(item.expected ?? 0);
    const cost    = parseFloat(item.avg_cost ?? 0);
    const total   = parseFloat(item.total_cost ?? (onHand * cost));
    rows.push([item.item_id ?? item.id, item.name ?? item.title, item.unit, onHand, booked, avail, exp, cost, total]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:10},{wch:28},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:12}];
  styleXLSXHeader(ws, 9);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  XLSX.writeFile(wb, `stock_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.xlsx`);
  showToast('📥 Stock exported!');
}

// Restore saved MRPeasy credentials on page switch
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = sessionStorage.getItem('mrp_user');
  const savedKey  = sessionStorage.getItem('mrp_key');
  if (savedUser) setTimeout(() => {
    const u = document.getElementById('mrpeasy-user');
    const k = document.getElementById('mrpeasy-key');
    if (u) u.value = savedUser;
    if (k) k.value = savedKey;
  }, 100);
});

// Fix toast to always use orange
const _origShowToast = showToast;
// Override to use accent for success
function showToast(msg, warn = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = warn ? '#e84040' : 'var(--accent)';
  el.style.color = '#fff';
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
