'use strict';
/*
 * Tienda — servidor
 * ------------------------------------------------------------------
 * - Catálogo: proveedor (API firmada HMAC) + productos propios, unificados por UPC.
 * - Categorías: Chocolates · Enlatados · Refrigerados (+ las que traiga el catálogo).
 * - Ficha de envío por producto (peso y medidas) para ShipStation.
 * - Cuentas con Supabase Auth (Google o correo), carrito por usuario, pedidos con estado.
 * - Datos en Supabase (Postgres + Storage). Sin Supabase corre en modo local (archivo).
 * Requiere Node 18+. Sin dependencias.  Ejecutar: node server.js
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/* ── .env ─────────────────────────────────────────────── */
(function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const s = line.trim(); if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('='); if (i === -1) continue;
      const k = s.slice(0, i).trim(); let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (_) {}
})(path.join(__dirname, '.env'));

const DB = require('./db');
const { db, getSetting, setSetting } = DB;
const channels = require('./channels');
const ebay = require('./ebay');
const square = require('./square');
const TAX = require('./tax');
const mail = require('./mail');
const dns = require('dns').promises;

const BASE_URL = (process.env.SHOPPEX_BASE_URL || 'https://partners-api.shoppexcorp.com').replace(/\/+$/, '');
const KEY = process.env.SHOPPEX_KEY || '';
const SECRET = process.env.SHOPPEX_SECRET || '';
const PORT = parseInt(process.env.PORT || '3000', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
let adminPwGenerated = false;
/* Sin contraseña configurada se genera una al azar, pero SOLO fuera de producción: en
 * producción se imprimiría en los registros del servidor (Railway los guarda) y quedaría
 * a la vista de cualquiera con acceso a ellos. Allí es mejor no arrancar. */
if (!ADMIN_PASSWORD && !(process.env.ADMIN_PASSWORD_HASH || '').trim()) {
  if (process.env.NODE_ENV === 'production') {
    console.error('\n  ⛔ Falta la contraseña del panel. Define ADMIN_PASSWORD_HASH');
    console.error('     (genéralo con: npm run hash-password -- "tu frase") y vuelve a desplegar.\n');
    process.exit(1);
  }
  ADMIN_PASSWORD = crypto.randomBytes(12).toString('base64url'); adminPwGenerated = true;
}

const uid = (p) => p + '_' + crypto.randomBytes(6).toString('base64url');
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? round2(n) : null; };
/* Cantidad pedida: entero de 1 a 999. Rechaza basura ("5abc", "1e3", 2.5, NaN) en vez de redondearla. */
const qtyOf = (v) => {
  if (typeof v === 'string' && !/^\s*\d{1,4}\s*$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return n;
};

/* ── Cliente del proveedor (Shoppex Partner API, HMAC) ─
 * Nueva API: https://partners-api.shoppexcorp.com
 * La firma es la misma de antes (METHOD, ROUTE, TS, NONCE, sha256(body) unidos con \n);
 * ROUTE se firma sin dominio y sin query string. */
const API_PREFIX = process.env.SHOPPEX_API_PREFIX != null ? process.env.SHOPPEX_API_PREFIX : '';
const ROUTE_PRODUCTS = process.env.SHOPPEX_ROUTE_PRODUCTS || '/api/v1/products';
const ROUTE_ORDERS = process.env.SHOPPEX_ROUTE_ORDERS || '/api/v1/orders';
function signHeaders(method, route, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
  const signature = crypto.createHmac('sha256', SECRET).update([method, route, timestamp, nonce, bodyHash].join('\n')).digest('hex');
  return { 'Content-Type': 'application/json', 'X-Shoppex-Key': KEY, 'X-Shoppex-Timestamp': timestamp, 'X-Shoppex-Nonce': nonce, 'X-Shoppex-Signature': signature };
}
function supplierGet(route, query) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + API_PREFIX + route);
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const req = (url.protocol === 'http:' ? http : https).request(url, { method: 'GET', headers: signHeaders('GET', route, ''), timeout: 20000 }, (res) => {
      let data = ''; res.on('data', (c) => (data += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json: j, text: data }); });
    });
    req.on('timeout', () => req.destroy(new Error('tiempo de espera agotado')));
    req.on('error', reject); req.end();
  });
}
function supplierPost(route, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(BASE_URL + API_PREFIX + route);
    const req = (url.protocol === 'http:' ? http : https).request(url, { method: 'POST', headers: signHeaders('POST', route, body), timeout: 25000 }, (res) => {
      let data = ''; res.on('data', (c) => (data += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json: j, text: data }); });
    });
    req.on('timeout', () => req.destroy(new Error('tiempo de espera agotado')));
    req.on('error', reject); req.write(body); req.end();
  });
}
async function fetchAllProducts() {
  const all = []; let page = 1;
  while (page <= 80) {
    const r = await supplierGet(ROUTE_PRODUCTS, { page: String(page), per_page: '200' });
    if (r.status !== 200) { const msg = (r.json && (r.json.message || r.json.error || (r.json.data && r.json.data.message))) || ''; const e = new Error(`HTTP ${r.status}${msg ? ' · ' + String(msg).slice(0, 160) : ''}`); e.status = r.status; throw e; }
    all.push(...((r.json && r.json.data) || []));
    const pg = r.json && r.json.pagination;
    if (!pg || !pg.has_next) break;
    page += 1; await new Promise((res) => setTimeout(res, 250));
  }
  return all;
}

/* ── Categorías y normalización ────────────────────────
 * La web vende Perfumería. Todo lo demás (chocolates, enlatados, lo que la dueña
 * cree) vive como inventario y solo sale por marketplaces. */
const DEFAULT_CATEGORIES = [
  { key: 'Perfumería', desc: 'Fragancias originales para damas, caballeros y unisex, en todas las concentraciones', tone: 'perfume' },
  { key: 'Chocolates', desc: 'Tabletas, bombones, cremas y bebidas de cacao', tone: 'cacao' },
  { key: 'Enlatados', desc: 'Conservas, salsas y despensa que viaja bien', tone: 'lata' },
  { key: 'Refrigerados', desc: 'Quesos, tequeños y frescos que necesitan frío', tone: 'frio' },
];
const CATEGORY_RULES = [
  ['Perfumería', /parfum|toilette|cologne|extrait|perfume|fragan|\beau\b|\bed[tpc]\b|body (mist|spray)|aftershave|after shave/i],
  ['Refrigerados', /\b(queso|tequeñ|refriger|congelad|helad|jam[oó]n|salchich|mortadel|yogur|mantequill|nata\b|crema de leche|cuajad|chorizo|frozen|cheese|andesfood|tequemosh)/i],
  ['Chocolates', /\b(chocolat|cacao|cocoa|bomb[oó]n|trufa|nutella|brownie|toddy|savoy|el rey\b)/i],
  ['Enlatados', /\b(lata\b|enlatad|conserva|at[uú]n|sardin|diablitos?|salsa|ketchup|mayonesa|harina|galleta|caramelo|malta|frijol|caraota|arroz|ma[ií]z|pasta|aceite|vinagre|caf[eé]\b|az[uú]car|papel[oó]n|canned|pan\b)/i],
  ['Hogar y más', /electrodom|cafetera|licuadora|plancha|tostadora|freidora|microondas|aspiradora|ventilador|olla|sart[eé]n|batidora|l[aá]mpara|toalla|s[aá]bana|hervidor|extractor|air ?fryer|blender|toaster|kettle|kitchen/i],
];
const KNOWN_CATEGORIES = {
  'Perfumería': { desc: 'Fragancias originales para damas, caballeros y unisex, en todas las concentraciones', tone: 'perfume' },
  'Hogar y más': { desc: 'Electrodomésticos y artículos seleccionados, con la misma garantía de siempre', tone: 'hogar' },
};
const PERFUME = 'Perfumería';
function detectCategory(text) { const t = String(text || ''); for (const [c, re] of CATEGORY_RULES) if (re.test(t)) return c; return 'Otros'; }
function detectGender(text) {
  const t = String(text || '').toLowerCase();
  if (/\bunisex\b/.test(t)) return 'Unisex';
  if (/\b(women|woman|womens|female|femme|mujer(es)?|damas?|ladies|lady|for her|pour elle|femenin[oa]|donna)\b|\((w|l|f)\)/.test(t)) return 'Damas';
  if (/\b(men|man|mens|male|homme|hombres?|caballeros?|for him|pour lui|masculin[oe]?|uomo)\b|\(m\)/.test(t)) return 'Caballeros';
  return 'Unisex';
}
/* Notas olfativas: se detectan en el nombre y la descripción; el panel puede fijarlas a mano por UPC. */
const NOTES = [
  { key: 'bergamot', en: 'Bergamot', es: 'Bergamota', re: /bergam/i },
  { key: 'citrus', en: 'Citrus', es: 'Cítricos', re: /c[ií]tric|citrus|lemon|lim[oó]n|\blime\b|mandarin|orange|naranja|grapefruit|pomelo|toronja|yuzu|neroli/i },
  { key: 'jasmine', en: 'Jasmine', es: 'Jazmín', re: /jasmin|jazm[ií]n/i },
  { key: 'lavender', en: 'Lavender', es: 'Lavanda', re: /lavend|lavand/i },
  { key: 'patchouli', en: 'Patchouli', es: 'Pachulí', re: /patchoul|pachul/i },
  { key: 'sandalwood', en: 'Sandalwood', es: 'Sándalo', re: /sandalwood|s[aá]ndalo|\bsantal\b/i },
  { key: 'tonka', en: 'Tonka Bean', es: 'Haba tonka', re: /tonka/i },
  { key: 'vanilla', en: 'Vanilla', es: 'Vainilla', re: /vanill|vainill/i },
  { key: 'lily', en: 'Lily of the Valley', es: 'Lirio de los valles', re: /lily[ -]of[ -]the[ -]valley|muguet|lirio de los valles/i },
  { key: 'vetiver', en: 'Vetiver', es: 'Vetiver', re: /v[eé]tiver/i },
  { key: 'rose', en: 'Rose', es: 'Rosa', re: /\broses?\b|\brosas?\b/i },
  { key: 'oud', en: 'Oud', es: 'Oud', re: /\ba?oud\b|agarwood/i },
  { key: 'amber', en: 'Amber', es: 'Ámbar', re: /\bamber|[aá]mbar|\bambre\b|ambroxan/i },
  { key: 'musk', en: 'Musk', es: 'Almizcle', re: /\bmusks?\b|almizcle|\bmusc\b/i },
];
const NOTE_KEYS = NOTES.map((n) => n.key);
function detectNotes(text) { const t = String(text || ''); return NOTES.filter((n) => n.re.test(t)).map((n) => n.key); }
const META_FIELDS = ['category', 'gender', 'weightOz', 'lengthIn', 'widthIn', 'heightIn', 'wholesaleMin', 'wholesalePrice', 'tags', 'image', 'description', 'name', 'brand', 'featured', 'webVisible', 'condition', 'notes'];
function applyMeta(p, m) {
  if (!m) return p;
  if (m.category) p.category = m.category;
  if (m.gender) p.gender = m.gender;
  for (const k of ['weightOz', 'lengthIn', 'widthIn', 'heightIn', 'wholesalePrice']) if (m[k] != null) p[k] = num(m[k]);
  if (m.wholesaleMin != null) p.wholesaleMin = Math.max(0, parseInt(m.wholesaleMin, 10) || 0) || null;
  if (m.image) p.image = m.image;
  if (m.description) p.description = m.description;
  if (m.name) p.name = m.name;
  if (m.brand) p.brand = m.brand;
  if (m.featured != null) p.featured = !!m.featured;
  if (m.condition && ['nuevo', 'usado_casi_nuevo', 'caja_abierta'].includes(m.condition)) p.condition = m.condition;
  if (Array.isArray(m.tags)) p.tags = m.tags;
  if (Array.isArray(m.notes)) { p.notes = m.notes.filter((k) => NOTE_KEYS.includes(k)); p.notesManual = true; }
  return p;
}
function normalizeApi(p, meta, supplierCategory) {
  const upc = p.upc == null ? '' : String(p.upc);
  const name = p.name || 'Sin nombre', type = p.type || '';
  const pid = p.product_id || p.sku || p.id;
  const base = { id: 'api:' + pid, source: 'API', supplier: 'API', sku: String(p.product_id || p.sku || ''), name, brand: p.brand || '—', type, condition: 'nuevo',
    cost: parseFloat(p.price) || 0, stock: parseInt(p.stock_quantity, 10) || 0, upc, image: p.image_url || '',
    description: String(p.description || p.short_description || '').trim(),
    category: supplierCategory || detectCategory(name + ' ' + type), gender: '', notes: [],
    weightOz: num(p.weight_oz || p.weight), lengthIn: num(p.length), widthIn: num(p.width), heightIn: num(p.height), wholesaleMin: null, wholesalePrice: null, tags: [], featured: false };
  return applyMeta(base, meta[upc]);
}
function normalizeManual(row) {
  const d = row.data || {};
  const cat = (row.category && row.category !== 'Otros') ? row.category : detectCategory(row.name + ' ' + (d.type || '') + ' ' + (row.brand || ''));
  const gender = cat === PERFUME ? (d.gender || '') : '';
  return { id: row.id, source: d.supplier || 'Propio', supplier: d.supplier || 'Propio', sku: '', condition: d.condition || 'nuevo', name: row.name || 'Sin nombre', brand: row.brand || '—', type: d.type || '',
    cost: Number(row.cost) || 0, stock: parseInt(row.stock, 10) || 0, upc: String(row.upc || ''), image: d.image || '',
    description: String(d.description || '').trim(), category: cat,
    gender, weightOz: num(d.weightOz), lengthIn: num(d.lengthIn), widthIn: num(d.widthIn), heightIn: num(d.heightIn),
    wholesaleMin: parseInt(d.wholesaleMin, 10) || null, wholesalePrice: num(d.wholesalePrice), tags: Array.isArray(d.tags) ? d.tags : [], featured: !!d.featured, createdAt: row.created_at || null,
    fixedPrice: num(d.price), notes: Array.isArray(d.notes) ? d.notes.filter((k) => NOTE_KEYS.includes(k)) : [], notesManual: Array.isArray(d.notes) && d.notes.length > 0 };
}
function unifyByUpc(list) {
  const map = new Map();
  for (const p of list) {
    const key = p.upc || p.id;
    const isApi = p.source === 'API';
    if (!map.has(key)) {
      map.set(key, { ...p, offers: [{ source: p.source, cost: p.cost, stock: p.stock }], ownStock: isApi ? 0 : p.stock, apiStock: isApi ? p.stock : 0, hasApi: isApi, hasOwn: !isApi });
      continue;
    }
    const ex = map.get(key);
    ex.offers.push({ source: p.source, cost: p.cost, stock: p.stock }); if (isApi) ex.hasApi = true; else ex.hasOwn = true;
    ex.stock += p.stock; ex.cost = Math.min(ex.cost, p.cost);
    if (isApi) { ex.apiStock += p.stock; if (!ex.sku) ex.sku = p.sku; } else ex.ownStock += p.stock;
    if ((p.description || '').length > (ex.description || '').length) ex.description = p.description;
    if (!ex.image && p.image) ex.image = p.image;
    for (const k of ['weightOz', 'lengthIn', 'widthIn', 'heightIn', 'wholesaleMin', 'wholesalePrice']) if (ex[k] == null && p[k] != null) ex[k] = p[k];
    if (!isApi) { ex.category = p.category; if (p.name) ex.name = p.name; ex.featured = ex.featured || p.featured; if (p.condition && p.condition !== 'nuevo') ex.condition = p.condition;
      if (p.fixedPrice) ex.fixedPrice = p.fixedPrice; if (p.gender) ex.gender = p.gender; if (p.notesManual) { ex.notes = p.notes; ex.notesManual = true; } if (p.brand && p.brand !== '—' && (!ex.brand || ex.brand === '—')) ex.brand = p.brand; }
  }
  return [...map.values()];
}

