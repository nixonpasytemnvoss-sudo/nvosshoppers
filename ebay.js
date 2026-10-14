'use strict';
/*
 * eBay — publicación real con la Sell Inventory API, lectura de ventas y guía de envío.
 *
 * Qué hace:
 *  1. Conexión OAuth (botón "Conectar con eBay" del panel). El permiso se guarda en la
 *     base de datos; dura 18 meses y se renueva solo en cada uso.
 *  2. Publicar: por cada producto crea la ficha (título, fotos, descripción, UPC, peso),
 *     la oferta (precio del canal, cantidad, políticas) y la pone en venta.
 *  3. Sincronizar: cuando cambia el stock o el precio, actualiza los anuncios ya publicados.
 *  4. Ventas: lee los pedidos pagados de eBay y los entrega al servidor, que descuenta
 *     primero el inventario propio y los pasa a ShipStation.
 *  5. Guía: cuando el pedido se marca "enviado", sube el número de rastreo a eBay.
 *
 * Variables: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME (obligatorias)
 *            EBAY_ENV=sandbox para probar · EBAY_MARKETPLACE_ID (EBAY_US)
 *            EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID,
 *            EBAY_LOCATION_KEY, EBAY_SHIP_FROM_ZIP, EBAY_CATEGORY_WOMEN|MEN|UNISEX (opcionales)
 */
const { getSetting, setSetting } = require('./db');

const env = (k) => (process.env[k] || '').trim();
const SANDBOX = env('EBAY_ENV').toLowerCase() === 'sandbox';
const API = (env('EBAY_API_BASE') || (SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com')).replace(/\/+$/, '');
const AUTH = (env('EBAY_AUTH_BASE') || (SANDBOX ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com')).replace(/\/+$/, '');
const MARKET = env('EBAY_MARKETPLACE_ID') || 'EBAY_US';
const LOCALE = env('EBAY_LOCALE') || 'en-US';
const SCOPES = ['https://api.ebay.com/oauth/api_scope', 'https://api.ebay.com/oauth/api_scope/sell.inventory', 'https://api.ebay.com/oauth/api_scope/sell.account', 'https://api.ebay.com/oauth/api_scope/sell.fulfillment'].join(' ');
const isHttps = (u) => /^https:\/\//i.test(String(u || ''));
const round2 = (n) => Math.round(n * 100) / 100;

/* ── Estado guardado (permiso, anuncios, pedidos ya leídos) ── */
let st = null;
async function load() { if (!st) { const s = (await getSetting('ebay', {})) || {}; st = { listings: {}, imported: [], categories: {}, ...s }; } return st; }
async function save() { await setSetting('ebay', st); }
const init = () => load().catch(() => {});
const hasApp = () => !!(env('EBAY_CLIENT_ID') && env('EBAY_CLIENT_SECRET'));
const hasCreds = () => hasApp() && !!(env('EBAY_REFRESH_TOKEN') || (st && st.refreshToken));

/* ── OAuth ── */
let tok = { value: '', exp: 0 };
const basic = () => 'Basic ' + Buffer.from(`${env('EBAY_CLIENT_ID')}:${env('EBAY_CLIENT_SECRET')}`).toString('base64');
async function tokenRequest(params) {
  const r = await fetch(API + '/identity/v1/oauth2/token', { method: 'POST', headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`eBay no dio acceso (${r.status}): ${j.error_description || j.error || 'revisa EBAY_CLIENT_ID / EBAY_CLIENT_SECRET'}`);
  return j;
}
function authUrl(state) {
  if (!hasApp() || !env('EBAY_RUNAME')) throw new Error('Faltan EBAY_CLIENT_ID, EBAY_CLIENT_SECRET o EBAY_RUNAME en el servidor');
  const q = new URLSearchParams({ client_id: env('EBAY_CLIENT_ID'), redirect_uri: env('EBAY_RUNAME'), response_type: 'code', scope: SCOPES, state });
  return `${AUTH}/oauth2/authorize?${q.toString()}`;
}
async function exchangeCode(code) {
  const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: env('EBAY_RUNAME') });
  await load();
  st.refreshToken = j.refresh_token; st.refreshExp = new Date(Date.now() + (Number(j.refresh_token_expires_in) || 47304000) * 1000).toISOString(); st.connectedAt = new Date().toISOString(); st.config = null;
  tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 7200) * 1000 };
  await save(); return true;
}
async function disconnect() { await load(); delete st.refreshToken; delete st.refreshExp; st.config = null; tok = { value: '', exp: 0 }; await save(); }
async function accessToken() {
  if (tok.value && tok.exp > Date.now() + 60000) return tok.value;
  await load(); const rt = env('EBAY_REFRESH_TOKEN') || st.refreshToken;
  if (!rt) throw new Error('eBay no está conectado: entra en Canales y pulsa "Conectar con eBay"');
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt, scope: SCOPES });
  tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 7200) * 1000 };
  return tok.value;
}
async function call(method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Language': LOCALE, 'Accept-Language': LOCALE, 'X-EBAY-C-MARKETPLACE-ID': MARKET }, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) {}
  return { ok: r.ok, status: r.status, json };
}
function errText(r) {
  const e = r.json && (r.json.errors || r.json.warnings);
  if (Array.isArray(e) && e.length) return e.map((x) => (x.longMessage || x.message || 'error') + (Array.isArray(x.parameters) && x.parameters.length ? ' [' + x.parameters.map((p) => p.value).join(', ') + ']' : '')).join(' · ').slice(0, 420);
  return `eBay respondió HTTP ${r.status}`;
}

