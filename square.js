'use strict';
/*
 * Square — cobro con tarjeta en el checkout (Web Payments SDK + Payments API).
 *
 * Cómo viaja el dinero:
 *  1. El navegador carga el formulario de tarjeta de Square (un iframe de Square). El número
 *     de tarjeta NUNCA toca este servidor: Square lo cambia por un "token" de un solo uso.
 *  2. El navegador manda ese token junto con el pedido. El servidor calcula el total él mismo
 *     (precios, envío, impuesto) y le pide a Square cobrar exactamente esa cantidad.
 *  3. Square responde aprobado o rechazado, con las verificaciones de dirección (AVS), código
 *     de seguridad (CVV) y su evaluación de riesgo.
 *
 * Variables: SQUARE_ACCESS_TOKEN, SQUARE_APP_ID, SQUARE_LOCATION_ID (obligatorias)
 *            SQUARE_ENV=sandbox para pruebas · SQUARE_WEBHOOK_SIGNATURE_KEY (avisos de reembolsos/disputas)
 */
const crypto = require('crypto');
const env = (k) => (process.env[k] || '').trim();
const SANDBOX = env('SQUARE_ENV').toLowerCase() === 'sandbox';
const API = (env('SQUARE_API_BASE') || (SANDBOX ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com')).replace(/\/+$/, '');
const SDK = env('SQUARE_SDK_URL') || (SANDBOX ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js');
const VERSION = env('SQUARE_VERSION') || '2026-09-16';
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cents = (n) => Math.round(Number(n) * 100);

const hasCreds = () => !!(env('SQUARE_ACCESS_TOKEN') && env('SQUARE_APP_ID') && env('SQUARE_LOCATION_ID'));
const publicConfig = () => (hasCreds() ? { appId: env('SQUARE_APP_ID'), locationId: env('SQUARE_LOCATION_ID'), sdk: SDK, sandbox: SANDBOX } : null);
/* Orígenes que la política de seguridad del navegador (CSP) debe permitir en la tienda. */
function cspHosts() {
  if (!hasCreds()) return null;
  const sdk = new URL(SDK).origin;
  return { script: sdk, frame: sdk, style: sdk, connect: (SANDBOX ? 'https://pci-connect.squareupsandbox.com' : 'https://pci-connect.squareup.com') + ' https://o160250.ingest.sentry.io', font: 'https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net' };
}

async function call(method, path, body) {
  try {
    const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + env('SQUARE_ACCESS_TOKEN'), 'Content-Type': 'application/json', 'Square-Version': VERSION }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  } catch (e) { return { ok: false, status: 0, json: { errors: [{ code: 'NETWORK', detail: e.message }] } }; }
}

/* Mensajes para el cliente: claros y sin dar pistas a quien prueba tarjetas robadas. */
const DECLINE = {
  CVV_FAILURE: ['El código de seguridad (CVV) no coincide. Revísalo e inténtalo otra vez.', 'The security code (CVV) does not match. Please check it and try again.'],
  ADDRESS_VERIFICATION_FAILURE: ['El código postal no coincide con el de la tarjeta.', 'The ZIP code does not match the one on the card.'],
  INVALID_EXPIRATION: ['La fecha de vencimiento no es válida.', 'The expiration date is not valid.'],
  CARD_EXPIRED: ['La tarjeta está vencida.', 'The card has expired.'],
  INSUFFICIENT_FUNDS: ['La tarjeta no tiene fondos suficientes.', 'The card has insufficient funds.'],
  CARD_NOT_SUPPORTED: ['Ese tipo de tarjeta no se acepta. Prueba con otra.', 'That card type is not supported. Please try another card.'],
  INVALID_CARD_DATA: ['Los datos de la tarjeta no son válidos.', 'The card details are not valid.'],
  PAN_FAILURE: ['El número de tarjeta no es válido.', 'The card number is not valid.'],
  CARD_TOKEN_EXPIRED: ['El formulario de pago venció. Vuelve a escribir la tarjeta.', 'The payment form expired. Please enter your card again.'],
  CARD_TOKEN_USED: ['Ese intento de pago ya se usó. Vuelve a escribir la tarjeta.', 'That payment attempt was already used. Please enter your card again.'],
  NETWORK: ['No pudimos comunicarnos con el procesador de pagos. No se hizo ningún cargo; inténtalo de nuevo.', 'We could not reach the payment processor. You were not charged; please try again.'],
};
const GENERIC = ['El banco rechazó el pago. Prueba con otra tarjeta o contacta a tu banco.', 'The payment was declined by your bank. Please try another card or contact your bank.'];

/* Cobra un pedido. El monto sale del pedido guardado en el servidor, nunca del navegador. */
async function createPayment(order, pay) {
  const b = order.buyer || {}; const src = String((pay && pay.sourceId) || '');
  if (!src || src.length > 300) return { ok: false, code: 'NO_SOURCE', message: GENERIC };
  const body = {
    source_id: src,
    idempotency_key: (order.number + '-' + crypto.createHash('sha256').update(src).digest('hex')).slice(0, 45),
    amount_money: { amount: cents(order.totals.total), currency: 'USD' },
    autocomplete: true, location_id: env('SQUARE_LOCATION_ID'), reference_id: String(order.number).slice(0, 40),
    note: `Pedido ${order.number}`.slice(0, 500), buyer_email_address: b.email || undefined,
    shipping_address: { address_line_1: b.address, locality: b.city, administrative_district_level_1: b.stateCode || b.state, postal_code: b.zip, country: b.countryCode || 'US', first_name: String(b.name || '').split(' ')[0], last_name: String(b.name || '').split(' ').slice(1).join(' ') || undefined },
  };
  if (pay.verificationToken) body.verification_token = String(pay.verificationToken).slice(0, 300);
  const r = await call('POST', '/v2/payments', body);
  const p = r.json && r.json.payment; const err = ((r.json && r.json.errors) || [])[0];
  if (!r.ok || !p || !['COMPLETED', 'APPROVED'].includes(p.status)) {
    const code = (err && err.code) || (p && p.status) || 'DECLINED';
    return { ok: false, code, detail: (err && err.detail) || '', message: DECLINE[code] || GENERIC, paymentId: p && p.id };
  }
  const cd = p.card_details || {}; const card = cd.card || {};
  return { ok: true, payment: { provider: 'square', id: p.id, status: p.status, amount: round2(((p.amount_money || {}).amount || 0) / 100), brand: card.card_brand || '', last4: card.last_4 || '', avs: cd.avs_status || '', cvv: cd.cvv_status || '',
    risk: (p.risk_evaluation && p.risk_evaluation.risk_level) || '', receiptUrl: p.receipt_url || '', at: p.created_at || new Date().toISOString(), sandbox: SANDBOX || undefined } };
}

async function refund(order, amount, reason) {
  const pid = order.payment && order.payment.id; if (!pid) return { ok: false, note: 'Este pedido no tiene un pago de Square' };
  const amt = round2(amount || order.payment.amount || order.totals.total);
  const r = await call('POST', '/v2/refunds', { idempotency_key: (`rf-${order.number}-${cents(amt)}-${(order.refunds || []).length}`).slice(0, 45), payment_id: pid, amount_money: { amount: cents(amt), currency: 'USD' }, reason: String(reason || 'Reembolso').slice(0, 190) });
  const f = r.json && r.json.refund; const err = ((r.json && r.json.errors) || [])[0];
  if (!r.ok || !f) return { ok: false, note: (err && (err.detail || err.code)) || `Square respondió ${r.status}` };
  return { ok: true, refund: { id: f.id, status: f.status, amount: amt, at: new Date().toISOString() } };
}

/* Firma de los avisos de Square: HMAC-SHA256 de (URL del aviso + cuerpo tal cual llegó), en base64. */
function verifyWebhook(rawBody, signature, url) {
  const key = env('SQUARE_WEBHOOK_SIGNATURE_KEY'); if (!key || !signature) return false;
  const good = crypto.createHmac('sha256', key).update(url + rawBody).digest('base64');
  const a = Buffer.from(String(signature)), b = Buffer.from(good);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function test() {
  if (!hasCreds()) return { ok: false, note: 'Faltan SQUARE_ACCESS_TOKEN, SQUARE_APP_ID o SQUARE_LOCATION_ID' };
  const r = await call('GET', '/v2/locations/' + encodeURIComponent(env('SQUARE_LOCATION_ID')));
  const l = r.json && r.json.location;
  if (!r.ok || !l) return { ok: false, note: (((r.json && r.json.errors) || [])[0] || {}).detail || `Square respondió ${r.status}` };
  return { ok: true, name: l.name || l.business_name || '', status: l.status || '', currency: l.currency || '', country: l.country || '', cards: (l.capabilities || []).includes('CREDIT_CARD_PROCESSING'), sandbox: SANDBOX };
}

module.exports = { hasCreds, publicConfig, cspHosts, createPayment, refund, verifyWebhook, test, SANDBOX };