/* ── Pricing / ajustes de tienda ─────────────────────── */
const DEFAULT_PRICING = {
  globalMargin: 35, categoryMargins: {}, overrides: {}, rounding: 'ends99', showCompare: true,
  shipping: { freeOver: 150, flat: 9.99, perOz: 0 },
  store: { name: 'NVOS Shoppers Inc', tagline: 'Casa de compras', headline: 'Tu mercado global, con elegancia.', lede: '', headlineEn: '', ledeEn: '', whatsapp: '', currency: 'USD', categories: DEFAULT_CATEGORIES, banners: {}, brandLogos: {} },
  wholesale: { ebayMarkup: 15 },
  /* Visibilidad en la web: solo Perfumería se publica en la tienda propia.
   * Todo lo demás vive como inventario y sale por marketplaces (eBay, Walmart, Mercado Libre).
   * meta.webVisible ('1'/'0') por producto gana sobre la lista de categorías. */
  visibility: { enforce: true, webCategories: [PERFUME] },
  /* El proveedor (Shoppex) es una casa de perfumería: todo lo suyo entra como Perfumería
   * salvo que se corrija producto por producto. Vacío = detectar por el nombre. */
  supplier: { category: PERFUME },
  automation: { shipOnPaid: true },
  /* Impuesto por estado (tax.js) y regla de revisión manual de pedidos grandes */
  tax: TAX.DEFAULTS,
  fraud: { reviewOver: 750 },
  referral: { buyerPct: 5, ownerPct: 5, minOrder: 0 },
  channels: {
    web: { label: 'Mi web', commission: 0, gateway: 3.5, fixed: 0.30 },
    ebay: { label: 'eBay', commission: 15, gateway: 0, fixed: 0.30 },
    walmart: { label: 'Walmart Marketplace', commission: 15, gateway: 0, fixed: 0.00, enabled: false },
    mercadolibre: { label: 'Mercado Libre Int.', commission: 17.5, gateway: 0, fixed: 0.00, enabled: false },
  },
};
const CHANNEL_KEYS = Object.keys(DEFAULT_PRICING.channels);
const onlyChannels = (o) => Object.fromEntries(CHANNEL_KEYS.map((k) => [k, { ...DEFAULT_PRICING.channels[k], ...((o || {})[k] || {}) }]));
async function loadPricing() {
  const s = (await getSetting('pricing', null)) || {};
  return { ...DEFAULT_PRICING, ...s, channels: onlyChannels(s.channels),
    shipping: { ...DEFAULT_PRICING.shipping, ...(s.shipping || {}) }, store: { ...DEFAULT_PRICING.store, ...(s.store || {}) }, wholesale: { ...DEFAULT_PRICING.wholesale, ...(s.wholesale || {}) },
    visibility: { ...DEFAULT_PRICING.visibility, ...(s.visibility || {}) }, referral: { ...DEFAULT_PRICING.referral, ...(s.referral || {}) },
    supplier: { ...DEFAULT_PRICING.supplier, ...(s.supplier || {}) }, automation: { ...DEFAULT_PRICING.automation, ...(s.automation || {}) },
    tax: TAX.merge(s.tax), fraud: { ...DEFAULT_PRICING.fraud, ...(s.fraud || {}) } };
}
async function savePricing(r) {
  const cur = await loadPricing();
  const clean = {
    globalMargin: Number(r.globalMargin ?? cur.globalMargin) || 0,
    categoryMargins: r.categoryMargins && typeof r.categoryMargins === 'object' ? r.categoryMargins : cur.categoryMargins,
    overrides: r.overrides && typeof r.overrides === 'object' ? r.overrides : cur.overrides,
    rounding: (r.rounding ?? cur.rounding) === 'ends99' ? 'ends99' : 'none',
    showCompare: (r.showCompare ?? cur.showCompare) !== false,
    shipping: { ...cur.shipping, ...(r.shipping || {}) }, store: { ...cur.store, ...(r.store || {}) },
    wholesale: { ...cur.wholesale, ...(r.wholesale || {}) }, channels: onlyChannels({ ...cur.channels, ...(r.channels || {}) }),
    visibility: { ...cur.visibility, ...(r.visibility || {}) }, referral: { ...cur.referral, ...(r.referral || {}) },
    supplier: { ...cur.supplier, ...(r.supplier || {}) }, automation: { ...cur.automation, ...(r.automation || {}) },
    tax: TAX.merge(r.tax && typeof r.tax === 'object' ? { timezone: r.tax.timezone || cur.tax.timezone, states: { ...cur.tax.states, ...(r.tax.states || {}) } } : cur.tax),
    fraud: { reviewOver: Math.max(0, Number((r.fraud || {}).reviewOver ?? cur.fraud.reviewOver) || 0) },
  };
  await setSetting('pricing', clean); await rebuildCatalog(); return clean;
}

/* ── Caché del catálogo ──────────────────────────────── */
let apiState = { raw: [], mode: KEY && SECRET ? 'conectando' : 'sin-credenciales', error: KEY && SECRET ? null : 'Faltan SHOPPEX_KEY / SHOPPEX_SECRET.', at: null, refreshing: false };
let cache = { at: 0, admin: null, pub: null, building: null };
async function refreshApi() {
  if (apiState.refreshing || !KEY || !SECRET) return;
  apiState.refreshing = true;
  try {
    const raw = await fetchAllProducts();
    apiState = { raw, mode: 'live', error: raw.length ? null : 'El proveedor respondió sin productos.', at: new Date().toISOString(), refreshing: false };
  } catch (e) {
    apiState = { ...apiState, mode: apiState.raw.length ? 'live-stale' : 'error', error: `Sin conexión con el proveedor (${e.message}).`, refreshing: false };
  }
  await rebuildCatalog();
}
let rebuildQueued = false;
async function rebuildCatalog() {
  /* si llega otro cambio mientras se arma, se vuelve a armar al terminar para no servir datos viejos */
  if (cache.building) { rebuildQueued = true; return cache.building; }
  cache.building = (async () => {
    try {
      const [metaRows, manualRows, pricing, committed] = await Promise.all([db.all('product_meta'), db.where('products_manual', { active: true }), loadPricing(), channels.getCommitted()]);
      const meta = {}; for (const r of metaRows) meta[r.upc] = r.data || {};
      const supCat = String((pricing.supplier || {}).category || '');
      /* Si el proveedor manda un producto sin costo válido, su precio de venta saldría del
       * mínimo de redondeo (casi gratis). Esos productos no entran al catálogo: mejor no
       * tenerlo a la venta que venderlo regalado. */
      const apiOk = []; const apiSinCosto = [];
      for (const p of apiState.raw) {
        const np = normalizeApi(p, meta, supCat);
        if (Number.isFinite(np.cost) && np.cost > 0) apiOk.push(np); else apiSinCosto.push(np.upc || np.sku || '?');
      }
      if (apiSinCosto.length) console.error(`[catálogo] ${apiSinCosto.length} producto(s) del proveedor sin costo válido, fuera del catálogo: ${apiSinCosto.slice(0, 10).join(', ')}${apiSinCosto.length > 10 ? '…' : ''}`);
      const products = unifyByUpc([...apiOk, ...manualRows.map((r) => applyMeta(normalizeManual(r), meta[String(r.upc || '')]))]).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      const vis = pricing.visibility || { enforce: false, webCategories: [] };
      for (const p of products) {
        const c = committed[p.upc] || { qty: 0, own: 0 };
        p.stockBase = p.stock; p.committed = c.qty; p.committedOwn = c.own;
        p.stock = Math.max(0, p.stock - p.committed);
        /* Inventario propio primero: lo que queda libre de mi mercancía antes de pedirle a Shoppex */
        p.ownFree = Math.max(0, (p.ownStock || 0) - c.own);
        p.apiFree = Math.max(0, p.stock - p.ownFree);
        /* género y notas solo aplican a perfumería */
        if (p.category === PERFUME) { if (!p.gender) p.gender = detectGender(p.name + ' ' + (p.type || '')); if (!p.notesManual) p.notes = detectNotes(p.name + ' ' + (p.type || '') + ' ' + (p.description || '')); }
        else { p.gender = ''; if (!p.notesManual) p.notes = []; }
        p.sell = channels.computeSell(p, pricing);
        const ov = (pricing.overrides || {})[p.upc] || {};
        p.compare = pricing.showCompare && ov.compare > p.sell ? round2(ov.compare) : null;
        p.margin = channels.marginFor(p, pricing);
        const m = meta[p.upc] || {};
        p.webVisible = m.webVisible != null && m.webVisible !== ''
          ? (m.webVisible === true || m.webVisible === '1' || m.webVisible === 1)
          : (!vis.enforce || (vis.webCategories || []).includes(p.category));
      }
      const webProducts = products.filter((p) => p.webVisible);
      const brands = {}; const cats = {};
      for (const p of webProducts) { brands[p.brand] = (brands[p.brand] || 0) + 1; cats[p.category] = (cats[p.category] || 0) + 1; }
      const stats = { products: webProducts.length, units: webProducts.reduce((s, p) => s + p.stock, 0), brands: Object.keys(brands).length };
      const store = { ...pricing.store, categories: (pricing.store.categories || DEFAULT_CATEGORIES).map((c) => ({ ...c, count: cats[c.key] || 0 })) };
      for (const k of Object.keys(cats)) if (!store.categories.some((c) => c.key === k) && k !== 'Otros') store.categories.push({ key: k, desc: (KNOWN_CATEGORIES[k] || {}).desc || '', tone: (KNOWN_CATEGORIES[k] || {}).tone || 'otro', count: cats[k] });
      if (cats.Otros) store.categories.push({ key: 'Otros', desc: 'Todo lo demás', tone: 'otro', count: cats.Otros });
      const pub = { store, shipping: pricing.shipping, tax: TAX.publicTable(pricing.tax), stats, referral: { buyerPct: Number((pricing.referral || {}).buyerPct) || 0 }, fetchedAt: new Date().toISOString(),
        products: webProducts.map((p) => ({ id: p.id, upc: p.upc, name: p.name, brand: p.brand, category: p.category, type: p.type, gender: p.gender, condition: p.condition || 'nuevo', sell: p.sell, compare: p.compare,
          stock: p.stock, image: p.image, description: p.description, weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn,
          wholesaleMin: p.wholesaleMin, wholesalePrice: p.wholesalePrice, tags: p.tags, featured: p.featured, own: p.source !== 'API', addedAt: p.createdAt || null, notes: p.notes || [] })),
        notes: NOTES.map((n) => ({ key: n.key, en: n.en, es: n.es, count: webProducts.filter((p) => (p.notes || []).includes(n.key)).length })) };
      const statsAll = { products: products.length, units: products.reduce((s, p) => s + p.stock, 0), brands: new Set(products.map((p) => p.brand)).size, webVisible: webProducts.length, hidden: products.length - webProducts.length,
        supplier: products.filter((p) => p.hasApi).length, own: products.filter((p) => p.hasOwn).length, both: products.filter((p) => p.hasApi && p.hasOwn).length, ownUnits: products.reduce((s2, p) => s2 + (p.ownFree || 0), 0) };
      cache = { at: Date.now(), admin: { mode: apiState.mode, error: apiState.error, apiAt: apiState.at, apiCount: apiState.raw.length, stats: statsAll, products, store, shipping: pricing.shipping, visibility: pricing.visibility, categories: allCategoryKeys(pricing, products), notes: NOTES.map((n) => ({ key: n.key, en: n.en, es: n.es })) }, pub, building: null };
    } catch (e) { console.error('[catálogo] no se pudo armar:', e.message); cache.building = null; }
    if (rebuildQueued) { rebuildQueued = false; await rebuildCatalog(); }
  })();
  return cache.building;
}
function allCategoryKeys(pricing, products) {
  const out = []; const add = (k) => { if (k && k !== 'Otros' && !out.includes(k)) out.push(k); };
  for (const c of (pricing.store.categories || [])) add(c.key);
  for (const k of [...new Set(products.map((p) => p.category))].sort((a, b) => String(a).localeCompare(String(b), 'es'))) add(k);
  out.push('Otros'); return out;
}
async function catalog(kind) {
  if (!cache.pub) await rebuildCatalog();
  if (apiState.mode === 'conectando' || (Date.now() - cache.at > 60000 && !apiState.refreshing)) refreshApi();
  return kind === 'admin' ? cache.admin : cache.pub;
}
setInterval(refreshApi, 60000).unref();
const byUpc = (list, upc) => list.find((p) => p.upc === upc);

/* ── Referidos ───────────────────────────────────────
 * El admin activa un código por cliente (referral_codes). El comprador lo usa
 * en el checkout y recibe un descuento; cuando el pedido pasa a "pagado", el
 * dueño del código gana saldo a favor (balance) para sus próximas compras. */
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
async function findReferral(code) {
  code = normCode(code); if (!code) return null;
  const row = await db.find('referral_codes', { code });
  return row && row.enabled !== false ? row : null;
}
async function referralByEmail(email) {
  email = String(email || '').toLowerCase(); if (!email) return null;
  return db.find('referral_codes', { email });
}
async function creditReferral(code, amount, kind, orderNumber, note) {
  const row = await db.find('referral_codes', { code }); if (!row) return null;
  const balance = round2(Math.max(0, (Number(row.balance) || 0) + amount));
  const patch = { balance, updated_at: new Date().toISOString() };
  if (kind === 'earn') { patch.earned = round2((Number(row.earned) || 0) + amount); patch.uses = (parseInt(row.uses, 10) || 0) + 1; }
  await db.update('referral_codes', { code }, patch);
  await db.insert('referral_log', { at: new Date().toISOString(), code, order_number: String(orderNumber || ''), kind, amount: round2(amount), note: String(note || '') });
  return balance;
}

/* ── Pedidos ─────────────────────────────────────────── */
const rowToOrder = (r) => ({ ...(r.data || {}), id: r.id, number: r.number, status: r.status, channel: r.channel, createdAt: r.created_at, userId: r.user_id });
async function nextOrderNumber(prefix) {
  const year = new Date().getFullYear();
  const seq = (await getSetting('order_seq', {})) || {}; const k = `${prefix}-${year}`;
  seq[k] = (seq[k] || 0) + 1; await setSetting('order_seq', seq);
  return `${prefix}-${year}-${String(seq[k]).padStart(4, '0')}`;
}
/* Los pedidos se reservan de uno en uno: así dos compras simultáneas no se llevan la misma
 * unidad ni el mismo número de pedido. */
let orderChain = Promise.resolve();
const serial = (fn) => { const p = orderChain.then(fn, fn); orderChain = p.catch(() => {}); return p; };
const L2 = (lang, es, en) => (lang === 'es' ? es : en);
const US_EXTRA = ['PR', 'VI', 'GU', 'AS', 'MP', 'AA', 'AE', 'AP'];
async function patchOrder(number, fn) {
  const row = await db.find('orders', { number }); if (!row) return null;
  const o = rowToOrder(row); fn(o); const { id, createdAt, userId, ...data } = o;
  await db.update('orders', { number }, { data }); return o;
}

/* Calcula un pedido completo SIN guardarlo: precios, envío, descuento, impuesto y total.
 * Todo sale del catálogo y los ajustes del servidor; del navegador solo se aceptan los UPC,
 * las cantidades y la dirección. Lo usan la cotización del checkout y la compra real. */