/* ── Configuración de la cuenta: políticas y almacén ── */
async function setup(force) {
  await load();
  if (st.config && !force && !(st.config.missing || []).length) return st.config;
  const cfg = { fulfillmentPolicyId: env('EBAY_FULFILLMENT_POLICY_ID'), paymentPolicyId: env('EBAY_PAYMENT_POLICY_ID'), returnPolicyId: env('EBAY_RETURN_POLICY_ID'), merchantLocationKey: env('EBAY_LOCATION_KEY'), found: {}, missing: [], errors: [] };
  const pick = async (kind, listKey, idKey, cfgKey, label) => {
    const r = await call('GET', `/sell/account/v1/${kind}?marketplace_id=${MARKET}`);
    if (!r.ok) cfg.errors.push(`${label}: ${errText(r)}`);
    const list = (r.json && r.json[listKey]) || [];
    cfg.found[cfgKey] = list.map((p) => ({ id: p[idKey], name: p.name || '' }));
    if (!cfg[cfgKey] && list.length) cfg[cfgKey] = list[0][idKey];
    if (!cfg[cfgKey]) cfg.missing.push(`${label} (créala en eBay → Account → Business policies)`);
  };
  await pick('fulfillment_policy', 'fulfillmentPolicies', 'fulfillmentPolicyId', 'fulfillmentPolicyId', 'política de envío');
  await pick('payment_policy', 'paymentPolicies', 'paymentPolicyId', 'paymentPolicyId', 'política de pago');
  await pick('return_policy', 'returnPolicies', 'returnPolicyId', 'returnPolicyId', 'política de devoluciones');
  const lr = await call('GET', '/sell/inventory/v1/location?limit=50');
  const locs = (lr.json && lr.json.locations) || [];
  cfg.found.merchantLocationKey = locs.map((l) => ({ id: l.merchantLocationKey, name: l.name || '' }));
  if (!cfg.merchantLocationKey && locs.length) cfg.merchantLocationKey = (locs.find((l) => l.merchantLocationStatus === 'ENABLED') || locs[0]).merchantLocationKey;
  if (!cfg.merchantLocationKey && env('EBAY_SHIP_FROM_ZIP')) {
    const key = 'nvos-principal';
    const address = { postalCode: env('EBAY_SHIP_FROM_ZIP'), country: env('EBAY_SHIP_FROM_COUNTRY') || 'US' };
    if (env('EBAY_SHIP_FROM_CITY')) address.city = env('EBAY_SHIP_FROM_CITY');
    if (env('EBAY_SHIP_FROM_STATE')) address.stateOrProvince = env('EBAY_SHIP_FROM_STATE');
    const cr = await call('POST', `/sell/inventory/v1/location/${key}`, { location: { address }, locationTypes: ['WAREHOUSE'], name: 'Depósito principal', merchantLocationStatus: 'ENABLED' });
    if (cr.ok) cfg.merchantLocationKey = key; else cfg.errors.push('almacén: ' + errText(cr));
  }
  if (!cfg.merchantLocationKey) cfg.missing.push('almacén de salida (pon EBAY_SHIP_FROM_ZIP con el código postal desde donde despachas)');
  st.config = cfg; await save(); return cfg;
}

