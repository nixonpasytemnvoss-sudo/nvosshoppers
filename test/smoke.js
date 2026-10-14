'use strict';
/* Prueba automática de punta a punta. Arranca el servidor en modo local (archivo temporal,
   sin Supabase ni correos) contra un simulador de Shoppex, eBay, ShipStation y las bases de
   códigos de barras, y recorre: catálogo → inventario propio → pedido → envío → eBay.
   Uso: npm test */
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mock = require('./mock-services');
const tax = require('../tax');

const PORT = 3999, MP = 4019, B = `http://localhost:${PORT}`, M = `http://localhost:${MP}`;
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data'); const backup = fs.existsSync(dataDir) ? fs.mkdtempSync(path.join(os.tmpdir(), 'nvos-data-')) : null;
if (backup) { fs.cpSync(dataDir, backup, { recursive: true }); fs.rmSync(dataDir, { recursive: true, force: true }); }
const restore = () => { fs.rmSync(dataDir, { recursive: true, force: true }); if (backup) fs.cpSync(backup, dataDir, { recursive: true }); };

const env = { ...process.env, PORT, NODE_ENV: 'test', ADMIN_PASSWORD: 'smoke', SESSION_SECRET: 'smoke', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', RESEND_API_KEY: '', SITE_URL: B,
  SHOPPEX_BASE_URL: M + '/shoppex', SHOPPEX_KEY: 'k', SHOPPEX_SECRET: 's', UPCITEMDB_URL: M + '/upc', UPCITEMDB_KEY: '', OPENFOODFACTS_URL: M + '/off', ALLOW_LOCAL_FETCH: '1',
  EBAY_API_BASE: M + '/ebay', EBAY_AUTH_BASE: M + '/ebay-auth', EBAY_CLIENT_ID: 'cid', EBAY_CLIENT_SECRET: 'csec', EBAY_RUNAME: 'NVOS-RuName', EBAY_REFRESH_TOKEN: '', EBAY_ENV: '',
  SHIPSTATION_API_BASE: M + '/ss', SHIPSTATION_KEY: 'sk', SHIPSTATION_SECRET: 'ss', CHANNEL_WEBHOOK_SECRET: 'hook', GOOGLE_CSE_KEY: '', GOOGLE_CSE_CX: '',
  SQUARE_API_BASE: M + '/square', SQUARE_SDK_URL: M + '/sq-sdk.js', SQUARE_ACCESS_TOKEN: 'sq-token', SQUARE_APP_ID: 'sq-app', SQUARE_LOCATION_ID: 'LOC1', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sqsig', SQUARE_ENV: '',
  ADMIN_PATH: 'panel-nvos', ADMIN_EMAILS: 'prueba@nvos.test', ADMIN_PASSWORD_HASH: '', ADMIN_TOTP_SECRET: '', ADMIN_IP_ALLOW: '', TRUST_PROXY: '1', ADMIN_ALERT_EMAIL: '' };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY']) delete env[k];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cookie = '', srv, ms;
