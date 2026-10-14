'use strict';
/*
 * Impuesto a las ventas (sales tax) por estado de EE. UU.
 *
 * - La tabla trae los 50 estados y DC con la tasa ESTATAL vigente al 1 de julio de 2026
 *   (Tax Foundation). `local` es el promedio de los impuestos locales, solo como referencia.
 * - Cada estado tiene: `collect` (si la tienda cobra allí), `rate` (lo que se cobra, editable)
 *   y `shipping` (si el envío también paga impuesto en ese estado).
 * - Por defecto NO se cobra en ningún estado: la dueña activa solo aquellos donde está
 *   registrada para cobrar (su estado y los que le indique su contador por "nexus").
 * - El impuesto se calcula siempre en el servidor, sobre (subtotal − descuento) y, si aplica,
 *   el envío, según el estado de entrega.
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const STATES = [
  ['AL', 'Alabama', 4, 5.46], ['AK', 'Alaska', 0, 1.82], ['AZ', 'Arizona', 5.6, 2.94], ['AR', 'Arkansas', 6.5, 2.98], ['CA', 'California', 7.25, 1.78],
  ['CO', 'Colorado', 2.9, 4.99], ['CT', 'Connecticut', 6.35, 0], ['DE', 'Delaware', 0, 0], ['DC', 'District of Columbia', 6, 0], ['FL', 'Florida', 6, 0.98],
  ['GA', 'Georgia', 4, 3.56], ['HI', 'Hawaii', 4, 0.5], ['ID', 'Idaho', 6, 0.03], ['IL', 'Illinois', 6.25, 2.73], ['IN', 'Indiana', 7, 0],
  ['IA', 'Iowa', 6, 0.94], ['KS', 'Kansas', 6.5, 2.21], ['KY', 'Kentucky', 6, 0], ['LA', 'Louisiana', 5, 5.13], ['ME', 'Maine', 5.5, 0],
  ['MD', 'Maryland', 6, 0], ['MA', 'Massachusetts', 6.25, 0], ['MI', 'Michigan', 6, 0], ['MN', 'Minnesota', 6.875, 1.26], ['MS', 'Mississippi', 7, 0.06],
  ['MO', 'Missouri', 4.225, 4.22], ['MT', 'Montana', 0, 0], ['NE', 'Nebraska', 5.5, 1.48], ['NV', 'Nevada', 6.85, 1.39], ['NH', 'New Hampshire', 0, 0],
  ['NJ', 'New Jersey', 6.625, 0], ['NM', 'New Mexico', 4.875, 2.8], ['NY', 'New York', 4, 4.54], ['NC', 'North Carolina', 4.75, 2.35], ['ND', 'North Dakota', 5, 2.09],
  ['OH', 'Ohio', 5.75, 1.54], ['OK', 'Oklahoma', 4.5, 4.56], ['OR', 'Oregon', 0, 0], ['PA', 'Pennsylvania', 6, 0.34], ['RI', 'Rhode Island', 7, 0],
  ['SC', 'South Carolina', 6, 1.49], ['SD', 'South Dakota', 4.2, 1.91], ['TN', 'Tennessee', 7, 2.61], ['TX', 'Texas', 6.25, 1.95], ['UT', 'Utah', 6.1, 1.32],
  ['VT', 'Vermont', 6, 0.43], ['VA', 'Virginia', 5.3, 0.47], ['WA', 'Washington', 6.5, 3.07], ['WV', 'West Virginia', 6, 0.6], ['WI', 'Wisconsin', 5, 0.72], ['WY', 'Wyoming', 4, 1.39],
].map(([code, name, state, local]) => ({ code, name, state, local }));
const BY_CODE = Object.fromEntries(STATES.map((s) => [s.code, s]));
const AS_OF = '2026-07-01';

/* ── Código postal → estado ───────────────────────────────────────────────
 * Los 3 primeros dígitos del ZIP (el "prefijo de sección") identifican el estado.
 * Sirve para que nadie escoja "Oregon" (sin impuesto) con un ZIP de Florida y se
 * ahorre el impuesto: lo que el comprador escribe se comprueba contra su ZIP.
 * Rangos del Servicio Postal (USPS), inclusive. */