async function priceOrder(input, user, strict) {
  const lang = input.lang === 'es' ? 'es' : 'en';
  const cat = await catalog('admin'); const pricing = await loadPricing();
  const items = [];
  /* El mismo UPC puede llegar repetido en varias líneas: se suman ANTES de validar el stock,
   * si no cada línea se compararía contra el inventario completo y se podría sobrevender. */
  const want = new Map();
  for (const it of (Array.isArray(input.items) ? input.items : []).slice(0, 60)) {
    const upc = String((it && it.upc) || ''); if (!upc) continue;
    const q1 = qtyOf(it && it.qty);
    if (q1 == null) throw new Error(L2(lang, 'La cantidad no es válida', 'The quantity is not valid'));
    want.set(upc, Math.min(999, (want.get(upc) || 0) + q1));
  }
  for (const [upc, qty] of want) {
    const p = byUpc(cat.products, upc);
    if (!p || !p.webVisible) continue; // lo oculto de la web no se puede comprar por la web
    if (p.stock < qty) throw new Error(L2(lang, `Solo quedan ${p.stock} unidades de "${p.name}"`, `Only ${p.stock} left of "${p.name}"`));
    const wholesale = p.wholesaleMin && p.wholesalePrice && qty >= p.wholesaleMin;
    /* Regla "mi mercancía sale primero": lo cargado en mi inventario se descuenta antes de pedirle nada a Shoppex. */
    const ownQty = Math.min(qty, p.ownFree || 0);
    items.push({ upc: p.upc, productId: p.id, supplierSku: p.sku || '', name: p.name, brand: p.brand, image: p.image, qty, ownQty, supplierQty: qty - ownQty,
      price: wholesale ? p.wholesalePrice : p.sell, wholesale: !!wholesale, cost: p.cost, condition: p.condition || 'nuevo',
      weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn });
  }
  if (!items.length) throw new Error(L2(lang, 'El carrito está vacío o los productos ya no están disponibles', 'Your cart is empty or the products are no longer available'));
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const costTotal = round2(items.reduce((s, i) => s + i.cost * i.qty, 0));
  const totalOz = items.reduce((s, i) => s + (i.weightOz || 0) * i.qty, 0);
  const sh = pricing.shipping;
  const shipping = subtotal >= (Number(sh.freeOver) || Infinity) ? 0 : round2((Number(sh.flat) || 0) + (Number(sh.perOz) || 0) * totalOz);
  const b = input.buyer || {}; const buyer = {};
  for (const k of ['name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'notes']) buyer[k] = String(b[k] || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
  if (user) buyer.email = user.email;
  buyer.countryCode = channels.countryCode(buyer.country);
  /* Un ZIP de EE. UU. manda sobre el país que se escriba: si no, bastaría poner "Canadá"
   * con dirección de entrega en Florida para no pagar impuesto. */
  const zipState = TAX.stateFromZip(buyer.zip);
  if (zipState && TAX.BY_CODE[zipState] && buyer.countryCode !== 'US') buyer.countryCode = 'US';
  buyer.stateCode = buyer.countryCode === 'US' ? String(channels.stateCode(buyer.state, 'US') || '').toUpperCase() : '';
  /* Si el estado escrito no cuadra con el ZIP, el impuesto se calcula SIEMPRE con el estado
   * del ZIP (es el destino real del paquete): así nadie elige un estado sin impuesto para
   * ahorrárselo. No se rechaza la venta, porque hay ZIP legítimos fuera de su rango habitual
   * (p. ej. 73301 es de Austin, Texas, dentro del rango de Oklahoma): se cobra bien y se anota. */
  if (buyer.countryCode === 'US' && zipState && TAX.BY_CODE[zipState]) {
    const taxState = (() => {
      if (buyer.stateCode === zipState) return zipState;
      const declared = TAX.BY_CODE[buyer.stateCode];
      if (!declared) return zipState; // estado ilegible: manda el ZIP
      /* Con estados en desacuerdo se toma el que cobra más, para no premiar la discrepancia. */
      const rateOf = (c) => { const st = ((pricing.tax || {}).states || {})[c] || {}; return st.collect ? Number(st.rate) || 0 : -1; };
      return rateOf(zipState) >= rateOf(buyer.stateCode) ? zipState : buyer.stateCode;
    })();
    if (taxState !== buyer.stateCode) { buyer.taxStateNote = `declarado ${buyer.stateCode || '—'}, ZIP de ${zipState}`; buyer.stateCode = taxState; }
  }
  if (strict) {
    if (!buyer.name || !buyer.email || !buyer.address || !buyer.city) throw new Error(L2(lang, 'Faltan datos de entrega (nombre, correo, dirección y ciudad)', 'Delivery details are missing (name, email, address and city)'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(buyer.email)) throw new Error(L2(lang, 'El correo no es válido', 'The email address is not valid'));
    if (buyer.countryCode === 'US') {
      if (!TAX.BY_CODE[buyer.stateCode] && !US_EXTRA.includes(buyer.stateCode)) throw new Error(L2(lang, 'Elige el estado de entrega', 'Please choose the delivery state'));
      if (!/^\d{5}(-\d{4})?$/.test(buyer.zip)) throw new Error(L2(lang, 'El código postal debe tener 5 dígitos', 'The ZIP code must have 5 digits'));
    }
  }

  /* — Referido: descuento al comprador; el dueño gana saldo cuando el pedido se paga — */
  let referral = null; let discount = 0; let referralNeedsReview = false;
  const rr = pricing.referral || {};
  if (input.referralCode) {
    const ref = await findReferral(input.referralCode);
    if (!ref) throw new Error(L2(lang, 'Ese código de referido no es válido o está inactivo', 'That referral code is not valid or is inactive'));
    /* El correo del comprador invitado no está verificado: cualquiera podría poner otro y
     * usar su propio código para cobrar descuento y comisión a la vez. Con cuenta se compara
     * el correo verificado; sin cuenta, el código solo vale si no es el del propio comprador
     * según los datos del pedido (correo o teléfono). */
    const refMail = String(ref.email || '').toLowerCase();
    if (refMail && buyer.email && refMail === buyer.email.toLowerCase()) throw new Error(L2(lang, 'No puedes usar tu propio código de referido', 'You cannot use your own referral code'));
    if (!user && refMail) {
      /* Sin cuenta verificada el premio al dueño del código se retiene hasta que la dueña lo
       * apruebe: así el auto-referido no se paga solo. */
      referralNeedsReview = true;
    }
    if (rr.minOrder && subtotal < Number(rr.minOrder)) throw new Error(L2(lang, `El código aplica en compras desde $${Number(rr.minOrder)}`, `The code applies to orders from $${Number(rr.minOrder)}`));
    const buyerPct = ref.buyer_pct != null && ref.buyer_pct !== '' ? Number(ref.buyer_pct) : (Number(rr.buyerPct) || 0);
    const ownerPct = ref.owner_pct != null && ref.owner_pct !== '' ? Number(ref.owner_pct) : (Number(rr.ownerPct) || 0);
    discount = round2(subtotal * Math.max(0, Math.min(50, buyerPct)) / 100);
    referral = { code: ref.code, ownerEmail: ref.email || '', ownerName: ref.name || '', buyerPct, ownerPct, discount, credited: false, needsReview: referralNeedsReview || undefined };
  }

  /* — Impuesto del estado de entrega (solo donde la tienda cobra) — */
  const tx = TAX.compute(pricing.tax, { country: buyer.countryCode, stateCode: buyer.stateCode, base: subtotal - discount, shipping });

  /* — Saldo a favor: solo para cuentas con el correo verificado — */
  let creditUsed = 0; let creditCode = null;
  if (input.useCredit && user && user.verified) {
    const mine = await referralByEmail(user.email);
    const bal = mine ? Number(mine.balance) || 0 : 0;
    if (mine && mine.enabled !== false && bal > 0) { creditUsed = round2(Math.min(bal, Math.max(0, subtotal - discount + shipping + tx.tax))); creditCode = mine.code; }
  }
  const total = round2(Math.max(0, subtotal - discount + shipping + tx.tax - creditUsed));
  return { lang, pricing, items, buyer, referral, discount, tx, creditUsed, creditCode, subtotal, costTotal, totalOz, shipping, total };
}
const quoteTotals = (q) => ({ subtotal: q.subtotal, discount: q.discount, shipping: q.shipping, tax: q.tx.tax, taxRate: q.tx.rate, taxState: q.tx.state, credit: q.creditUsed, total: q.total });

/* Guarda el pedido y reserva el stock (queda "pendiente de pago"). */
async function reserveOrder(input, user) {
  const q = await priceOrder(input, user, true); const lang = q.lang;
  if (input.expectedTotal != null && Math.abs(Number(input.expectedTotal) - q.total) > 0.009) throw new Error(L2(lang, 'El total cambió mientras comprabas. Revisa el resumen y vuelve a confirmar.', 'The total changed while you were checking out. Please review the summary and confirm again.'));
  if (square.hasCreds() && q.total > 0 && !(input.payment && input.payment.sourceId)) throw new Error(L2(lang, 'Falta el pago con tarjeta', 'Card payment is required'));
  if (q.creditUsed > 0) await creditReferral(q.creditCode, -q.creditUsed, 'spend', '', 'Saldo usado en compra');
  const number = await nextOrderNumber('ORD'); const now = new Date().toISOString();
  const order = {
    number, createdAt: now, status: 'pendiente_pago', channel: 'web', lang, userId: user ? user.id : null, buyer: q.buyer, items: q.items,
    referral: q.referral, creditUsed: q.creditUsed || 0, creditCode: q.creditUsed > 0 ? q.creditCode : undefined,
    totals: { subtotal: q.subtotal, discount: q.discount, credit: q.creditUsed || 0, shipping: q.shipping, tax: q.tx.tax, taxRate: q.tx.rate, taxState: q.tx.state, taxable: q.tx.taxable, total: q.total, cost: q.costTotal, profit: round2(q.subtotal - q.discount - q.costTotal), weightOz: round2(q.totalOz) },
    supplierOrder: { sent: false, id_order_partner: number, products: q.items.filter((i) => i.supplierQty > 0).map((i) => ({ upc: i.upc, sku: i.supplierSku || undefined, quantity: i.supplierQty })) },
    history: [{ at: now, status: 'pendiente_pago' }],
  };
  if (q.creditUsed > 0) await db.update('referral_log', { code: q.creditCode, order_number: '' }, { order_number: number }).catch(() => {});
  const row = await db.insert('orders', { number, user_id: order.userId, email: q.buyer.email, status: order.status, channel: 'web', created_at: order.createdAt, data: order });
  await channels.commitSale(q.items, 'web', number, { buyer: q.buyer.name });
  await rebuildCatalog();
  return rowToOrder(row);
}

/* Compra completa: reserva → cobro en Square → "pagado" (o se cancela si el banco rechaza). */
async function placeOrder(input, user) {
  const pricing = await loadPricing();
  const order = await serial(() => reserveOrder(input, user)); const lang = order.lang;
  if (!square.hasCreds()) { mail.orderCreated(pricing.store, order, SITE_URL); return order; } // sin pasarela: se cobra a mano
  if (order.totals.total <= 0) { const r0 = await setOrderStatus(order.number, { status: 'pagado', note: 'Pagado con saldo a favor' }, { silent: true }); mail.orderCreated(pricing.store, r0.order, SITE_URL); return r0.order; }
  const r = await square.createPayment(order, input.payment || {});
  if (!r.ok) {
    await setOrderStatus(order.number, { status: 'cancelado', note: `Pago rechazado (${r.code})` }, { silent: true });
    const e = new Error(L2(lang, r.message[0], r.message[1])); e.declined = true; e.code = r.code; throw e;
  }
  const reasons = []; const fraud = pricing.fraud || {};
  if (r.payment.risk === 'HIGH') reasons.push('Square lo marcó como riesgo alto');
  if (/REJECTED/i.test(r.payment.avs)) reasons.push('la dirección no coincide con la de la tarjeta (AVS)');
  if (/REJECTED/i.test(r.payment.cvv)) reasons.push('el CVV no fue verificado');
  if (Number(fraud.reviewOver) > 0 && order.totals.total >= Number(fraud.reviewOver)) reasons.push(`el total supera $${Number(fraud.reviewOver)}`);
  try {
    const gw = pricing.channels.web || {}; const fees = round2(order.totals.total * (Number(gw.gateway) || 0) / 100 + (Number(gw.fixed) || 0));
    await patchOrder(order.number, (o) => { o.payment = r.payment; o.totals.fees = fees; o.totals.profit = round2(o.totals.profit - fees); if (reasons.length) o.review = { at: new Date().toISOString(), reasons }; });
    const out = await setOrderStatus(order.number, { status: 'pagado', note: `Pago con tarjeta ${r.payment.brand} ··${r.payment.last4}`.trim() }, { silent: true });
    mail.orderCreated(pricing.store, out.order, SITE_URL);
    if (reasons.length) mail.adminAlert(pricing.store, `Pedido ${order.number} en revisión`, `El pedido ${order.number} por $${order.totals.total.toFixed(2)} quedó pagado pero retenido antes de enviarse: ${reasons.join('; ')}. Revísalo en el panel → Pedidos.`);
    return out.order;
  } catch (e) {
    /* El cargo existe en Square pero no se pudo anotar: queda registrado para conciliar (el aviso de Square lo repara). */
    console.error(`[pago] COBRADO pero sin anotar: pedido ${order.number}, pago Square ${r.payment.id}:`, e.message);
    return { ...order, status: 'pagado', payment: r.payment };
  }
}
/* Con pasarela activa no deben quedar reservas sin pago: se liberan a los 30 minutos. */
setInterval(async () => {
  if (!square.hasCreds()) return;
  try {
    const rows = await db.where('orders', { status: 'pendiente_pago' }, { order: 'created_at.desc', limit: 200 });
    for (const r of rows) if (r.channel === 'web' && !(r.data || {}).payment && Date.now() - new Date(r.created_at).getTime() > 30 * 60000) await setOrderStatus(r.number, { status: 'cancelado', note: 'Reserva vencida sin pago' }, { silent: true });
  } catch (e) { console.error('[pedidos] limpieza:', e.message); }
}, 10 * 60000).unref();

const publicOrder = (o) => ({ number: o.number, createdAt: o.createdAt, status: o.status, history: o.history || [],
  items: o.items.map((i) => ({ name: i.name, brand: i.brand, image: i.image, upc: i.upc, qty: i.qty, price: i.price, wholesale: i.wholesale })),
  referralCode: o.referral ? o.referral.code : null,
  totals: { subtotal: o.totals.subtotal, discount: o.totals.discount || 0, credit: o.totals.credit || 0, shipping: o.totals.shipping, tax: o.totals.tax || 0, taxRate: o.totals.taxRate || 0, taxState: o.totals.taxState || '', total: o.totals.total },
  buyer: { name: o.buyer.name, address: o.buyer.address, city: o.buyer.city, state: o.buyer.state, zip: o.buyer.zip, country: o.buyer.country },
  payment: o.payment ? { brand: o.payment.brand || '', last4: o.payment.last4 || '', receiptUrl: o.payment.receiptUrl || '' } : null,
  refunded: o.refund ? o.refund.amount : 0,
  fulfillment: o.fulfillment ? { carrier: o.fulfillment.carrier || '', tracking: o.fulfillment.tracking || '', at: o.fulfillment.at } : null });

/* Pedido que llega de un marketplace (webhook o lectura de eBay): entra como "pagado",
 * descuenta primero el inventario propio y deja lista la parte que se pide a Shoppex. */
async function createChannelOrder(key, d) {
  const items = (Array.isArray(d.items) ? d.items : []).slice(0, 100).map((it) => ({ upc: clean(it.upc || it.sku, 32), qty: Math.max(1, parseInt(it.qty ?? it.quantity, 10) || 1), name: clean(it.name, 200), price: Number(it.price) || 0, lineItemId: clean(it.lineItemId, 60) || undefined })).filter((it) => it.upc);
  if (!items.length) return { ok: false, error: 'Sin artículos con UPC/SKU' };
  const cat = await catalog('admin');
  const shortfalls = items.filter((it) => { const p = byUpc(cat.products, it.upc); return (p ? p.stock : 0) < it.qty; }).map((it) => { const p = byUpc(cat.products, it.upc); return { upc: it.upc, requested: it.qty, available: p ? p.stock : 0 }; });
  const externalId = clean(d.externalId || d.orderId, 80) || ('EXT-' + Date.now());
  /* El mismo aviso puede llegar dos veces (reintento del canal o de eBay): si ya existe un
   * pedido con ese identificador externo se devuelve el que hay, sin volver a descontar stock
   * ni a mandárselo al proveedor. */
  const dup = (await db.where('orders', { channel: key }, { order: 'created_at.desc', limit: 500 }))
    .find((r) => ((r.data || {}).externalId || '') === externalId);
  if (dup) return { ok: true, order: dup.number, duplicate: true };
  const number = await nextOrderNumber(key.toUpperCase());
  const b = d.buyer || {};
  const order = { number, createdAt: new Date().toISOString(), status: 'pagado', channel: key, externalId, userId: null, lang: 'en',
    buyer: { name: clean(b.name, 200) || `Cliente ${key}`, email: clean(b.email, 200), phone: clean(b.phone, 40), address: clean(b.address, 300), city: clean(b.city, 100), state: clean(b.state, 100), zip: clean(b.zip, 20), country: clean(b.country, 60) },
    items: items.map((i) => {
      const p = byUpc(cat.products, i.upc) || {};
      const ownQty = Math.min(i.qty, p.ownFree || 0); /* primero sale mi mercancía */
      return { upc: i.upc, name: i.name || p.name || i.upc, brand: p.brand || '', image: p.image || '', qty: i.qty, price: i.price, cost: p.cost || 0, ownQty, supplierQty: i.qty - ownQty, supplierSku: p.sku || '', lineItemId: i.lineItemId, condition: p.condition || 'nuevo', weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn };
    }),
    shortfalls: shortfalls.length ? shortfalls : undefined, history: [{ at: new Date().toISOString(), status: 'pagado' }] };
  const subtotal = round2(order.items.reduce((s, i) => s + i.price * i.qty, 0)); const cost = round2(order.items.reduce((s, i) => s + i.cost * i.qty, 0));
  /* El aviso trae el precio que dice el canal. No se rechaza (en un marketplace el precio
   * varía de verdad: ofertas, promociones, descuentos del canal), pero si viene muy por
   * debajo del publicado el pedido queda retenido para que la dueña lo revise antes de enviar. */
  const pr = await loadPricing();
  const bajos = order.items.filter((i) => {
    const p = byUpc(cat.products, i.upc); if (!p) return false;
    const esperado = channels.priceBreakdown(p, pr, key).price;
    return esperado > 0 && i.price < esperado * 0.7;
  }).map((i) => i.upc);
  if (bajos.length) order.review = { at: new Date().toISOString(), reasons: [`el precio recibido está muy por debajo del publicado (${bajos.join(', ')})`] };
  const total = Number(d.total) || subtotal; const fee = round2(total * ((Number((pr.channels[key] || {}).commission) || 0) / 100));
  order.totals = { subtotal, discount: 0, shipping: Number(d.shipping) || 0, total, cost, fees: fee, profit: round2(subtotal - cost - fee), weightOz: round2(order.items.reduce((s, i) => s + (i.weightOz || 0) * i.qty, 0)) };
  order.supplierOrder = { sent: false, id_order_partner: number, products: order.items.filter((i) => i.supplierQty > 0).map((i) => ({ upc: i.upc, sku: i.supplierSku, quantity: i.supplierQty })) };
  await db.insert('orders', { number, user_id: null, email: order.buyer.email, status: order.status, channel: key, created_at: order.createdAt, data: order });
  await channels.commitSale(order.items, key, externalId); await rebuildCatalog();
  await afterPaid(order).catch((e) => console.error('[pedido] automatización:', e.message));
  return { ok: true, order: number, shortfalls };
}
/* Al quedar pagado: la orden pasa sola a ShipStation (si hay llaves y la automatización está activa). */
async function afterPaid(o) {
  const pricing = await loadPricing();
  if ((pricing.automation || {}).shipOnPaid === false || !channels.shipstation.hasCreds() || (o.fulfillment && o.fulfillment.id)) return o;
  if (!o.buyer || !o.buyer.address) return o;
  if (o.review) return o; /* retenido: la dueña lo aprueba antes de que salga */
  const r = await channels.shipstation.createOrder(o, pricing.store);
  if (r.ok) { o.fulfillment = { ...(o.fulfillment || {}), provider: 'shipstation', id: r.id, mode: r.mode, at: new Date().toISOString() }; const { id, createdAt, userId, ...data } = o; await db.update('orders', { number: o.number }, { data }); }
  else console.error('[ShipStation]', r.note);
  return o;
}
/* Cambio de estado de un pedido: lo usa el panel y el aviso de ShipStation. */
async function setOrderStatus(number, body, opts = {}) {
  const row = await db.find('orders', { number: clean(number, 40) }); if (!row) return { ok: false, code: 404, error: 'Pedido no encontrado' };
  const STATUSES = ['pendiente_pago', 'pagado', 'en_proceso', 'enviado', 'entregado', 'cancelado'];
  const status = STATUSES.includes(body.status) ? body.status : row.status;
  const o = rowToOrder(row); const prev = o.status;
  o.status = status; o.history = [...(o.history || []), { at: new Date().toISOString(), status, note: clean(body.note, 300) || undefined }];
  if (body.tracking != null || body.carrier != null) o.fulfillment = { ...(o.fulfillment || {}), tracking: clean(body.tracking, 80), carrier: clean(body.carrier, 60), at: new Date().toISOString() };
  if (status === 'cancelado' && prev !== 'cancelado') await channels.releaseSale(o.items, o.channel, o.number);
  if (prev === 'cancelado' && status !== 'cancelado') await channels.commitSale(o.items, o.channel, o.number);
  /* Referidos: al confirmar el pago, el dueño del código gana su saldo (una sola vez) */
  if (o.referral && !o.referral.credited && !o.referral.needsReview && ['pagado', 'en_proceso', 'enviado', 'entregado'].includes(status)) {
    const base = round2((o.totals.subtotal || 0) - (o.totals.discount || 0));
    const gain = round2(base * (Number(o.referral.ownerPct) || 0) / 100);
    if (gain > 0) { await creditReferral(o.referral.code, gain, 'earn', o.number, `Compra de ${o.buyer.name}`); o.referral.credited = true; o.referral.credit = gain; }
  }
  if (status === 'cancelado' && prev !== 'cancelado') {
    if (o.referral && o.referral.credited && o.referral.credit) { await creditReferral(o.referral.code, -o.referral.credit, 'reverse', o.number, 'Pedido cancelado'); o.referral.credited = false; }
    if (o.creditUsed > 0 && o.creditCode && !o.creditRefunded) { await creditReferral(o.creditCode, o.creditUsed, 'refund', o.number, 'Devolución de saldo por cancelación'); o.creditRefunded = true; }
  }
  /* eBay: al despachar, la guía se sube a la venta para que el comprador la vea */
  const f = o.fulfillment || {};
  if (status === 'enviado' && o.channel === 'ebay' && f.tracking && f.ebayTracking !== f.tracking && ebay.hasCreds()) {
    const r = await ebay.markShipped(o).catch((e) => ({ ok: false, note: e.message }));
    if (r.ok) o.fulfillment.ebayTracking = f.tracking; else console.error('[eBay] guía no enviada:', r.note);
  }
  const { id, createdAt, userId, ...data } = o;
  await db.update('orders', { number: o.number }, { status, data });
  await rebuildCatalog();
  if (status === 'pagado' && prev !== 'pagado') await afterPaid(o).catch((e) => console.error('[pedido] automatización:', e.message));
  if (!opts.silent && (status !== prev || body.tracking) && o.buyer && o.buyer.email && o.channel === 'web') { const pricing = await loadPricing(); mail.orderStatus(pricing.store, o, SITE_URL); }
  return { ok: true, order: o };
}

/* ── Usuarios (Supabase Auth) ────────────────────────── */
async function currentUser(req) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const user = await DB.userFromToken(token);
  if (!user) return null;
  const prof = await db.find('profiles', { id: user.id });
  if (!prof) {
    await db.upsert('profiles', [{ id: user.id, email: user.email, name: user.name, avatar: user.avatar || '', provider: user.provider, welcomed_at: new Date().toISOString(), created_at: new Date().toISOString() }], 'id');
    const pricing = await loadPricing();
    mail.welcome(pricing.store, user, SITE_URL, String(req.headers['x-lang'] || '') === 'es' ? 'es' : 'en');
    user.isNew = true;
  } else if (prof.name !== user.name || prof.email !== user.email) {
    db.update('profiles', { id: user.id }, { name: user.name, email: user.email, avatar: user.avatar || '' }).catch(() => {});
  }
  return user;
}

/* ── Seguridad del panel ───────────────────────────────
 * Capas, de fuera hacia dentro:
 *  1. Dirección del panel configurable (ADMIN_PATH) y lista opcional de IP permitidas (ADMIN_IP_ALLOW).
 *  2. Contraseña (ADMIN_PASSWORD o, mejor, ADMIN_PASSWORD_HASH) comparada en tiempo constante.
 *  3. Segundo factor: código de 6 dígitos de una app autenticadora (TOTP).
 *  4. Bloqueo por intentos fallidos y freno general cuando hay un ataque.
 *  5. Sesión corta, atada al navegador, en cookie HttpOnly + SameSite; cada cambio queda en la bitácora. */
const ADMIN_PATH = ('/' + String(process.env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, '')).toLowerCase();
const ADMIN_IP_ALLOW = (process.env.ADMIN_IP_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean);
/* Quita comillas y el nombre de la variable si se pegó la línea entera (error de copiado habitual). */
const ADMIN_HASH = (process.env.ADMIN_PASSWORD_HASH || '').trim()
  .replace(/^["']|["']$/g, '').replace(/^ADMIN_PASSWORD_HASH\s*=\s*/i, '').trim();
const ADMIN_HASH_OK = !ADMIN_HASH || /^scrypt:[0-9a-f]{16,}:[0-9a-f]{64,}$/i.test(ADMIN_HASH);
const SESSION_HOURS = 12, IDLE_MINUTES = 120;
const TRUST_PROXY = Math.max(0, parseInt(process.env.TRUST_PROXY == null ? '1' : process.env.TRUST_PROXY, 10) || 0);
/* IP real del visitante. Detrás de Railway/Render el proxy AÑADE la IP al final de X-Forwarded-For;
 * lo que venga antes lo puede inventar el visitante, así que se cuenta desde el final. */
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (TRUST_PROXY > 0 && xff.length) return xff[Math.max(0, xff.length - TRUST_PROXY)];
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const uaHash = (req) => sha256(req.headers['user-agent'] || '').toString('base64url').slice(0, 16);
function checkPassword(pw) {
  pw = String(pw || '');
  if (!pw) return false; // la contraseña vacía nunca vale, pase lo que pase con la configuración
  if (!ADMIN_HASH_OK) return false; // hash mal pegado: no se entra hasta corregirlo
  if (ADMIN_HASH.startsWith('scrypt:')) {
    try {
      const [, salt, hash] = ADMIN_HASH.split(':');
      const want = Buffer.from(hash || '', 'hex');
      /* Un hash truncado daría want.length = 0 y timingSafeEqual(vacío, vacío) = true:
       * entonces CUALQUIER contraseña entraría. Se exige salt y hash completos. */
      if (!salt || want.length < 32 || Buffer.from(salt, 'hex').length < 8) return false;
      const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), want.length);
      return crypto.timingSafeEqual(got, want);
    } catch (_) { return false; }
  }
  if (!ADMIN_PASSWORD) return false; // sin contraseña configurada no se entra
  return crypto.timingSafeEqual(sha256(pw), sha256(ADMIN_PASSWORD));
}

/* Código de la app autenticadora (TOTP, RFC 6238: HMAC-SHA1, 6 dígitos, 30 s) */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) { let bits = ''; for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(ch).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function b32encode(buf) { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let out = ''; for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function totp(secret, counter) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(b).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
let lastTotpCounter = 0;
function checkTotp(secret, code) {
  code = String(code || '').replace(/\D/g, ''); if (code.length !== 6 || !secret) return false;
  const c = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    if (c + d <= lastTotpCounter) continue; // un código no sirve dos veces
    if (crypto.timingSafeEqual(Buffer.from(totp(secret, c + d)), Buffer.from(code))) { lastTotpCounter = c + d; return true; }
  }
  return false;
}
async function twoFa() {
  const envS = (process.env.ADMIN_TOTP_SECRET || '').replace(/\s/g, '').toUpperCase();
  if (envS) return { enabled: true, secret: envS, fromEnv: true };
  if (process.env.ADMIN_2FA_RESET === '1') return { enabled: false };
  return (await getSetting('admin_2fa', {})) || {};
}

/* Intentos fallidos: 5 seguidos desde una IP la bloquean 15 minutos; si llueven intentos desde
 * muchas IP, cada respuesta de acceso se demora (hasta 4 s) para frenar el ataque sin dejar fuera a la dueña. */
const loginFails = new Map(); let recentFails = [];
function loginBlockedMinutes(ip) { const r = loginFails.get(ip); return r && r.until > Date.now() ? Math.ceil((r.until - Date.now()) / 60000) : 0; }
function loginFail(ip) {
  const now = Date.now(); const r = loginFails.get(ip) || { n: 0, first: now, until: 0 };
  if (now - r.first > 15 * 60000) { r.n = 0; r.first = now; }
  r.n += 1; if (r.n >= 5) { r.until = now + 15 * 60000; r.n = 0; r.first = now; }
  loginFails.set(ip, r); recentFails = recentFails.filter((t) => now - t < 15 * 60000); recentFails.push(now);
  return r.until > now;
}
const loginDelay = () => new Promise((res) => setTimeout(res, Math.min(4000, 250 + recentFails.filter((t) => Date.now() - t < 15 * 60000).length * 150)));
/* Techo global: el bloqueo por IP no frena a una red de robots que cambia de IP en cada intento.
 * Pasados 40 fallos en 15 minutos el panel deja de aceptar intentos de nadie durante unos minutos. */
const GLOBAL_FAIL_MAX = 40; let globalLockUntil = 0;
const loginStorm = () => {
  const now = Date.now();
  if (globalLockUntil > now) return Math.ceil((globalLockUntil - now) / 60000);
  if (recentFails.filter((t) => now - t < 15 * 60000).length >= GLOBAL_FAIL_MAX) { globalLockUntil = now + 10 * 60000; return 10; }
  return 0;
};

/* Bitácora: quién entró y qué se cambió (se guarda en la base, últimas 400 entradas). */
async function audit(req, action, detail) {
  try {
    const list = (await getSetting('audit_log', [])) || [];
    list.unshift({ at: new Date().toISOString(), ip: req ? clientIp(req) : '', action: String(action).slice(0, 60), detail: String(detail || '').slice(0, 200) });
    await setSetting('audit_log', list.slice(0, 400));
  } catch (e) { console.error('[bitácora]', e.message); }
}

/* ── Sesión de admin (cookie) ────────────────────────── */
const sessions = new Map();
const signSid = (id) => id + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('base64url');
function readSid(token, req) {
  const i = String(token || '').lastIndexOf('.'); if (i < 1) return null;
  const id = token.slice(0, i), sig = token.slice(i + 1);
  const good = crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('base64url');
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null; } catch (_) { return null; }
  const s = sessions.get(id); const now = Date.now();
  if (!s || s.exp < now || now - s.seen > IDLE_MINUTES * 60000 || (req && s.ua !== uaHash(req))) { sessions.delete(id); return null; }
  s.seen = now; return { id, ...s };
}
function newSession(req, data) { const id = crypto.randomBytes(24).toString('base64url'); const now = Date.now(); sessions.set(id, { ...data, ua: uaHash(req), ip: clientIp(req), exp: now + SESSION_HOURS * 36e5, seen: now }); return signSid(id); }
setInterval(() => { const now = Date.now(); for (const [k, s] of sessions) if (s.exp < now || now - s.seen > IDLE_MINUTES * 60000) sessions.delete(k); for (const [k, r] of loginFails) if (r.until < now && now - r.first > 15 * 60000) loginFails.delete(k); }, 60000).unref();
function cookies(req) { const out = {}; for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i === -1) continue; try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) {} } return out; }
const isHttps = (req) => IS_PROD || req.headers['x-forwarded-proto'] === 'https';
function setCookie(req, res, name, val, hours) {
  const attrs = [`${name}=${encodeURIComponent(val)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.round(hours * 3600)}`, isHttps(req) ? 'Secure' : ''].filter(Boolean);
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : [prev]), attrs.join('; ')]);
}
const adminIpOk = (req) => !ADMIN_IP_ALLOW.length || ADMIN_IP_ALLOW.includes(clientIp(req));
/* Solo la sesión del panel da acceso de administrador. Una cuenta de cliente, aunque use el
 * correo de la dueña, nunca abre el panel ni sus rutas. */
