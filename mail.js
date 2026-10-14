'use strict';
/*
 * Correos con Resend (https://resend.com) — solo fetch, sin dependencias.
 * Sin RESEND_API_KEY los correos se registran en consola y no se envían.
 * Cada correo sale en el idioma en que el cliente estaba viendo la tienda (inglés por defecto).
 */
const KEY = (process.env.RESEND_API_KEY || '').trim();
const FROM = (process.env.EMAIL_FROM || 'Tienda <onboarding@resend.dev>').trim();
const REPLY_TO = (process.env.EMAIL_REPLY_TO || '').trim();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toFixed(2);

async function send({ to, subject, html }) {
  if (!to) return { ok: false, skipped: 'sin destinatario' };
  if (!KEY) { console.log(`[correo no enviado — falta RESEND_API_KEY] → ${to}: ${subject}`); return { ok: false, skipped: 'sin RESEND_API_KEY' }; }
  try {
    const body = { from: FROM, to: [to], subject, html }; if (REPLY_TO) body.reply_to = REPLY_TO;
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('[correo] error', j); return { ok: false, error: j }; }
    return { ok: true, id: j.id };
  } catch (e) { console.error('[correo] error', e.message); return { ok: false, error: e.message }; }
}

function layout(store, title, body, lang) {
  return `<!doctype html><html lang="${lang === 'es' ? 'es' : 'en'}"><body style="margin:0;background:#F6F3EC;font-family:Georgia,serif;color:#1E1A14">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E6DFD2">
    <tr><td style="background:#0E1D42;color:#E4C878;padding:22px 28px;font-size:20px;letter-spacing:.04em">${esc(store.name)}</td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 14px;font-size:24px;font-weight:600;line-height:1.25">${esc(title)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #E6DFD2;color:#6B6257;font-size:12px;font-family:Arial,sans-serif">${esc(store.name)}${store.whatsapp ? ' · WhatsApp ' + esc(store.whatsapp) : ''}</td></tr>
  </table></td></tr></table></body></html>`;
}
const p = (t) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;font-family:Arial,sans-serif">${t}</p>`;
const btn = (href, t) => `<p style="margin:20px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:#C79A3B;color:#0E1D42;text-decoration:none;font-weight:700;padding:12px 20px;font-family:Arial,sans-serif">${esc(t)}</a></p>`;

