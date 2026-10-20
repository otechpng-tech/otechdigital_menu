/* Otech Digital Menu – Offline-first + Advanced Settings */
const API = '';
const STORAGE_KEY = 'otech_offline_v1';

let cart = [];
let currentLocation = null;
let currentService = 'both';
let allMenuItems = [];
let allCategories = [];
let settings = {};
let adminToken = localStorage.getItem('otech_token') || null;
let lastOrderId = null;
let kdsFilter = 'pending';
let isOnline = navigator.onLine;
let offlineQueue = JSON.parse(localStorage.getItem('otech_order_queue') || '[]');
let knownOrderIds = new Set();

async function refreshNetworkConfig() {
  try {
    const net = await api('/api/network');
    if (net && net.base_url) {
      settings.lan_base_url = net.base_url;
      saveCache('settings', settings);
      return net.base_url;
    }
  } catch (e) {}
  return settings.lan_base_url || window.location.origin;
}

function getGuestBaseUrl() {
  // 1) Public internet URL (hosted online) — best for customer QR codes
  if (settings && settings.public_base_url && /^https?:\/\//i.test(settings.public_base_url)) {
    return String(settings.public_base_url).replace(/\/$/, '');
  }
  // 2) Current page origin if not localhost (already on LAN or hosted)
  const origin = window.location.origin || '';
  if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) {
    return origin.replace(/\/$/, '');
  }
  // 3) Saved LAN URL for same-Wi-Fi use
  if (settings && settings.lan_base_url && !/localhost|127\.0\.0\.1/i.test(settings.lan_base_url)) {
    return String(settings.lan_base_url).replace(/\/$/, '');
  }
  return origin.replace(/\/$/, '') || 'http://localhost:8080';
}

let lastCustomerStatus = null;
let audioCtx = null;

function playNotifySound(kind) {
  // kind: 'new' (kitchen) | 'status' (customer)
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    if (kind === 'new') {
      // Two beeps — new order for kitchen
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      o.start(now); o.stop(now + 0.22);
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.value = 1175;
      g2.gain.setValueAtTime(0.0001, now + 0.25);
      g2.gain.exponentialRampToValueAtTime(0.25, now + 0.27);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      o2.start(now + 0.25); o2.stop(now + 0.52);
    } else {
      // Soft chime — status change for customer
      o.type = 'sine';
      o.frequency.value = 523;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.start(now); o.stop(now + 0.4);
    }
  } catch (e) { console.warn('Audio not available', e); }
}