async function isAdmin(req) { if (!adminIpOk(req)) return false; const s = readSid(cookies(req).asid, req); return !!(s && s.kind === 'admin'); }

/* ── Límite de peticiones por IP ─────────────────────── */
const hits = new Map();
function rateLimit(req, key, max, windowMs, id) {
  const k = key + '|' + (id || clientIp(req)); const now = Date.now();
  const rec = hits.get(k) || { n: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + windowMs; }
  rec.n += 1; hits.set(k, rec); return rec.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, 60000).unref();
/* Pagos rechazados: 4 seguidos desde una IP y no se aceptan más intentos durante una hora
 * (así se corta a quien usa la tienda para probar tarjetas robadas). */
const declines = new Map();
const declineBlocked = (ip) => { const d = declines.get(ip); return !!(d && d.n >= 4 && Date.now() - d.first < 60 * 60000); };
function declineHit(ip) { const now = Date.now(); const d = declines.get(ip) || { n: 0, first: now }; if (now - d.first > 60 * 60000) { d.n = 0; d.first = now; } d.n += 1; declines.set(ip, d); if (declines.size > 5000) declines.delete(declines.keys().next().value); return d.n; }

/* ── Respuestas y cabeceras de seguridad ─────────────── */
function secHeaders(req, res, admin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  /* Sin 'unsafe-inline' en los scripts: aunque alguien lograra colar HTML, no puede ejecutar código. */
  const common = `default-src 'self'; img-src 'self' data: https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  if (admin) { res.setHeader('Content-Security-Policy', `${common}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src 'none'`); return; }
  const supa = DB.URL ? ' ' + DB.URL : ''; const sq = square.cspHosts();
  res.setHeader('Content-Security-Policy', `${common}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${sq ? ' ' + sq.style : ''}; font-src https://fonts.gstatic.com${sq ? ' ' + sq.font : ''}; ` +
    `script-src 'self'${sq ? ' ' + sq.script : ''}; connect-src 'self'${supa}${sq ? ' ' + sq.connect : ''}; frame-src ${sq ? sq.frame : "'none'"}`);
}
const sendJson = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const sendFile = (res, file, type, cache) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache || 'no-cache' }); res.end(fs.readFileSync(file)); };
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { req.destroy(); reject(new Error('Cuerpo demasiado grande')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readBody(req, limit) { const raw = await readRaw(req, limit); try { const j = JSON.parse(raw || '{}'); if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('x'); return j; } catch (_) { throw new Error('JSON inválido'); } }
function sameOrigin(req) { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (_) { return false; } }
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/* ── Búsqueda por código de barras en bases públicas ───
 * UPCitemdb (perfumes, artículos en general; 100 consultas/día sin llave) y
 * Open Food Facts (alimentos: chocolates, enlatados…). Se usa al escanear un
 * producto que no está ni en el inventario propio ni en el catálogo del proveedor. */
const UPCDB_URL = (process.env.UPCITEMDB_URL || 'https://api.upcitemdb.com').replace(/\/+$/, '');
const OFF_URL = (process.env.OPENFOODFACTS_URL || 'https://world.openfoodfacts.org').replace(/\/+$/, '');
const ALLOW_LOCAL_FETCH = process.env.ALLOW_LOCAL_FETCH === '1' && !IS_PROD;
const lookupCache = new Map();
const okImg = (u) => /^https:\/\//i.test(String(u || '')) || (ALLOW_LOCAL_FETCH && /^http:\/\//i.test(String(u || '')));
async function fetchJson(url, opts = {}, ms = 9000) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, ok: r.ok, json: j };
}
function parseWeightOz(txt) {
  const m = String(txt || '').toLowerCase().match(/([\d.,]+)\s*(lbs?|pounds?|oz|ounces?|kg|g|grams?|ml|cl|l)\b/); if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.')); if (!(n > 0)) return null; const u = m[2];
  const oz = /^(lb|pound)/.test(u) ? n * 16 : /^(oz|ounce)/.test(u) ? n : u === 'kg' ? n * 35.274 : u === 'ml' ? n * 0.0353 : u === 'cl' ? n * 0.353 : u === 'l' ? n * 35.3 : n * 0.035274;
  return round2(oz);
}
async function lookupExternal(upc) {
  if (lookupCache.has(upc)) return lookupCache.get(upc);
  const key = (process.env.UPCITEMDB_KEY || '').trim();
  const [a, b] = await Promise.allSettled([
    fetchJson(`${UPCDB_URL}/prod/${key ? 'v1' : 'trial'}/lookup?upc=${encodeURIComponent(upc)}`, { headers: key ? { Accept: 'application/json', user_key: key, key_type: '3scale' } : { Accept: 'application/json' } }),
    fetchJson(`${OFF_URL}/api/v2/product/${encodeURIComponent(upc)}.json?fields=product_name,product_name_en,product_name_es,brands,generic_name,quantity,categories,image_front_url,image_url`, { headers: { 'User-Agent': 'NVOS-Market/1.0 (inventario)' } }),
  ]);
  const out = { sources: [], images: [] };
  const it = a.status === 'fulfilled' && a.value.json && Array.isArray(a.value.json.items) ? a.value.json.items[0] : null;
  if (a.status === 'fulfilled' && a.value.status === 429) out.limited = true;
  if (it) {
    out.sources.push('UPCitemdb'); out.name = clean(it.title, 200); out.brand = clean(it.brand, 120); out.description = clean(it.description, 3000); out.type = clean(String(it.category || '').split('>').pop(), 120);
    out.weightOz = parseWeightOz(it.weight); const dm = String(it.dimension || '').match(/([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*(in|inch|cm)?/i);
    if (dm) { const k = /cm/i.test(dm[4] || '') ? 1 / 2.54 : 1; out.lengthIn = round2(dm[1] * k); out.widthIn = round2(dm[2] * k); out.heightIn = round2(dm[3] * k); }
    for (const im of (Array.isArray(it.images) ? it.images : [])) if (okImg(im)) out.images.push(im);
  }
  const f = b.status === 'fulfilled' && b.value.json && b.value.json.status === 1 ? b.value.json.product : null;
  if (f) {
    out.sources.push('Open Food Facts');
    out.name = out.name || clean([f.product_name_es || f.product_name || f.product_name_en, f.quantity].filter(Boolean).join(' '), 200);
    out.brand = out.brand || clean(String(f.brands || '').split(',')[0], 120);
    out.description = out.description || clean(f.generic_name, 3000); out.type = out.type || clean(String(f.categories || '').split(',').pop(), 120);
    out.weightOz = out.weightOz || parseWeightOz(f.quantity); out.food = true;
    for (const im of [f.image_front_url, f.image_url]) if (im && okImg(im) && !out.images.includes(im)) out.images.push(im);
  }
  out.images = out.images.slice(0, 8);
  const res = out.sources.length ? out : (out.limited ? { sources: [], images: [], limited: true } : null);
  if (res && res.sources.length) { out.category = detectCategory(`${out.name} ${out.type} ${out.brand}`); if (out.category === 'Otros' && out.food) out.category = 'Enlatados'; lookupCache.set(upc, out); if (lookupCache.size > 500) lookupCache.delete(lookupCache.keys().next().value); }
  return res;
}
/* Fotos: se descarga la imagen elegida en el servidor (el navegador no puede por CORS) y el
 * panel la centra sobre fondo blanco antes de guardarla. Solo https y nunca hacia redes internas. */
function isPrivateIp(ip) {
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  const v6 = ip.toLowerCase(); return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
}
async function fetchImageAsDataUrl(rawUrl) {
  let url = String(rawUrl || '');
  for (let hop = 0; hop < 4; hop++) {
    let u; try { u = new URL(url); } catch (_) { throw new Error('Enlace de imagen no válido'); }
    if (u.protocol !== 'https:' && !ALLOW_LOCAL_FETCH) throw new Error('Solo se aceptan enlaces https');
    if (!ALLOW_LOCAL_FETCH) { const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []); if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) throw new Error('Ese enlace no es accesible'); }
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NVOS-Market/1.0)', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), u).toString(); continue; }
    if (!r.ok) throw new Error(`La imagen respondió HTTP ${r.status}`);
    const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|jpg|webp|gif|avif)$/.test(type)) throw new Error('Ese enlace no es una imagen (png, jpg o webp)');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8e6) throw new Error('La imagen supera 8 MB');
    return `data:${type};base64,${buf.toString('base64')}`;
  }
  throw new Error('Demasiadas redirecciones');
}
/* Búsqueda de fotos con la API oficial de Google (Programmable Search), filtrando fondo blanco.
 * Opcional: solo funciona con GOOGLE_CSE_KEY y GOOGLE_CSE_CX. */
