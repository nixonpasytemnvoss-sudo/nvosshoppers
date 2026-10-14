'use strict';
/*
 * Canales de venta + inventario común.
 * - Ledger de inventario en la base de datos (inventory_ledger / inventory_log).
 * - Precios por canal que absorben la comisión (eBay 15 %).
 * - Precio al mayor por producto; en eBay se infla con la comisión.
 * - ShipStation: creación real de la orden con peso y medidas de cada artículo.
 */
const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');
const ebay = require('./ebay');

const round2 = (n) => Math.round(n * 100) / 100;
const env = (k) => (process.env[k] || '').trim();

/* ── Ledger de inventario ─────────────────────────────── */
let ledgerCache = null;
/* Devuelve { upc: { qty, own } }: total comprometido y cuánto de eso salió del inventario propio. */
async function getCommitted() {
  if (ledgerCache) return ledgerCache;
  const rows = await db.all('inventory_ledger');
  ledgerCache = {};
  for (const r of rows) if (r.committed > 0 || r.committed_own > 0) ledgerCache[r.upc] = { qty: r.committed || 0, own: r.committed_own || 0 };
  return ledgerCache;
}
async function commitSale(items, channel, externalId, extra = {}) {
  const committed = await getCommitted();
  const rows = [], logs = [];
  for (const it of items || []) {
    const upc = String(it.upc || '').trim(); const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    if (!upc) continue;
    const own = Math.max(0, Math.min(qty, parseInt(it.ownQty, 10) || 0));
    const c = committed[upc] || { qty: 0, own: 0 };
    c.qty += qty; c.own += own; committed[upc] = c;
    rows.push({ upc, committed: c.qty, committed_own: c.own, updated_at: new Date().toISOString() });
    logs.push({ at: new Date().toISOString(), channel, external_id: String(externalId || ''), upc, qty, kind: 'sale', extra: { ...extra, own } });
  }
  if (rows.length) { await db.upsert('inventory_ledger', rows, 'upc'); for (const l of logs) await db.insert('inventory_log', l); }
  return rows;
}
async function releaseSale(items, channel, externalId) {
  const committed = await getCommitted();
  const rows = [];
  for (const it of items || []) {
    const upc = String(it.upc || '').trim(); const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    if (!upc || !committed[upc]) continue;
    const own = Math.max(0, Math.min(qty, parseInt(it.ownQty, 10) || 0));
    const c = committed[upc];
    c.qty = Math.max(0, c.qty - qty); c.own = Math.max(0, c.own - own);
    rows.push({ upc, committed: c.qty, committed_own: c.own, updated_at: new Date().toISOString() });
    await db.insert('inventory_log', { at: new Date().toISOString(), channel, external_id: String(externalId || ''), upc, qty: -qty, kind: 'release', extra: { own: -own } });
    if (!c.qty && !c.own) delete committed[upc];
  }
  if (rows.length) await db.upsert('inventory_ledger', rows, 'upc');
}
async function setCommitted(upc, units, ownUnits) {
  const committed = await getCommitted();
  upc = String(upc || '').trim(); units = Math.max(0, parseInt(units, 10) || 0);
  if (!upc) return;
  const own = ownUnits != null ? Math.max(0, Math.min(units, parseInt(ownUnits, 10) || 0)) : Math.min(units, (committed[upc] || {}).own || 0);
  if (units || own) committed[upc] = { qty: units, own }; else delete committed[upc];
  await db.upsert('inventory_ledger', [{ upc, committed: units, committed_own: own, updated_at: new Date().toISOString() }], 'upc');
  await db.insert('inventory_log', { at: new Date().toISOString(), channel: 'ajuste', external_id: '', upc, qty: units, kind: 'set', extra: { own } });
}
async function invLog(limit = 200) { return db.all('inventory_log', { order: 'at.desc', limit }); }