/* ── Categoría de eBay ── */
const CAT_QUERY = { 'perf:WOMEN': "women's fragrance perfume spray", 'perf:MEN': "men's fragrance cologne spray", 'perf:UNISEX': 'unisex fragrance perfume spray', 'cat:Chocolates': 'chocolate candy bar', 'cat:Enlatados': 'canned food pantry', 'cat:Refrigerados': 'cheese gourmet food' };
const pending = new Map();
async function categoryFor(item) {
  const perf = item.category === 'Perfumería';
  const g = item.gender === 'Damas' ? 'WOMEN' : item.gender === 'Caballeros' ? 'MEN' : 'UNISEX';
  if (perf && (env('EBAY_CATEGORY_' + g) || env('EBAY_CATEGORY_ID'))) return env('EBAY_CATEGORY_' + g) || env('EBAY_CATEGORY_ID');
  if (!perf && env('EBAY_CATEGORY_ID_OTHER')) return env('EBAY_CATEGORY_ID_OTHER');
  const key = perf ? 'perf:' + g : 'cat:' + item.category;
  const known = CAT_QUERY[key]; const cacheKey = known ? key : 'q:' + String(item.title).toLowerCase().slice(0, 60);
  if (st.categories[cacheKey]) return st.categories[cacheKey];
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const p = (async () => {
    if (!st.treeId) { const t = await call('GET', `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKET}`); st.treeId = (t.json && t.json.categoryTreeId) || '0'; }
    const r = await call('GET', `/commerce/taxonomy/v1/category_tree/${st.treeId}/get_category_suggestions?q=${encodeURIComponent(known || item.title)}`);
    const id = r.json && r.json.categorySuggestions && r.json.categorySuggestions[0] && r.json.categorySuggestions[0].category.categoryId;
    if (!id) throw new Error('eBay no sugirió categoría para "' + String(item.title).slice(0, 40) + '"');
    if (known) st.categories[cacheKey] = id;
    return id;
  })();
  pending.set(cacheKey, p);
  try { return await p; } finally { pending.delete(cacheKey); }
}