const hasGoogleImages = () => !!((process.env.GOOGLE_CSE_KEY || '').trim() && (process.env.GOOGLE_CSE_CX || '').trim());
async function googleImages(q) {
  const qs = new URLSearchParams({ key: process.env.GOOGLE_CSE_KEY.trim(), cx: process.env.GOOGLE_CSE_CX.trim(), q, searchType: 'image', imgDominantColor: 'white', imgType: 'photo', num: '8', safe: 'active' });
  const r = await fetchJson(`${(process.env.GOOGLE_CSE_URL || 'https://www.googleapis.com').replace(/\/+$/, '')}/customsearch/v1?${qs.toString()}`);
  if (!r.ok) throw new Error((r.json && r.json.error && r.json.error.message) || `Google respondió HTTP ${r.status}`);
  return ((r.json && r.json.items) || []).map((x) => x.link).filter((l) => /^https:\/\//i.test(l)).slice(0, 8);
}

/* ── eBay: ventas entrantes y stock de lo publicado ──── */
let ebayBusy = false;
async function ebayPullOrders() {
  if (!ebay.hasCreds() || ebayBusy) return { ok: false, imported: 0 };
  ebayBusy = true;
  try {
    const list = await ebay.fetchNewOrders(); const done = [];
    for (const d of list) {
      const r = await createChannelOrder('ebay', d).catch((e) => ({ ok: false, error: e.message }));
      if (r.ok) done.push(r.order); else console.error('[eBay] pedido', d.externalId, 'no entró:', r.error);
      await ebay.markImported(d.externalId);
    }
    return { ok: true, imported: done.length, orders: done };
  } catch (e) { console.error('[eBay] lectura de ventas:', e.message); return { ok: false, imported: 0, error: e.message }; }
  finally { ebayBusy = false; }
}
async function ebayPushStock() {
  if (!ebay.hasCreds()) return { ok: false, updated: 0 };
  try { const pricing = await loadPricing(); const cat = await catalog('admin'); return await ebay.syncStock(channels.buildChannelPayload(cat.products, pricing, 'ebay')); }
  catch (e) { console.error('[eBay] stock:', e.message); return { ok: false, updated: 0, error: e.message }; }
}
setInterval(() => { ebayPullOrders().then(() => ebayPushStock()); }, 10 * 60000).unref();

async function orderByPayment(paymentId) {
  const rows = await db.all('orders', { order: 'created_at.desc', limit: 2000 });
  const row = rows.find((r) => ((r.data || {}).payment || {}).id === paymentId); return row ? rowToOrder(row) : null;
}
async function recordRefund(number, rf) {
  return patchOrder(number, (o) => {
    const list = (o.refunds || []).filter((x) => x.id !== rf.id); list.push({ id: rf.id, status: rf.status, amount: round2(rf.amount), at: rf.at });
    const sum = round2(list.reduce((a, x) => a + x.amount, 0));
    o.refunds = list; o.refund = { amount: sum, at: rf.at, full: sum >= round2((o.payment && o.payment.amount) || o.totals.total) - 0.005 };
    o.history = [...(o.history || []), { at: new Date().toISOString(), status: o.status, note: `Reembolso de $${round2(rf.amount).toFixed(2)}` }];
  });
}

/* ══════════ RUTAS PÚBLICAS ══════════ */
async function publicRouter(req, res, u) {
  const P = u.pathname;
  if (P === '/' || P === '/index.html') return sendFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html; charset=utf-8');
  if (P === '/config.js') {
    const pricing = await loadPricing();
    const cfg = { supabaseUrl: DB.URL || '', supabaseAnonKey: DB.ANON || '', local: DB.LOCAL, store: { name: pricing.store.name, tagline: pricing.store.tagline, headline: pricing.store.headline, lede: pricing.store.lede, whatsapp: pricing.store.whatsapp }, square: square.publicConfig() };
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('window.APP_CONFIG=' + JSON.stringify(cfg) + ';');
  }
  if (P.startsWith('/img/')) {
    const file = path.join(__dirname, 'data', 'img', path.basename(P)); const ext = path.extname(file).toLowerCase();
    if (MIME[ext] && fs.existsSync(file)) return sendFile(res, file, MIME[ext], 'public, max-age=86400');
    res.writeHead(404); return res.end();
  }
  const ext = path.extname(P).toLowerCase();
  /* Librerías alojadas aquí (en vez de un CDN): se sirve solo el nombre del archivo,
   * nunca una ruta que venga del visitante, y con caché larga porque llevan la versión. */
  if (P.startsWith('/vendor/') && MIME[ext]) {
    const file = path.join(__dirname, 'public', 'vendor', path.basename(P));
    if (fs.existsSync(file)) return sendFile(res, file, MIME[ext], 'public, max-age=31536000, immutable');
    res.writeHead(404); return res.end();
  }
  if (MIME[ext]) {
    const name = path.basename(P);
    /* El panel (su HTML y su JavaScript) solo se sirve desde ADMIN_PATH. */
    if (name === 'admin.js' || name === 'admin.html') { res.writeHead(404); return res.end(); }
    const file = path.join(__dirname, 'public', name);
    if (fs.existsSync(file)) return sendFile(res, file, MIME[ext], 'no-cache');
  }

  if (P === '/api/catalog') {
    const payload = await catalog('pub');
    return payload ? sendJson(res, 200, payload) : sendJson(res, 503, { error: 'Catálogo aún no disponible' });
  }
  if (P === '/api/product' && req.method === 'GET') {
    const payload = await catalog('pub'); const upc = u.searchParams.get('upc') || '';
    const p = payload && (byUpc(payload.products, upc) || payload.products.find((x) => x.id === upc));
    return p ? sendJson(res, 200, { ok: true, product: p }) : sendJson(res, 404, { ok: false, error: 'Producto no encontrado' });
  }

  /* Cotización: el total que se va a cobrar (con envío e impuesto), calculado en el servidor */
  if (P === '/api/orders/quote' && req.method === 'POST') {
    if (!rateLimit(req, 'quote', 60, 60000)) return sendJson(res, 429, { ok: false, error: 'Demasiadas consultas, espera un momento' });
    try { const data = await readBody(req, 50000); const q = await priceOrder(data, await currentUser(req), false); return sendJson(res, 200, { ok: true, totals: quoteTotals(q) }); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }
  if (P === '/api/orders' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origen no permitido' });
    const ip = clientIp(req); const en = String(req.headers['x-lang'] || '') !== 'es';
    if (declineBlocked(ip)) return sendJson(res, 429, { ok: false, error: en ? 'Too many declined payments. Please try again in an hour or contact us.' : 'Demasiados pagos rechazados. Inténtalo en una hora o escríbenos.' });
    if (!rateLimit(req, 'order', 8, 10 * 60000)) return sendJson(res, 429, { ok: false, error: en ? 'Too many attempts, please wait a few minutes' : 'Demasiados intentos, espera unos minutos' });
    try {
      const data = await readBody(req, 200000); const user = await currentUser(req);
      const mailKey = String((user && user.email) || (data.buyer && data.buyer.email) || '').toLowerCase().slice(0, 200);
      if (mailKey && !rateLimit(req, 'ordermail', 8, 30 * 60000, mailKey)) return sendJson(res, 429, { ok: false, error: en ? 'Too many attempts, please wait a few minutes' : 'Demasiados intentos, espera unos minutos' });
      const order = await placeOrder(data, user); return sendJson(res, 200, { ok: true, order: publicOrder(order) });
    } catch (e) {
      if (e.declined) { const n = declineHit(ip); if (n === 4) audit(req, 'pagos_rechazados', `4 pagos rechazados seguidos desde ${ip}; bloqueada 1 hora`); }
      return sendJson(res, e.declined ? 402 : 400, { ok: false, declined: !!e.declined, error: e.message });
    }
  }

  /* Avisos de Square: reembolsos, disputas y pagos que quedaron sin anotar */
  if (P === '/api/square/webhook' && req.method === 'POST') {
    const raw = await readRaw(req, 3e5).catch(() => '');
    if (!square.verifyWebhook(raw, req.headers['x-square-hmacsha256-signature'], SITE_URL + '/api/square/webhook')) return sendJson(res, 401, { ok: false, error: 'Firma inválida' });
    let ev = {}; try { ev = JSON.parse(raw); } catch (_) {}
    const obj = (ev.data && ev.data.object) || {}; const type = String(ev.type || '');
    try {
      if (type.startsWith('payment.')) {
        const p = obj.payment || {}; const row = p.reference_id ? await db.find('orders', { number: String(p.reference_id) }) : null;
        if (row && row.status === 'pendiente_pago' && p.status === 'COMPLETED' && Math.abs(((p.amount_money || {}).amount || 0) / 100 - Number((row.data.totals || {}).total)) < 0.01) {
          const cd = p.card_details || {};
          await patchOrder(row.number, (o) => { o.payment = o.payment || { provider: 'square', id: p.id, status: p.status, amount: (p.amount_money.amount || 0) / 100, brand: (cd.card || {}).card_brand || '', last4: (cd.card || {}).last_4 || '', avs: cd.avs_status || '', cvv: cd.cvv_status || '', risk: (p.risk_evaluation || {}).risk_level || '', receiptUrl: p.receipt_url || '', at: p.created_at }; });
          const out = await setOrderStatus(row.number, { status: 'pagado', note: 'Pago confirmado por aviso de Square' }, { silent: true });
          if (out.ok) mail.orderCreated((await loadPricing()).store, out.order, SITE_URL);
        }
      } else if (type.startsWith('refund.')) {
        const f = obj.refund || {}; const o = f.payment_id ? await orderByPayment(f.payment_id) : null;
        if (o && ['COMPLETED', 'PENDING'].includes(f.status)) await recordRefund(o.number, { id: f.id, status: f.status, amount: ((f.amount_money || {}).amount || 0) / 100, at: f.created_at || new Date().toISOString() });
      } else if (type.startsWith('dispute.')) {
        const d = obj.dispute || {}; const pid = (d.disputed_payment || {}).payment_id; const o = pid ? await orderByPayment(pid) : null;
        if (o) {
          await patchOrder(o.number, (x) => { x.dispute = { id: d.id || d.dispute_id, state: d.state, reason: d.reason, amount: ((d.amount_money || {}).amount || 0) / 100, at: new Date().toISOString() }; });
          if (type === 'dispute.created') mail.adminAlert((await loadPricing()).store, `Disputa de pago en el pedido ${o.number}`, `El banco del cliente abrió una disputa (${d.reason || 'sin motivo'}) por el pedido ${o.number}. Respóndela en el panel de Square antes de la fecha límite, con la guía de envío y la prueba de entrega.`);
        }
      }
    } catch (e) { console.error('[Square] aviso:', e.message); }
    return sendJson(res, 200, { ok: true });
  }

  /* cuenta */
  if (P === '/api/auth/me') {
    const user = await currentUser(req);
    return sendJson(res, 200, { ok: true, user: user ? { name: user.name, email: user.email, avatar: user.avatar || '', isNew: !!user.isNew, verified: !!user.verified } : null });
  }
  if (P === '/api/my/orders') {
    const user = await currentUser(req); if (!user) return sendJson(res, 401, { ok: false, error: 'Inicia sesión' });
    /* Los pedidos hechos sin cuenta solo se muestran a quien demostró ser dueño de ese correo
     * (Google o correo confirmado); si no, cualquiera podría registrarse con un correo ajeno y verlos. */
    const mine = await db.where('orders', { user_id: user.id }, { order: 'created_at.desc', limit: 100 });
    const byMail = user.verified ? await db.where('orders', { email: user.email }, { order: 'created_at.desc', limit: 100 }) : [];
    const seen = new Set(); const rows = [...mine, ...byMail].filter((r) => r.channel === 'web' && !seen.has(r.number) && seen.add(r.number)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return sendJson(res, 200, { ok: true, orders: rows.map((r) => publicOrder(rowToOrder(r))) });
  }
  if (P === '/api/my/cart') {
    const user = await currentUser(req); if (!user) return sendJson(res, 401, { ok: false, error: 'Inicia sesión' });
    if (req.method === 'GET') { const c = await db.find('carts', { user_id: user.id }); return sendJson(res, 200, { ok: true, items: (c && c.items) || [] }); }
    if (req.method === 'PUT') {
      try {
        const d = await readBody(req, 50000);
        const items = (Array.isArray(d.items) ? d.items : []).slice(0, 80).map((i) => ({ upc: clean(i.upc, 32), qty: Math.min(999, Math.max(1, parseInt(i.qty, 10) || 1)) })).filter((i) => i.upc);
        await db.upsert('carts', [{ user_id: user.id, items, updated_at: new Date().toISOString() }], 'user_id');
        return sendJson(res, 200, { ok: true, items });
      } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
    }
  }
  if (P === '/api/my/profile' && req.method === 'PUT') {
    const user = await currentUser(req); if (!user) return sendJson(res, 401, { ok: false, error: 'Inicia sesión' });
    try {
      const d = await readBody(req, 5000); const addr = {};
      for (const k of ['name', 'phone', 'address', 'city', 'state', 'zip', 'country']) addr[k] = clean(d[k], 200);
      await db.update('profiles', { id: user.id }, { shipping: addr });
      return sendJson(res, 200, { ok: true });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }
  if (P === '/api/my/profile' && req.method === 'GET') {
    const user = await currentUser(req); if (!user) return sendJson(res, 401, { ok: false, error: 'Inicia sesión' });
    const prof = await db.find('profiles', { id: user.id });
    return sendJson(res, 200, { ok: true, shipping: (prof && prof.shipping) || null });
  }

  /* referidos */
  if (P === '/api/referral/check' && req.method === 'GET') {
    if (!rateLimit(req, 'refchk', 20, 60000)) return sendJson(res, 429, { ok: false, error: 'Demasiados intentos' });
    const ref = await findReferral(u.searchParams.get('code') || '');
    if (!ref) return sendJson(res, 200, { ok: true, valid: false });
    const pricing = await loadPricing();
    const buyerPct = ref.buyer_pct != null && ref.buyer_pct !== '' ? Number(ref.buyer_pct) : (Number((pricing.referral || {}).buyerPct) || 0);
    return sendJson(res, 200, { ok: true, valid: true, code: ref.code, buyerPct, ownerName: String(ref.name || '').split(' ')[0] || '' });
  }
  if (P === '/api/my/referral' && req.method === 'GET') {
    const user = await currentUser(req); if (!user) return sendJson(res, 401, { ok: false, error: 'Inicia sesión' });
    const mine = user.verified ? await referralByEmail(user.email) : null;
    if (!mine || mine.enabled === false) return sendJson(res, 200, { ok: true, enabled: false });
    const pricing = await loadPricing();
    const log = (await db.where('referral_log', { code: mine.code }, { order: 'at.desc', limit: 60 })) || [];
    return sendJson(res, 200, { ok: true, enabled: true, code: mine.code, balance: Number(mine.balance) || 0, earned: Number(mine.earned) || 0, uses: parseInt(mine.uses, 10) || 0,
      buyerPct: mine.buyer_pct != null && mine.buyer_pct !== '' ? Number(mine.buyer_pct) : Number((pricing.referral || {}).buyerPct) || 0,
      ownerPct: mine.owner_pct != null && mine.owner_pct !== '' ? Number(mine.owner_pct) : Number((pricing.referral || {}).ownerPct) || 0,
      log: log.map((l) => ({ at: l.at, kind: l.kind, amount: l.amount, order: l.order_number, note: l.note })) });
  }

  /* boletín */
  if (P === '/api/newsletter' && req.method === 'POST') {
    if (!rateLimit(req, 'news', 6, 60000)) return sendJson(res, 429, { ok: false, error: 'Demasiados intentos' });
    try {
      const d = await readBody(req, 2000); const email = clean(d.email, 160).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { ok: false, error: 'Correo no válido' });
      const list = (await getSetting('newsletter', [])) || [];
      if (!list.some((x) => x.email === email)) { list.push({ email, at: new Date().toISOString() }); await setSetting('newsletter', list); }
      return sendJson(res, 200, { ok: true });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  /* webhook de ventas de marketplaces */
  const mCh = P.match(/^\/api\/channels\/([a-z0-9_-]+)\/order$/i);
  if (mCh && req.method === 'POST') {
    const key = mCh[1].toLowerCase();
    if (!CHANNEL_KEYS.includes(key) || key === 'web') return sendJson(res, 404, { ok: false, error: 'Canal desconocido' });
    const check = channels.verifyChannelSecret(key, req.headers['x-channel-secret'] || u.searchParams.get('secret') || '');
    if (!check.ok) return sendJson(res, 401, { ok: false, error: 'Secreto inválido o no configurado' });
    try {
      const d = await readBody(req, 1e5);
      const r = await createChannelOrder(key, d);
      return sendJson(res, r.ok ? 200 : 400, r);
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  /* eBay exige este punto a toda app en producción ("Marketplace account deletion"):
   * responde su verificación y acusa recibo cuando un usuario de eBay cierra su cuenta. */
  if (P === '/api/ebay/account-deletion') {
    const vt = (process.env.EBAY_VERIFICATION_TOKEN || '').trim();
    if (req.method === 'GET') {
      const code = u.searchParams.get('challenge_code') || ''; if (!vt || !code) return sendJson(res, 400, { error: 'Falta EBAY_VERIFICATION_TOKEN o challenge_code' });
      return sendJson(res, 200, { challengeResponse: crypto.createHash('sha256').update(code).update(vt).update(SITE_URL + '/api/ebay/account-deletion').digest('hex') });
    }
    if (req.method === 'POST') { const d = await readBody(req, 1e5).catch(() => ({})); console.log('[eBay] cierre de cuenta notificado:', ((d.notification || {}).data || {}).username || '(sin usuario)'); res.writeHead(204); return res.end(); }
  }

  /* ShipStation avisa cuando se imprime la etiqueta: guardamos la guía y marcamos "enviado" */
  if (P === '/api/shipstation/webhook' && req.method === 'POST') {
    const check = channels.verifyChannelSecret('shipstation', u.searchParams.get('secret') || req.headers['x-channel-secret'] || '');
    if (!check.ok) return sendJson(res, 401, { ok: false, error: 'Secreto inválido o no configurado' });
    try {
      const d = await readBody(req, 1e5);
      if (d.resource_type && !/SHIP_NOTIFY/i.test(d.resource_type)) return sendJson(res, 200, { ok: true, ignored: d.resource_type });
      const r = await channels.shipstation.fetchShipments(d.resource_url);
      if (!r.ok) return sendJson(res, 502, { ok: false, error: r.note });
      const done = [];
      for (const sh of r.shipments) {
        if (sh.voided || !sh.orderNumber || !sh.trackingNumber) continue;
        const row = await db.find('orders', { number: String(sh.orderNumber) }); if (!row) continue;
        const cur = rowToOrder(row);
        if ((cur.fulfillment || {}).tracking === sh.trackingNumber && ['enviado', 'entregado'].includes(cur.status)) continue;
        const st = ['entregado', 'cancelado'].includes(cur.status) ? cur.status : 'enviado';
        const out = await setOrderStatus(cur.number, { status: st, tracking: sh.trackingNumber, carrier: channels.shipstation.carrierName(sh.carrierCode), note: 'Etiqueta creada en ShipStation' });
        if (out.ok) done.push(cur.number);
      }
      return sendJson(res, 200, { ok: true, updated: done });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado');
}

const ebayStates = new Map();
/* ══════════ RUTAS DE ADMIN ══════════ */
async function adminRouter(req, res, u) {
  const P = u.pathname;
  if (P === ADMIN_PATH) {
    /* La dirección del JavaScript se escribe al servir: así vive bajo la ruta secreta y no
     * en /admin.js, donde cualquiera podría leer cómo está hecho el panel. */
    const html = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8').replace('__ADMIN_JS_SRC__', ADMIN_PATH + '/admin.js?v=8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  if (P === ADMIN_PATH + '/admin.js') return sendFile(res, path.join(__dirname, 'public', 'admin.js'), MIME['.js'], 'no-store');
  if (P === '/api/admin/login' && req.method === 'POST') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origen no permitido' });
    const ip = clientIp(req); const wait = loginBlockedMinutes(ip) || loginStorm();
    if (wait) return sendJson(res, 429, { ok: false, error: `Demasiados intentos. Espera ${wait} minuto${wait === 1 ? '' : 's'}.` });
    const d = await readBody(req, 2000).catch(() => ({}));
    await loginDelay();
    const fa = await twoFa();
    if (!checkPassword(d.password)) {
      const locked = loginFail(ip); audit(req, 'acceso_fallido', locked ? 'contraseña incorrecta · IP bloqueada 15 min' : 'contraseña incorrecta');
      if (locked) mail.adminAlert((await loadPricing()).store, 'Intentos fallidos de entrar al panel', `Hubo 5 intentos fallidos seguidos de entrar al panel desde la IP ${ip}. Esa IP quedó bloqueada 15 minutos. Si no fuiste tú, cambia la contraseña.`);
      return sendJson(res, 401, { ok: false, error: 'Contraseña incorrecta' });
    }
    if (fa.enabled) {
      if (!d.code) return sendJson(res, 401, { ok: false, need2fa: true, error: 'Escribe el código de 6 dígitos de tu app autenticadora' });
      if (!checkTotp(fa.secret, d.code)) { loginFail(ip); audit(req, 'acceso_fallido', 'código de 2 pasos incorrecto'); return sendJson(res, 401, { ok: false, need2fa: true, error: 'Código incorrecto o vencido' }); }
    }
    loginFails.delete(ip);
    setCookie(req, res, 'asid', newSession(req, { kind: 'admin' }), SESSION_HOURS);
    const known = (await getSetting('admin_ips', [])) || [];
    if (!known.includes(ip)) { await setSetting('admin_ips', [ip, ...known].slice(0, 30)); if (known.length) mail.adminAlert((await loadPricing()).store, 'Nuevo acceso al panel', `Alguien entró al panel desde una IP nueva: ${ip} (${String(req.headers['user-agent'] || '').slice(0, 120)}). Si no fuiste tú, cambia la contraseña de inmediato.`); }
    audit(req, 'acceso', fa.enabled ? 'con verificación en 2 pasos' : 'solo contraseña');
    return sendJson(res, 200, { ok: true });
  }
  if (P === '/api/admin/logout' && req.method === 'POST') { const s0 = readSid(cookies(req).asid, req); if (s0) sessions.delete(s0.id); setCookie(req, res, 'asid', '', 0); return sendJson(res, 200, { ok: true }); }
  if (P === '/api/admin/session') return sendJson(res, 200, { ok: true, admin: await isAdmin(req) });

  if (!(await isAdmin(req))) return sendJson(res, 401, { ok: false, error: 'Sesión de administrador requerida' });
  if (req.method !== 'GET' && !sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'Origen no permitido' });
  const body = req.method === 'GET' ? {} : await readBody(req, 6e6).catch((e) => ({ __err: e.message }));
  if (body.__err) return sendJson(res, 400, { ok: false, error: body.__err });
  if (req.method !== 'GET') {
    const act = P.replace('/api/admin/', '');
    if (!['meta', 'upload', 'image-import', 'products/stock', 'provider-test', 'refresh', 'ebay/test', 'ebay/import', 'ebay/sync', 'logout'].includes(act)) audit(req, act, [body.number, body.upc, body.id, body.key, body.channel, body.status, body.name, body.email].filter(Boolean).join(' · '));
  }

  /* seguridad: verificación en 2 pasos y bitácora */
  if (P === '/api/admin/security' && req.method === 'GET') {
    const fa = await twoFa();
    return sendJson(res, 200, { ok: true, twoFa: !!fa.enabled, twoFaEnv: !!fa.fromEnv, twoFaPending: !!(fa.secret && !fa.enabled), hashed: !!ADMIN_HASH, weakPassword: !ADMIN_HASH && ADMIN_PASSWORD.length < 14, adminPath: ADMIN_PATH, defaultPath: ADMIN_PATH === '/admin',
      ipAllow: ADMIN_IP_ALLOW.length, sessionHours: SESSION_HOURS, idleMinutes: IDLE_MINUTES, https: isHttps(req), sessionSecret: !!process.env.SESSION_SECRET, webhookSecret: !!(process.env.CHANNEL_WEBHOOK_SECRET || '').trim(), squareWebhook: !!(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '').trim(),
      alerts: !!process.env.RESEND_API_KEY && !!mail.alertTo(), log: ((await getSetting('audit_log', [])) || []).slice(0, 120) });
  }
  if (P === '/api/admin/2fa/setup' && req.method === 'POST') {
    const fa = await twoFa(); if (fa.fromEnv) return sendJson(res, 400, { ok: false, error: 'La verificación en 2 pasos está fijada en el servidor (ADMIN_TOTP_SECRET).' });
    if (fa.enabled) return sendJson(res, 400, { ok: false, error: 'Ya está activa. Desactívala primero para cambiar de teléfono.' });
    const secret = b32encode(crypto.randomBytes(20)); await setSetting('admin_2fa', { secret, enabled: false });
    const name = (await loadPricing()).store.name || 'Tienda';
    return sendJson(res, 200, { ok: true, secret, uri: `otpauth://totp/${encodeURIComponent(name + ':admin')}?secret=${secret}&issuer=${encodeURIComponent(name)}&algorithm=SHA1&digits=6&period=30` });
  }
  if (P === '/api/admin/2fa/enable' && req.method === 'POST') {
    const fa = (await getSetting('admin_2fa', {})) || {}; if (!fa.secret) return sendJson(res, 400, { ok: false, error: 'Primero genera la clave' });
    if (!checkTotp(fa.secret, body.code)) return sendJson(res, 400, { ok: false, error: 'Código incorrecto. Revisa que la hora del teléfono esté en automático.' });
    await setSetting('admin_2fa', { secret: fa.secret, enabled: true, at: new Date().toISOString() }); return sendJson(res, 200, { ok: true });
  }
  if (P === '/api/admin/2fa/disable' && req.method === 'POST') {
    const fa = await twoFa(); if (fa.fromEnv) return sendJson(res, 400, { ok: false, error: 'Está fijada en el servidor (ADMIN_TOTP_SECRET).' });
    if (fa.enabled && !checkTotp(fa.secret, body.code)) return sendJson(res, 400, { ok: false, error: 'Código incorrecto' });
    await setSetting('admin_2fa', {}); return sendJson(res, 200, { ok: true });
  }

  if (P === '/api/admin/status') { const c = await catalog('admin'); return sendJson(res, 200, { mode: c.mode, error: c.error, apiAt: c.apiAt, apiCount: c.apiCount, storage: DB.LOCAL ? 'local (archivo)' : 'Supabase', email: !!process.env.RESEND_API_KEY, adminEmails: ADMIN_EMAILS, square: square.publicConfig() ? { ready: true, sandbox: square.SANDBOX } : { ready: false }, googleImages: hasGoogleImages(), siteUrl: SITE_URL, webhookSecret: !!(process.env.CHANNEL_WEBHOOK_SECRET || process.env.SHIPSTATION_WEBHOOK_SECRET) }); }
  if (P === '/api/admin/catalog') { const c = await catalog('admin'); return sendJson(res, 200, { mode: c.mode, error: c.error, stats: c.stats, store: c.store, products: c.products, categories: c.categories, notes: c.notes }); }
  if (P === '/api/admin/provider-test' && req.method === 'POST') {
    if (!KEY || !SECRET) return sendJson(res, 200, { ok: false, status: 0, note: 'Faltan SHOPPEX_KEY / SHOPPEX_SECRET en el servidor.' });
    try {
      const t0 = Date.now(); const r = await supplierGet(ROUTE_PRODUCTS, { page: '1', per_page: '5' });
      const items = (r.json && r.json.data) || [];
      return sendJson(res, 200, { ok: r.status === 200, status: r.status, ms: Date.now() - t0, url: BASE_URL + API_PREFIX + ROUTE_PRODUCTS, key: KEY.slice(0, 9) + '…',
        count: items.length, pagination: r.json && r.json.pagination, sample: items.slice(0, 2).map((p) => ({ id: p.product_id || p.id, sku: p.sku, name: p.name, brand: p.brand, upc: p.upc, price: p.price, stock: p.stock_quantity })),
        body: r.status === 200 ? undefined : String(r.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400) });
    } catch (e) { return sendJson(res, 200, { ok: false, status: 0, note: e.message, url: BASE_URL + API_PREFIX + ROUTE_PRODUCTS }); }
  }
  if (P === '/api/admin/refresh' && req.method === 'POST') { await refreshApi(); const c = await catalog('admin'); return sendJson(res, 200, { ok: true, mode: c.mode, error: c.error, apiCount: c.apiCount }); }
  if (P === '/api/admin/pricing' && req.method === 'GET') return sendJson(res, 200, await loadPricing());
  if (P === '/api/admin/pricing' && req.method === 'POST') return sendJson(res, 200, { ok: true, rules: await savePricing(body) });

  /* referidos: reglas generales, códigos por cliente y bitácora */
  if (P === '/api/admin/referrals' && req.method === 'GET') {
    const pricing = await loadPricing();
    const codes = (await db.all('referral_codes', { order: 'created_at.desc', limit: 500 })) || [];
    const log = (await db.all('referral_log', { order: 'at.desc', limit: 200 })) || [];
    return sendJson(res, 200, { rules: pricing.referral, codes, log });
  }
  if (P === '/api/admin/referrals' && req.method === 'POST') {
    const rules = await savePricing({ referral: { buyerPct: Math.max(0, Math.min(50, Number(body.buyerPct) || 0)), ownerPct: Math.max(0, Math.min(50, Number(body.ownerPct) || 0)), minOrder: Math.max(0, Number(body.minOrder) || 0) } });
    return sendJson(res, 200, { ok: true, rules: rules.referral });
  }
  if (P === '/api/admin/referrals/code' && req.method === 'POST') {
    /* Activa (o edita) el código de un cliente elegido; no es para todo el mundo. */
    const email = clean(body.email, 200).toLowerCase();
    if (!email) return sendJson(res, 400, { ok: false, error: 'Falta el correo del cliente' });
    let row = await db.find('referral_codes', { email });
    let code = normCode(body.code) || (row && row.code);
    if (!code) { const base = normCode(email.split('@')[0]).slice(0, 8) || 'NVOS'; code = base + '-' + crypto.randomBytes(2).toString('hex').toUpperCase(); }
    if (!row) {
      const clash = await db.find('referral_codes', { code });
      if (clash && String(clash.email || '').toLowerCase() !== email) return sendJson(res, 409, { ok: false, error: 'Ese código ya lo tiene otro cliente' });
      const prof = await db.find('profiles', { email });
      row = await db.insert('referral_codes', { code, user_id: (prof && prof.id) || null, email, name: clean(body.name, 200) || (prof && prof.name) || '', enabled: body.enabled !== false, buyer_pct: body.buyerPct === '' || body.buyerPct == null ? null : Number(body.buyerPct), owner_pct: body.ownerPct === '' || body.ownerPct == null ? null : Number(body.ownerPct), balance: 0, earned: 0, uses: 0 });
    } else {
      const patch = { updated_at: new Date().toISOString() };
      if (body.enabled != null) patch.enabled = !!body.enabled;
      if (body.name != null) patch.name = clean(body.name, 200);
      if (body.buyerPct !== undefined) patch.buyer_pct = body.buyerPct === '' || body.buyerPct == null ? null : Number(body.buyerPct);
      if (body.ownerPct !== undefined) patch.owner_pct = body.ownerPct === '' || body.ownerPct == null ? null : Number(body.ownerPct);
      await db.update('referral_codes', { code: row.code }, patch);
      row = { ...row, ...patch };
    }
    return sendJson(res, 200, { ok: true, code: row });
  }
  if (P === '/api/admin/referrals/adjust' && req.method === 'POST') {
    const code = normCode(body.code); const amount = round2(Number(body.amount) || 0);
    if (!code || !amount) return sendJson(res, 400, { ok: false, error: 'Falta código o monto' });
    const row = await creditReferral(code, amount, 'adjust', '', clean(body.note, 200) || 'Ajuste manual del admin');
    if (!row) return sendJson(res, 404, { ok: false, error: 'Código no encontrado' });
    return sendJson(res, 200, { ok: true, balance: row.balance });
  }

  /* Aprobar la comisión de un referido que quedó retenida (compra sin cuenta verificada). */
  if (P === '/api/admin/referrals/approve' && req.method === 'POST') {
    const row = await db.find('orders', { number: clean(body.number, 40) });
    if (!row) return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' });
    const o = rowToOrder(row);
    if (!o.referral || !o.referral.needsReview) return sendJson(res, 400, { ok: false, error: 'Ese pedido no tiene una comisión retenida' });
    const base = round2((o.totals.subtotal || 0) - (o.totals.discount || 0));
    const gain = round2(base * (Number(o.referral.ownerPct) || 0) / 100);
    const upd = await patchOrder(o.number, (x) => { x.referral.needsReview = false; if (gain > 0) { x.referral.credited = true; x.referral.credit = gain; } });
    if (gain > 0) await creditReferral(o.referral.code, gain, 'earn', o.number, `Compra de ${o.buyer.name} (aprobada)`);
    await audit(req, 'referido_aprobado', `${o.number} · ${o.referral.code} · $${gain}`);
    return sendJson(res, 200, { ok: true, credited: gain, order: upd ? upd.number : o.number });
  }

  /* pedir a Shoppex la parte del pedido que no salió de mi inventario */
  if (P === '/api/admin/supplier-order' && req.method === 'POST') {
    const number = clean(body.number, 40);
    const row = await db.find('orders', { number });
    if (!row) return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' });
    const o = row.data || {};
    const so = o.supplierOrder || {};
    const prods = (so.products || []).filter((p) => (p.quantity || 0) > 0);
    if (!prods.length) return sendJson(res, 400, { ok: false, error: 'Este pedido salió completo de tu inventario; no hay nada que pedirle a Shoppex.' });
    if (so.sent) return sendJson(res, 409, { ok: false, error: `Ya se envió a Shoppex (${so.sentAt || ''})`, response: so.response });
    if (!KEY || !SECRET) return sendJson(res, 400, { ok: false, error: 'Faltan SHOPPEX_KEY / SHOPPEX_SECRET en el servidor.' });
    const payload = {
      id_order_partner: String(so.id_order_partner || number),
      items: prods.map((p) => (p.sku ? { sku: p.sku, quantity: p.quantity } : { product_id: p.upc, quantity: p.quantity })),
      comments: clean(body.comments, 300) || `Pedido ${number} · ${(o.buyer && o.buyer.name) || ''}`.trim(),
    };
    try {
      const r = await supplierPost(ROUTE_ORDERS, payload);
      const ok = r.status >= 200 && r.status < 300 && r.json && r.json.success !== false;
      so.response = r.json || { status: r.status, body: String(r.text || '').slice(0, 400) };
      if (ok) { so.sent = true; so.sentAt = new Date().toISOString(); }
      o.supplierOrder = so;
      o.history = [...(o.history || []), { at: new Date().toISOString(), status: ok ? 'pedido_proveedor' : 'error_proveedor', note: ok ? 'Enviado a Shoppex' : `Shoppex respondió ${r.status}` }];
      await db.update('orders', { number }, { data: o });
      return sendJson(res, ok ? 200 : 502, { ok, status: r.status, sent: so.sent, response: so.response, payload });
    } catch (e) { return sendJson(res, 502, { ok: false, error: 'No se pudo contactar a Shoppex: ' + e.message, payload }); }
  }

  /* pedidos */
  if (P === '/api/admin/orders' && req.method === 'GET') return sendJson(res, 200, (await db.all('orders', { order: 'created_at.desc', limit: 500 })).map(rowToOrder));
  if (P === '/api/admin/orders/status' && req.method === 'POST') { const r = await setOrderStatus(body.number, body); return sendJson(res, r.ok ? 200 : (r.code || 400), r); }
  if (P === '/api/admin/ship' && req.method === 'POST') {
    const row = await db.find('orders', { number: clean(body.number, 40) }); if (!row) return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' });
    const o = rowToOrder(row); const pricing = await loadPricing();
    const r = await channels.shipstation.createOrder(o, pricing.store);
    o.fulfillment = { ...(o.fulfillment || {}), provider: 'shipstation', id: r.id, mode: r.mode, at: new Date().toISOString() };
    const { id, createdAt, userId, ...data } = o; await db.update('orders', { number: o.number }, { data });
    return sendJson(res, 200, { ok: r.ok, result: r });
  }
  if (P === '/api/admin/square-test' && req.method === 'POST') return sendJson(res, 200, await square.test());
  if (P === '/api/admin/refund' && req.method === 'POST') {
    const row = await db.find('orders', { number: clean(body.number, 40) }); if (!row) return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' });
    const o = rowToOrder(row); if (!o.payment || !o.payment.id) return sendJson(res, 400, { ok: false, error: 'Este pedido no se cobró con Square' });
    const paid = round2(o.payment.amount || o.totals.total); const left = round2(paid - ((o.refund && o.refund.amount) || 0));
    const amount = body.amount ? round2(Number(body.amount)) : left;
    if (!(amount > 0) || amount > left + 0.005) return sendJson(res, 400, { ok: false, error: `Solo quedan $${left.toFixed(2)} por reembolsar` });
    const r = await square.refund(o, amount, clean(body.reason, 180) || `Pedido ${o.number}`);
    if (!r.ok) return sendJson(res, 502, { ok: false, error: 'Square no aceptó el reembolso: ' + r.note });
    const upd = await recordRefund(o.number, r.refund);
    /* reembolso total de algo que aún no salió: se cancela y el stock vuelve */
    if (upd.refund.full && ['pagado', 'en_proceso'].includes(o.status)) await setOrderStatus(o.number, { status: 'cancelado', note: 'Reembolsado por completo' });
    return sendJson(res, 200, { ok: true, refunded: amount, full: upd.refund.full });
  }
  if (P === '/api/admin/orders/approve' && req.method === 'POST') {
    const o = await patchOrder(clean(body.number, 40), (x) => { if (x.review) { x.reviewed = { at: new Date().toISOString(), reasons: x.review.reasons }; delete x.review; } });
    if (!o) return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' });
    if (['pagado', 'en_proceso'].includes(o.status)) await afterPaid(o).catch((e) => console.error('[pedido] automatización:', e.message));
    return sendJson(res, 200, { ok: true });
  }
  /* reporte de impuestos del mes (por estado) */
  if (P === '/api/admin/tax-report' && req.method === 'GET') {
    const pricing = await loadPricing(); const tz = pricing.tax.timezone;
    const month = /^\d{4}-\d{2}$/.test(u.searchParams.get('month') || '') ? u.searchParams.get('month') : TAX.monthOf(new Date().toISOString(), tz);
    const orders = (await db.all('orders', { order: 'created_at.desc', limit: 5000 })).map(rowToOrder);
    const rep = TAX.report(orders, pricing.tax, month, (o) => { const b = o.buyer || {}; const cc = b.countryCode || channels.countryCode(b.country); return cc === 'US' ? String(b.stateCode || channels.stateCode(b.state, 'US') || '').toUpperCase() : ''; });
    const fmt = u.searchParams.get('format');
    if (fmt === 'csv' || fmt === 'detail') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sales-tax-${month}${fmt === 'detail' ? '-orders' : ''}.csv"`, 'Cache-Control': 'no-store' }); return res.end(TAX.toCsv(rep, fmt)); }
    return sendJson(res, 200, { ok: true, report: rep, states: TAX.STATES, asOf: TAX.AS_OF, tax: pricing.tax });
  }

  /* productos propios */
  if (P === '/api/admin/products' && req.method === 'GET') return sendJson(res, 200, (await db.all('products_manual', { order: 'updated_at.desc' })).map((r) => ({ ...(r.data || {}), id: r.id, upc: r.upc, name: r.name, brand: r.brand, category: r.category, cost: r.cost, stock: r.stock, active: r.active, updatedAt: r.updated_at })));
  if (P === '/api/admin/products' && req.method === 'POST') {
    const saved = await saveManual(body); if (saved.error) return sendJson(res, 400, { ok: false, error: saved.error });
    await rebuildCatalog(); return sendJson(res, 200, { ok: true, product: saved });
  }
  if (P === '/api/admin/products/stock' && req.method === 'POST') {
    const row = await db.find('products_manual', { id: clean(body.id, 60) }); if (!row) return sendJson(res, 404, { ok: false, error: 'Producto no encontrado' });
    const stock = Math.max(0, (parseInt(row.stock, 10) || 0) + (parseInt(body.delta, 10) || 0));
    await db.update('products_manual', { id: row.id }, { stock, updated_at: new Date().toISOString() }); await rebuildCatalog();
    return sendJson(res, 200, { ok: true, id: row.id, name: row.name, stock });
  }
  if (P === '/api/admin/products' && req.method === 'DELETE') { await db.del('products_manual', { id: clean(body.id, 60) }); await rebuildCatalog(); return sendJson(res, 200, { ok: true }); }
  if (P === '/api/admin/products/import' && req.method === 'POST') {
    const CSV_MAP = { codigo: 'upc', sku: 'upc', nombre: 'name', producto: 'name', marca: 'brand', categoria: 'category', subtipo: 'type', tipo: 'type', costo: 'cost', cantidad: 'stock', peso_oz: 'weightOz', peso: 'weightOz', largo_in: 'lengthIn', largo: 'lengthIn', ancho_in: 'widthIn', ancho: 'widthIn', alto_in: 'heightIn', alto: 'heightIn', mayor_min: 'wholesaleMin', mayor_precio: 'wholesalePrice', descripcion: 'description', imagen: 'image', etiquetas: 'tags', destacado: 'featured', proveedor: 'supplier', condicion: 'condition', estado: 'condition' };
    const COND_MAP = { nuevo: 'nuevo', new: 'nuevo', usado: 'usado_casi_nuevo', 'usado casi nuevo': 'usado_casi_nuevo', usado_casi_nuevo: 'usado_casi_nuevo', 'like new': 'usado_casi_nuevo', 'caja abierta': 'caja_abierta', caja_abierta: 'caja_abierta', 'open box': 'caja_abierta' };
    const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 2000) : []).map((r) => { const o = {}; for (const [k, v] of Object.entries(r || {})) { const kk = String(k).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); o[CSV_MAP[kk] || k] = v; } if (typeof o.featured === 'string') o.featured = /^(1|si|s[ií]|yes|true)$/i.test(o.featured); if (o.condition) o.condition = COND_MAP[String(o.condition).trim().toLowerCase()] || 'nuevo'; return o; }); let n = 0; const errors = [];
    for (const r of rows) { const s = await saveManual(r); if (s.error) errors.push(`${r.name || r.upc || '?'}: ${s.error}`); else n += 1; }
    await rebuildCatalog(); return sendJson(res, 200, { ok: true, imported: n, errors });
  }

  /* ficha (categoría, envío, al mayor) por UPC — sirve para productos del proveedor */
  if (P === '/api/admin/meta' && req.method === 'POST') {
    const upc = clean(body.upc, 32); if (!upc) return sendJson(res, 400, { ok: false, error: 'Falta UPC' });
    const cur = (await db.find('product_meta', { upc })) || { data: {} }; const data = { ...(cur.data || {}) };
    for (const k of META_FIELDS) if (body[k] !== undefined) { if (body[k] === '' || body[k] === null) delete data[k]; else data[k] = body[k]; }
    await db.upsert('product_meta', [{ upc, data, updated_at: new Date().toISOString() }], 'upc');
    await rebuildCatalog(); return sendJson(res, 200, { ok: true, upc, data });
  }
  if (P === '/api/admin/meta' && req.method === 'GET') { const upc = u.searchParams.get('upc') || ''; const m = await db.find('product_meta', { upc }); return sendJson(res, 200, { ok: true, upc, data: (m && m.data) || {} }); }

  if (P === '/api/admin/upload' && req.method === 'POST') {
    const m = String(body.dataUrl || '').match(/^data:image\/(png|jpe?g|webp|svg\+xml);base64,(.+)$/);
    if (!m) return sendJson(res, 400, { ok: false, error: 'Imagen no válida (png, jpg, webp o svg)' });
    const svg = m[1] === 'svg+xml'; const ext = svg ? 'svg' : m[1] === 'jpeg' ? 'jpg' : m[1]; const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3e6) return sendJson(res, 400, { ok: false, error: 'La imagen supera 3 MB' });
    if (svg && /<script|\son[a-z]+\s*=|javascript:|<foreignObject/i.test(buf.toString('utf8'))) return sendJson(res, 400, { ok: false, error: 'Ese SVG trae código incrustado; expórtalo como SVG simple' });
    try { const url = await DB.uploadImage(uid('img') + '.' + ext, buf, svg ? 'image/svg+xml' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext)); return sendJson(res, 200, { ok: true, url }); }
    catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
  }
  if (P === '/api/admin/image-import' && req.method === 'POST') {
    try { return sendJson(res, 200, { ok: true, dataUrl: await fetchImageAsDataUrl(body.url) }); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }
  if (P === '/api/admin/image-search' && req.method === 'GET') {
    if (!hasGoogleImages()) return sendJson(res, 200, { ok: false, error: 'La búsqueda de fotos en Google no está configurada (GOOGLE_CSE_KEY y GOOGLE_CSE_CX).' });
    try { return sendJson(res, 200, { ok: true, images: await googleImages(clean(u.searchParams.get('q'), 160)) }); }
    catch (e) { return sendJson(res, 200, { ok: false, error: e.message }); }
  }

  /* eBay */
  if (P === '/api/admin/ebay/status' && req.method === 'GET') return sendJson(res, 200, { ok: true, ...(await ebay.status()), callback: SITE_URL + '/api/admin/ebay/callback' });
  if (P === '/api/admin/ebay/connect' && req.method === 'GET') {
    try { const state = crypto.randomBytes(12).toString('base64url'); ebayStates.set(state, Date.now() + 15 * 60000); res.writeHead(302, { Location: ebay.authUrl(state) }); return res.end(); }
    catch (e) { res.writeHead(302, { Location: ADMIN_PATH + '#chan:' + encodeURIComponent(e.message) }); return res.end(); }
  }
  if (P === '/api/admin/ebay/callback' && req.method === 'GET') {
    const state = u.searchParams.get('state') || ''; const code = u.searchParams.get('code') || ''; let msg = 'eBay conectado';
    try {
      if (!code) throw new Error(u.searchParams.get('error_description') || 'eBay no devolvió el permiso');
      if (!ebayStates.has(state) || ebayStates.get(state) < Date.now()) throw new Error('El enlace de conexión venció; pulsa "Conectar con eBay" otra vez');
      ebayStates.delete(state); await ebay.exchangeCode(code); await ebay.setup(true).catch(() => {});
    } catch (e) { msg = 'eBay: ' + e.message; }
    res.writeHead(302, { Location: ADMIN_PATH + '#chan:' + encodeURIComponent(msg) }); return res.end();
  }
  if (P === '/api/admin/ebay/test' && req.method === 'POST') { try { return sendJson(res, 200, { ok: true, config: await ebay.setup(true) }); } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }); } }
  if (P === '/api/admin/ebay/import' && req.method === 'POST') return sendJson(res, 200, await ebayPullOrders());
  if (P === '/api/admin/ebay/sync' && req.method === 'POST') return sendJson(res, 200, await ebayPushStock());
  if (P === '/api/admin/ebay/disconnect' && req.method === 'POST') { await ebay.disconnect(); return sendJson(res, 200, { ok: true }); }

  /* canales */
  if (P === '/api/admin/channels' && req.method === 'GET') {
    const pricing = await loadPricing(); const cat = await catalog('admin'); const state = await channels.loadChannelState();
    const summary = Object.keys(pricing.channels).filter((k) => k !== 'web').map((k) => {
      const payload = channels.buildChannelPayload(cat.products, pricing, k);
      const sample = cat.products.find((p) => p.upc && p.stock > 0);
      return { key: k, ...pricing.channels[k], enabled: pricing.channels[k].enabled !== false, publishable: payload.count,
        sample: sample ? { name: sample.name, ...channels.priceBreakdown(sample, pricing, k) } : null, lastPublish: state[k] || null,
        credsReady: k === 'web' ? true : !!(channels.adapters[k] && channels.adapters[k].hasCreds()) };
    });
    return sendJson(res, 200, { channels: summary, integrations: { square: { credsReady: square.hasCreds(), sandbox: square.SANDBOX, webhook: !!(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '').trim() }, shipstation: { credsReady: channels.shipstation.hasCreds(), autoShip: (pricing.automation || {}).shipOnPaid !== false }, email: { credsReady: !!process.env.RESEND_API_KEY } }, totalWithUpc: cat.products.filter((p) => p.upc).length });
  }
  if (P === '/api/admin/channels' && req.method === 'POST') {
    const pricing = await loadPricing(); const ch = { ...pricing.channels }; const k = String(body.key || '');
    if (!ch[k]) return sendJson(res, 400, { ok: false, error: 'Canal desconocido' });
    if (body.enabled != null) ch[k].enabled = !!body.enabled;
    for (const f of ['commission', 'gateway', 'fixed']) if (body[f] != null) ch[k][f] = Math.max(0, Number(body[f]) || 0);
    await savePricing({ channels: ch }); return sendJson(res, 200, { ok: true });
  }
  if (P === '/api/admin/channels/export' && req.method === 'GET') { const pricing = await loadPricing(); const cat = await catalog('admin'); return sendJson(res, 200, channels.buildChannelPayload(cat.products, pricing, u.searchParams.get('channel') || 'web')); }
  if (P === '/api/admin/channels/publish' && req.method === 'POST') {
    const key = String(body.channel || ''); const pricing = await loadPricing();
    if (!pricing.channels[key]) return sendJson(res, 400, { ok: false, error: 'Canal desconocido' });
    if (pricing.channels[key].enabled === false) return sendJson(res, 400, { ok: false, error: 'Ese canal está apagado' });
    const cat = await catalog('admin'); let list = cat.products;
    if (body.scope === 'own') list = list.filter((p) => p.hasOwn); else if (body.scope === 'supplier') list = list.filter((p) => p.hasApi && !p.hasOwn);
    if (body.category) list = list.filter((p) => p.category === body.category);
    const payload = channels.buildChannelPayload(list, pricing, key);
    const lim = parseInt(body.limit, 10) || 0; if (lim > 0) { payload.items = payload.items.filter((i) => i.quantity > 0 && i.images.length).slice(0, lim); payload.count = payload.items.length; }
    const result = key === 'web' ? { ok: true, mode: 'nativo', note: 'La web es tu tienda; ya está publicada.' } : channels.adapters[key] ? await channels.adapters[key].publish(payload) : { ok: false, mode: '-', note: 'Sin adaptador' };
    const rec = await channels.recordPublish(key, payload, result); return sendJson(res, 200, { ok: result.ok, result, state: rec, count: payload.count });
  }
  if (P === '/api/admin/lookup' && req.method === 'GET') {
    const upc = String(u.searchParams.get('upc') || '').replace(/[^0-9A-Za-z-]/g, ''); if (!upc) return sendJson(res, 400, { ok: false, error: 'Falta el código' });
    const cat = await catalog('admin'); const manual = await db.find('products_manual', { upc }); const found = byUpc(cat.products, upc) || null;
    let external = null;
    if (!manual && !found) external = await lookupExternal(upc).catch(() => null);
    return sendJson(res, 200, { ok: true, upc, found, manual: manual ? { ...(manual.data || {}), id: manual.id, upc: manual.upc, name: manual.name, brand: manual.brand, category: manual.category, cost: manual.cost, stock: manual.stock } : null, external, googleImages: hasGoogleImages() });
  }
  if (P === '/api/admin/inventory' && req.method === 'POST') {
    const upc = clean(body.upc, 32); if (!upc) return sendJson(res, 400, { ok: false, error: 'Falta UPC' });
    await channels.setCommitted(upc, body.committed); await rebuildCatalog();
    const cat = await catalog('admin'); const p = byUpc(cat.products, upc);
    return sendJson(res, 200, { ok: true, product: p ? { upc, stock: p.stock, stockBase: p.stockBase, committed: p.committed } : null });
  }
  if (P === '/api/admin/inventory/log' && req.method === 'GET') return sendJson(res, 200, { committed: await channels.getCommitted(), log: await channels.invLog(200) });
  if (P === '/api/admin/customers' && req.method === 'GET') return sendJson(res, 200, await db.all('profiles', { order: 'created_at.desc', limit: 500 }));
  if (P === '/api/admin/newsletter' && req.method === 'GET') return sendJson(res, 200, (await getSetting('newsletter', [])) || []);

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado');
}

async function saveManual(d) {
  const name = clean(d.name, 200); if (!name) return { error: 'El producto necesita nombre' };
  const id = d.id && String(d.id).startsWith('man_') ? String(d.id) : uid('man');
  const category = clean(d.category || d.dept, 60) || detectCategory(name + ' ' + (d.type || '') + ' ' + (d.brand || ''));
  const data = { type: clean(d.type, 120), gender: ['Damas', 'Caballeros', 'Unisex'].includes(d.gender) ? d.gender : undefined,
    condition: ['nuevo', 'usado_casi_nuevo', 'caja_abierta'].includes(d.condition) ? d.condition : 'nuevo',
    image: clean(d.image, 600), description: clean(d.description, 3000), supplier: clean(d.supplier, 80),
    weightOz: num(d.weightOz), lengthIn: num(d.lengthIn), widthIn: num(d.widthIn), heightIn: num(d.heightIn),
    wholesaleMin: parseInt(d.wholesaleMin, 10) || null, wholesalePrice: num(d.wholesalePrice), featured: !!d.featured && d.featured !== '0',
    price: num(d.price), notes: (Array.isArray(d.notes) ? d.notes : String(d.notes || '').split(',')).map((x) => String(x).trim()).filter((k) => NOTE_KEYS.includes(k)),
    tags: (Array.isArray(d.tags) ? d.tags.join(',') : String(d.tags || '')).split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 12) };
  const row = { id, upc: String(d.upc || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 32), name, brand: clean(d.brand, 120) || '—', category,
    cost: Math.max(0, Number(d.cost) || 0), stock: Math.max(0, parseInt(d.stock, 10) || 0), active: d.active !== false, data, updated_at: new Date().toISOString() };
  const existing = await db.find('products_manual', { id });
  if (existing) await db.update('products_manual', { id }, row); else await db.insert('products_manual', { ...row, created_at: new Date().toISOString() });
  return { ...data, ...row };
}