/* ── Precios ──────────────────────────────────────────── */
function marginFor(product, pricing) {
  const ov = (pricing.overrides || {})[product.upc] || {};
  if (ov.margin != null) return Number(ov.margin);
  if ((pricing.categoryMargins || {})[product.category] != null) return Number(pricing.categoryMargins[product.category]);
  return Number(pricing.globalMargin) || 0;
}
function applyRounding(n, mode) { if (mode === 'ends99') return Math.max(0, Math.floor(n) + 0.99); return round2(n); }
function computeSell(product, pricing) {
  /* precio de venta fijado a mano en "Mi inventario": gana sobre el margen */
  if (Number(product.fixedPrice) > 0) return round2(Number(product.fixedPrice));
  const cost = Number(product.cost != null ? product.cost : product.price) || 0;
  return applyRounding(cost * (1 + marginFor(product, pricing) / 100), pricing.rounding);
}
function channelPrice(base, ch, rounding) {
  const take = ((Number(ch.commission) || 0) + (Number(ch.gateway) || 0)) / 100;
  const fixed = Number(ch.fixed) || 0;
  const price = take >= 0.95 ? base + fixed : (base + fixed) / (1 - take);
  return applyRounding(price, rounding);
}
function priceBreakdown(product, pricing, channelKey) {
  const ch = (pricing.channels || {})[channelKey] || { commission: 0, gateway: 0, fixed: 0 };
  const base = computeSell(product, pricing);
  const cost = Number(product.cost != null ? product.cost : product.price) || 0;
  const price = channelKey === 'web' ? base : channelPrice(base, ch, pricing.rounding);
  const fees = price * ((Number(ch.commission) || 0) + (Number(ch.gateway) || 0)) / 100 + (Number(ch.fixed) || 0);
  return { cost: round2(cost), webPrice: round2(base), price: round2(price), fees: round2(fees), net: round2(price - fees), profit: round2(price - fees - cost) };
}

/* ── Paquete para publicar en un canal ───────────────── */
/* Condición → códigos de condición de eBay (conditionId / conditionName) */
const EBAY_CONDITION = {
  nuevo: { id: 1000, name: 'NEW' },
  caja_abierta: { id: 1500, name: 'NEW_OTHER' },
  usado_casi_nuevo: { id: 2750, name: 'LIKE_NEW' },
};
function buildChannelPayload(products, pricing, channelKey) {
  const ch = (pricing.channels || {})[channelKey] || {};
  const currency = (pricing.store && pricing.store.currency) || 'USD';
  const items = [];
  for (const p of products) {
    if (!p.upc) continue;
    /* La web propia solo lista lo visible (Perfumería o lo marcado); el resto vive como inventario para marketplaces. */
    if (channelKey === 'web' && p.webVisible === false) continue;
    const base = computeSell(p, pricing);
    const price = channelKey === 'web' ? base : channelPrice(base, ch, pricing.rounding);
    const cond = String(p.condition || 'nuevo');
    const item = {
      sku: p.upc, upc: p.upc, title: p.name, brand: p.brand, category: p.category, subcategory: p.type, gender: p.gender || '', notes: p.notes || [],
      condition: cond, conditionId: (EBAY_CONDITION[cond] || EBAY_CONDITION.nuevo).id, conditionName: (EBAY_CONDITION[cond] || EBAY_CONDITION.nuevo).name,
      price, currency, quantity: p.stock, images: p.image ? [p.image] : [], description: p.description || '',
      weightOz: p.weightOz || null, dimensionsIn: p.lengthIn ? { length: p.lengthIn, width: p.widthIn, height: p.heightIn } : null,
    };
    if (p.wholesaleMin && p.wholesalePrice) {
      item.wholesale = { minQty: p.wholesaleMin, price: channelKey === 'web' ? round2(p.wholesalePrice) : channelPrice(p.wholesalePrice, ch, pricing.rounding) };
    }
    items.push(item);
  }
  return { channel: channelKey, currency, count: items.length, items };
}

/* ── Estado de publicación por canal ─────────────────── */
async function loadChannelState() { return (await getSetting('channel_state', {})) || {}; }
async function recordPublish(channelKey, payload, result) {
  const st = await loadChannelState();
  st[channelKey] = { at: new Date().toISOString(), count: payload.count, mode: result.mode, ok: result.ok, note: result.note || '' };
  await setSetting('channel_state', st);
  return st[channelKey];
}