const ZIP_RANGES = [
  [5, 5, 'NY'], [6, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
  [50, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'], [90, 99, 'AE'], [100, 149, 'NY'], [150, 196, 'PA'],
  [197, 199, 'DE'], [200, 205, 'DC'], [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'],
  [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'],
  [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'], [430, 459, 'OH'],
  [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'],
  [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'],
  [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'],
  [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'],
  [850, 865, 'AZ'], [870, 884, 'NM'], [889, 898, 'NV'], [900, 961, 'CA'], [962, 966, 'AP'],
  [967, 968, 'HI'], [969, 969, 'GU'], [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];
/* Estado al que pertenece un ZIP, o '' si no se reconoce. */
function stateFromZip(zip) {
  const m = /^(\d{3})\d{2}(-\d{4})?$/.exec(String(zip || '').trim());
  if (!m) return '';
  const p = parseInt(m[1], 10);
  for (const [lo, hi, st] of ZIP_RANGES) if (p >= lo && p <= hi) return st;
  return '';
}
/* ¿El estado declarado cuadra con el ZIP? Si el ZIP no se reconoce no se estorba la venta. */
function zipMatchesState(zip, stateCode) {
  const from = stateFromZip(zip);
  if (!from) return true;
  return from === String(stateCode || '').toUpperCase();
}

const DEFAULTS = { timezone: 'America/New_York', states: Object.fromEntries(STATES.map((s) => [s.code, { collect: false, rate: s.state, shipping: false }])) };

/* Une lo guardado con la tabla base y limpia valores raros (tasa entre 0 y 15 %). */
function merge(saved) {
  const out = { timezone: (saved && saved.timezone) || DEFAULTS.timezone, states: {} };
  for (const s of STATES) {
    const cur = ((saved && saved.states) || {})[s.code] || {};
    const rate = cur.rate === '' || cur.rate == null || !Number.isFinite(Number(cur.rate)) ? s.state : Math.min(15, Math.max(0, Number(cur.rate)));
    out.states[s.code] = { collect: !!cur.collect, rate, shipping: !!cur.shipping };
  }
  return out;
}

/* Impuesto de un pedido. `stateCode` ya viene en 2 letras; fuera de EE. UU. no se cobra. */
function compute(tax, { country, stateCode, base, shipping }) {
  const none = { tax: 0, rate: 0, state: '', taxable: 0 };
  if (country !== 'US') return none;
  const st = ((tax && tax.states) || {})[stateCode];
  if (!st || !BY_CODE[stateCode]) return none;
  if (!st.collect || !(st.rate > 0)) return { ...none, state: stateCode };
  const taxable = round2(Math.max(0, Number(base) || 0) + (st.shipping ? Math.max(0, Number(shipping) || 0) : 0));
  return { tax: round2(taxable * st.rate / 100), rate: st.rate, state: stateCode, taxable };
}

/* Lo que la tienda necesita para mostrar el impuesto antes de pagar (solo estados donde se cobra). */
function publicTable(tax) {
  const out = {};
  for (const [code, st] of Object.entries((tax && tax.states) || {})) if (st.collect && st.rate > 0) out[code] = { rate: st.rate, shipping: !!st.shipping };
  return out;
}

const monthOf = (iso, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/New_York', year: 'numeric', month: '2-digit' }).format(new Date(iso)).slice(0, 7); } catch (_) { return String(iso || '').slice(0, 7); } };
const PAID = ['pagado', 'en_proceso', 'enviado', 'entregado'];
const paidAt = (o) => { const h = (o.history || []).find((x) => x.status === 'pagado'); return (h && h.at) || o.createdAt; };

/* Reporte del mes: lo cobrado por estado en la web, los reembolsos y, aparte, las ventas de
 * marketplaces (allí el impuesto lo cobra y lo declara el marketplace, no la tienda). */
function report(orders, tax, month, stateOf) {
  const tz = (tax && tax.timezone) || 'America/New_York';
  const rows = {}; const market = {}; const refunds = []; const detail = [];
  const row = (map, code) => (map[code] = map[code] || { state: code, name: (BY_CODE[code] || {}).name || (code === '—' ? 'Sin estado / fuera de EE. UU.' : code), orders: 0, sales: 0, shipping: 0, taxable: 0, tax: 0, total: 0 });
  for (const o of orders) {
    const t = o.totals || {}; const code = t.taxState || stateOf(o) || '—';
    if (o.refund && o.refund.at && monthOf(o.refund.at, tz) === month) refunds.push({ number: o.number, state: code, at: o.refund.at, amount: round2(o.refund.amount || 0), tax: round2(o.refund.full ? (t.tax || 0) : 0) });
    if (!PAID.includes(o.status) || monthOf(paidAt(o), tz) !== month) continue;
    const sales = round2((t.subtotal || 0) - (t.discount || 0));
    if (o.channel && o.channel !== 'web') { const r = row(market, code); r.orders += 1; r.sales = round2(r.sales + sales); r.shipping = round2(r.shipping + (t.shipping || 0)); r.total = round2(r.total + (t.total || 0)); r.channel = o.channel; continue; }
    const r = row(rows, code);
    r.orders += 1; r.sales = round2(r.sales + sales); r.shipping = round2(r.shipping + (t.shipping || 0));
    r.taxable = round2(r.taxable + (t.tax > 0 ? (t.taxable != null ? t.taxable : sales) : 0)); r.tax = round2(r.tax + (t.tax || 0)); r.total = round2(r.total + (t.total || 0));
    detail.push({ number: o.number, paidAt: paidAt(o), state: code, sales, shipping: round2(t.shipping || 0), taxRate: t.taxRate || 0, tax: round2(t.tax || 0), total: round2(t.total || 0), status: o.status, payment: (o.payment && o.payment.id) || '' });
  }
  const list = Object.values(rows).sort((a, b) => b.tax - a.tax || b.sales - a.sales);
  const sum = (arr, k) => round2(arr.reduce((s, x) => s + (x[k] || 0), 0));
  return { month, timezone: tz, rows: list, totals: { orders: list.reduce((s, x) => s + x.orders, 0), sales: sum(list, 'sales'), shipping: sum(list, 'shipping'), taxable: sum(list, 'taxable'), tax: sum(list, 'tax'), total: sum(list, 'total') },
    marketplace: Object.values(market).sort((a, b) => b.sales - a.sales), refunds, refundedTax: sum(refunds, 'tax'), detail };
}
const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(rep, kind) {
  const lines = [];
  if (kind === 'detail') {
    lines.push(['Order', 'Paid at', 'State', 'Net sales', 'Shipping', 'Tax rate %', 'Tax collected', 'Total charged', 'Status', 'Square payment']);
    for (const d of rep.detail) lines.push([d.number, d.paidAt, d.state, d.sales.toFixed(2), d.shipping.toFixed(2), d.taxRate, d.tax.toFixed(2), d.total.toFixed(2), d.status, d.payment]);
  } else {
    lines.push(['Month', 'State', 'State name', 'Orders', 'Net sales', 'Shipping', 'Taxable sales', 'Tax collected', 'Total charged']);
    for (const r of rep.rows) lines.push([rep.month, r.state, r.name, r.orders, r.sales.toFixed(2), r.shipping.toFixed(2), r.taxable.toFixed(2), r.tax.toFixed(2), r.total.toFixed(2)]);
    lines.push([rep.month, 'TOTAL', '', rep.totals.orders, rep.totals.sales.toFixed(2), rep.totals.shipping.toFixed(2), rep.totals.taxable.toFixed(2), rep.totals.tax.toFixed(2), rep.totals.total.toFixed(2)]);
    if (rep.refunds.length) { lines.push([]); lines.push(['Refunds in month', 'State', 'Order', '', 'Refunded', '', '', 'Tax refunded']); for (const f of rep.refunds) lines.push([rep.month, f.state, f.number, '', f.amount.toFixed(2), '', '', f.tax.toFixed(2)]); }
    if (rep.marketplace.length) { lines.push([]); lines.push(['Marketplace sales (tax collected and remitted by the marketplace)', 'State', 'State name', 'Orders', 'Net sales']); for (const r of rep.marketplace) lines.push([rep.month, r.state, r.name, r.orders, r.sales.toFixed(2)]); }
  }
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { STATES, BY_CODE, AS_OF, DEFAULTS, merge, compute, publicTable, report, toCsv, monthOf, PAID, stateFromZip, zipMatchesState };
