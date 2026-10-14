'use strict';
/*
 * Simulador local de los servicios externos, para probar sin llaves reales:
 *   /shoppex  → catálogo y pedidos del proveedor
 *   /upc      → UPCitemdb (búsqueda por código de barras)
 *   /off      → Open Food Facts
 *   /ebay     → eBay (OAuth, políticas, fichas, ofertas, ventas, guía)
 *   /ss       → ShipStation (crear orden, leer envíos)
 *   /square   → Square (cobros, reembolsos) y /sq-sdk.js, un formulario de tarjeta de mentira
 *   /pic/…    → una imagen PNG mínima
 * Uso: node test/mock-services.js [puerto]   (lo arranca solo `npm test`)
 */
const http = require('http');

const P = [
  ['CAROLINA HERRERA', '212 3.4 EDT MEN', 51.75, 49, '8411061043868', 'A fresh urban scent. Top notes of bergamot, grapefruit and lavender; heart of ginger and gardenia; base of sandalwood, vetiver and musk.'],
  ['CAROLINA HERRERA', '212 HEROES 3.0 EDT MEN + 10ML', 64.25, 8, '8411061065259', 'Gift set. Pear and ginger on top, geranium heart and a warm musk and leather base.'],
  ['CAROLINA HERRERA', '212 VIP BLACK ELIXIR 3.4 EDP MEN', 78.5, 14, '8411061055519', 'Intense and magnetic. Absinthe, lavender and a deep black vanilla accord.'],
  ['CAROLINA HERRERA', 'GOOD GIRL 2.7 EDP WOMEN', 82.0, 31, '8411061026342', 'Jasmine and tuberose over roasted tonka bean and cocoa. Luminous yet mysterious.'],
  ['CAROLINA HERRERA', 'VERY GOOD GIRL 2.7 EDP WOMEN', 86.4, 12, '8411061991923', 'Red currant and lychee, a rose heart, and a base of vetiver and vanilla.'],
  ['VALENTINO', 'BORN IN ROMA UOMO 3.4 EDT MEN', 79.9, 22, '3614272761469', 'Mineral salt, violet leaf, ginger and smoked vetiver with a woody base.'],
  ['VALENTINO', 'DONNA BORN IN ROMA 3.4 EDP WOMEN', 96.0, 17, '3614272761308', 'Three jasmine flowers, bourbon vanilla and blackcurrant with guaiac wood.'],
  ['DOLCE & GABBANA', 'LIGHT BLUE 3.3 EDT WOMEN', 58.3, 44, '3423473020233', 'Sicilian lemon, apple and jasmine over cedarwood, amber and musk.'],
  ['DOLCE & GABBANA', 'THE ONE 3.3 EDP MEN', 69.0, 19, '3423473021230', 'Grapefruit, coriander and basil; ginger and cardamom; amber, tobacco and cedar.'],
  ['DOLCE & GABBANA', 'K BY DOLCE GABBANA 3.4 EDT MEN', 55.2, 26, '3423473049456', 'Blood orange, juniper and lavender on a base of vetiver, cedarwood and patchouli.'],
  ['PRADA', 'LUNA ROSSA CARBON 3.4 EDT MEN', 84.0, 9, '8435137759783', 'Bergamot and lavender with patchouli, ambroxan and a metallic freshness.'],
  ['PRADA', 'PARADOXE 3.0 EDP WOMEN', 101.5, 13, '3614273760164', 'Neroli bud, amber accord and white musk in a refillable bottle.'],
  ['PRADA', 'L HOMME 3.4 EDT MEN', 82.3, 6, '8435137750658', 'Iris and amber with neroli, geranium and patchouli. Clean and elegant.'],
  ['YVES SAINT LAURENT', 'LIBRE 3.0 EDP WOMEN', 104.0, 21, '3614272648425', 'French lavender, Moroccan orange blossom and a bold vanilla musk accord.'],
  ['YVES SAINT LAURENT', 'Y 3.3 EDP MEN', 98.5, 18, '3614272050358', 'Apple, bergamot and sage with a tonka bean, cedar and vetiver base.'],
  ['YVES SAINT LAURENT', 'BLACK OPIUM 3.0 EDP WOMEN', 96.7, 27, '3365440787971', 'Black coffee, white flowers and vanilla with patchouli and cedarwood.'],
  ['MONTALE', 'INTENSE CAFE 3.4 EDP UNISEX', 88.0, 11, '3760260453066', 'Rose and coffee wrapped in amber, vanilla and white musk.'],
  ['MONTALE', 'ARABIANS TONKA 3.4 EDP UNISEX', 92.5, 7, '3760260456722', 'Saffron, bergamot and rose with oud, tonka bean, amber and musk.'],
  ['MONTALE', 'CHOCOLATE GREEDY 3.4 EDP UNISEX', 84.3, 5, '3760260451093', 'A gourmand of cocoa, bitter orange, tonka bean and vanilla.'],
  ['EMPER', 'STALLION 53 2.8 EDP UNISEX', 21.0, 60, '6291108598443', 'Sandalwood, iris and cedarwood on a soft leather and amber base.'],
  ['EMPER', 'ROYAL BLEND BOURBON 3.4 EDP UNISEX', 24.5, 38, '6291108735114', 'Cinnamon, vanilla and tonka bean with tobacco leaf and oud.'],
  ['ORIENTICA', 'ROYAL AMBER 2.7 EDP UNISEX', 61.0, 15, '6297001158319', 'Golden amber, labdanum, vanilla and a trail of sandalwood and musk.'],
  ['ORIENTICA', 'AMBER ROUGE 2.7 EDP UNISEX', 58.0, 23, '6297001158265', 'Saffron and jasmine over amberwood, cedar and a resinous musk.'],
  ['AL HARAMAIN', 'AMBER OUD GOLD EDITION 2.0 EDP UNISEX', 39.9, 33, '6291100130160', 'Bergamot and green notes with melon, pineapple, amber, vanilla and musk.'],
  ['AL HARAMAIN', 'L AVENTURE 3.4 EDP MEN', 34.0, 40, '6291100132911', 'Lemon and bergamot with lily of the valley, jasmine, patchouli and amber.'],
  ['KAREN LOW', 'PURE EAU FRAICHE 3.4 EDT WOMEN', 14.8, 52, '5055810013172', 'Mandarin, lily of the valley and rose on a light white musk.'],
  ['KAREN LOW', 'XTREME ME 3.4 EDP WOMEN', 15.2, 47, '5055810013196', 'Pear and jasmine over vanilla, patchouli and sandalwood.'],
  ['VERSACE', 'EROS 3.4 EDT MEN', 66.0, 35, '8011003809219', 'Mint, green apple and lemon with tonka bean, vanilla, vetiver and cedar.'],
  ['VERSACE', 'BRIGHT CRYSTAL 3.0 EDT WOMEN', 54.0, 29, '8018365071466', 'Pomegranate, yuzu and peony over amber and musk.'],
  ['VERSACE', 'DYLAN BLUE 3.4 EDT MEN', 59.5, 24, '8011003825745', 'Bergamot, grapefruit and fig leaf with patchouli, ambrox and musk.'],
  ['PACO RABANNE', '1 MILLION 3.4 EDT MEN', 63.0, 41, '3349668566372', 'Blood mandarin and peppermint with rose, cinnamon, leather and amber.'],
  ['PACO RABANNE', 'INVICTUS 3.4 EDT MEN', 61.5, 28, '3349668515660', 'Grapefruit and marine accord, bay leaf and jasmine, with patchouli and ambergris.'],
  ['PACO RABANNE', 'OLYMPEA 2.7 EDP WOMEN', 68.0, 16, '3349668528653', 'Green mandarin and water jasmine with salted vanilla and sandalwood.'],
  ['JO MALONE', 'WOOD SAGE & SEA SALT 3.4 COLOGNE UNISEX', 98.0, 10, '690251040032', 'Ambrette seeds, sea salt and sage with a mineral, woody freshness.'],
  ['JO MALONE', 'LIME BASIL & MANDARIN 3.4 COLOGNE UNISEX', 98.0, 12, '690251008391', 'Lime and mandarin with peppery basil and white thyme over amberwood.'],
  ['LATTAFA', 'KHAMRAH 3.4 EDP UNISEX', 27.5, 55, '6291108737194', 'Cinnamon, nutmeg and bergamot with dates, praline, vanilla, tonka bean and amberwood.'],
  ['LATTAFA', 'YARA 3.4 EDP WOMEN', 19.9, 64, '6291108730515', 'Orchid, heliotrope and tangerine with vanilla, sandalwood and musk.'],
  ['LATTAFA', 'ASAD 3.4 EDP MEN', 21.3, 58, '6291108735015', 'Black pepper, tobacco and pineapple with patchouli, amber and vanilla.'],
  ['GIORGIO ARMANI', 'ACQUA DI GIO 3.4 EDT MEN', 74.0, 20, '3360372058878', 'Marine notes, bergamot and neroli with jasmine, rosemary, patchouli and cedar.'],
  ['GIORGIO ARMANI', 'SI 3.4 EDP WOMEN', 92.0, 14, '3605521816658', 'Blackcurrant nectar, rose and freesia on vanilla, patchouli and ambroxan.'],
  ['BURBERRY', 'HER 3.3 EDP WOMEN', 81.0, 0, '3614227693876', 'Red and dark berries with jasmine and violet, on a dry amber and musk.'],
  ['BURBERRY', 'HERO 3.3 EDT MEN', 72.0, 11, '3614229820799', 'Bergamot, juniper and black pepper with three cedarwood oils.'],
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function start(port, opts = {}) {
  const base = `http://localhost:${port}`;
  const img = (i) => (opts.images === 'local' ? `/img/demo-${(i % 12) + 1}.svg` : `https://img.example.test/p/${i + 1}.jpg`);
  const state = { supplierOrders: [], ebay: { items: {}, offers: {}, published: [], fulfillments: [], bulk: [], orders: [] }, ss: { orders: [], shipments: [] }, square: { payments: [], refunds: [] } };
  const products = P.map(([brand, name, price, stock, upc, description], i) => ({ product_id: 1000 + i, sku: 'SX' + (1000 + i), name, brand, type: 'Fragrance', price: price.toFixed(2), stock_quantity: stock, upc, image_url: img(i), description }));
  const send = (res, code, obj, type) => { const b = Buffer.isBuffer(obj) ? obj : Buffer.from(obj == null ? '' : JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': type || 'application/json' }); res.end(b); };
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const u = new URL(req.url, base); const p = u.pathname; let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (_) { body = Object.fromEntries(new URLSearchParams(raw)); }
      /* ── proveedor ── */
      if (p === '/shoppex/api/v1/products') {
        if (!req.headers['x-shoppex-signature']) return send(res, 401, { message: 'firma requerida' });
        const page = Number(u.searchParams.get('page')) || 1; const per = Number(u.searchParams.get('per_page')) || 200;
        return send(res, 200, { data: products.slice((page - 1) * per, page * per), pagination: { has_next: page * per < products.length } });
      }
      if (p === '/shoppex/api/v1/orders' && req.method === 'POST') { state.supplierOrders.push(body); return send(res, 200, { success: true, order_id: 'SO-' + state.supplierOrders.length }); }
      /* ── códigos de barras ── */
      if (p === '/upc/prod/trial/lookup') {
        const upc = u.searchParams.get('upc');
        if (upc === '0850012345678') return send(res, 200, { code: 'OK', total: 1, items: [{ title: 'Sol de Janeiro Brazilian Crush Cheirosa 62 Body Mist 240ml', brand: 'Sol de Janeiro', description: 'Hair and body fragrance mist with pistachio, salted caramel and vanilla.', category: 'Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne', weight: '0.6 lb', dimension: '2 X 2 X 8 inches', images: [`${base}/pic/a.png`, `${base}/pic/b.png`] }] });
        return send(res, 200, { code: 'OK', total: 0, items: [] });
      }
      if (p.startsWith('/off/api/v2/product/')) {
        if (p.includes('7591016851203')) return send(res, 200, { status: 1, product: { product_name: 'Chocolate con leche Savoy', brands: 'Savoy,Nestlé', quantity: '130 g', categories: 'Snacks, Chocolates', generic_name: 'Chocolate con leche', image_front_url: `${base}/pic/c.png` } });
        return send(res, 404, { status: 0 });
      }
      if (p.startsWith('/pic/')) return send(res, 200, PNG, 'image/png');
      /* ── eBay ── */
      if (p === '/ebay/identity/v1/oauth2/token') {
        if (!String(req.headers.authorization || '').startsWith('Basic ')) return send(res, 401, { error: 'invalid_client' });
        if (body.grant_type === 'authorization_code') return send(res, 200, { access_token: 'acc-1', expires_in: 7200, refresh_token: 'ref-1', refresh_token_expires_in: 47304000 });
        if (body.grant_type === 'refresh_token' && body.refresh_token === 'ref-1') return send(res, 200, { access_token: 'acc-2', expires_in: 7200 });
        return send(res, 400, { error: 'invalid_grant', error_description: 'refresh token inválido' });
      }
      if (p.startsWith('/ebay/')) {
        if (!/^Bearer acc-/.test(String(req.headers.authorization || ''))) return send(res, 401, { errors: [{ message: 'Invalid access token' }] });
        const e = state.ebay; let m;
        if (p === '/ebay/sell/account/v1/fulfillment_policy') return send(res, 200, { fulfillmentPolicies: [{ fulfillmentPolicyId: 'FP1', name: 'Envío estándar' }] });
        if (p === '/ebay/sell/account/v1/payment_policy') return send(res, 200, { paymentPolicies: [{ paymentPolicyId: 'PP1', name: 'Pagos gestionados' }] });
        if (p === '/ebay/sell/account/v1/return_policy') return send(res, 200, { returnPolicies: [{ returnPolicyId: 'RP1', name: '30 días' }] });
        if (p === '/ebay/sell/inventory/v1/location') return send(res, 200, { locations: [{ merchantLocationKey: 'miami-1', name: 'Miami', merchantLocationStatus: 'ENABLED' }] });
        if (p === '/ebay/commerce/taxonomy/v1/get_default_category_tree_id') return send(res, 200, { categoryTreeId: '0' });
        if (p.endsWith('/get_category_suggestions')) { const q = u.searchParams.get('q') || ''; return send(res, 200, { categorySuggestions: [{ category: { categoryId: /women/i.test(q) ? '11848' : /unisex/i.test(q) ? '180345' : /men/i.test(q) ? '11850' : '99' } }] }); }
        if ((m = p.match(/^\/ebay\/sell\/inventory\/v1\/inventory_item\/(.+)$/)) && req.method === 'PUT') {
          const sku = decodeURIComponent(m[1]);
          if (!body.product || !body.product.title || body.product.title.length > 80) return send(res, 400, { errors: [{ message: 'Title is required and must be 80 characters or fewer' }] });
          if (!(body.product.imageUrls || []).length) return send(res, 400, { errors: [{ message: 'At least one image is required' }] });
          e.items[sku] = body; return send(res, 204, null);
        }
        if (p === '/ebay/sell/inventory/v1/offer' && req.method === 'GET') { const sku = u.searchParams.get('sku'); const o = Object.values(e.offers).filter((x) => x.sku === sku); return o.length ? send(res, 200, { offers: o }) : send(res, 404, { errors: [{ errorId: 25713, message: 'This Offer is not available.' }] }); }
        if (p === '/ebay/sell/inventory/v1/offer' && req.method === 'POST') {
          for (const k of ['fulfillmentPolicyId', 'paymentPolicyId', 'returnPolicyId']) if (!(body.listingPolicies || {})[k]) return send(res, 400, { errors: [{ message: 'Missing ' + k }] });
          if (!body.categoryId || !body.merchantLocationKey) return send(res, 400, { errors: [{ message: 'Missing category or location' }] });
          const id = 'OF' + (Object.keys(e.offers).length + 1); e.offers[id] = { ...body, offerId: id, status: 'UNPUBLISHED' }; return send(res, 201, { offerId: id });
        }
        if ((m = p.match(/^\/ebay\/sell\/inventory\/v1\/offer\/([^/]+)$/)) && req.method === 'PUT') { if (!e.offers[m[1]]) return send(res, 404, { errors: [{ message: 'no offer' }] }); Object.assign(e.offers[m[1]], body); return send(res, 204, null); }
        if ((m = p.match(/^\/ebay\/sell\/inventory\/v1\/offer\/([^/]+)\/publish$/))) { const o = e.offers[m[1]]; if (!o) return send(res, 404, { errors: [{ message: 'no offer' }] }); o.status = 'PUBLISHED'; o.listing = { listingId: 'L' + m[1] }; e.published.push(o.sku); return send(res, 200, { listingId: o.listing.listingId }); }
        if (p === '/ebay/sell/inventory/v1/bulk_update_price_quantity') { e.bulk.push(body); return send(res, 200, { responses: (body.requests || []).map((r) => ({ sku: r.sku, statusCode: 200 })) }); }
        if (p === '/ebay/sell/fulfillment/v1/order' && req.method === 'GET') return send(res, 200, { orders: e.orders });
        if ((m = p.match(/^\/ebay\/sell\/fulfillment\/v1\/order\/([^/]+)\/shipping_fulfillment$/))) { e.fulfillments.push({ orderId: decodeURIComponent(m[1]), ...body }); return send(res, 201, null); }
        return send(res, 404, { errors: [{ message: 'ruta eBay no simulada: ' + p }] });
      }
      /* ── Square ── */
      if (p === '/sq-sdk.js') return send(res, 200, Buffer.from(`window.Square={payments:function(appId,loc){return{card:async function(){var el;return{attach:async function(sel){el=document.querySelector(sel);el.innerHTML='<input id="fakeCard" placeholder="Card number (test)" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:15px;margin-bottom:12px">';},tokenize:async function(d){var v=(document.querySelector('#fakeCard')||{}).value||'';window.__lastTokenize=d;if(!v)return{status:'INVALID',errors:[{message:'Card number is required.'}]};return{status:'OK',token:v.indexOf('4000')===0?'cnon:card-nonce-declined':'cnon:card-nonce-ok'};},destroy:async function(){if(el)el.innerHTML='';}};}};}};`), 'text/javascript');
      if (p.startsWith('/square/')) {
        if (String(req.headers.authorization || '') !== 'Bearer sq-token' || !req.headers['square-version']) return send(res, 401, { errors: [{ code: 'UNAUTHORIZED', detail: 'bad token' }] });
        const q = state.square; let m;
        if (p === '/square/v2/payments' && req.method === 'POST') {
          if (!body.idempotency_key || body.idempotency_key.length > 45 || !body.amount_money || !Number.isInteger(body.amount_money.amount)) return send(res, 400, { errors: [{ code: 'BAD_REQUEST', detail: 'idempotency/amount' }] });
          const dup = q.payments.find((x) => x.idempotency_key === body.idempotency_key); if (dup) return send(res, 200, { payment: dup.payment });
          if (body.source_id === 'cnon:card-nonce-declined') return send(res, 402, { errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CVV_FAILURE', detail: 'Authorization error: CVV_FAILURE' }], payment: { id: 'pay-x', status: 'FAILED' } });
          const payment = { id: 'pay-' + (q.payments.length + 1), status: 'COMPLETED', amount_money: body.amount_money, reference_id: body.reference_id, created_at: new Date().toISOString(), receipt_url: 'https://squareup.com/receipt/preview/pay-' + (q.payments.length + 1),
            card_details: { status: 'CAPTURED', avs_status: 'AVS_ACCEPTED', cvv_status: 'CVV_ACCEPTED', card: { card_brand: 'VISA', last_4: '1111' } }, risk_evaluation: { risk_level: body.source_id === 'cnon:high-risk' ? 'HIGH' : 'NORMAL' } };
          q.payments.push({ ...body, payment }); return send(res, 200, { payment });
        }
        if (p === '/square/v2/refunds' && req.method === 'POST') { const refund = { id: 'rf-' + (q.refunds.length + 1), status: 'PENDING', payment_id: body.payment_id, amount_money: body.amount_money }; q.refunds.push({ ...body, refund }); return send(res, 200, { refund }); }
        if ((m = p.match(/^\/square\/v2\/locations\/(.+)$/))) return send(res, 200, { location: { id: m[1], name: 'NVOS Miami', status: 'ACTIVE', currency: 'USD', country: 'US', capabilities: ['CREDIT_CARD_PROCESSING'] } });
        return send(res, 404, { errors: [{ code: 'NOT_FOUND', detail: p }] });
      }
      /* ── ShipStation ── */
      if (p === '/ss/orders/createorder') {
        if (!String(req.headers.authorization || '').startsWith('Basic ')) return send(res, 401, { Message: 'no auth' });
        state.ss.orders.push(body); return send(res, 200, { orderId: 9000 + state.ss.orders.length, orderKey: body.orderKey });
      }
      if (p === '/ss/shipments') return send(res, 200, { shipments: state.ss.shipments });
      if (p === '/__state') return send(res, 200, state);
      if (p === '/__set' && req.method === 'POST') { if (body.ebayOrders) state.ebay.orders = body.ebayOrders; if (body.shipments) state.ss.shipments = body.shipments; return send(res, 200, { ok: true }); }
      send(res, 404, { error: 'no simulado: ' + p });
    });
  });
  return new Promise((resolve) => srv.listen(port, () => resolve({ srv, state, base, products })));
}
module.exports = { start, PRODUCTS: P };
if (require.main === module) { const port = Number(process.argv[2]) || 4010; start(port, { images: process.env.MOCK_IMAGES || 'https' }).then(() => console.log('Simulador en http://localhost:' + port)); }