/* ── Adaptadores de marketplaces (publicación) ────────── */
const sim = (key, payload) => ({ ok: true, mode: 'simulación', note: `Paquete listo: ${payload.count} productos para ${key}. La publicación automática en ${key} todavía no está conectada; usa "Ver paquete" para exportarlo.` });
/* eBay publica de verdad (ebay.js). Walmart y Mercado Libre quedan en simulación hasta conectar sus llaves. */
const adapters = {
  ebay: { label: 'eBay', hasCreds: () => ebay.hasCreds(), publish: (payload, opts) => ebay.publish(payload, opts) },
  walmart: { label: 'Walmart Marketplace', hasCreds: () => !!(env('WALMART_CLIENT_ID') && env('WALMART_CLIENT_SECRET')),
    async publish(payload) { return sim('Walmart', payload); } },
  mercadolibre: { label: 'Mercado Libre', hasCreds: () => !!env('MELI_TOKEN'),
    async publish(payload) { return sim('Mercado Libre', payload); } },
};

/* ── ShipStation: orden real con peso y medidas ───────── */
const US_STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR' };
const COUNTRIES = { 'united states': 'US', 'united states of america': 'US', usa: 'US', 'estados unidos': 'US', eeuu: 'US', 'ee.uu.': 'US', canada: 'CA', 'canadá': 'CA', mexico: 'MX', 'méxico': 'MX', 'puerto rico': 'PR', venezuela: 'VE', colombia: 'CO', 'españa': 'ES', spain: 'ES', 'united kingdom': 'GB', 'reino unido': 'GB', panama: 'PA', 'panamá': 'PA', chile: 'CL', peru: 'PE', 'perú': 'PE', argentina: 'AR', ecuador: 'EC', 'república dominicana': 'DO', 'dominican republic': 'DO' };
/* "Estados Unidos" → US, "Florida" → FL: ShipStation exige códigos de 2 letras */
function countryCode(c) { const t = String(c || '').trim(); if (!t) return 'US'; if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase(); return COUNTRIES[t.toLowerCase()] || 'US'; }
function stateCode(st, country) { const t = String(st || '').trim(); if (country !== 'US' || /^[A-Za-z]{2}$/.test(t)) return /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : t; return US_STATES[t.toLowerCase()] || t; }
const SS_API = (env('SHIPSTATION_API_BASE') || 'https://ssapi.shipstation.com').replace(/\/+$/, '');
const CARRIERS = { stamps_com: 'USPS', usps: 'USPS', ups: 'UPS', ups_walleted: 'UPS', fedex: 'FedEx', fedex_walleted: 'FedEx', dhl_express: 'DHL', dhl_express_worldwide: 'DHL', ontrac: 'OnTrac' };
const shipstation = {
  carrierName: (code) => CARRIERS[String(code || '').toLowerCase()] || String(code || '').toUpperCase(),
  /* Lee los envíos que ShipStation anuncia en su aviso SHIP_NOTIFY (solo acepta su propio dominio). */
  async fetchShipments(resourceUrl) {
    if (!this.hasCreds()) return { ok: false, note: 'Faltan las llaves de ShipStation', shipments: [] };
    let url; try { url = new URL(String(resourceUrl || '')); } catch (_) { return { ok: false, note: 'resource_url inválida', shipments: [] }; }
    if (url.origin !== new URL(SS_API).origin) return { ok: false, note: 'resource_url no es de ShipStation', shipments: [] };
    const auth = Buffer.from(`${env('SHIPSTATION_KEY')}:${env('SHIPSTATION_SECRET')}`).toString('base64');
    try {
      const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } }); const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, note: `ShipStation respondió ${r.status}`, shipments: [] };
      return { ok: true, shipments: Array.isArray(j.shipments) ? j.shipments : [] };
    } catch (e) { return { ok: false, note: 'No se pudo contactar a ShipStation: ' + e.message, shipments: [] }; }
  },
  hasCreds: () => !!(env('SHIPSTATION_KEY') && env('SHIPSTATION_SECRET')),
  buildPayload(order, store) {
    const b = order.buyer || {};
    const items = (order.items || []).map((i) => ({
      sku: i.upc || undefined, name: i.name, quantity: i.qty, unitPrice: i.price,
      weight: i.weightOz ? { value: i.weightOz, units: 'ounces' } : undefined,
    }));
    // Peso total = suma; caja = la base más grande y alturas apiladas (aproximación de una sola caja)
    const totalOz = (order.items || []).reduce((s, i) => s + (Number(i.weightOz) || 0) * i.qty, 0);
    const dims = (order.items || []).reduce((acc, i) => {
      if (!i.lengthIn) return acc;
      return { length: Math.max(acc.length, i.lengthIn), width: Math.max(acc.width, i.widthIn || 0), height: acc.height + (i.heightIn || 0) * i.qty };
    }, { length: 0, width: 0, height: 0 });
    return {
      orderNumber: order.number, orderKey: order.number, orderDate: order.createdAt, paymentDate: order.createdAt, orderStatus: 'awaiting_shipment',
      customerEmail: b.email, customerUsername: b.email,
      shipTo: { name: b.name, street1: b.address, city: b.city, state: stateCode(b.state, countryCode(b.country)), postalCode: b.zip, country: countryCode(b.country), phone: b.phone || undefined },
      billTo: { name: b.name },
      items,
      amountPaid: order.totals.total, shippingAmount: order.totals.shipping, taxAmount: order.totals.tax || 0,
      weight: totalOz ? { value: round2(totalOz), units: 'ounces' } : undefined,
      dimensions: dims.length ? { units: 'inches', length: round2(dims.length), width: round2(dims.width), height: round2(dims.height) } : undefined,
      internalNotes: `Canal: ${order.channel || 'web'} · ${store.name}` + ((order.items || []).some((i) => i.supplierQty > 0) ? ' · PEDIR A SHOPPEX: ' + (order.items || []).filter((i) => i.supplierQty > 0).map((i) => `${i.supplierQty}× ${i.upc}`).join(', ') : ' · Todo sale de inventario propio'),
      advancedOptions: { source: order.channel || 'web', customField1: order.externalId || undefined },
      customerNotes: b.notes || undefined,
    };
  },
  async createOrder(order, store) {
    const payload = this.buildPayload(order, store);
    if (!this.hasCreds()) return { ok: true, mode: 'simulación', id: `SS-SIM-${order.number}`, note: 'ShipStation en simulación; añade SHIPSTATION_KEY y SHIPSTATION_SECRET para crear envíos reales.', payload };
    const auth = Buffer.from(`${env('SHIPSTATION_KEY')}:${env('SHIPSTATION_SECRET')}`).toString('base64');
    try {
      const r = await fetch(SS_API + '/orders/createorder', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, mode: 'en vivo', note: `ShipStation respondió ${r.status}: ${(j && (j.ExceptionMessage || j.Message)) || 'error'}`, payload };
      return { ok: true, mode: 'en vivo', id: j.orderId, key: j.orderKey, note: 'Orden creada en ShipStation con peso y medidas.', payload };
    } catch (e) { return { ok: false, mode: 'en vivo', note: 'No se pudo contactar a ShipStation: ' + e.message, payload }; }
  },
};

/* ── Webhook entrante ─────────────────────────────────── */
function verifyChannelSecret(channelKey, provided) {
  const expected = env(`${channelKey.toUpperCase()}_WEBHOOK_SECRET`) || env('CHANNEL_WEBHOOK_SECRET');
  if (!expected) return { ok: false, reason: 'no-secret' };
  const a = Buffer.from(String(provided || '')), b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, reason: ok ? '' : 'bad-secret' };
}

module.exports = {
  getCommitted, commitSale, releaseSale, setCommitted, invLog,
  computeSell, channelPrice, priceBreakdown, buildChannelPayload, marginFor,
  loadChannelState, recordPublish, adapters, shipstation, verifyChannelSecret, countryCode, stateCode,
};