const raw = (url, opts = {}) => fetch(B + url, { redirect: 'manual', ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
const j = async (url, opts = {}) => { const r = await raw(url, opts); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return r.json(); };
const mj = async (url, body) => (await fetch(M + url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
let n = 0; const ok = (cond, msg) => { if (!cond) throw new Error('FALLÓ: ' + msg); n += 1; console.log('  ✓', msg); };
const until = async (fn, msg, tries = 60) => { for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await sleep(250); } throw new Error('FALLÓ (tiempo): ' + msg); };
const T = { Authorization: 'Bearer dev:prueba@nvos.test:Prueba' };
const buyer = { name: 'Prueba Uno', email: 'prueba@nvos.test', address: '100 Ocean Dr', city: 'Miami', state: 'Florida', zip: '33139', country: 'United States' };
const OKCARD = { sourceId: 'cnon:card-nonce-ok' };
/* mismo cálculo que la app autenticadora del teléfono */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32d = (x) => { let bits = ''; for (const ch of x) bits += B32.indexOf(ch).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (secret, at = Date.now()) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(at / 30000))); const h = crypto.createHmac('sha1', b32d(secret)).update(b).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };

(async () => {
  ms = await mock.start(MP);
  srv = spawn(process.execPath, [path.join(root, 'server.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  await until(async () => { try { return (await fetch(B + '/config.js')).ok; } catch (_) { return false; } }, 'el servidor arranca');
  await j('/api/admin/login', { method: 'POST', body: { password: 'smoke' } });
  await until(async () => (await j('/api/admin/status')).mode === 'live', 'catálogo del proveedor leído');

  console.log('\nCatálogo y categorías');
  let cat = await j('/api/admin/catalog'); const total = mock.PRODUCTS.length;
  ok(cat.products.length === total && cat.products.every((p) => p.category === 'Perfumería' && p.webVisible), `los ${total} productos del proveedor entran como Perfumería y salen en la web (incluidos "Chocolate Greedy" e "Intense Cafe")`);
  ok(cat.stats.supplier === total && cat.stats.own === 0 && cat.stats.webVisible === total && cat.stats.hidden === 0, 'contadores: proveedor / mío / visibles / solo inventario');
  ok(cat.categories[0] === 'Perfumería' && cat.categories.includes('Chocolates') && cat.categories.at(-1) === 'Otros', 'el panel ofrece Perfumería en la lista de categorías');
  const by = (upc) => cat.products.find((p) => p.upc === upc);
  ok(by('8411061043868').gender === 'Caballeros' && by('8411061026342').gender === 'Damas' && by('3760260453066').gender === 'Unisex', 'detecta Caballeros / Damas / Unisex por el nombre');
  ok(['bergamot', 'citrus', 'lavender', 'sandalwood', 'vetiver', 'musk'].every((k) => by('8411061043868').notes.includes(k)), 'detecta las notas en la descripción (212: bergamota, cítricos, lavanda, sándalo, vetiver, almizcle)');
  const pub0 = await j('/api/catalog');
  ok(pub0.notes.find((x) => x.key === 'vanilla').count > 5 && pub0.products[0].cost === undefined, 'la tienda recibe las notas con su conteo y nunca el costo');
  const ch = await j('/api/admin/channels');
  ok(ch.channels.map((c) => c.key).join() === 'ebay,walmart,mercadolibre', 'canales: solo eBay, Walmart y Mercado Libre');
  await j('/api/admin/meta', { method: 'POST', body: { upc: '8411061043868', notes: ['citrus'], gender: 'Unisex' } });
  cat = await j('/api/admin/catalog'); ok(by('8411061043868').notes.join() === 'citrus' && by('8411061043868').gender === 'Unisex', 'notas y género fijados a mano desde el panel');
  await j('/api/admin/meta', { method: 'POST', body: { upc: '8411061043868', notes: '', gender: '' } });
  const pr = await j('/api/admin/pricing', { method: 'POST', body: { store: { categories: [...(await j('/api/admin/pricing')).store.categories, { key: 'Cuidado personal', desc: '', tone: 'otro' }] } } });
  cat = await j('/api/admin/catalog'); ok(pr.ok && cat.categories.includes('Cuidado personal'), 'categoría nueva creada por la dueña');

  console.log('\nInventario propio y escáner');
  const UPC = '8411061026342'; /* Good Girl: el proveedor tiene 31 */
  const scan = await j('/api/admin/lookup?upc=' + UPC);
  ok(scan.found && scan.found.name.includes('GOOD GIRL') && !scan.manual && !scan.external, 'escanear un UPC del proveedor trae su ficha');
  const own = await j('/api/admin/products', { method: 'POST', body: { name: scan.found.name, brand: scan.found.brand, category: scan.found.category, upc: UPC, cost: 70, stock: 2, weightOz: 14, lengthIn: 6, widthIn: 4, heightIn: 3, image: scan.found.image, description: scan.found.description } });
  ok(own.ok, 'producto cargado en mi inventario con el mismo UPC');
  cat = await j('/api/admin/catalog'); let gg = by(UPC);
  ok(gg.hasApi && gg.hasOwn && gg.ownFree === 2 && gg.apiFree === 31 && gg.stock === 33 && cat.products.length === total && cat.stats.own === 1 && cat.stats.both === 1, 'se une con el del proveedor en una sola ficha: 2 míos + 31 del proveedor');
  ok((await j('/api/admin/lookup?upc=' + UPC)).manual.stock === 2, 'volver a escanearlo lo reconoce como mío');
  const plus = await j('/api/admin/products/stock', { method: 'POST', body: { id: own.product.id, delta: 1 } });
  ok(plus.ok && plus.stock === 3, 'modo recepción: un escaneo suma 1 al stock');
  await j('/api/admin/products/stock', { method: 'POST', body: { id: own.product.id, delta: -1 } });
  const ext = await j('/api/admin/lookup?upc=0850012345678');
  ok(ext.external && ext.external.name.includes('Cheirosa') && ext.external.images.length === 2 && ext.external.weightOz === 9.6 && ext.external.category === 'Perfumería', 'UPC desconocido: datos y fotos desde la base de códigos de barras');
  const food = await j('/api/admin/lookup?upc=7591016851203');
  ok(food.external && food.external.brand === 'Savoy' && food.external.category === 'Chocolates' && food.external.images.length === 1, 'alimento: datos desde Open Food Facts, categoría Chocolates');
  const imp = await j('/api/admin/image-import', { method: 'POST', body: { url: ext.external.images[0] } });
  ok(imp.ok && imp.dataUrl.startsWith('data:image/png;base64,'), 'la foto elegida se descarga para pasarla a fondo blanco');
  const up = await j('/api/admin/upload', { method: 'POST', body: { dataUrl: imp.dataUrl } });
  ok(up.ok && up.url.startsWith('/img/'), 'y se guarda en el almacén de fotos');
  const bad = await j('/api/admin/upload', { method: 'POST', body: { dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64') } });
  ok(!bad.ok, 'un SVG con código incrustado se rechaza');
  const choc = await j('/api/admin/products', { method: 'POST', body: { name: food.external.name, brand: food.external.brand, category: food.external.category, upc: '7591016851203', cost: 2, stock: 30, price: 4.5, weightOz: 5 } });
  cat = await j('/api/admin/catalog'); const pub1 = await j('/api/catalog');
  ok(choc.ok && by('7591016851203').webVisible === false && by('7591016851203').sell === 4.5 && !pub1.products.find((p) => p.upc === '7591016851203') && cat.stats.hidden === 1, 'el chocolate queda como inventario: no sale en la web, precio fijado a mano');
  const ep = await j('/api/admin/channels/export?channel=ebay');
  ok(ep.items.find((i) => i.upc === '7591016851203') && ep.items.find((i) => i.upc === '7591016851203').price > 4.5, 'pero sí va en el paquete de eBay, con la comisión sumada');

  console.log('\nImpuestos y pago con Square');
  const cfg = await (await fetch(B + '/config.js')).text();
  ok(/"appId":"sq-app"/.test(cfg) && !/sq-token/.test(cfg), 'la tienda recibe el App ID público de Square, nunca la llave secreta');
  let qt = await j('/api/orders/quote', { method: 'POST', headers: T, body: { items: [{ upc: UPC, qty: 3 }], buyer } });
  ok(qt.ok && qt.totals.tax === 0 && qt.totals.taxState === 'FL', 'de entrada no se cobra impuesto en ningún estado');
  const txs = await j('/api/admin/pricing', { method: 'POST', body: { tax: { states: { FL: { collect: true, rate: 6, shipping: false }, TX: { collect: true, rate: 6.25, shipping: true } } } } });
  ok(txs.ok && txs.rules.tax.states.FL.collect && !txs.rules.tax.states.NY.collect && txs.rules.tax.states.NY.rate === 4 && Object.keys(txs.rules.tax.states).length === 51, 'la dueña activa Florida y Texas; los 51 quedan con su tasa');
  qt = await j('/api/orders/quote', { method: 'POST', headers: T, body: { items: [{ upc: UPC, qty: 3 }], buyer } });
  const sub = qt.totals.subtotal; const expTax = Math.round(sub * 6) / 100;
  ok(qt.totals.tax === expTax && qt.totals.taxRate === 6 && qt.totals.shipping === 0 && Math.abs(qt.totals.total - (sub + expTax)) < 0.005, `cotización a Florida: 6 % sobre $${sub} = $${expTax}`);
  /* El ZIP acompaña al estado: el servidor comprueba que cuadren (ZIP de Nueva York y de Texas). */
  const qNY = await j('/api/orders/quote', { method: 'POST', headers: T, body: { items: [{ upc: UPC, qty: 1 }], buyer: { ...buyer, state: 'NY', city: 'New York', zip: '10001' } } });
  const qTX = await j('/api/orders/quote', { method: 'POST', headers: T, body: { items: [{ upc: '6291108730515', qty: 1 }], buyer: { ...buyer, state: 'TX', city: 'Austin', zip: '78701' } } });
  ok(qNY.totals.tax === 0 && qTX.totals.shipping === 9.99 && qTX.totals.tax === Math.round((qTX.totals.subtotal + 9.99) * 6.25) / 100, 'Nueva York no cobra (no activo); Texas cobra 6.25 % también sobre el envío');
  ok((await j('/api/catalog')).tax.FL.rate === 6, 'la tienda conoce las tasas activas para mostrarlas antes de pagar');

  console.log('\nPedido de la web: mi stock sale primero');
  const noPay = await raw('/api/orders', { method: 'POST', headers: T, body: { items: [{ upc: UPC, qty: 1 }], buyer } });
  ok(noPay.status === 400, 'sin tarjeta no hay pedido');
  const tamper = await j('/api/orders', { method: 'POST', headers: T, body: { items: [{ upc: UPC, qty: 3, price: 0.01 }], buyer, payment: OKCARD, expectedTotal: 0.03, totals: { total: 0.03 } } });
  ok(!tamper.ok && /total changed|total cambió/i.test(tamper.error), 'un precio inventado desde el navegador no sirve: el total lo pone el servidor');
  const decl = await raw('/api/orders', { method: 'POST', headers: T, body: { lang: 'en', items: [{ upc: UPC, qty: 1 }], buyer, payment: { sourceId: 'cnon:card-nonce-declined' } } }); const declJ = await decl.json();
  cat = await j('/api/admin/catalog'); gg = by(UPC);
  ok(decl.status === 402 && declJ.declined && /CVV/.test(declJ.error) && gg.stock === 33 && (await j('/api/admin/orders')).find((x) => x.status === 'cancelado'), 'tarjeta rechazada: mensaje claro, pedido cancelado y stock intacto');
  const ord = await j('/api/orders', { method: 'POST', headers: T, body: { lang: 'en', items: [{ upc: UPC, qty: 3 }], buyer, payment: OKCARD, expectedTotal: qt.totals.total } });
  const adminOrders = await j('/api/admin/orders'); let o = adminOrders.find((x) => x.number === ord.order.number);
  ok(ord.ok && ord.order.status === 'pagado' && o.items[0].ownQty === 2 && o.items[0].supplierQty === 1 && o.lang === 'en', 'pide 3 y paga: salen 2 de mi inventario y solo 1 se pide al proveedor');
  let mstate = await mj('/__state'); const sqp = mstate.square.payments.find((x) => x.reference_id === o.number);
  ok(sqp && sqp.amount_money.amount === Math.round(qt.totals.total * 100) && sqp.location_id === 'LOC1' && o.payment.last4 === '1111' && o.payment.avs === 'AVS_ACCEPTED' && o.totals.tax === expTax && o.totals.taxState === 'FL', 'Square cobró exactamente el total del servidor (con impuesto) y el pedido guarda tarjeta, AVS y CVV');
  ok(ord.order.payment.last4 === '1111' && ord.order.payment.id === undefined && ord.order.totals.cost === undefined, 'el cliente ve los 4 últimos dígitos y su recibo; nada interno');
  ok(o.supplierOrder.products.length === 1 && o.supplierOrder.products[0].quantity === 1, 'el pedido a Shoppex queda preparado por 1 unidad');
  cat = await j('/api/admin/catalog'); gg = by(UPC); ok(gg.ownFree === 0 && gg.apiFree === 30 && gg.stock === 30, 'stock: mis 2 unidades ya están comprometidas');
  ok(!(await j('/api/orders', { method: 'POST', headers: T, body: { items: [{ upc: '7591016851203', qty: 1 }], buyer, payment: OKCARD } })).ok, 'un producto que no es de la web no se puede comprar por la web');
  const sso = mstate.ss.orders.find((x) => x.orderNumber === o.number);
  ok(sso && sso.shipTo.country === 'US' && sso.shipTo.state === 'FL' && sso.weight.value === 42 && sso.taxAmount === expTax && /PEDIR A SHOPPEX: 1× 8411061026342/.test(sso.internalNotes), 'al pagar, la orden pasa sola a ShipStation (US / FL, 42 oz, impuesto, nota de lo que falta pedir)');
  const sup = await j('/api/admin/supplier-order', { method: 'POST', body: { number: o.number } }); mstate = await mj('/__state');
  ok(sup.ok && mstate.supplierOrders[0].items[0].quantity === 1, 'botón "Pedir a Shoppex": manda solo la unidad que falta');

  console.log('\nFraude, reembolsos y reporte de impuestos');
  await j('/api/admin/pricing', { method: 'POST', body: { fraud: { reviewOver: 20 } } });
  const big = await j('/api/orders', { method: 'POST', headers: T, body: { items: [{ upc: '6291108730515', qty: 1 }], buyer: { ...buyer, state: 'TX', zip: '73301', city: 'Austin' }, payment: OKCARD } });
  let bo = (await j('/api/admin/orders')).find((x) => x.number === big.order.number); mstate = await mj('/__state');
  ok(big.ok && bo.status === 'pagado' && bo.review && !mstate.ss.orders.some((x) => x.orderNumber === bo.number), 'pedido sobre el umbral: pagado pero retenido, no pasa a ShipStation');
  await j('/api/admin/orders/approve', { method: 'POST', body: { number: bo.number } }); mstate = await mj('/__state');
  ok(mstate.ss.orders.some((x) => x.orderNumber === bo.number), 'al aprobarlo, sale a ShipStation');
  await j('/api/admin/pricing', { method: 'POST', body: { fraud: { reviewOver: 0 } } });
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  let rep = (await j('/api/admin/tax-report?month=' + month)).report; const fl = rep.rows.find((x) => x.state === 'FL'); const tx = rep.rows.find((x) => x.state === 'TX');
  ok(fl && fl.orders === 1 && fl.tax === expTax && fl.taxable === sub && tx && tx.tax === bo.totals.tax && rep.totals.tax === Math.round((expTax + bo.totals.tax) * 100) / 100, `reporte del mes: Florida $${expTax} y Texas $${bo.totals.tax} de impuesto cobrado`);
  const csv = await (await raw('/api/admin/tax-report?format=csv&month=' + month)).text();
  ok(csv.includes(`${month},FL,Florida,1,`) && csv.includes(',TOTAL,'), 'el reporte se descarga en CSV para el contador');
  const rf = await j('/api/admin/refund', { method: 'POST', body: { number: bo.number } }); mstate = await mj('/__state');
  bo = (await j('/api/admin/orders')).find((x) => x.number === bo.number); rep = (await j('/api/admin/tax-report?month=' + month)).report;
  ok(rf.ok && rf.full && mstate.square.refunds[0].amount_money.amount === Math.round(bo.totals.total * 100) && bo.status === 'cancelado' && bo.refund.full && !rep.rows.find((x) => x.state === 'TX') && rep.refunds.length === 1, 'reembolso total: Square devuelve el dinero, el pedido se cancela y sale del reporte');
  const evt = JSON.stringify({ type: 'dispute.created', data: { object: { dispute: { id: 'dp1', state: 'EVIDENCE_REQUIRED', reason: 'FRAUDULENT', amount_money: { amount: 100 }, disputed_payment: { payment_id: o.payment.id } } } } });
  ok((await fetch(B + '/api/square/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-square-hmacsha256-signature': 'falsa' }, body: evt })).status === 401, 'un aviso de Square con firma falsa se rechaza');
  const sig = crypto.createHmac('sha256', 'sqsig').update(B + '/api/square/webhook' + evt).digest('base64');
  await fetch(B + '/api/square/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-square-hmacsha256-signature': sig }, body: evt });
  ok((await j('/api/admin/orders')).find((x) => x.number === o.number).dispute.reason === 'FRAUDULENT', 'con firma válida, la disputa queda marcada en el pedido');
  const X = { 'X-Forwarded-For': '7.7.7.7' }; let lastDecl;
  for (let i = 0; i < 5; i++) lastDecl = await raw('/api/orders', { method: 'POST', headers: { ...T, ...X }, body: { items: [{ upc: '6291108730515', qty: 1 }], buyer: { ...buyer, email: `bot${i}@x.test` }, payment: { sourceId: 'cnon:card-nonce-declined' } } });
  ok(lastDecl.status === 429, 'tras 4 tarjetas rechazadas seguidas, esa IP queda bloqueada una hora (prueba de tarjetas robadas)');

  await mj('/__set', { shipments: [{ orderNumber: o.number, trackingNumber: '9400111899223344556677', carrierCode: 'stamps_com', voided: false }] });
  ok((await raw('/api/shipstation/webhook?secret=mal', { method: 'POST', body: {} })).status === 401, 'el aviso de ShipStation exige el secreto');
  const hook = await j('/api/shipstation/webhook?secret=hook', { method: 'POST', body: { resource_url: M + '/ss/shipments?batchId=1', resource_type: 'SHIP_NOTIFY' } });
  const mine = await j('/api/my/orders', { headers: T }); const mo = mine.orders.find((x) => x.number === o.number);
  ok(hook.ok && hook.updated[0] === o.number && mo.status === 'enviado' && mo.fulfillment.tracking === '9400111899223344556677' && mo.fulfillment.carrier === 'USPS', 'ShipStation avisa la etiqueta: el pedido queda "enviado" con su guía y el cliente la ve');
  ok(!(await j('/api/shipstation/webhook?secret=hook', { method: 'POST', body: { resource_url: 'http://169.254.169.254/x', resource_type: 'SHIP_NOTIFY' } })).ok, 'un aviso con dirección ajena a ShipStation se rechaza');

  console.log('\neBay');
  let es = await j('/api/admin/ebay/status'); ok(es.appReady && !es.connected, 'llaves cargadas, falta dar el permiso');
  const go = await raw('/api/admin/ebay/connect'); const loc = new URL(go.headers.get('location'));
  ok(go.status === 302 && loc.pathname === '/ebay-auth/oauth2/authorize' && loc.searchParams.get('redirect_uri') === 'NVOS-RuName' && /sell\.inventory/.test(loc.searchParams.get('scope')), '"Conectar con eBay" lleva a la pantalla de permiso de eBay');
  const cb = await raw(`/api/admin/ebay/callback?code=abc&state=${encodeURIComponent(loc.searchParams.get('state'))}`);
  es = await j('/api/admin/ebay/status');
  ok(cb.status === 302 && es.connected && es.config.fulfillmentPolicyId === 'FP1' && es.config.merchantLocationKey === 'miami-1' && !es.config.missing.length, 'permiso guardado; encuentra solas las políticas y el almacén');
  const pubr = await j('/api/admin/channels/publish', { method: 'POST', body: { channel: 'ebay', limit: 5 } });
  es = await until(async () => { const s = await j('/api/admin/ebay/status'); return s.job && !s.job.running && s.job.finishedAt ? s : null; }, 'publicación de eBay termina');
  mstate = await mj('/__state');
  ok(pubr.ok && es.job.ok === 5 && es.job.failed === 0 && es.listings === 5 && mstate.ebay.published.length === 5, 'publica 5 productos de prueba: ficha + oferta + anuncio');
  const it = mstate.ebay.items['8411061043868']; const of = Object.values(mstate.ebay.offers).find((x) => x.sku === '8411061043868');
  ok(it.product.title === 'Carolina Herrera 212 Eau de Toilette 3.4 oz for Men' && it.product.upc[0] === '8411061043868' && it.product.imageUrls.length === 1 && it.product.aspects.Type[0] === 'Eau de Toilette' && it.product.aspects.Volume[0] === '3.4 oz', 'el anuncio lleva título completo, UPC, foto y características');
  ok(of.categoryId === '11850' && of.pricingSummary.price.value === '82.99' && of.availableQuantity === 49 && /bergamot/.test(of.listingDescription), 'la oferta lleva categoría de hombre, precio con comisión (82.99), cantidad y descripción');
  await mj('/__set', { ebayOrders: [{ orderId: '12-34567-89012', orderPaymentStatus: 'PAID', buyer: { username: 'buyer_1' }, pricingSummary: { total: { value: '165.98' }, deliveryCost: { value: '0.0' } },
    fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: 'Ana Smith', email: 'x@members.ebay.com', primaryPhone: { phoneNumber: '3055550100' }, contactAddress: { addressLine1: '1 Main St', city: 'Austin', stateOrProvince: 'TX', postalCode: '73301', countryCode: 'US' } } } }],
    lineItems: [{ lineItemId: 'LI1', sku: '8411061043868', quantity: 2, title: '212', lineItemCost: { value: '165.98' } }] }] });
  const imp1 = await j('/api/admin/ebay/import', { method: 'POST', body: {} }); const imp2 = await j('/api/admin/ebay/import', { method: 'POST', body: {} });
  const eo = (await j('/api/admin/orders')).find((x) => x.channel === 'ebay'); mstate = await mj('/__state');
  ok(imp1.imported === 1 && imp2.imported === 0 && eo.status === 'pagado' && eo.items[0].qty === 2 && eo.items[0].supplierQty === 2 && eo.buyer.city === 'Austin', 'la venta de eBay entra una sola vez como pedido pagado');
  ok(mstate.ss.orders.some((x) => x.orderNumber === eo.number && x.advancedOptions.source === 'ebay'), 'y pasa sola a ShipStation');
  const sy = await j('/api/admin/ebay/sync', { method: 'POST', body: {} }); mstate = await mj('/__state');
  ok(sy.ok && sy.updated === 1 && mstate.ebay.bulk[0].requests[0].sku === '8411061043868' && mstate.ebay.bulk[0].requests[0].offers[0].availableQuantity === 47, 'el anuncio de eBay baja de 49 a 47 unidades');
  await j('/api/admin/orders/status', { method: 'POST', body: { number: eo.number, status: 'enviado', carrier: 'USPS', tracking: '9400 1118 9922' } }); mstate = await mj('/__state');
  ok(mstate.ebay.fulfillments[0].orderId === '12-34567-89012' && mstate.ebay.fulfillments[0].trackingNumber === '940011189922' && mstate.ebay.fulfillments[0].lineItems[0].lineItemId === 'LI1', 'al despachar, la guía se sube a la venta de eBay');

  console.log('\nSeguridad del panel');
  const home = await raw('/'); const csp = home.headers.get('content-security-policy') || '';
  const scriptSrc = (csp.match(/script-src[^;]*/) || [''])[0];
  ok(!scriptSrc.includes('unsafe-inline') && csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'") && scriptSrc.includes(M) && home.headers.get('x-frame-options') === 'DENY', 'la tienda no permite scripts incrustados ni que la metan en un marco');
  const adm = await raw('/panel-nvos'); const acsp = adm.headers.get('content-security-policy') || '';
  ok(adm.status === 200 && /script-src 'self';/.test(acsp) && !acsp.includes('jsdelivr') && (await raw('/admin')).status === 404 && (await raw('/admin.html')).status === 404, 'el panel vive en su propia dirección; /admin ya no existe');
  const anon = await fetch(B + '/api/admin/catalog'); const asUser = await fetch(B + '/api/admin/catalog', { headers: T });
  ok(anon.status === 401 && asUser.status === 401, 'sin sesión del panel no hay datos, ni siquiera con una cuenta de cliente que use el correo de la dueña');
  const xo = await fetch(B + '/api/admin/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  ok(xo.status === 403, 'una página ajena no puede dar órdenes al panel aunque la dueña tenga la sesión abierta');
  const ua2 = await fetch(B + '/api/admin/catalog', { headers: { Cookie: cookie, 'User-Agent': 'otro-navegador' } });
  ok(ua2.status === 401, 'una cookie de sesión copiada a otro navegador no sirve');
  await j('/api/admin/login', { method: 'POST', body: { password: 'smoke' } });
  const fa = await j('/api/admin/2fa/setup', { method: 'POST', body: {} });
  ok(fa.ok && /^[A-Z2-7]{32}$/.test(fa.secret) && totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000) === '287082', 'genera la clave para la app autenticadora (cálculo verificado con el vector oficial)');
  ok(!(await j('/api/admin/2fa/enable', { method: 'POST', body: { code: '000000' } })).ok && (await j('/api/admin/2fa/enable', { method: 'POST', body: { code: totp(fa.secret) } })).ok, 'la verificación en 2 pasos solo se activa con un código correcto');
  await j('/api/admin/logout', { method: 'POST', body: {} });
  const l1 = await j('/api/admin/login', { method: 'POST', body: { password: 'smoke' } });
  const l2 = await j('/api/admin/login', { method: 'POST', body: { password: 'smoke', code: totp(fa.secret) } });
  ok(!l1.ok && l1.need2fa && !l2.ok, 'con la contraseña sola ya no se entra, y un código ya usado no vale dos veces');
  const l3 = await j('/api/admin/login', { method: 'POST', body: { password: 'smoke', code: totp(fa.secret, Date.now() + 30000) } });
  ok(l3.ok && (await j('/api/admin/session')).admin, 'contraseña + código nuevo: entra');
  const H = { 'X-Forwarded-For': '1.2.3.4, 9.9.9.9' }; let last;
  for (let i = 0; i < 6; i++) last = await raw('/api/admin/login', { method: 'POST', headers: { ...H, Cookie: '' }, body: { password: 'adivinando' + i } });
  const lastJ = await last.json(); const spoof = await raw('/api/admin/login', { method: 'POST', headers: { 'X-Forwarded-For': '5.5.5.5, 9.9.9.9', Cookie: '' }, body: { password: 'x' } });
  ok(last.status === 429 && /Espera/.test(lastJ.error) && spoof.status === 429, '5 contraseñas malas bloquean esa IP 15 minutos, aunque el atacante falsee la cabecera de IP');
  const sec = await j('/api/admin/security');
  ok(sec.twoFa && sec.log.some((l) => l.action === 'acceso_fallido' && l.ip === '9.9.9.9') && sec.log.some((l) => l.action === 'acceso') && sec.log.some((l) => l.action === 'refund'), 'la bitácora registra accesos, intentos fallidos y cambios');

  console.log('\nCancelación');
  const canc = await j('/api/admin/orders/status', { method: 'POST', body: { number: o.number, status: 'cancelado' } });
  cat = await j('/api/admin/catalog'); gg = by(UPC);
  ok(canc.ok && gg.ownFree === 2 && gg.stock === 33, 'cancelar devuelve el stock (mis 2 unidades vuelven a estar libres)');

  console.log('\nIntegridad del carrito y del panel');
  /* Sobreventa: el mismo UPC repetido en varias líneas se suma antes de mirar el stock.
     Hay 33 unidades: 5 líneas de 20 (100 unidades) tiene que rechazarse, no cobrarse. */
  const many = Array.from({ length: 5 }, () => ({ upc: UPC, qty: 20 }));
  const over = await raw('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: many, buyer } });
  const overJ = await over.json().catch(() => ({}));
  ok(!over.ok && /quedan 33|33 left/i.test(overJ.error || ''), 'repetir el mismo producto en varias líneas no permite sobrevender');
  /* Y repartido dentro del stock disponible cuenta como una sola línea con la suma:
     2+3 en dos líneas debe costar lo mismo que 5 en una. */
  const split = await j('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 2 }, { upc: UPC, qty: 3 }], buyer } });
  const junta = await j('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 5 }], buyer } });
  ok(split.ok && junta.ok && split.totals.subtotal === junta.totals.subtotal && split.totals.total === junta.totals.total,
    'dos líneas del mismo producto suman como una sola de 5 unidades');
  /* Cantidades con basura pegada se rechazan en vez de redondearse. */
  const junk = await raw('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: '2abc' }], buyer } });
  const junk2 = await raw('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 1.5 }], buyer } });
  ok(!junk.ok && !junk2.ok, 'una cantidad inválida ("2abc", 1.5) se rechaza');

  /* El JavaScript del panel no se sirve en /admin.js: ahí cualquiera leería cómo está hecho
     el panel y qué rutas tiene. Solo se sirve bajo la dirección secreta. */
  const ajsPublico = await raw('/admin.js');
  const ahtmlPublico = await raw('/admin.html');
  const panelHtml = await (await raw('/panel-nvos')).text();
  const ajsSecreto = await raw('/panel-nvos/admin.js');
  ok(ajsPublico.status === 404 && ahtmlPublico.status === 404 && ajsSecreto.ok
    && /panel-nvos\/admin\.js/.test(panelHtml) && !/__ADMIN_JS_SRC__/.test(panelHtml),
    'el JavaScript del panel solo se sirve desde su dirección secreta, no en /admin.js');

  /* La librería de Supabase se sirve desde el propio sitio: si viniera de un CDN alterado
     podría robar la contraseña y la sesión de cada cliente al iniciar sesión. */
  const lib = await raw('/vendor/supabase-js-2.45.4.min.js');
  const libTxt = await lib.text();
  const portadaRes = await raw('/'); const portada = await portadaRes.text();
  const cspLib = portadaRes.headers.get('content-security-policy') || '';
  ok(lib.ok && /createClient/.test(libTxt) && !/jsdelivr/i.test(portada) && !/jsdelivr/i.test(cspLib),
    'la librería de Supabase se sirve desde el propio sitio y jsDelivr ya no está permitido');
  /* Y la carpeta de librerías no deja salir a otros archivos del proyecto. */
  const fuga = await raw('/vendor/../server.js');
  ok(!fuga.ok || !/ADMIN_PASSWORD/.test(await fuga.text()), 'la carpeta de librerías no sirve archivos del proyecto');

  /* Referidos: una compra sin cuenta verificada no paga sola la comisión al dueño del código
     (si no, el propio dueño compra como invitado y cobra descuento y comisión a la vez). */
  const rc = await j('/api/admin/referrals/code', { method: 'POST', body: { email: 'dueno@ejemplo.test', code: 'DUENO-1' } });
  const gde = await j('/api/orders', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 1 }], buyer: { ...buyer, email: 'otro@ejemplo.test' }, referralCode: 'DUENO-1', payment: OKCARD } });
  const refs = await j('/api/admin/referrals');
  const mio = (Array.isArray(refs) ? refs : refs.codes || []).find((x) => x.code === 'DUENO-1');
  ok(rc.ok && gde.ok && gde.order.totals.discount > 0 && Number(mio.balance || 0) === 0, 'con el código aplicado el comprador ahorra, pero la comisión del dueño queda retenida');
  const apr = await j('/api/admin/referrals/approve', { method: 'POST', body: { number: gde.order.number } });
  const refs2 = await j('/api/admin/referrals');
  const mio2 = (Array.isArray(refs2) ? refs2 : refs2.codes || []).find((x) => x.code === 'DUENO-1');
  ok(apr.ok && apr.credited > 0 && Number(mio2.balance || 0) === apr.credited, 'la dueña aprueba la comisión desde el panel y ahí sí se abona');

  /* Un aviso de marketplace repetido (reintento del canal) no puede crear dos pedidos
     ni descontar el stock dos veces. */
  const wh = { externalId: 'WMT-REPETIDO-1', items: [{ upc: '6291108730515', qty: 1, price: 82.99 }], total: 82.99,
    buyer: { name: 'Cliente Walmart', email: 'wm@ejemplo.test', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' } };
  const envia = () => fetch(B + '/api/channels/walmart/order', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Channel-Secret': 'hook' }, body: JSON.stringify(wh) }).then((r) => r.json());
  const w1 = await envia(); const w2 = await envia();
  const wOrders = (await j('/api/admin/orders')).filter((x) => (x.externalId || '') === 'WMT-REPETIDO-1');
  ok(w1.ok && w2.ok && w2.duplicate === true && w1.order === w2.order && wOrders.length === 1, 'un aviso de marketplace repetido no crea un segundo pedido');

  /* Impuesto: el estado se comprueba contra el código postal. Con Florida al 6 % activo,
     declarar Oregon (sin impuesto) con un ZIP de Miami no puede salir sin impuesto. */
  const realFL = await j('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 1 }], buyer } });
  const fakeOR = await raw('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 1 }], buyer: { ...buyer, state: 'Oregon' } } });
  const fakeORj = await fakeOR.json().catch(() => ({}));
  ok(realFL.ok && (!fakeORj.ok || fakeORj.totals.tax === realFL.totals.tax), 'elegir un estado sin impuesto con un ZIP de Florida no evita el impuesto');
  /* Y declarar otro país con dirección de entrega en EE. UU. tampoco. */
  const fakeCA = await j('/api/orders/quote', { method: 'POST', headers: { Cookie: '' }, body: { items: [{ upc: UPC, qty: 1 }], buyer: { ...buyer, country: 'Canada' } } });
  ok(fakeCA.ok && fakeCA.totals.tax === realFL.totals.tax, 'declarar otro país con ZIP de EE. UU. no evita el impuesto');
  ok(tax.stateFromZip('33139') === 'FL' && tax.stateFromZip('97201') === 'OR' && tax.stateFromZip('10001') === 'NY' && tax.stateFromZip('abc') === '', 'el código postal identifica bien su estado');
  /* Nada se publica con precio 0: un costo inválido del proveedor dejaría la mercancía
     casi gratis, y esos productos se quedan fuera del catálogo. */
  const pub = (await j('/api/catalog')).products;
  ok(pub.length > 0 && pub.every((p) => Number(p.sell) > 0), 'nada se publica con precio 0 (costo inválido del proveedor)');

  /* Un ADMIN_PASSWORD_HASH mal pegado no debe abrir el panel con cualquier contraseña. */
  const bootAdmin = async (hash) => {
    const p2 = PORT + 2, b2 = `http://localhost:${p2}`;
    const s2 = spawn(process.execPath, [path.join(root, 'server.js')],
      { env: { ...env, PORT: p2, ADMIN_PASSWORD: '', ADMIN_PASSWORD_HASH: hash, ADMIN_TOTP_SECRET: '' }, stdio: ['ignore', 'ignore', 'ignore'] });
    try {
      await until(async () => { try { return (await fetch(b2 + '/config.js')).ok; } catch (_) { return false; } }, 'arranca el servidor de prueba del panel');
      const tryPw = async (password) => (await fetch(b2 + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).then((r) => r.json()).catch(() => ({}))).ok === true;
      return { vacia: await tryPw(''), cualquiera: await tryPw('loquesea') };
    } finally { s2.kill(); }
  };
  const pegadoEntero = await bootAdmin('ADMIN_PASSWORD_HASH=scrypt:4f3a2b1c8d9e0f11:9b2c7d');
  ok(!pegadoEntero.vacia && !pegadoEntero.cualquiera, 'pegar la línea entera en ADMIN_PASSWORD_HASH no abre el panel con contraseña vacía');
  const truncado = await bootAdmin('scrypt:4f3a2b1c8d9e0f11:');
  ok(!truncado.vacia && !truncado.cualquiera, 'un hash truncado no abre el panel con cualquier contraseña');

  /* En producción sin Supabase, un token "dev:" inventado no debe dar acceso a la cuenta de nadie. */
  const p3 = PORT + 3, b3 = `http://localhost:${p3}`;
  const s3 = spawn(process.execPath, [path.join(root, 'server.js')],
    { env: { ...env, PORT: p3, NODE_ENV: 'production', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', SESSION_SECRET: 'x'.repeat(40) }, stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    await until(async () => { try { return (await fetch(b3 + '/config.js')).ok; } catch (_) { return false; } }, 'arranca el servidor en modo producción');
    const forged = await fetch(b3 + '/api/my/orders', { headers: { Authorization: 'Bearer dev:victima@gmail.com:Victima' } });
    ok(forged.status === 401, 'en producción un token "dev:" falsificado no entra como otro cliente');
  } finally { s3.kill(); }

  console.log(`\nTodo bien: ${n} comprobaciones.`);
})().then(() => 0, (e) => { console.error('\n' + e.message); return 1; }).then((code) => { if (srv) srv.kill(); if (ms) ms.srv.close(); restore(); process.exit(code); });