function itemsTable(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;font-family:Arial,sans-serif;font-size:14px">
  ${items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #EEE8DC">${esc(i.name)} <span style="color:#6B6257">× ${i.qty}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #EEE8DC;white-space:nowrap">${money(i.price * i.qty)}</td></tr>`).join('')}
  </table>`;
}

const STATUS_TEXT = {
  es: {
    pendiente_pago: ['Pendiente de pago', 'Recibimos tu pedido y está reservado. Te escribiremos para coordinar el pago.'],
    pagado: ['Pago confirmado', 'Tu pago quedó registrado. Empezamos a preparar tu pedido.'],
    en_proceso: ['En preparación', 'Estamos empacando tu pedido con cuidado.'],
    enviado: ['Enviado', 'Tu pedido ya va en camino.'],
    entregado: ['Entregado', 'Tu pedido fue entregado. Gracias por comprar con nosotros.'],
    cancelado: ['Cancelado', 'Tu pedido fue cancelado. Si no lo pediste tú, respóndenos a este correo.'],
  },
  en: {
    pendiente_pago: ['Awaiting payment', 'We received your order and it is reserved. We will contact you to arrange payment.'],
    pagado: ['Payment confirmed', 'Your payment has been recorded. We are getting your order ready.'],
    en_proceso: ['Preparing', 'We are carefully packing your order.'],
    enviado: ['Shipped', 'Your order is on its way.'],
    entregado: ['Delivered', 'Your order was delivered. Thank you for shopping with us.'],
    cancelado: ['Cancelled', 'Your order was cancelled. If you did not request this, just reply to this email.'],
  },
};
const L = (lang) => (lang === 'es' ? 'es' : 'en');
const alertTo = () => (process.env.ADMIN_ALERT_EMAIL || (process.env.ADMIN_EMAILS || '').split(',')[0] || '').trim();

module.exports = {
  send, STATUS_TEXT, alertTo,
  /* Avisos a la dueña: accesos al panel desde una IP nueva, pedidos retenidos, disputas */
  adminAlert(store, subject, text) {
    const to = alertTo(); if (!to) { console.log(`[aviso] ${subject}: ${text}`); return Promise.resolve({ ok: false }); }
    return send({ to, subject: `[${store.name}] ${subject}`, html: layout(store, subject, p(esc(text)), 'es') });
  },
  welcome(store, user, siteUrl, lang) {
    const es = L(lang) === 'es'; const first = user.name ? esc(user.name.split(' ')[0]) : '';
    return send({ to: user.email, subject: es ? `Bienvenido a ${store.name}` : `Welcome to ${store.name}`,
      html: layout(store, es ? `Hola${first ? ', ' + first : ''}. Ya tienes tu cuenta.` : `Hi${first ? ' ' + first : ''}, your account is ready.`,
        p(es ? 'Desde tu cuenta puedes guardar tu carrito, ver tus pedidos y seguir su estado: pago, preparación, envío y entrega.' : 'From your account you can save your cart, see your orders and follow each step: payment, preparation, shipping and delivery.') +
        p(es ? 'Encuentra fragancias originales para damas, caballeros y unisex, de las marcas que conoces.' : 'Discover original fragrances for women, men and unisex from the brands you know.') +
        btn(siteUrl + '/#/catalogo', es ? 'Ver el catálogo' : 'Browse the catalog'), lang) });
  },
  orderCreated(store, order, siteUrl) {
    const o = order; const es = L(o.lang) === 'es'; const paid = o.status === 'pagado'; const t = o.totals || {};
    const where = esc([o.buyer.address, o.buyer.city, o.buyer.state, o.buyer.zip, o.buyer.country].filter(Boolean).join(', '));
    const card = o.payment && o.payment.last4 ? ` (${esc(o.payment.brand || '')} ··${esc(o.payment.last4)})` : '';
    const lines = [`${es ? 'Subtotal' : 'Subtotal'}: ${money(t.subtotal)}`];
    if (t.discount) lines.push(`${es ? 'Descuento' : 'Discount'}: −${money(t.discount)}`);
    lines.push(`${es ? 'Envío' : 'Shipping'}: ${t.shipping ? money(t.shipping) : (es ? 'gratis' : 'free')}`);
    if (t.tax) lines.push(`${es ? 'Impuesto' : 'Sales tax'}${t.taxState ? ` (${esc(t.taxState)} ${t.taxRate}%)` : ''}: ${money(t.tax)}`);
    if (t.credit) lines.push(`${es ? 'Saldo usado' : 'Store credit'}: −${money(t.credit)}`);
    const intro = paid
      ? (es ? `Gracias, ${esc(o.buyer.name)}. Recibimos tu pago${card} y ya estamos preparando tu pedido. Te avisaremos con la guía cuando salga.` : `Thank you, ${esc(o.buyer.name)}. We received your payment${card} and are getting your order ready. We will email you the tracking number when it ships.`)
      : (es ? `Gracias, ${esc(o.buyer.name)}. Tu pedido está reservado y en estado <b>pendiente de pago</b>. Te contactaremos para coordinar el pago${store.whatsapp ? ' (o escríbenos al WhatsApp ' + esc(store.whatsapp) + ')' : ''}.`
        : `Thank you, ${esc(o.buyer.name)}. Your order is reserved and <b>awaiting payment</b>. We will contact you to arrange payment${store.whatsapp ? ' (or message us on WhatsApp ' + esc(store.whatsapp) + ')' : ''}.`);
    return send({ to: o.buyer.email, subject: paid ? (es ? `Pedido ${o.number} confirmado — ${store.name}` : `Order ${o.number} confirmed — ${store.name}`) : (es ? `Pedido ${o.number} recibido — ${store.name}` : `Order ${o.number} received — ${store.name}`),
      html: layout(store, paid ? (es ? `Pedido ${esc(o.number)} confirmado` : `Order ${esc(o.number)} confirmed`) : (es ? `Recibimos tu pedido ${esc(o.number)}` : `We received your order ${esc(o.number)}`),
        p(intro) + itemsTable(o.items) + p(lines.join(' &nbsp;·&nbsp; ') + `<br><b>Total${paid ? (es ? ' pagado' : ' paid') : ''}: ${money(t.total)}</b>`) +
        p(`${es ? 'Entrega en' : 'Delivery to'}: ${where}`) +
        (paid && o.payment && o.payment.receiptUrl ? p(`<a href="${esc(o.payment.receiptUrl)}">${es ? 'Ver el recibo del pago' : 'View payment receipt'}</a>`) : '') +
        btn(siteUrl + '/#/cuenta/pedidos', es ? 'Seguir mi pedido' : 'Track my order'), o.lang) });
  },
  orderStatus(store, order, siteUrl) {
    const lang = L(order.lang); const es = lang === 'es';
    const [title, text] = STATUS_TEXT[lang][order.status] || [order.status, ''];
    const f = order.fulfillment || {};
    const track = f.tracking ? p(`${es ? 'Guía' : 'Tracking number'}: <b>${esc(f.tracking)}</b>${f.carrier ? ' (' + esc(f.carrier) + ')' : ''}`) : '';
    return send({ to: order.buyer.email, subject: `${es ? 'Pedido' : 'Order'} ${order.number}: ${title}`,
      html: layout(store, `${es ? 'Pedido' : 'Order'} ${esc(order.number)} — ${esc(title)}`, p(esc(text)) + track + itemsTable(order.items) + btn(siteUrl + '/#/cuenta/pedidos', es ? 'Ver mi pedido' : 'View my order'), lang) });
  },
};