/* ── Texto del anuncio ── */
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-&.'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
function perfumeParts(item) {
  const t = ((item.subcategory || '') + ' ' + (item.title || '')).toLowerCase();
  const type = /extrait|pure parfum|parfum extract/.test(t) ? 'Extrait de Parfum' : /eau de parfum|\bedp\b/.test(t) ? 'Eau de Parfum' : /eau de toilette|\bedt\b/.test(t) ? 'Eau de Toilette' : /cologne|\bedc\b/.test(t) ? 'Eau de Cologne' : /body (mist|spray)/.test(t) ? 'Body Spray' : '';
  const name0 = String(item.title || '');
  let volume = '';
  const mu = name0.match(/(\d+(?:[.,]\d+)?)\s*(ml|fl\.?\s*oz|oz)\b/i);
  if (mu) volume = `${mu[1].replace(',', '.')} ${/ml/i.test(mu[2]) ? 'ml' : 'oz'}`;
  else { const md = name0.match(/\b(\d{1,2}[.,]\d{1,2})\b/); if (md && parseFloat(md[1].replace(',', '.')) <= 12) volume = `${md[1].replace(',', '.')} oz`; }
  const name = name0
    .replace(/(\d+(?:[.,]\d+)?)\s*(ml|fl\.?\s*oz|oz)\b/ig, ' ').replace(/\b\d{1,2}[.,]\d{1,2}\b/g, ' ')
    .replace(/\b(edt|edp|edc|eau de toilette|eau de parfum|eau de cologne|extrait de parfum|spray|sp|tester)\b/ig, ' ')
    .replace(/\b(for )?(men|man|women|woman|unisex|ladies|homme|femme|pour)\b/ig, ' ').replace(/\(\s*[mwlf]\s*\)/ig, ' ')
    .replace(/[+]\s*$/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return { type, volume, name };
}
function listingTitle(item) {
  const brand = item.brand && item.brand !== '—' ? titleCase(item.brand) : '';
  let title;
  if (item.category === 'Perfumería') {
    const p = perfumeParts(item); const who = item.gender === 'Damas' ? 'for Women' : item.gender === 'Caballeros' ? 'for Men' : 'Unisex';
    const core = titleCase(p.name || item.title); const hasBrand = brand && core.toLowerCase().includes(brand.toLowerCase());
    title = [hasBrand ? '' : brand, core, p.type, p.volume, who].filter(Boolean).join(' ');
  } else {
    const core = String(item.title || ''); title = brand && !core.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${core}` : core;
  }
  title = title.replace(/\s{2,}/g, ' ').trim();
  if (title.length > 80) { title = title.slice(0, 80); const i = title.lastIndexOf(' '); if (i > 50) title = title.slice(0, i); }
  return title;
}
const escH = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
function listingHtml(item, title, aspects) {
  const d = plain(item.description);
  const rows = Object.entries(aspects).map(([k, v]) => `<li><b>${escH(k)}:</b> ${escH(v.join(', '))}</li>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1b1b1b;max-width:760px"><h2 style="font-size:20px;margin:0 0 10px">${escH(title)}</h2>${d ? `<p>${escH(d)}</p>` : ''}<ul>${rows}${item.upc ? `<li><b>UPC:</b> ${escH(item.upc)}</li>` : ''}</ul><p>Brand new and 100% authentic. Carefully packed and shipped with tracking.</p></div>`;
}
function buildListing(item) {
  const title = listingTitle(item);
  const aspects = {};
  if (item.brand && item.brand !== '—') aspects.Brand = [titleCase(item.brand)];
  if (item.category === 'Perfumería') {
    const p = perfumeParts(item);
    if (p.name) aspects['Fragrance Name'] = [titleCase(p.name).slice(0, 65)];
    if (p.type) aspects.Type = [p.type];
    if (p.volume) aspects.Volume = [p.volume];
    if (/spray|\bsp\b|\bed[tpc]\b|eau de/i.test(item.title + ' ' + (item.subcategory || ''))) aspects.Formulation = ['Spray'];
  }
  const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
  const product = { title, description: (plain(item.description) || title).slice(0, 4000), aspects, imageUrls: (item.images || []).filter(isHttps).slice(0, 12) };
  if (aspects.Brand) product.brand = aspects.Brand[0];
  if (/^\d{12,14}$/.test(String(item.upc || ''))) product.upc = [String(item.upc)];
  const inventoryItem = { availability: { shipToLocationAvailability: { quantity: qty } }, condition: item.conditionName || 'NEW', product };
  if (item.weightOz) {
    inventoryItem.packageWeightAndSize = { weight: { value: Number(item.weightOz), unit: 'OUNCE' } };
    const dm = item.dimensionsIn; if (dm && dm.length && dm.width && dm.height) inventoryItem.packageWeightAndSize.dimensions = { length: dm.length, width: dm.width, height: dm.height, unit: 'INCH' };
  }
  return { title, aspects, qty, inventoryItem, html: listingHtml(item, title, aspects) };
}

/* ── Publicar un producto ── */
async function publishOne(item, cfg, currency) {
  const sku = String(item.sku); const L = buildListing(item); const price = round2(Number(item.price) || 0);
  let r = await call('PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, L.inventoryItem);
  if (!r.ok) throw new Error('Ficha: ' + errText(r));
  const details = { availableQuantity: L.qty, categoryId: String(await categoryFor(item)), listingDescription: L.html,
    listingPolicies: { fulfillmentPolicyId: cfg.fulfillmentPolicyId, paymentPolicyId: cfg.paymentPolicyId, returnPolicyId: cfg.returnPolicyId },
    merchantLocationKey: cfg.merchantLocationKey, pricingSummary: { price: { value: price.toFixed(2), currency } } };
  r = await call('GET', `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${MARKET}`);
  const offer = r.ok && r.json && Array.isArray(r.json.offers) ? r.json.offers[0] : null;
  let offerId = offer && offer.offerId;
  if (offerId) { r = await call('PUT', `/sell/inventory/v1/offer/${offerId}`, details); if (!r.ok) throw new Error('Oferta: ' + errText(r)); }
  else { r = await call('POST', '/sell/inventory/v1/offer', { sku, marketplaceId: MARKET, format: 'FIXED_PRICE', ...details }); if (!r.ok || !r.json || !r.json.offerId) throw new Error('Oferta: ' + errText(r)); offerId = r.json.offerId; }
  let listingId = offer && offer.listing && offer.listing.listingId;
  if (!(offer && offer.status === 'PUBLISHED')) {
    r = await call('POST', `/sell/inventory/v1/offer/${offerId}/publish`);
    if (!r.ok) throw new Error('Publicar: ' + errText(r));
    listingId = (r.json && r.json.listingId) || listingId;
  }
  st.listings[sku] = { offerId, listingId: listingId || '', qty: L.qty, price, title: L.title, at: new Date().toISOString() };
  return st.listings[sku];
}

/* ── Publicación en segundo plano ── */
let job = { running: false, total: 0, done: 0, ok: 0, failed: 0, skipped: 0, errors: [] };
async function publish(payload) {
  await load();
  if (!hasCreds()) return { ok: false, mode: 'sin conexión', note: 'eBay todavía no está conectado. Pon las llaves en el servidor y pulsa "Conectar con eBay".' };
  if (job.running) return { ok: false, mode: 'en vivo', note: `Ya hay una publicación en curso (${job.done} de ${job.total}).` };
  let cfg; try { cfg = await setup(false); } catch (e) { return { ok: false, mode: 'en vivo', note: e.message }; }
  if ((cfg.missing || []).length) return { ok: false, mode: 'en vivo', note: 'Falta configurar en eBay: ' + cfg.missing.join('; ') };
  const all = payload.items || [];
  const items = all.filter((i) => i.quantity > 0 && (i.images || []).some(isHttps) && Number(i.price) > 0);
  const noPhoto = all.filter((i) => i.quantity > 0 && !(i.images || []).some(isHttps)).length;
  const noStock = all.filter((i) => !(i.quantity > 0)).length;
  job = { running: true, total: items.length, done: 0, ok: 0, failed: 0, skipped: all.length - items.length, noPhoto, noStock, errors: [], startedAt: new Date().toISOString(), finishedAt: null };
  if (!items.length) { job.running = false; job.finishedAt = new Date().toISOString(); return { ok: false, mode: 'en vivo', note: `Nada que publicar: ${noStock} sin stock y ${noPhoto} sin foto.` }; }
  const queue = items.slice(); const currency = payload.currency || 'USD';
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try { await publishOne(it, cfg, currency); job.ok += 1; }
      catch (e) { job.failed += 1; if (job.errors.length < 200) job.errors.push({ sku: it.sku, title: String(it.title).slice(0, 80), error: e.message }); }
      job.done += 1; if (job.done % 25 === 0) await save().catch(() => {});
    }
  };
  Promise.all([worker(), worker(), worker()]).catch((e) => console.error('[eBay] publicación:', e.message)).finally(async () => {
    job.running = false; job.finishedAt = new Date().toISOString();
    st.lastJob = { ...job, errors: job.errors.slice(0, 200) }; await save().catch(() => {});
    console.log(`[eBay] publicación terminada: ${job.ok} publicados, ${job.failed} con error`);
  });
  return { ok: true, mode: 'en vivo', note: `Publicando ${items.length} productos en eBay en segundo plano${job.skipped ? ` (${noStock} sin stock y ${noPhoto} sin foto quedaron fuera)` : ''}. El avance se ve en esta misma tarjeta.` };
}

/* ── Stock y precio de lo ya publicado ── */
async function syncStock(payload) {
  await load();
  if (!hasCreds() || job.running) return { ok: false, updated: 0, note: job.running ? 'Hay una publicación en curso' : 'eBay no está conectado' };
  const bySku = new Map((payload.items || []).map((i) => [String(i.sku), i])); const currency = payload.currency || 'USD';
  const changes = [];
  for (const [sku, l] of Object.entries(st.listings)) {
    if (!l.offerId) continue;
    const it = bySku.get(sku); const qty = it ? Math.max(0, parseInt(it.quantity, 10) || 0) : 0; const price = it ? round2(Number(it.price) || l.price) : l.price;
    if (qty !== l.qty || price !== l.price) changes.push({ sku, qty, price, offerId: l.offerId });
  }
  let updated = 0; const errors = [];
  for (let i = 0; i < changes.length; i += 25) {
    const chunk = changes.slice(i, i + 25);
    const r = await call('POST', '/sell/inventory/v1/bulk_update_price_quantity', { requests: chunk.map((c) => ({ sku: c.sku, shipToLocationAvailability: { quantity: c.qty }, offers: [{ offerId: c.offerId, availableQuantity: c.qty, price: { value: c.price.toFixed(2), currency } }] })) });
    const resp = (r.json && r.json.responses) || [];
    for (const c of chunk) {
      const rr = resp.find((x) => x.sku === c.sku);
      const good = rr ? (rr.statusCode >= 200 && rr.statusCode < 300) : r.ok;
      if (good) { st.listings[c.sku].qty = c.qty; st.listings[c.sku].price = c.price; updated += 1; }
      else errors.push({ sku: c.sku, error: rr && rr.errors ? errText({ json: { errors: rr.errors }, status: rr.statusCode }) : errText(r) });
    }
  }
  st.lastSync = { at: new Date().toISOString(), updated, failed: errors.length, errors: errors.slice(0, 30) };
  if (changes.length) await save();
  return { ok: true, updated, failed: errors.length, errors };
}

/* ── Ventas ── */
async function fetchNewOrders() {
  await load();
  const since = new Date(Date.now() - 4 * 864e5).toISOString();
  const r = await call('GET', `/sell/fulfillment/v1/order?filter=${encodeURIComponent(`creationdate:[${since}..]`)}&limit=100`);
  if (!r.ok) throw new Error(errText(r));
  const out = [];
  for (const o of (r.json && r.json.orders) || []) {
    if (st.imported.includes(o.orderId)) continue;
    if (o.orderPaymentStatus && o.orderPaymentStatus !== 'PAID') continue;
    if (o.cancelStatus && o.cancelStatus.cancelState === 'CANCELED') continue;
    const ship = (((o.fulfillmentStartInstructions || [])[0] || {}).shippingStep || {}).shipTo || {}; const a = ship.contactAddress || {};
    const ps = o.pricingSummary || {};
    out.push({ externalId: o.orderId, total: Number((ps.total || {}).value) || 0, shipping: Number((ps.deliveryCost || {}).value) || 0,
      buyer: { name: ship.fullName || (o.buyer && o.buyer.username) || 'Cliente eBay', email: ship.email || '', phone: (ship.primaryPhone && ship.primaryPhone.phoneNumber) || '', address: [a.addressLine1, a.addressLine2].filter(Boolean).join(', '), city: a.city || '', state: a.stateOrProvince || '', zip: a.postalCode || '', country: a.countryCode || 'US' },
      items: (o.lineItems || []).map((li) => { const q = Math.max(1, parseInt(li.quantity, 10) || 1); return { sku: li.sku || '', qty: q, name: li.title || '', price: round2((Number((li.lineItemCost || {}).value) || 0) / q), lineItemId: li.lineItemId }; }) });
  }
  st.lastImport = { at: new Date().toISOString(), found: out.length };
  return out;
}
async function markImported(orderId) { await load(); if (!st.imported.includes(orderId)) st.imported.push(orderId); st.imported = st.imported.slice(-4000); await save(); }
async function markShipped(order) {
  const f = order.fulfillment || {}; if (!order.externalId || !f.tracking) return { ok: false, note: 'Falta el pedido de eBay o la guía' };
  const body = { shippedDate: new Date().toISOString(), shippingCarrierCode: f.carrier || 'USPS', trackingNumber: String(f.tracking).replace(/[^A-Za-z0-9]/g, '') };
  const lines = (order.items || []).filter((i) => i.lineItemId).map((i) => ({ lineItemId: i.lineItemId, quantity: i.qty }));
  if (lines.length) body.lineItems = lines;
  const r = await call('POST', `/sell/fulfillment/v1/order/${encodeURIComponent(order.externalId)}/shipping_fulfillment`, body);
  return r.ok ? { ok: true } : { ok: false, note: errText(r) };
}

async function status() {
  await load();
  return { appReady: hasApp(), runame: !!env('EBAY_RUNAME'), connected: hasCreds(), sandbox: SANDBOX, marketplace: MARKET, connectedAt: st.connectedAt || null, refreshExp: st.refreshExp || null,
    config: st.config || null, job: job.startedAt ? job : (st.lastJob || job), listings: Object.keys(st.listings).length, lastImport: st.lastImport || null, lastSync: st.lastSync || null };
}

module.exports = { init, hasApp, hasCreds, authUrl, exchangeCode, disconnect, setup, publish, syncStock, fetchNewOrders, markImported, markShipped, status, buildListing, listingTitle, perfumeParts };