/* ══════════ Servidor ══════════ */
const server = http.createServer(async (req, res) => {
  let u; try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch (_) { res.writeHead(400); return res.end(); }
  const adminApi = u.pathname.startsWith('/api/admin/'); const adminPage = u.pathname === ADMIN_PATH; const adminJs = u.pathname === ADMIN_PATH + '/admin.js';
  secHeaders(req, res, adminApi || adminPage || adminJs);
  try {
    if (!['GET', 'POST', 'PUT', 'DELETE', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    /* fuera de la lista de IP permitidas, el panel sencillamente no existe */
    if ((adminApi || adminPage || adminJs) && !adminIpOk(req)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    if (u.pathname.startsWith('/api/') && !adminApi && !rateLimit(req, 'api', 600, 60000)) return sendJson(res, 429, { ok: false, error: 'Demasiadas peticiones, espera un momento' });
    if (adminApi || adminPage || adminJs) await adminRouter(req, res, u);
    else await publicRouter(req, res, u);
  } catch (e) {
    const ref = crypto.randomBytes(4).toString('hex'); console.error(`[servidor ${ref}]`, e);
    /* en producción no se devuelven detalles internos, solo una referencia para buscar en el registro */
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: IS_PROD ? `Error interno (ref. ${ref}). Inténtalo de nuevo.` : 'Error interno: ' + e.message });
  }
});
server.requestTimeout = 30000; server.headersTimeout = 15000; server.keepAliveTimeout = 65000; server.maxHeadersCount = 80;
server.listen(PORT, async () => {
  await ebay.init(); await rebuildCatalog(); refreshApi();
  console.log('\n  ────────────────────────────────────────────────');
  console.log(`   Tienda:      ${SITE_URL}`);
  console.log(`   Panel:       ${SITE_URL}${ADMIN_PATH}`);
  if (adminPwGenerated) console.log(`   Contraseña admin (generada): ${ADMIN_PASSWORD}  → fíjala con ADMIN_PASSWORD`);
  console.log(`   Datos:       ${DB.LOCAL ? 'LOCAL (data/local-db.json) — define SUPABASE_URL para producción' : 'Supabase ✓'}`);
  console.log(`   Proveedor:   ${KEY && SECRET ? 'credenciales cargadas ✓' : 'SIN credenciales (solo productos propios)'}`);
  console.log(`   Correos:     ${process.env.RESEND_API_KEY ? 'Resend ✓' : 'apagados (falta RESEND_API_KEY)'}`);
  console.log(`   ShipStation: ${channels.shipstation.hasCreds() ? 'llaves cargadas ✓' : 'simulación (faltan SHIPSTATION_KEY / SHIPSTATION_SECRET)'}`);
  console.log(`   Square:      ${square.hasCreds() ? (square.SANDBOX ? 'modo de prueba (sandbox) ✓' : 'cobros reales ✓') : 'sin llaves: los pedidos quedan pendientes de pago'}`);
  console.log(`   eBay:        ${ebay.hasCreds() ? 'conectado ✓' : ebay.hasApp() ? 'llaves cargadas; falta pulsar "Conectar con eBay" en el panel' : 'sin llaves'}`);
  console.log('  ────────────────────────────────────────────────');
  const warn = [];
  if (IS_PROD && !process.env.SESSION_SECRET) warn.push('Falta SESSION_SECRET: las sesiones del panel se cierran en cada reinicio.');
  if (!ADMIN_HASH_OK) warn.push('ADMIN_PASSWORD_HASH tiene un formato inválido y se está ignorando: debe ser scrypt:<salt>:<hash> tal como lo imprime «npm run hash-password». Pega SOLO el valor.');
  if (!ADMIN_HASH && ADMIN_PASSWORD.length < 14) warn.push('La contraseña del panel tiene menos de 14 caracteres.');
  if (IS_PROD && ADMIN_PATH === '/admin') warn.push('El panel está en /admin; define ADMIN_PATH con una ruta que solo tú conozcas.');
  if (IS_PROD && !(process.env.CHANNEL_WEBHOOK_SECRET || '').trim()) warn.push('Falta CHANNEL_WEBHOOK_SECRET: los avisos de ShipStation no se aceptan.');
  if (square.hasCreds() && !(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '').trim()) warn.push('Falta SQUARE_WEBHOOK_SIGNATURE_KEY: reembolsos y disputas hechos en Square no llegarán al panel.');
  twoFa().then((fa) => { if (!fa.enabled) warn.push('La verificación en 2 pasos del panel está apagada (Ajustes → Seguridad).'); for (const w of warn) console.log('   ⚠ ' + w); if (warn.length) console.log(''); });
});