function saveCache(key, data) {
  try {
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    store[key] = { data, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {}
}
function loadCache(key) {
  try {
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return store[key] ? store[key].data : null;
  } catch (e) { return null; }
}

function updateOnlineStatus() {
  isOnline = navigator.onLine;
  const banner = document.getElementById('offline-banner');
  if (banner) banner.classList.toggle('hidden', isOnline);
  if (isOnline) syncOfflineQueue();
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

async function syncOfflineQueue() {
  if (!offlineQueue.length || !isOnline) return;
  const remaining = [];
  for (const order of offlineQueue) {
    try {
      const res = await fetch(API + '/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      const data = await res.json();
      if (!data.success) remaining.push(order);
    } catch (e) { remaining.push(order); }
  }
  offlineQueue = remaining;
  localStorage.setItem('otech_order_queue', JSON.stringify(offlineQueue));
}

async function loadSettings() {
  let s = null;
  if (isOnline) {
    try {
      s = await api('/api/settings');
      if (s && !s.error && !s.offline) saveCache('settings', s);
    } catch (e) {}
  }
  if (!s || s.error || s.offline) {
    s = loadCache('settings') || {
      business_name: 'Otech Restaurant & Hotel',
      tagline: 'Digital Menu & Room Service',
      currency: 'PGK', currency_symbol: 'K',
      theme_primary: '#0f766e', theme_accent: '#f59e0b',
      theme_bg: '#f8fafc', theme_mode: 'light'
    };
  }
  settings = s;
  applySettings();
  return s;
}

function applySettings() {
  const root = document.documentElement;
  if (settings.theme_primary) {
    root.style.setProperty('--primary', settings.theme_primary);
    root.style.setProperty('--primary-dark', settings.theme_primary);
  }
  if (settings.theme_accent) root.style.setProperty('--accent', settings.theme_accent);
  if (settings.theme_bg) root.style.setProperty('--bg', settings.theme_bg);
  document.body.classList.toggle('theme-dark', settings.theme_mode === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && settings.theme_primary) meta.content = settings.theme_primary;

  const brand = document.getElementById('landing-brand');
  const title = document.getElementById('landing-title');
  const tagline = document.getElementById('landing-tagline');
  const logoEl = document.getElementById('landing-logo');
  if (brand) brand.textContent = settings.business_name || settings.restaurant_name || 'Otech';
  if (title) title.textContent = settings.business_name || 'Digital Menu & Orders';
  if (tagline) tagline.textContent = settings.tagline || 'Restaurant Tables • Hotel Room Service';
  if (logoEl) {
    const src = settings.logo_base64 || settings.logo_url;
    if (src) {
      logoEl.src = src;
      logoEl.classList.remove('hidden');
      if (brand) brand.classList.add('hidden');
    } else {
      logoEl.classList.add('hidden');
      if (brand) brand.classList.remove('hidden');
    }
  }
  document.title = (settings.business_name || 'Otech') + ' Digital Menu';
}

function formatPrice(n) {
  const sym = settings.currency_symbol || settings.currency || 'K';
  return sym + ' ' + (Number(n) || 0).toFixed(2);
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
  if (id === 'kitchen') loadKitchenOrders();
  if (id === 'admin' && adminToken) loadAdmin();
}
function goGuest() { showPage('guest-entry'); }
function goKitchen() { showPage('kitchen'); }
function goAdmin() {
  if (adminToken) showPage('admin');
  else showPage('admin-login');
}

async function loadGuestMenu(forcedCode) {
  const raw = (forcedCode != null && forcedCode !== ''
    ? String(forcedCode)
    : (document.getElementById('location-code')?.value || '')).trim();
  if (!raw) {
    alert('Please scan the QR code on your table or room to view the menu.');
    return false;
  }
  const codeUpper = raw.toUpperCase();
  const codeLower = raw.toLowerCase();

  // 1) Direct token lookup (works even if locations list fails)
  let loc = null;
  if (isOnline) {
    try {
      const byToken = await api('/api/location/' + encodeURIComponent(raw));
      if (byToken && byToken.id && !byToken.error) loc = byToken;
      // try lower/upper token variants
      if (!loc) {
        const t2 = await api('/api/location/' + encodeURIComponent(codeLower));
        if (t2 && t2.id && !t2.error) loc = t2;
      }
    } catch (e) {}
  }

  // 2) Full locations list match
  if (!loc) {
    let locs = null;
    if (isOnline) {
      locs = await api('/api/locations');
      if (Array.isArray(locs)) saveCache('locations', locs);
      else locs = null;
    }
    if (!Array.isArray(locs)) locs = loadCache('locations') || [];
    loc = locs.find(l =>
      (l.code && String(l.code).toUpperCase() === codeUpper) ||
      (l.qr_token && String(l.qr_token).toLowerCase() === codeLower)
    ) || null;
  }

  if (!loc) {
    alert('Could not find this table/room. Check Wi‑Fi is the restaurant network and the server is running.\nCode: ' + raw);
    showPage('guest-entry');
    const codeEl = document.getElementById('location-code');
    if (codeEl) codeEl.value = raw;
    return false;
  }

  currentLocation = loc;
  currentService = loc.type === 'room' ? 'room' : 'restaurant';
  try {
    sessionStorage.setItem('otech_table', JSON.stringify({
      code: loc.code, token: loc.qr_token, type: loc.type, name: loc.name
    }));
  } catch (e) {}

  const codeEl = document.getElementById('location-code');
  if (codeEl) codeEl.value = loc.qr_token || loc.code;

  const locEl = document.getElementById('guest-location');
  const typeEl = document.getElementById('guest-type');
  if (locEl) locEl.textContent = loc.name || loc.code;
  if (typeEl) typeEl.textContent = loc.type === 'room' ? 'Room Service' : 'Table Service';

  showPage('guest-menu');
  await loadMenu();
  return true;
}

function guestBack() {
  // Stay in guest context; go to entry only if staff needs to change table
  if (lastOrderId) {
    showPage('order-confirm');
    refreshOrderStatus();
  } else {
    showPage('guest-entry');
  }
}

function orderMoreSameTable() {
  if (!currentLocation) {
    alert('Scan your table QR code first to order.');
    showPage('guest-entry');
    return;
  }
  showPage('guest-menu');
}

async function loadMenu() {
  const svc = currentService || 'both';
  // Always try network — do not trust navigator.onLine alone
  let cats = await api('/api/categories?service=' + encodeURIComponent(svc));
  let items = await api('/api/menu?service=' + encodeURIComponent(svc));

  if (Array.isArray(cats) && cats.length) {
    allCategories = cats;
    saveCache('categories_' + svc, cats);
    saveCache('categories_both', cats);
  }
  if (Array.isArray(items) && items.length) {
    allMenuItems = items;
    saveCache('menu_' + svc, items);
    saveCache('menu_both', items);
  }

  // Fallback service=both if filtered empty
  if ((!Array.isArray(items) || !items.length) && svc !== 'both') {
    const itemsBoth = await api('/api/menu?service=both');
    if (Array.isArray(itemsBoth) && itemsBoth.length) {
      allMenuItems = itemsBoth;
      saveCache('menu_both', itemsBoth);
    }
  }

  if (!Array.isArray(allCategories) || !allCategories.length) {
    allCategories = loadCache('categories_' + svc) || loadCache('categories_both') || [];
  }
  if (!Array.isArray(allMenuItems) || !allMenuItems.length) {
    allMenuItems = loadCache('menu_' + svc) || loadCache('menu_both') || [];
  }

  // Last resort: show any cached menus
  if (!Array.isArray(allMenuItems) || !allMenuItems.length) {
    allMenuItems = loadCache('menu_restaurant') || loadCache('menu_room') || [];
  }

  renderCategories();
  renderMenuItems();

  const el = document.getElementById('menu-items');
  if (el && (!allMenuItems || !allMenuItems.length)) {
    el.innerHTML = '<p class="hint" style="padding:24px;text-align:center">' +
      'No menu items loaded.<br><small>Check Wi‑Fi, open the PC LAN address (not localhost), and allow port 8080 in Windows Firewall.</small>' +
      '<br><button class="btn primary" style="margin-top:12px" onclick="loadMenu()">Retry</button></p>';
  }
}

function renderCategories() {
  const el = document.getElementById('menu-categories');
  if (!el) return;
  el.innerHTML = '<button class="tab active" data-id="all" onclick="filterMenu(this)">All</button>' +
    (allCategories || []).map(c => '<button class="tab" data-id="' + c.id + '" onclick="filterMenu(this)">' + esc(c.name) + '</button>').join('');
}
function filterMenu(btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderMenuItems(btn.dataset.id === 'all' ? null : btn.dataset.id);
}
function renderMenuItems(catId) {
  let items = Array.isArray(allMenuItems) ? allMenuItems.slice() : [];
  if (catId) items = items.filter(i => String(i.category_id) === String(catId));
  const el = document.getElementById('menu-items');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="hint" style="padding:24px;text-align:center">No menu items available yet' +
      (!isOnline ? ' (offline)' : '') + '.<br><small>Ask staff to add items in Admin → Menu.</small></p>';
    return;
  }
  el.className = 'menu-grid';
  el.innerHTML = items.map(item => {
    const img = item.image_url
      ? '<img class="card-img" src="' + esc(item.image_url) + '" alt="' + esc(item.name) + '" loading="lazy">'
      : '<div class="card-img placeholder">🍽</div>';
    return '<article class="menu-card">' +
      '<div class="card-media">' + img + '</div>' +
      '<div class="card-body">' +
      '<h4>' + esc(item.name) + '</h4>' +
      (item.description ? '<p class="desc">' + esc(item.description) + '</p>' : '') +
      '<div class="card-footer">' +
      '<span class="price">' + formatPrice(item.price) + '</span>' +
      '<button type="button" class="add-btn" onclick="addToCart(' + item.id + ')">+ Add</button>' +
      '</div></div></article>';
  }).join('');
}

function addToCart(itemId) {
  itemId = Number(itemId);
  const item = (allMenuItems || []).find(i => Number(i.id) === itemId);
  if (!item) { console.warn('Item not found', itemId); return; }
  const existing = cart.find(c => Number(c.menu_item_id) === itemId);
  if (existing) existing.quantity++;
  else cart.push({ menu_item_id: item.id, item_name: item.name, unit_price: Number(item.price), quantity: 1, notes: '' });
  updateCartUI();
  // Open cart pane on mobile
  const pane = document.getElementById('cart-pane');
  if (pane && window.innerWidth < 769) pane.classList.add('open');
}
function updateCartUI() {
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = count;
  const total = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = total.toFixed(2);
  const currencyEl = document.getElementById('currency');
  if (currencyEl) currencyEl.textContent = settings.currency_symbol || settings.currency || 'K';
  const el = document.getElementById('cart-items');
  if (!el) return;
  if (!cart.length) { el.innerHTML = '<p class="hint">Cart is empty — tap + on menu items</p>'; return; }
  el.innerHTML = cart.map((c, idx) =>
    '<div class="cart-item"><div><strong>' + esc(c.item_name) + '</strong><br><small>' +
    formatPrice(c.unit_price) + ' × ' + c.quantity + ' = ' + formatPrice(c.unit_price * c.quantity) +
    '</small></div><div class="qty"><button type="button" onclick="changeQty(' +
    idx + ',-1)">−</button><span>' + c.quantity + '</span><button type="button" onclick="changeQty(' + idx + ',1)">+</button></div></div>'
  ).join('');
}
function changeQty(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  updateCartUI();
}
function toggleCartPane() {
  const pane = document.getElementById('cart-pane');
  if (pane) pane.classList.toggle('open');
  updateCartUI();
}
function toggleCart() { toggleCartPane(); }

async function placeOrder() {
  if (!cart.length) return alert('Cart is empty');
  if (!currentLocation) return alert('No location selected');
  const payload = {
    location_code: currentLocation.code,
    location_type: currentLocation.type,
    customer_name: document.getElementById('customer-name').value || 'Guest',
    notes: document.getElementById('order-notes').value || '',
    items: cart
  };
  if (!isOnline) {
    offlineQueue.push(payload);
    localStorage.setItem('otech_order_queue', JSON.stringify(offlineQueue));
    lastOrderId = 'OFF-' + Date.now();
    document.getElementById('confirm-number').textContent = lastOrderId + ' (queued offline)';
    document.getElementById('confirm-total').textContent = formatPrice(cart.reduce((s, i) => s + i.quantity * i.unit_price, 0));
    cart = [];
    updateCartUI();
    document.getElementById('cart-drawer').classList.remove('open');
    showPage('order-confirm');
    alert('You are offline. Order saved and will send when connection returns.');
    return;
  }
  const res = await api('/api/order', 'POST', payload);
  if (res.success) {
    lastOrderId = res.order_id;
    document.getElementById('confirm-number').textContent = res.order_number;
    document.getElementById('confirm-total').textContent = formatPrice(res.total);
    cart = [];
    updateCartUI();
    document.getElementById('cart-drawer').classList.remove('open');
    showPage('order-confirm');
    setTimeout(refreshOrderStatus, 500);
  } else alert(res.error || 'Failed to place order');
}
function trackOrder() {
  showPage('order-confirm');
  refreshOrderStatus();
}

async function refreshOrderStatus() {
  const box = document.getElementById('track-status-text');
  const title = document.getElementById('track-title');
  if (!lastOrderId) {
    if (box) box.textContent = 'No order yet. Scan QR and place an order.';
    return;
  }
  // Load orders and find ours (by id or order number) for THIS table only
  let orders = [];
  if (isOnline) {
    orders = await api('/api/orders');
    if (!Array.isArray(orders)) orders = [];
  } else {
    orders = loadCache('orders') || [];
  }
  const tableCode = currentLocation ? currentLocation.code : null;
  let order = orders.find(o => String(o.id) === String(lastOrderId) || o.order_number === lastOrderId);
  if (!order && tableCode) {
    // latest order for this table
    const tableOrders = orders.filter(o => o.location_code === tableCode);
    if (tableOrders.length) order = tableOrders[0];
  }
  if (!order) {
    if (box) box.textContent = 'Waiting for kitchen to receive your order…';
    setStepStatus('pending');
    return;
  }
  const st = order.status || 'pending';
  setStepStatus(st);
  const labels = {
    pending: 'Order received — waiting for kitchen',
    preparing: 'Kitchen is preparing your order…',
    ready: 'Your order is ready!',
    delivered: 'Order delivered to your table/room',
    completed: 'Order completed. Thank you!',
    cancelled: 'Order was cancelled'
  };
  if (box) box.textContent = labels[st] || st;
  if (title) title.textContent = st === 'completed' || st === 'delivered' ? 'Enjoy your meal!' : 'Order Status';
  const numEl = document.getElementById('confirm-number');
  if (numEl) numEl.textContent = order.order_number || lastOrderId;
  if (order.total != null) {
    const tot = document.getElementById('confirm-total');
    if (tot) tot.textContent = formatPrice(order.total);
  }
  // Big status badge for customer
  const badge = document.getElementById('live-status-badge');
  if (badge) {
    const badgeText = {
      pending: 'Pending — received',
      preparing: 'Preparing…',
      ready: 'Ready!',
      delivered: 'Delivered',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    badge.textContent = badgeText[st] || st;
    badge.className = 'live-status ' + st;
  }
  // Soft chime when status changes for the guest
  if (lastCustomerStatus && lastCustomerStatus !== st) {
    playNotifySound('status');
  }
  lastCustomerStatus = st;
}

function setStepStatus(status) {
  const order = ['pending', 'preparing', 'ready', 'delivered'];
  const idx = order.indexOf(status === 'completed' ? 'delivered' : status);
  order.forEach((s, i) => {
    const el = document.getElementById('step-' + s);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
  if (status === 'completed') {
    ['pending','preparing','ready','delivered'].forEach(s => {
      const el = document.getElementById('step-' + s);
      if (el) { el.classList.add('done'); el.classList.remove('active'); }
    });
  }
}

async function loadKitchenOrders() {
  let orders = [];
  if (isOnline) {
    orders = await api('/api/orders');
    if (Array.isArray(orders)) saveCache('orders', orders);
    else orders = [];
  }
  if (!Array.isArray(orders) || !orders.length) {
    const cached = loadCache('orders');
    orders = Array.isArray(cached) ? cached : [];
  }

  // New-order notification sound for kitchen / tracking staff
  const soundEl = document.getElementById('kds-sound');
  const soundOn = !soundEl || soundEl.checked;
  if (knownOrderIds.size > 0) {
    const newOnes = orders.filter(o =>
      o.status === 'pending' && !knownOrderIds.has(String(o.id))
    );
    if (newOnes.length && soundOn) {
      playNotifySound('new');
      document.title = '🔔 New order! — Otech Kitchen';
      setTimeout(() => { document.title = 'Otech Digital Menu'; }, 4000);
    }
  }
  orders.forEach(o => knownOrderIds.add(String(o.id)));

  const el = document.getElementById('kds-orders');
  if (!el) return;

  let filtered;
  if (kdsFilter === 'all') filtered = orders;
  else if (kdsFilter === 'done') filtered = orders.filter(o => o.status === 'completed' || o.status === 'delivered');
  else filtered = orders.filter(o => o.status === kdsFilter);

  if (!filtered.length) {
    el.innerHTML = '<p class="hint" style="grid-column:1/-1;text-align:center;padding:40px">No orders in this view</p>';
    return;
  }
  el.innerHTML = filtered.map(o => {
    const itemsHtml = (o.items || []).map(i =>
      '<li>' + i.quantity + '× ' + esc(i.item_name) + (i.notes ? ' <em>(' + esc(i.notes) + ')</em>' : '') + '</li>'
    ).join('');
    const nextStatus = { pending: 'preparing', preparing: 'ready', ready: 'delivered', delivered: 'completed' }[o.status];
    const nextLabel = labelStatus(nextStatus);
    return '<div class="kds-card ' + o.status + '"><h4>#' + esc(o.order_number) + ' — ' + esc(o.location_code) +
      ' <span class="badge">' + esc(o.status) + '</span></h4><div class="meta">' + esc(o.customer_name) + ' · ' +
      formatTime(o.created_at) + ' · ' + formatPrice(o.total) +
      '</div><ul>' + itemsHtml + '</ul>' + (o.notes ? '<p class="meta">Note: ' + esc(o.notes) + '</p>' : '') +
      '<div class="kds-actions">' +
      (nextStatus && isOnline ? '<button class="btn small primary" onclick="updateOrderStatus(' + o.id + ',\'' + nextStatus + '\')">' + nextLabel + '</button>' : '') +
      (o.status !== 'completed' && o.status !== 'cancelled' && isOnline ?
        '<button class="btn small outline" onclick="updateOrderStatus(' + o.id + ',\'completed\')">Done</button>' : '') +
      '</div></div>';
  }).join('');
}
function filterKDS(btn) {
  document.querySelectorAll('.kds-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  kdsFilter = btn.dataset.status;
  loadKitchenOrders();
}
async function updateOrderStatus(id, status) {
  if (!isOnline) return alert('Cannot update while offline');
  await api('/api/order/status', 'POST', { order_id: id, status });
  loadKitchenOrders();
}
function labelStatus(s) {
  return { preparing: 'Start Prep', ready: 'Mark Ready', delivered: 'Delivered', completed: 'Complete' }[s] || s;
}

async function doLogin() {
  const username = document.getElementById('admin-user').value;
  const password = document.getElementById('admin-pass').value;
  const res = await api('/api/login', 'POST', { username, password });
  if (res.success) {
    adminToken = res.token;
    localStorage.setItem('otech_token', adminToken);
    showPage('admin');
    loadAdmin();
  } else alert(res.error || 'Login failed');
}
function logout() {
  adminToken = null;
  localStorage.removeItem('otech_token');
  showPage('landing');
}
function showAdminPanel(btn) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
  if (btn.dataset.panel === 'stats') loadStats();
  if (btn.dataset.panel === 'finance') loadFinanceReport();
  if (btn.dataset.panel === 'menu') loadAdminMenu();
  if (btn.dataset.panel === 'locations') loadAdminLocations();
  if (btn.dataset.panel === 'orders') loadAdminOrders();
  if (btn.dataset.panel === 'settings') { fillSettingsForm(); loadUsers(); }
}
async function loadAdmin() { loadStats(); }
async function loadStats() {
  const s = await api('/api/admin/stats');
  const el = document.getElementById('stats-grid');
  if (!el) return;
  if (s.error || s.offline) { el.innerHTML = '<p class="hint">Stats unavailable offline</p>'; return; }
  el.innerHTML =
    '<div class="stat-card"><div class="value">' + s.today_orders + '</div><div class="label">Today\'s Orders</div></div>' +
    '<div class="stat-card"><div class="value">' + formatPrice(s.today_sales) + '</div><div class="label">Today\'s Sales</div></div>' +
    '<div class="stat-card"><div class="value">' + s.active_orders + '</div><div class="label">Active Orders</div></div>' +
    '<div class="stat-card"><div class="value">' + s.menu_items + '</div><div class="label">Menu Items</div></div>';
}
async function loadAdminMenu() {
  const cats = await api('/api/categories?service=both');
  let items = await api('/api/menu/all-admin');
  if (!Array.isArray(items)) items = await api('/api/menu?service=both');
  if (!Array.isArray(items)) items = [];
  const el = document.getElementById('admin-menu-list');
  if (!el) return;
  if (!Array.isArray(cats)) { el.innerHTML = '<p class="hint">Cannot load menu offline</p>'; return; }
  window._adminMenuItems = items;
  if (!items.length) {
    el.innerHTML = '<p class="hint">No menu items yet. Click "+ Menu Item" to add food or services with photos.</p>';
    return;
  }
  el.innerHTML = cats.map(c => {
    const catItems = items.filter(i => String(i.category_id) === String(c.id));
    if (!catItems.length) return '';
    return '<div class="admin-cat-block"><h3 class="admin-cat-title">' + esc(c.name) +
      ' <small>(' + esc(c.service_type || 'both') + ')</small></h3>' +
      '<div class="admin-menu-grid">' +
      catItems.map(i => {
        const media = i.image_url
          ? '<img src="' + esc(i.image_url) + '" alt="' + esc(i.name) + '" loading="lazy">'
          : '<div class="no-photo">🍽</div>';
        return '<article class="admin-card">' +
          '<div class="admin-card-img">' + media +
          (i.available ? '' : '<span class="ribbon">Hidden</span>') +
          '</div>' +
          '<div class="admin-card-body">' +
          '<h4>' + esc(i.name) + '</h4>' +
          '<p class="desc">' + esc(i.description || 'No description') + '</p>' +
          '<div class="admin-card-meta">' +
          '<strong class="price">' + formatPrice(i.price) + '</strong>' +
          '<span class="tag">' + esc(i.service_type || 'both') + '</span></div>' +
          '<div class="admin-card-actions">' +
          '<button class="btn small primary" onclick="showEditItem(' + i.id + ')">Edit / Photo</button>' +
          '<button class="btn small danger" onclick="deleteItem(' + i.id + ')">Delete</button>' +
          '</div></div></article>';
      }).join('') + '</div></div>';
  }).join('') || '<p class="hint">No items in categories</p>';
}
async function loadAdminLocations() {
  const locs = await api('/api/locations');
  const el = document.getElementById('admin-locations');
  if (!el) return;
  if (!Array.isArray(locs)) { el.innerHTML = '<p class="hint">Cannot load locations offline</p>'; return; }
  window._adminLocations = locs;
  const tables = locs.filter(l => l.type === 'table');
  const rooms = locs.filter(l => l.type === 'room');
  function card(l) {
    return '<article class="loc-manage-card">' +
      '<div class="loc-manage-top">' +
      '<div><span class="loc-badge ' + esc(l.type) + '">' + (l.type === 'table' ? 'Table' : 'Room') + '</span>' +
      '<h4>' + esc(l.code) + '</h4>' +
      '<p class="meta">' + esc(l.name || '') + '</p></div>' +
      '<div class="loc-qr-mini" id="qr-mini-' + l.id + '"></div></div>' +
      '<p class="meta small">QR token: <code>' + esc(l.qr_token) + '</code></p>' +
      '<div class="loc-manage-actions">' +
      '<button class="btn small primary" onclick="showQR(\'' + esc(l.qr_token) + '\',\'' + esc(l.code) + '\',\'' + esc(l.type) + '\')">View QR</button>' +
      '<button class="btn small outline" onclick="showEditLocation(' + l.id + ')">Edit</button>' +
      '<button class="btn small outline" onclick="regenLocationQR(' + l.id + ')">New QR</button>' +
      '<button class="btn small danger" onclick="deleteLocation(' + l.id + ')">Delete</button>' +
      '</div></article>';
  }
  el.innerHTML =
    '<p class="hint">Manage tables &amp; rooms. Each has one QR for guests to open the menu and track delivery.</p>' +
    '<h3 class="admin-cat-title">Tables (' + tables.length + ')</h3>' +
    '<div class="loc-manage-grid">' + (tables.map(card).join('') || '<p class="hint">No tables</p>') + '</div>' +
    '<h3 class="admin-cat-title" style="margin-top:20px">Rooms (' + rooms.length + ')</h3>' +
    '<div class="loc-manage-grid">' + (rooms.map(card).join('') || '<p class="hint">No rooms</p>') + '</div>';
  setTimeout(function() {
    locs.forEach(function(l) {
      var box = document.getElementById('qr-mini-' + l.id);
      if (!box) return;
      var base = getGuestBaseUrl();
      var url = base.replace(/\/$/, '') + '/?loc=' + encodeURIComponent(l.qr_token);
      if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(box, url, { width: 72, margin: 1 }, function() {});
      } else {
        box.innerHTML = '<img width="72" height="72" src="https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=' + encodeURIComponent(url) + '" alt="QR">';
      }
    });
  }, 50);
}

function showEditLocation(id) {
  var l = (window._adminLocations || []).find(function(x) { return x.id == id; });
  if (!l) return alert('Location not found');
  openModal('Edit ' + (l.type === 'table' ? 'Table' : 'Room') + ' — ' + esc(l.code),
    '<label>Code</label><input class="input" id="m-code" value="' + esc(l.code) + '">' +
    '<label>Display name</label><input class="input" id="m-name" value="' + esc(l.name || '') + '">' +
    '<label>Type</label><select class="input" id="m-type">' +
    '<option value="table"' + (l.type === 'table' ? ' selected' : '') + '>Table</option>' +
    '<option value="room"' + (l.type === 'room' ? ' selected' : '') + '>Room</option></select>' +
    '<p class="hint small">Current QR: <code>' + esc(l.qr_token) + '</code></p>' +
    '<button class="btn primary full" style="margin-top:12px" onclick="saveLocationEdit(' + id + ')">Save changes</button>');
}

async function saveLocationEdit(id) {
  var code = (document.getElementById('m-code') || {}).value;
  var name = (document.getElementById('m-name') || {}).value;
  var type = (document.getElementById('m-type') || {}).value || 'table';
  if (!code || !String(code).trim()) { alert('Code is required'); return; }
  var res = await api('/api/location/' + id, 'POST', {
    code: String(code).trim().toUpperCase(),
    name: (name || '').trim() || String(code).trim().toUpperCase(),
    type: type
  });
  if (res && res.error) { alert('Update failed: ' + res.error); return; }
  closeModal();
  await loadAdminLocations();
}

async function regenLocationQR(id) {
  if (!confirm('Generate a NEW QR code? Old printed stickers will stop working until you reprint.')) return;
  var res = await api('/api/location/' + id, 'POST', { regen_qr: true });
  if (res && res.error) { alert('Failed: ' + res.error); return; }
  await loadAdminLocations();
  if (res.location) showQR(res.location.qr_token, res.location.code, res.location.type);
}

async function deleteLocation(id) {
  var l = (window._adminLocations || []).find(function(x) { return x.id == id; });
  if (!confirm('Delete ' + (l ? l.code : 'this location') + '?')) return;
  var res = await api('/api/location/' + id, 'DELETE');
  if (res && res.error) { alert('Delete failed: ' + res.error); return; }
  await loadAdminLocations();
}

async function loadAdminOrders() {
  const orders = await api('/api/orders');
  const el = document.getElementById('admin-orders-list');
  if (!el) return;
  if (!orders || orders.error) { el.innerHTML = '<p class="hint">Cannot load orders offline</p>'; return; }
  el.innerHTML = orders.slice(0, 30).map(o =>
    '<div class="admin-item"><div class="left"><h4>#' + esc(o.order_number) + ' · ' + esc(o.location_code) +
    ' · ' + o.status + '</h4><div class="meta">' + esc(o.customer_name) + ' · ' + formatPrice(o.total) +
    ' · ' + formatTime(o.created_at) + '</div></div></div>'
  ).join('') || '<p class="hint">No orders yet</p>';
}

function fillSettingsForm() {
  const map = {
    'set-business_name': 'business_name', 'set-tagline': 'tagline', 'set-address': 'address',
    'set-phone': 'phone', 'set-email': 'email', 'set-logo_url': 'logo_url',
    'set-currency': 'currency', 'set-currency_symbol': 'currency_symbol',
    'set-tax_rate': 'tax_rate', 'set-tax_label': 'tax_label',
    'set-theme_primary': 'theme_primary', 'set-theme_accent': 'theme_accent',
    'set-theme_bg': 'theme_bg', 'set-theme_mode': 'theme_mode',
    'set-welcome_message': 'welcome_message', 'set-service_note': 'service_note',
    'set-order_success_msg': 'order_success_msg', 'set-public_base_url': 'public_base_url'
  };
  for (const [elId, key] of Object.entries(map)) {
    const el = document.getElementById(elId);
    if (el) el.value = settings[key] || '';
  }
  const preview = document.getElementById('logo-preview');
  if (preview) {
    const src = settings.logo_base64 || settings.logo_url;
    preview.innerHTML = src ? '<img src="' + src + '" alt="Logo">' : '';
  }
}
function handleLogoUpload(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > 800000) { alert('Image too large (max ~800 KB)'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    settings.logo_base64 = e.target.result;
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = '<img src="' + e.target.result + '" alt="Logo">';
  };
  reader.readAsDataURL(file);
}
async function saveSettings() {
  const payload = {
    business_name: document.getElementById('set-business_name').value,
    restaurant_name: document.getElementById('set-business_name').value,
    tagline: document.getElementById('set-tagline').value,
    address: document.getElementById('set-address').value,
    phone: document.getElementById('set-phone').value,
    email: document.getElementById('set-email').value,
    logo_url: document.getElementById('set-logo_url').value,
    logo_base64: settings.logo_base64 || '',
    currency: document.getElementById('set-currency').value,
    currency_symbol: document.getElementById('set-currency_symbol').value,
    tax_rate: document.getElementById('set-tax_rate').value,
    tax_label: document.getElementById('set-tax_label').value,
    theme_primary: document.getElementById('set-theme_primary').value,
    theme_accent: document.getElementById('set-theme_accent').value,
    theme_bg: document.getElementById('set-theme_bg').value,
    theme_mode: document.getElementById('set-theme_mode').value,
    welcome_message: document.getElementById('set-welcome_message').value,
    service_note: document.getElementById('set-service_note').value,
    order_success_msg: document.getElementById('set-order_success_msg').value,
    public_base_url: (document.getElementById('set-public_base_url') || {}).value || settings.public_base_url || ''
  };
  const status = document.getElementById('settings-status');
  if (!isOnline) {
    Object.assign(settings, payload);
    saveCache('settings', settings);
    applySettings();
    if (status) status.textContent = 'Saved locally (offline). Will sync when online.';
    return;
  }
  const res = await api('/api/settings', 'POST', payload);
  if (res.success) {
    Object.assign(settings, payload);
    saveCache('settings', settings);
    applySettings();
    if (status) status.textContent = 'Settings saved successfully.';
  } else if (status) status.textContent = 'Error: ' + (res.error || 'Failed');
}

function showAddCategory() {
  openModal('Add Category',
    '<input class="input" id="m-name" placeholder="Category name">' +
    '<input class="input" id="m-desc" placeholder="Description">' +
    '<select class="input" id="m-stype"><option value="both">Both</option><option value="restaurant">Restaurant only</option><option value="room">Room Service only</option></select>' +
    '<button class="btn primary full" onclick="saveCategory()">Save</button>');
}
async function saveCategory() {
  await api('/api/category', 'POST', {
    name: document.getElementById('m-name').value,
    description: document.getElementById('m-desc').value,
    service_type: document.getElementById('m-stype').value
  });
  closeModal(); loadAdminMenu();
}
window._pendingItemImage = '';
function itemFormHtml(cats, item) {
  item = item || {};
  const opts = cats.map(c =>
    '<option value="' + c.id + '"' + (item.category_id == c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'
  ).join('');
  const st = item.service_type || 'both';
  return '<label>Category</label><select class="input" id="m-cat">' + opts + '</select>' +
    '<label>Name</label><input class="input" id="m-name" placeholder="Item name" value="' + esc(item.name || '') + '">' +
    '<label>Description</label><input class="input" id="m-desc" placeholder="Description" value="' + esc(item.description || '') + '">' +
    '<label>Price</label><input class="input" id="m-price" type="number" step="0.01" placeholder="Price" value="' + (item.price != null ? item.price : '') + '">' +
    '<label>Service</label><select class="input" id="m-stype">' +
    '<option value="both"' + (st==='both'?' selected':'') + '>Both</option>' +
    '<option value="restaurant"' + (st==='restaurant'?' selected':'') + '>Restaurant only</option>' +
    '<option value="room"' + (st==='room'?' selected':'') + '>Room Service only</option></select>' +
    '<label>Available</label><select class="input" id="m-avail">' +
    '<option value="1"' + (item.available !== 0 ? ' selected' : '') + '>Yes</option>' +
    '<option value="0"' + (item.available === 0 ? ' selected' : '') + '>No (hidden)</option></select>' +
    '<label>Photo (optional)</label><input type="file" id="m-image" accept="image/*" class="input" onchange="onItemImageSelected(event)">' +
    '<div id="m-image-preview" class="logo-preview">' +
    (item.image_url ? '<img src="' + esc(item.image_url) + '" style="max-height:80px;border-radius:8px">' : '') +
    '</div>';
}
function onItemImageSelected(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('Image too large (max 2 MB). Use a smaller photo.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._pendingItemImage = e.target.result;
    const prev = document.getElementById('m-image-preview');
    if (prev) prev.innerHTML = '<img src="' + e.target.result + '" style="max-height:80px;border-radius:8px">';
  };
  reader.readAsDataURL(file);
}
function showAddItem() {
  window._pendingItemImage = '';
  api('/api/categories?service=both').then(cats => {
    if (!Array.isArray(cats) || !cats.length) return alert('Need connection (or add a category first)');
    openModal('Add Menu / Service Item',
      itemFormHtml(cats, null) +
      '<button class="btn primary full" style="margin-top:12px" onclick="saveItem(null)">Save Item</button>');
  });
}
function showEditItem(id) {
  window._pendingItemImage = '';
  const item = (window._adminMenuItems || []).find(i => i.id == id);
  if (!item) return alert('Item not found');
  api('/api/categories?service=both').then(cats => {
    if (!Array.isArray(cats)) return alert('Need connection to edit');
    openModal('Edit Menu Item',
      itemFormHtml(cats, item) +
      '<button class="btn primary full" style="margin-top:12px" onclick="saveItem(' + id + ')">Update Item</button>');
  });
}
async function saveItem(id) {
  const nameEl = document.getElementById('m-name');
  if (!nameEl || !nameEl.value.trim()) { alert('Please enter item name'); return; }
  const payload = {
    category_id: +document.getElementById('m-cat').value,
    name: nameEl.value.trim(),
    description: (document.getElementById('m-desc') || {}).value || '',
    price: parseFloat((document.getElementById('m-price') || {}).value) || 0,
    service_type: (document.getElementById('m-stype') || {}).value || 'both',
    available: parseInt((document.getElementById('m-avail') || {}).value, 10)
  };
  if (isNaN(payload.available)) payload.available = 1;
  if (window._pendingItemImage) payload.image_url = window._pendingItemImage;
  else if (id) {
    const existing = (window._adminMenuItems || []).find(i => i.id == id);
    if (existing && existing.image_url) payload.image_url = existing.image_url;
  }
  let res;
  if (id) res = await api('/api/menu-item/' + id, 'POST', payload);
  else res = await api('/api/menu-item', 'POST', payload);
  if (res && res.error) {
    alert('Save failed: ' + res.error);
    return;
  }
  window._pendingItemImage = '';
  closeModal();
  await loadAdminMenu();
}
async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  await api('/api/menu-item/' + id, 'DELETE');
  loadAdminMenu();
}
function showAddLocation(type) {
  openModal('Add ' + (type === 'table' ? 'Table' : 'Room'),
    '<label>Code</label><input class="input" id="m-code" placeholder="e.g. ' + (type === 'table' ? 'T09' : 'R201') + '">' +
    '<label>Display name</label><input class="input" id="m-name" placeholder="e.g. Table 9">' +
    '<button class="btn primary full" style="margin-top:12px" onclick="saveLocation(\'' + type + '\')">Create &amp; show QR</button>');
}
async function saveLocation(type) {
  var code = (document.getElementById('m-code') || {}).value;
  if (!code || !String(code).trim()) { alert('Enter a code'); return; }
  var res = await api('/api/location', 'POST', {
    code: String(code).trim().toUpperCase(),
    name: ((document.getElementById('m-name') || {}).value || '').trim() || String(code).trim().toUpperCase(),
    type: type
  });
  if (res && res.error) { alert('Failed: ' + res.error); return; }
  closeModal();
  await loadAdminLocations();
  if (res.qr_token) showQR(res.qr_token, String(code).trim().toUpperCase(), type);
}
function showQR(token, code, type) {
  const base = getGuestBaseUrl();
  const url = base.replace(/\/$/, '') + '/?loc=' + encodeURIComponent(token);
  openModal('QR — ' + code + ' (' + type + ')',
    '<div class="qr-box"><div id="qrcode"></div><p style="margin-top:12px"><strong>' + esc(code) +
    '</strong> · ' + esc(type) + '</p>' +
    '<p class="hint small">Guests on restaurant Wi‑Fi scan this to open the menu, order, and track delivery for <strong>' + esc(code) + '</strong>.</p>' +
    '<p class="hint small" style="word-break:break-all">' + esc(url) + '</p>' +
    '<button class="btn outline full" style="margin-top:10px" onclick="printQRCard(\'' + esc(code) + '\',\'' + esc(url) + '\')">Print QR card</button></div>');
  setTimeout(() => {
    const container = document.getElementById('qrcode');
    if (container && typeof QRCode !== 'undefined') {
      QRCode.toCanvas(container, url, { width: 200, margin: 2 }, err => {
        if (err) container.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" alt="QR">';
      });
    } else if (container) {
      container.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" alt="QR">';
    }
  }, 100);
}
function printQRCard(code, url) {
  const w = window.open('', '_blank');
  w.document.write('<html><head><title>QR ' + code + '</title><style>body{font-family:sans-serif;text-align:center;padding:40px} img{width:220px;height:220px} h1{color:#0f766e}</style></head><body>' +
    '<h1>' + code + '</h1><p>Scan to order</p>' +
    '<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url) + '" alt="QR">' +
    '<p style="font-size:12px;color:#64748b;margin-top:16px">' + url + '</p>' +
    '<script>window.onload=function(){window.print()}<\/script></body></html>');
  w.document.close();
}

function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

async function api(path, method, body) {
  method = method || 'GET';
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    cache: 'no-store'
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    opts.signal = controller.signal;
    const res = await fetch(API + path, opts);
    clearTimeout(timer);
    if (!res.ok) {
      let errBody = {};
      try { errBody = await res.json(); } catch (e) {}
      return { error: errBody.error || ('HTTP ' + res.status), offline: false, status: res.status };
    }
    const data = await res.json();
    isOnline = true;
    const banner = document.getElementById('offline-banner');
    if (banner) banner.classList.add('hidden');
    return data;
  } catch (e) {
    isOnline = false;
    const banner = document.getElementById('offline-banner');
    if (banner) banner.classList.remove('hidden');
    return { error: e.name === 'AbortError' ? 'Timeout' : e.message, offline: true };
  }
}

async function checkConnection() {
  const r = await api('/api/ping');
  isOnline = !!(r && r.ok);
  const banner = document.getElementById('offline-banner');
  if (banner) banner.classList.toggle('hidden', isOnline);
  return isOnline;
}
function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


// ---------- User Management ----------
async function loadUsers() {
  const el = document.getElementById('users-list');
  if (!el) return;
  const users = await api('/api/users');
  if (!users || users.error || users.offline) {
    el.innerHTML = '<p class="hint">Cannot load users offline</p>';
    return;
  }
  if (!users.length) {
    el.innerHTML = '<p class="hint">No users found</p>';
    return;
  }
  el.innerHTML = users.map(u =>
    '<div class="admin-item">' +
      '<div class="left">' +
        '<h4>' + esc(u.username) + '</h4>' +
        '<div class="meta">Role: <strong>' + esc(u.role) + '</strong>' +
          (u.created_at ? ' · Created ' + formatTime(u.created_at) : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn small outline" onclick="showEditUser(' + u.id + ',\'' + esc(u.username) + '\',\'' + esc(u.role) + '\')">Edit</button>' +
        '<button class="btn small danger" onclick="deleteUser(' + u.id + ',\'' + esc(u.username) + '\')">Del</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function showAddUser() {
  openModal('Add User',
    '<input class="input" id="u-username" placeholder="Username">' +
    '<input class="input" id="u-password" type="password" placeholder="Password">' +
    '<select class="input" id="u-role">' +
      '<option value="staff">Staff</option>' +
      '<option value="kitchen">Kitchen</option>' +
      '<option value="manager">Manager</option>' +
      '<option value="admin">Admin</option>' +
    '</select>' +
    '<button class="btn primary full" onclick="saveNewUser()">Create User</button>');
}

async function saveNewUser() {
  const username = document.getElementById('u-username').value.trim();
  const password = document.getElementById('u-password').value;
  const role = document.getElementById('u-role').value;
  if (!username || !password) return alert('Username and password required');
  const res = await api('/api/users', 'POST', { username, password, role });
  if (res.success) {
    closeModal();
    loadUsers();
  } else {
    alert(res.error || 'Failed to create user');
  }
}

function showEditUser(id, username, role) {
  openModal('Edit User',
    '<input class="input" id="u-username" value="' + username + '" placeholder="Username">' +
    '<input class="input" id="u-password" type="password" placeholder="New password (leave blank to keep)">' +
    '<select class="input" id="u-role">' +
      '<option value="staff"' + (role==='staff'?' selected':'') + '>Staff</option>' +
      '<option value="kitchen"' + (role==='kitchen'?' selected':'') + '>Kitchen</option>' +
      '<option value="manager"' + (role==='manager'?' selected':'') + '>Manager</option>' +
      '<option value="admin"' + (role==='admin'?' selected':'') + '>Admin</option>' +
    '</select>' +
    '<button class="btn primary full" onclick="saveEditUser(' + id + ')">Save Changes</button>');
}

async function saveEditUser(id) {
  const username = document.getElementById('u-username').value.trim();
  const password = document.getElementById('u-password').value;
  const role = document.getElementById('u-role').value;
  const payload = { username, role };
  if (password) payload.password = password;
  const res = await api('/api/users/' + id, 'POST', payload);
  // server handles update on POST /api/users/ID
  if (res.success) {
    closeModal();
    loadUsers();
  } else {
    alert(res.error || 'Failed to update user');
  }
}

async function deleteUser(id, username) {
  if (!confirm('Delete user "' + username + '"? This cannot be undone.')) return;
  const res = await api('/api/users/' + id, 'DELETE');
  if (res.success) {
    loadUsers();
  } else {
    alert(res.error || 'Failed to delete user');
  }
}


// ---------- Finance report ----------
async function loadFinanceReport() {
  const el = document.getElementById('finance-report');
  if (!el) return;
  const data = await api('/api/admin/financial');
  if (!data || data.error || data.offline) {
    el.innerHTML = '<p class="hint">Finance data unavailable offline</p>';
    return;
  }
  window._financeData = data;
  let html = '<div class="stats-grid" style="margin-bottom:16px">' +
    '<div class="stat-card"><div class="value">' + formatPrice(data.all_time_sales) + '</div><div class="label">All-time Sales</div></div>' +
    '<div class="stat-card"><div class="value">' + (data.all_time_orders || 0) + '</div><div class="label">All-time Orders</div></div></div>';
  html += '<h3 style="margin:12px 0 8px">By status</h3><table class="finance-table"><tr><th>Status</th><th>Count</th></tr>';
  Object.keys(data.by_status || {}).forEach(k => {
    html += '<tr><td>' + esc(k) + '</td><td>' + data.by_status[k] + '</td></tr>';
  });
  html += '</table><h3 style="margin:16px 0 8px">Daily (last 30 days)</h3><table class="finance-table"><tr><th>Date</th><th>Orders</th><th>Sales</th></tr>';
  (data.daily || []).forEach(d => {
    html += '<tr><td>' + esc(d.day) + '</td><td>' + d.orders + '</td><td>' + formatPrice(d.sales) + '</td></tr>';
  });
  html += '</table><h3 style="margin:16px 0 8px">Top items</h3><table class="finance-table"><tr><th>Item</th><th>Qty</th><th>Revenue</th></tr>';
  (data.top_items || []).forEach(i => {
    html += '<tr><td>' + esc(i.item_name) + '</td><td>' + i.qty + '</td><td>' + formatPrice(i.revenue) + '</td></tr>';
  });
  html += '</table>';
  el.innerHTML = html;
}

function exportFinanceCSV() {
  const data = window._financeData;
  if (!data) { alert('Open Finance tab first'); return; }
  let csv = 'Date,Orders,Sales\\n';
  (data.daily || []).forEach(d => { csv += d.day + ',' + d.orders + ',' + d.sales + '\\n'; });
  csv += '\\nItem,Qty,Revenue\\n';
  (data.top_items || []).forEach(i => { csv += '"' + (i.item_name||'') + '",' + i.qty + ',' + i.revenue + '\\n'; });
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'otech-finance-report.csv';
  a.click();
}

function exportFinancePDF() {
  const data = window._financeData;
  if (!data) { alert('Open Finance tab first to load data'); return; }
  const biz = settings.business_name || 'Otech Restaurant';
  let rows = (data.daily || []).map(d =>
    '<tr><td>' + d.day + '</td><td>' + d.orders + '</td><td>' + formatPrice(d.sales) + '</td></tr>').join('');
  let tops = (data.top_items || []).map(i =>
    '<tr><td>' + esc(i.item_name) + '</td><td>' + i.qty + '</td><td>' + formatPrice(i.revenue) + '</td></tr>').join('');
  const html = '<html><head><title>Finance Report</title><style>' +
    'body{font-family:sans-serif;padding:24px;color:#1e293b} h1{color:#0f766e} table{width:100%;border-collapse:collapse;margin:12px 0}' +
    'th,td{border:1px solid #e2e8f0;padding:8px;text-align:left} th{background:#f0fdfa}</style></head><body>' +
    '<h1>' + esc(biz) + ' — Finance Report</h1><p>Generated: ' + new Date().toLocaleString() + '</p>' +
    '<p><strong>All-time sales:</strong> ' + formatPrice(data.all_time_sales) +
    ' &nbsp; <strong>Orders:</strong> ' + (data.all_time_orders||0) + '</p>' +
    '<h2>Daily</h2><table><tr><th>Date</th><th>Orders</th><th>Sales</th></tr>' + rows + '</table>' +
    '<h2>Top items</h2><table><tr><th>Item</th><th>Qty</th><th>Revenue</th></tr>' + tops + '</table>' +
    '<script>window.onload=function(){window.print()}<\\/script></body></html>';
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

async function exportMenuPDF() {
  const cats = await api('/api/categories?service=both');
  let items = await api('/api/menu?service=both');
  if (!cats || cats.error || !items || items.error) {
    alert('Need connection to export menu');
    return;
  }
  const biz = settings.business_name || 'Otech Restaurant';
  let body = '';
  cats.forEach(c => {
    const list = items.filter(i => i.category_id === c.id && i.available !== 0);
    if (!list.length) return;
    body += '<h2>' + esc(c.name) + '</h2><table><tr><th>Item</th><th>Description</th><th>Price</th></tr>';
    list.forEach(i => {
      body += '<tr><td>' + esc(i.name) + '</td><td>' + esc(i.description || '') +
        '</td><td>' + formatPrice(i.price) + '</td></tr>';
    });
    body += '</table>';
  });
  const html = '<html><head><title>Menu</title><style>' +
    'body{font-family:sans-serif;padding:24px;color:#1e293b} h1,h2{color:#0f766e} table{width:100%;border-collapse:collapse;margin:8px 0 20px}' +
    'th,td{border:1px solid #e2e8f0;padding:8px;text-align:left} th{background:#f0fdfa}' +
    '@media print{button{display:none}}</style></head><body>' +
    '<h1>' + esc(biz) + '</h1><p>' + esc(settings.tagline || 'Digital Menu') + '</p>' +
    '<p>' + esc(settings.address || '') + ' · ' + esc(settings.phone || '') + '</p>' +
    body +
    '<p style="margin-top:24px;font-size:12px;color:#64748b">Printed from Otech Digital Menu · ' + new Date().toLocaleDateString() + '</p>' +
    '<script>window.onload=function(){window.print()}<\\/script></body></html>';
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

(async function init() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); } catch (e) {}
  }
  updateOnlineStatus();
  await checkConnection();
  await loadSettings();
  // Auto-config LAN base URL for QR codes (same Wi‑Fi)
  if (isOnline) {
    try { await refreshNetworkConfig(); } catch (e) {}
  }

  const params = new URLSearchParams(window.location.search);
  const loc = params.get('loc') || params.get('table') || params.get('t');
  if (loc) {
    // QR scanned on phone → open this table's menu + order tracking
    const codeEl = document.getElementById('location-code');
    if (codeEl) codeEl.value = loc;
    try {
      await loadGuestMenu(loc);
    } catch (e) {
      console.error(e);
      showPage('guest-entry');
      alert('Could not open menu. Stay on restaurant Wi‑Fi and try again.');
    }
  } else {
    try {
      const saved = sessionStorage.getItem('otech_table');
      if (saved) {
        const tinfo = JSON.parse(saved);
        if (tinfo && (tinfo.token || tinfo.code)) {
          const codeEl = document.getElementById('location-code');
          if (codeEl) codeEl.value = tinfo.token || tinfo.code;
        }
      }
    } catch (e) {}
  }

  setInterval(() => {
    if (document.getElementById('order-confirm')?.classList.contains('active') && lastOrderId) {
      refreshOrderStatus();
    }
  }, 4000);
  setInterval(() => { checkConnection(); }, 15000);
  setInterval(() => {
    if (document.getElementById('kitchen') && document.getElementById('kitchen').classList.contains('active'))
      loadKitchenOrders();
  }, 6000);
  if (isOnline) {
    api('/api/locations').then(d => { if (Array.isArray(d)) saveCache('locations', d); });
    api('/api/categories?service=both').then(d => { if (Array.isArray(d)) saveCache('categories_both', d); });
    api('/api/menu?service=both').then(d => { if (Array.isArray(d)) saveCache('menu_both', d); });
  }
})();

// Ensure onclick handlers always find functions
window.showEditItem = showEditItem;
window.showAddItem = showAddItem;
window.saveItem = saveItem;
window.deleteItem = deleteItem;
window.loadAdminMenu = loadAdminMenu;
window.onItemImageSelected = onItemImageSelected;
window.showAdminPanel = showAdminPanel;
window.doLogin = doLogin;

window.showEditLocation = showEditLocation;
window.saveLocationEdit = saveLocationEdit;
window.regenLocationQR = regenLocationQR;
window.deleteLocation = deleteLocation;
window.showAddLocation = showAddLocation;
window.saveLocation = saveLocation;
window.showQR = showQR;
window.printQRCard = printQRCard;
