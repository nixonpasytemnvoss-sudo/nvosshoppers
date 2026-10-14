(() => {
'use strict';
/* NVOS Shoppers Inc — tienda "Ónix" v2
   Portada de la casa + catálogo con filtros + ficha + carrito + cuenta con pedidos y estados. */
const CFG = window.APP_CONFIG || {};
/* ── Idioma ES/EN ───────────────────────────────────── */
/* La tienda abre en inglés; el botón del globo cambia a español y la elección se recuerda. */
let LANG = 'en'; try { if (localStorage.getItem('nvos_lang') === 'es') LANG = 'es'; } catch (_) {}
const TX_EN = {
  'Ir al contenido': 'Skip to content', 'Busca por producto, marca o categoría': 'Search by product, brand or category', 'Buscar': 'Search',
  'Mi cuenta': 'My account', 'Carrito': 'Cart', 'Tu carrito': 'Your cart', 'Comprar': 'Shop', 'Tu cuenta': 'Your account', 'Ayuda': 'Help',
  'Catálogo': 'Catalog', 'Marcas': 'Brands', 'Destacados': 'Featured', 'Entrar o registrarte': 'Sign in or register', 'Mis pedidos': 'My orders',
  'Finalizar compra': 'Checkout', 'Envíos y plazos': 'Shipping & delivery', 'Cambios y devoluciones': 'Returns & exchanges', 'Contacto': 'Contact',
  'Todos los derechos reservados': 'All rights reserved', 'Inicio': 'Home',
  'NVOS Shoppers Inc. Reunimos varios proveedores en un solo mercado y despachamos cada pedido desde nuestro depósito.': 'NVOS Shoppers Inc. We bring several suppliers into one marketplace and ship every order from our own warehouse.',
  'Pendiente de pago': 'Awaiting payment', 'Pagado': 'Paid', 'En preparación': 'Preparing', 'Enviado': 'Shipped', 'Entregado': 'Delivered', 'Cancelado': 'Cancelled',
  'Cacao de origen': 'Single-origin cacao', 'Despensa que viaja bien': 'Pantry that travels well', 'Frescos que llegan fríos': 'Fresh goods, delivered cold', 'Encuentra tu fragancia': 'Find your fragrance', 'Para la casa': 'For the home', 'Más de la casa': 'More from the house',
  'Este producto necesita frío. Se despacha con empaque térmico y se entrega en días hábiles para que llegue en buen estado.': 'This product needs refrigeration. It ships in thermal packaging on business days so it arrives in perfect condition.',
  'El chocolate viaja con protección térmica en temporada de calor.': 'Chocolate ships with thermal protection during warm months.',
  'Empaque reforzado para que las latas lleguen sin golpes.': 'Reinforced packaging so cans arrive dent-free.',
  '2 a 3 horas': '2 to 3 hours', '3 a 5 horas': '3 to 5 hours', '6 a 8 horas': '6 to 8 hours', '8 a 12 horas': '8 to 12 hours',
  'Ligera y fresca: ideal para el día y para reaplicar.': 'Light and fresh: perfect for daytime and easy to reapply.',
  'Equilibrio entre frescura y presencia.': 'A balance of freshness and presence.',
  'Más intensa y duradera; acompaña toda la jornada.': 'More intense and longer-lasting; carries you through the day.',
  'La expresión más concentrada. Poca cantidad, muchas horas cerca de la piel.': 'The most concentrated expression. A little goes a long way, for hours on the skin.',
  'Damas': 'Women', 'Caballeros': 'Men', 'Unisex': 'Unisex',
  'Añadir al carrito': 'Add to cart', 'Agotado': 'Sold out', 'Frío': 'Cold chain', 'Al mayor': 'Wholesale',
  'Añadido al carrito': 'Added to cart', 'Sesión cerrada': 'Signed out', 'Listo, te avisaremos de lo nuevo.': "Done — we'll let you know what's new.", 'No se pudo suscribir': "Couldn't subscribe",
  'Subtotal': 'Subtotal', 'Envío': 'Shipping', 'Total': 'Total', 'Gratis': 'Free', 'Quitar': 'Remove', 'Seguir comprando': 'Keep shopping', 'Ver el catálogo': 'Browse the catalog',
  'Tu carrito está vacío': 'Your cart is empty', 'Explora el catálogo y añade lo que te guste.': 'Browse the catalog and add what you like.',
  'Preparando la vitrina…': 'Setting up the shop…', 'Un momento.': 'One moment.',
  'No pudimos cargar el catálogo': "We couldn't load the catalog", 'Recarga la página en unos segundos.': 'Reload the page in a few seconds.',
  'Departamento': 'Department', 'Categoría': 'Category', 'Marca': 'Brand', 'Precio': 'Price', 'Mín.': 'Min.', 'Máx.': 'Max.', 'Aplicar': 'Apply',
  'Disponibilidad': 'Availability', 'Solo con stock': 'In stock only', 'Con precio al mayor': 'With wholesale price', 'Destacados y ofertas': 'Featured & deals',
  'Quitar todos los filtros': 'Clear all filters', 'Filtrar': 'Filter', 'Ordenar por': 'Sort by', 'Relevancia': 'Relevance', 'Nombre': 'Name',
  'Precio: menor a mayor': 'Price: low to high', 'Precio: mayor a menor': 'Price: high to low', 'Mayor descuento': 'Biggest discount',
  'Sin coincidencias': 'No matches', 'Prueba quitando algún filtro.': 'Try removing a filter.', 'Para': 'For', 'Búsqueda': 'Search', 'Todo': 'All', 'Todos': 'All', '− Ver menos': '− Show fewer',
  'Colección completa': 'Full collection', 'Todo el catálogo': 'The whole catalog', 'Destacados de la casa': 'House picks',
  'Nuestras casas': 'Our houses', 'Elige tu marca': 'Pick your brand', 'Toca una marca para ver solo sus productos.': 'Tap a brand to see only its products.',
  'Departamentos': 'Departments', '¿Qué buscas hoy?': 'What are you looking for today?', 'producto': 'product', 'productos': 'products', 'marca': 'brand', 'marcas': 'brands',
  'Selección': 'Selection', 'Ver todos los destacados': 'See all featured', 'Recién llegados': 'Just in', 'Nuevos ingresos': 'New arrivals', 'Ver todo el catálogo': 'See the whole catalog',
  'Novedades': 'News', 'Avisos de nuevos ingresos y reposiciones. Sin saturar tu correo.': 'New arrivals and restock alerts. No inbox overload.', 'Suscribirme': 'Subscribe',
  'Selección de la casa': 'House selection', 'Explora el mercado': 'Explore the market', 'Productos': 'Products', 'Unidades en stock': 'Units in stock',
  '100 % original': '100% original', 'Producto garantizado': 'Guaranteed product', 'Pago seguro': 'Secure payment', 'Confirmación por correo': 'Email confirmation',
  'Envío asegurado': 'Insured shipping', 'A todo el país, con guía': 'Nationwide, with tracking', 'Seguimiento': 'Tracking', 'El estado de tu pedido, en tu cuenta': 'Your order status, in your account',
  'Nuestras marcas': 'Our brands', 'Casa de compras': 'House of shopping', 'Tu mercado global, con elegancia.': 'Your global market, with elegance.',
  'Todavía no hay productos publicados': 'No products published yet', 'El catálogo se está preparando. Vuelve en unos minutos.': 'The catalog is being prepared. Come back in a few minutes.',
  'Elegantes. Radiantes. Inolvidables.': 'Elegant. Radiant. Unforgettable.', 'Firmes. Refinados. Clásicos.': 'Bold. Refined. Timeless.', 'Modernos. Versátiles. Distintos.': 'Modern. Versatile. Distinctive.',
  'Compra por categoría': 'Shop by category', 'Para ella, para él, para todos': 'For her, for him, for everyone',
  'Aromas femeninos que unen flores suaves con notas cálidas y sensuales: una fragancia propia para cada ánimo y cada momento.': 'Feminine scents that pair soft florals with warm, sensual notes: a signature fragrance for every mood and every moment.',
  'Aromas seguros de sí mismos, con cítricos frescos y maderas profundas: de los clásicos de diario a los de noche.': 'Confident scents built on fresh citrus and deep woods, from everyday classics to evening statements.',
  'Almizcles limpios y ámbares cálidos hechos para compartirse y llevarse a tu manera.': 'Clean musks and warm ambers, made to be shared and worn your way.',
  'Fragancias para damas': "Women's Fragrances", 'Fragancias para caballeros': "Men's Fragrances", 'Fragancias unisex': 'Unisex Fragrances',
  'Familias olfativas': 'Scent families', 'Compra por notas': 'Shop by notes', 'Notas': 'Notes', 'Nota': 'Note',
  'De los cítricos brillantes a las maderas cálidas y los gourmand dulces: toca una nota para ver los perfumes que la llevan.': 'From bright citrus to warm woods and sweet gourmands: tap a note to see the perfumes that feature it.',
  'Las casas que trabajamos': 'The houses we carry', 'Ver todas las marcas': 'See all brands',
  'Pago': 'Payment', 'Pagar': 'Pay', 'Confirmar pedido': 'Confirm order', 'Procesando el pago…': 'Processing payment…', 'Impuesto': 'Sales tax', 'Otro país': 'Other country', 'Elige tu estado': 'Choose your state',
  'Se calcula con tu estado': 'Calculated from your state', 'Visa, Mastercard, American Express y Discover.': 'Visa, Mastercard, American Express and Discover.', 'Cargando el formulario de pago…': 'Loading the payment form…',
  'Pago seguro procesado por Square. No vemos ni guardamos el número de tu tarjeta. El cargo se hace al confirmar y recibes el recibo por correo.': 'Secure payment processed by Square. We never see or store your card number. You are charged when you confirm, and the receipt is emailed to you.',
  'No se pudo cargar el formulario de pago. Recarga la página.': 'The payment form could not be loaded. Please reload the page.', 'Revisa los datos de la tarjeta.': 'Please check your card details.',
  'Elige tu estado y escribe un código postal de 5 dígitos.': 'Choose your state and enter a 5-digit ZIP code.', 'Pedido confirmado': 'Order confirmed',
  'Recibimos tu pago y ya estamos preparando tu pedido. Te enviamos un correo con el detalle; cuando salga, recibirás la guía de rastreo.': 'We received your payment and are getting your order ready. We emailed you the details; when it ships, you will receive the tracking number.',
  'Ver recibo': 'View receipt', 'Reembolsado': 'Refunded', 'Pagado con': 'Paid with',
  'Confirma tu correo (te enviamos un enlace al registrarte) para ver también los pedidos que hiciste antes de crear la cuenta.': 'Confirm your email (we sent you a link when you signed up) to also see orders you placed before creating the account.',
  'fragancia': 'fragrance', 'fragancias': 'fragrances', 'Ver': 'See',
  'Ese producto ya no está disponible': 'That product is no longer available', 'Volver al catálogo': 'Back to the catalog',
  'Agotado por ahora': 'Sold out for now', 'Disponible': 'Available', 'unidad': 'unit', 'unidades': 'units', 'Quedan': 'Only', 'Descripción': 'Description', 'Ficha y envío': 'Details & shipping',
  'Presentación': 'Size', 'Duración estimada': 'Estimated wear', 'Peso': 'Weight', 'Medidas (largo × ancho × alto)': 'Dimensions (L × W × H)', 'Por confirmar': 'To be confirmed',
  'Código UPC': 'UPC code', 'gratis desde': 'free over', 'Condición': 'Condition', 'Nuevo': 'New', 'Usado · casi nuevo': 'Used · like new', 'Caja abierta': 'Open box',
  'También te puede gustar': 'You may also like', 'Piezas relacionadas': 'Related pieces', 'desde': 'from', 'und': 'units', 'c/u': 'ea.',
  'Datos de entrega': 'Delivery details', 'Nombre completo': 'Full name', 'Correo electrónico': 'Email', 'Teléfono': 'Phone', 'Dirección': 'Address',
  'Calle, número, apartamento': 'Street, number, apartment', 'Ciudad': 'City', 'Estado': 'State', 'Código postal': 'ZIP code', 'País': 'Country', 'Estados Unidos': 'United States',
  'Referencias de entrega (opcional)': 'Delivery notes (optional)', 'Resumen': 'Summary', 'Reservar pedido': 'Reserve order', 'Reservando…': 'Reserving…',
  'Completa nombre, correo, dirección y ciudad.': 'Fill in name, email, address and city.', 'No se pudo conectar': "Couldn't connect", 'No se pudo crear el pedido': "Couldn't create the order",
  'Tus datos viajan cifrados y no se comparten con terceros': 'Your data travels encrypted and is never shared with third parties',
  'Código de referido (opcional)': 'Referral code (optional)', 'Código aplicado': 'Code applied', 'de descuento': 'off', 'Ese código no es válido o está inactivo': 'That code is not valid or is inactive',
  'Usar mi saldo a favor': 'Use my credit balance', 'disponible': 'available', 'Descuento': 'Discount', 'Saldo usado': 'Credit used', 'código de': 'code from',
  'Pedido reservado': 'Order reserved', 'Ver mis pedidos': 'See my orders',
  'Te enviamos un correo con el detalle y te contactaremos para coordinar el pago. Desde tu cuenta puedes seguir cada paso: pago, preparación, envío y entrega.': "We emailed you the details and we'll contact you to arrange payment. From your account you can follow every step: payment, preparation, shipping and delivery.",
  'Guía': 'Tracking no.', 'al mayor': 'wholesale', 'Entrega en': 'Delivery to',
  'Mi perfil': 'My profile', 'Mi carrito': 'My cart', 'Mis referidos': 'My referrals', 'Panel de administración': 'Admin panel', 'Cerrar sesión': 'Sign out',
  'Guarda tu dirección para que el siguiente pedido sea más rápido.': 'Save your address so your next order is faster.', 'Correo': 'Email', 'Nombre y apellido': 'First & last name',
  'Guardar dirección': 'Save address', 'Dirección guardada': 'Address saved', 'No se pudo guardar': "Couldn't save",
  'Aquí ves el estado de cada pedido: pendiente de pago, pagado, en preparación, enviado o entregado.': 'Here you can see each order status: awaiting payment, paid, preparing, shipped or delivered.',
  'Todavía no tienes pedidos': "You don't have any orders yet",
  'Se guarda en tu cuenta: lo encuentras igual desde cualquier dispositivo.': "It's saved to your account: you'll find it the same on any device.",
  'Total con envío': 'Total with shipping',
  'Entra a tu cuenta': 'Sign in to your account', 'Crea tu cuenta': 'Create your account',
  'Con tu cuenta guardas el carrito, ves tus pedidos y sigues su estado.': 'With an account you keep your cart, see your orders and follow their status.',
  'Continuar con Google': 'Continue with Google', 'o con tu correo': 'or with your email', 'Modo local: entra solo con tu correo para probar.': 'Local mode: sign in with just your email to try it out.',
  'Contraseña': 'Password', 'Entrar': 'Sign in', 'Registrarme': 'Register', 'Escribe tu correo.': 'Type your email.',
  'La contraseña necesita al menos 6 caracteres.': 'The password needs at least 6 characters.', 'Correo o contraseña incorrectos.': 'Wrong email or password.',
  'Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí para entrar.': 'We sent you an email to confirm your account. Open it and come back here to sign in.',
  '¿Primera vez?': 'First time here?', '¿Ya tienes cuenta?': 'Already have an account?', 'Entra': 'Sign in', 'Nombre': 'Name',
  'Tu código': 'Your code', 'Saldo a favor': 'Credit balance', 'Ganado en total': 'Total earned', 'Compras con tu código': 'Purchases with your code',
  'Comparte tu código: quien compre con él recibe descuento y tú ganas saldo cuando el pedido se paga. Tu saldo se descuenta en tu próxima compra.': 'Share your code: whoever buys with it gets a discount, and you earn credit when the order is paid. Your credit is applied to your next purchase.',
  'Movimientos': 'Activity', 'Sin movimientos todavía.': 'No activity yet.', 'Copiar': 'Copy', 'Código copiado': 'Code copied',
  'Ganancia': 'Earned', 'Gasto': 'Spent', 'Reverso': 'Reversed', 'Devolución': 'Refund', 'Ajuste': 'Adjustment', 'Pedido': 'Order',
  'No tienes un código de referidos activo. Pregúntanos por WhatsApp para activarte uno.': "You don't have an active referral code yet. Ask us on WhatsApp to activate one for you.",
};
const t = (s) => (LANG === 'en' ? (TX_EN[s] != null ? TX_EN[s] : s) : s);
const NOTE_L = (n) => (LANG === 'en' ? n.en : n.es);
const CATL_EN = { 'Perfumería': 'Fragrances', 'Chocolates': 'Chocolates', 'Enlatados': 'Canned Goods', 'Refrigerados': 'Refrigerated', 'Hogar y más': 'Home & More', 'Otros': 'Others' };
const catL = (k) => (LANG === 'en' ? (CATL_EN[k] || k) : k);
const CONDL = { usado_casi_nuevo: 'Usado · casi nuevo', caja_abierta: 'Caja abierta', nuevo: 'Nuevo' };
const condL = (c) => t(CONDL[c] || c);
const LOC = () => (LANG === 'en' ? 'en' : 'es');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oz2g = (oz) => Math.round(oz * 28.3495);
const in2cm = (i) => (i * 2.54).toFixed(1);
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STEPS = [['pendiente_pago', 'Pendiente de pago'], ['pagado', 'Pagado'], ['en_proceso', 'En preparación'], ['enviado', 'Enviado'], ['entregado', 'Entregado']];
const STATUS_LABEL = Object.fromEntries([...STEPS, ['cancelado', 'Cancelado']]);
const CAT_HEAD = { Chocolates: 'Cacao de origen', Enlatados: 'Despensa que viaja bien', Refrigerados: 'Frescos que llegan fríos', 'Perfumería': 'Encuentra tu fragancia', 'Hogar y más': 'Para la casa', Otros: 'Más de la casa' };
const CAT_NOTE = { Refrigerados: 'Este producto necesita frío. Se despacha con empaque térmico y se entrega en días hábiles para que llegue en buen estado.', Chocolates: 'El chocolate viaja con protección térmica en temporada de calor.', Enlatados: 'Empaque reforzado para que las latas lleguen sin golpes.' };
const S = { catalog: null, products: [], cart: [], user: null, token: '', view: 'grid', route: {}, homeF: null, lastOrder: null, myRef: undefined, coRef: null, coCredit: false };
const noteList = () => (S.catalog && S.catalog.notes) || [];
const noteInfo = (k) => noteList().find((n) => n.key === k) || { key: k, en: k, es: k, count: 0 };
const brandLogo = (b) => ((store().brandLogos || {})[b]) || '';

/* ── Utilidades ─────────────────────────────────────── */
let tt; const toast = (m) => { const el = $('#toast'); el.textContent = m; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2400); };
const store = () => (S.catalog && S.catalog.store) || CFG.store || {};
const cats = () => (store().categories || []).filter((c) => c.count > 0);
const catInfo = (key) => (store().categories || []).find((c) => c.key === key) || { key, tone: 'otro', desc: '' };
const byUpc = (upc) => S.products.find((p) => p.upc === upc || p.id === upc);
async function api(url, opts = {}) {
  const headers = { 'X-Lang': LANG, ...(opts.headers || {}) };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (opts.body && typeof opts.body !== 'string') { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  const r = await fetch(url, { ...opts, headers });
  return r.json();
}
function tint(seed) { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `linear-gradient(155deg,hsl(${h} 30% 52%),hsl(${(h + 34) % 360} 36% 34%))`; }
function pic(p) {
  const ini = esc(((p.brand || p.name || '·')[0] || '·')).toUpperCase();
  const tile = `<div class="tile" style="background:${tint(p.brand || p.name)}">${ini}</div>`;
  if (p.image) return `<img src="${esc(p.image)}" alt="${esc(p.name || '')}" loading="lazy" data-fb="tile" data-ini="${ini}" data-bg="${esc(tint(p.brand || p.name))}">`;
  return tile;
}
const off = (p) => (p.compare && p.compare > p.sell) ? Math.round((1 - p.sell / p.compare) * 100) : 0;
const isPerfume = (p) => p.category === 'Perfumería';
const LADDER = [
  { abbr: 'Eau de Cologne', pct: '2–5 %', hours: '2 a 3 horas', level: 1, note: 'Ligera y fresca: ideal para el día y para reaplicar.' },
  { abbr: 'Eau de Toilette', pct: '5–15 %', hours: '3 a 5 horas', level: 2, note: 'Equilibrio entre frescura y presencia.' },
  { abbr: 'Eau de Parfum', pct: '15–20 %', hours: '6 a 8 horas', level: 3, note: 'Más intensa y duradera; acompaña toda la jornada.' },
  { abbr: 'Extrait de Parfum', pct: '20–40 %', hours: '8 a 12 horas', level: 4, note: 'La expresión más concentrada. Poca cantidad, muchas horas cerca de la piel.' },
];
function concOf(p) {
  if (!isPerfume(p)) return null;
  const t = ((p.type || '') + ' ' + (p.name || '')).toLowerCase();
  if (/extrait|parfum\s*extract|\bpure\s*parfum\b/.test(t)) return LADDER[3];
  if (/eau\s*de\s*parfum|\bedp\b/.test(t)) return LADDER[2];
  if (/eau\s*de\s*toilette|\bedt\b/.test(t)) return LADDER[1];
  if (/cologne|\bedc\b|eau\s*fra/.test(t)) return LADDER[0];
  return null;
}
const sizeOf = (p) => { const m = String(p.name || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|oz|g|kg|lb|und|unid)\b/i); return m ? `${m[1].replace(',', '.')} ${m[2].toLowerCase()}` : null; };
function describe(p) {
  if (p.description) return p.description.replace(/<[^>]*>/g, '').trim();
  const c = concOf(p), size = sizeOf(p);
  if (c) {
    const g = p.gender || 'Unisex';
    if (LANG === 'en') return `${c.abbr} ${g === 'Unisex' ? 'unisex' : 'for ' + t(g).toLowerCase()} by ${p.brand}${size ? `, ${size}` : ''}. ${c.pct} concentration: lasts ${t(c.hours)}.`;
    return `${c.abbr} ${g === 'Unisex' ? 'unisex' : 'para ' + g.toLowerCase()} de ${p.brand}${size ? `, ${size}` : ''}. Concentración de ${c.pct}: dura entre ${c.hours}.`;
  }
  if (LANG === 'en') return `${p.type || catL(p.category)} by ${p.brand}${size ? `, ${size}` : ''}. Original product, checked before it ships.`;
  return `${p.type || p.category} de ${p.brand}${size ? `, ${size}` : ''}. Producto original, revisado antes de enviarse.`;
}
const bars = (level, mini) => `<div class="bars ${mini ? 'mini' : ''}">` + [1, 2, 3, 4].map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('') + '</div>';
const badgeOf = (p) => isPerfume(p) && p.gender ? t(p.gender) : (p.type || catL(p.category));

/* ── Supabase Auth ──────────────────────────────────── */
let sb = null;
async function initAuth() {
  if (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
    const { data } = await sb.auth.getSession();
    S.token = data.session ? data.session.access_token : '';
    sb.auth.onAuthStateChange(async (_e, session) => {
      const t = session ? session.access_token : '';
      if (t !== S.token) { S.token = t; await loadUser(); render(); }
    });
  } else {
    S.token = localStorage.getItem('devtoken') || '';
  }
  await loadUser();
}
async function loadUser() {
  if (!S.token) { S.user = null; paintAcct(); return; }
  const r = await api('/api/auth/me').catch(() => ({}));
  S.user = r.user || null;
  if (S.user) { if (S.user.isNew) toast(LANG === 'en' ? `Welcome, ${S.user.name.split(' ')[0]}. We sent you an email.` : `Bienvenido, ${S.user.name.split(' ')[0]}. Te enviamos un correo.`); await mergeCart(); }
  paintAcct();
}
function paintAcct() { $('#acctLabel').textContent = S.user ? (S.user.name || t('Mi cuenta')).split(' ')[0] : t('Mi cuenta'); }
async function signOut() {
  if (sb) await sb.auth.signOut(); else localStorage.removeItem('devtoken');
  S.token = ''; S.user = null; paintAcct(); toast(t('Sesión cerrada')); location.hash = '#/';
}

/* ── Carrito ────────────────────────────────────────── */
function loadCart() { try { S.cart = JSON.parse(localStorage.getItem('nvos_cart') || '[]'); } catch (_) { S.cart = []; } }
function saveCart() { localStorage.setItem('nvos_cart', JSON.stringify(S.cart)); paintCartCount(); if (S.user) api('/api/my/cart', { method: 'PUT', body: { items: S.cart } }).catch(() => {}); }
async function mergeCart() {
  const r = await api('/api/my/cart').catch(() => ({}));
  for (const it of (Array.isArray(r.items) ? r.items : [])) if (!S.cart.find((c) => c.upc === it.upc)) S.cart.push({ upc: it.upc, qty: it.qty });
  saveCart();
}
function cartLines() { return S.cart.map((c) => { const p = byUpc(c.upc); if (!p) return null; const wholesale = !!(p.wholesaleMin && p.wholesalePrice && c.qty >= p.wholesaleMin); const unit = wholesale ? p.wholesalePrice : p.sell; return { ...c, p, unit, wholesale, total: unit * c.qty }; }).filter(Boolean); }
function cartTotals() {
  const lines = cartLines(); const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const sh = (S.catalog && S.catalog.shipping) || { freeOver: 150, flat: 9.99, perOz: 0 };
  const oz = lines.reduce((s, l) => s + (l.p.weightOz || 0) * l.qty, 0);
  const shipping = subtotal <= 0 ? 0 : subtotal >= Number(sh.freeOver) ? 0 : Number(sh.flat || 0) + Number(sh.perOz || 0) * oz;
  return { lines, subtotal, shipping, total: subtotal + shipping, count: lines.reduce((s, l) => s + l.qty, 0), freeOver: Number(sh.freeOver) };
}
function paintCartCount() { $('#cartCount').textContent = cartTotals().count; }
function addToCart(upc, qty = 1) {
  const p = byUpc(upc); if (!p || p.stock <= 0) return;
  const it = S.cart.find((c) => c.upc === upc); const cur = it ? it.qty : 0;
  const next = Math.min(p.stock, cur + Math.max(1, qty));
  if (it) it.qty = next; else S.cart.push({ upc, qty: next });
  saveCart();
  const wholesale = p.wholesaleMin && p.wholesalePrice && next >= p.wholesaleMin;
  toast(wholesale ? (LANG === 'en' ? `Added · wholesale price applied (${money(p.wholesalePrice)} ea.)` : `Añadido · precio al mayor aplicado (${money(p.wholesalePrice)} c/u)`) : t('Añadido al carrito'));
  openCart();
}
function setQty(upc, qty) {
  const p = byUpc(upc); const it = S.cart.find((c) => c.upc === upc); if (!it) return;
  qty = parseInt(qty, 10) || 0;
  if (qty <= 0) S.cart = S.cart.filter((c) => c.upc !== upc); else it.qty = Math.min(p ? p.stock : qty, qty);
  saveCart(); paintCart(); const ac = $('#acctCart'); if (ac) { ac.innerHTML = cartTotals().lines.map(lineHtml).join(''); wireLines(ac); }
}
function openCart() { paintCart(); $('#veil').classList.add('open'); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
function closeCart() { $('#veil').classList.remove('open'); $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }
function lineHtml(l) {
  return `<div class="li" data-upc="${esc(l.upc)}">
    <div class="li-shot">${pic(l.p)}</div>
    <div class="li-mid">
      <div class="li-brand">${esc(l.p.brand)}</div>
      <div class="li-name"><a href="#/p/${encodeURIComponent(l.upc)}">${esc(l.p.name)}</a></div>
      <div style="font-size:12px;color:var(--soft);margin-top:3px">${money(l.unit)} ${t('c/u')}${l.wholesale ? `<span class="may">${t('Al mayor')}</span>` : (l.p.wholesaleMin && l.p.wholesalePrice ? `<span class="may" style="color:var(--soft)">${money(l.p.wholesalePrice)} ${t('desde')} ${l.p.wholesaleMin}</span>` : '')}</div>
      <div class="qbar"><button data-d="-1" aria-label="Quitar una">−</button><span>${l.qty}</span><button data-d="1" aria-label="Añadir una">+</button></div>
    </div>
    <div class="li-end"><div class="li-price">${money(l.total)}</div><button class="li-rm">${t('Quitar')}</button></div>
  </div>`;
}
function wireLines(root) {
  if (!root) return;
  $$('.li', root).forEach((el) => {
    const upc = el.dataset.upc; const cur = () => (S.cart.find((c) => c.upc === upc) || { qty: 0 }).qty;
    $$('button[data-d]', el).forEach((b) => b.onclick = () => setQty(upc, cur() + Number(b.dataset.d)));
    $('.li-rm', el).onclick = () => setQty(upc, 0);
    $$('a', el).forEach((a) => a.onclick = closeCart);
  });
}
function paintCart() {
  const body = $('#dBody'), foot = $('#dFoot'); const tt2 = cartTotals();
  if (!tt2.lines.length) {
    body.innerHTML = `<div class="blank"><b>${t('Tu carrito está vacío')}</b>${t('Explora el catálogo y añade lo que te guste.')}</div>`;
    foot.innerHTML = `<button class="wide soft" id="keep">${t('Ver el catálogo')}</button>`;
    $('#keep').onclick = () => { closeCart(); location.hash = '#/catalogo'; };
    return;
  }
  body.innerHTML = tt2.lines.map(lineHtml).join(''); wireLines(body);
  const falta = tt2.freeOver - tt2.subtotal;
  foot.innerHTML = `
    ${tt2.shipping > 0 && falta > 0 ? `<p class="freeline">${LANG === 'en' ? `Add ${money(falta)} more for free shipping` : `Añade ${money(falta)} más y el envío es gratis`}</p>` : ''}
    <div class="tr"><span>${t('Subtotal')}</span><span>${money(tt2.subtotal)}</span></div>
    <div class="tr"><span>${t('Envío')}</span><span>${tt2.shipping === 0 ? t('Gratis') : money(tt2.shipping)}</span></div>
    <div class="tr sum"><span>${t('Total')}</span><span class="v">${money(tt2.total)}</span></div>
    <button class="wide" id="toCo">${t('Finalizar compra')}</button>
    <button class="wide soft" id="keep">${t('Seguir comprando')}</button>`;
  $('#toCo').onclick = () => { closeCart(); location.hash = '#/checkout'; };
  $('#keep').onclick = closeCart;
}

/* ── Catálogo ───────────────────────────────────────── */
async function loadCatalog() {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch('/api/catalog'); if (r.ok) { S.catalog = await r.json(); break; } } catch (_) {}
    await new Promise((res) => setTimeout(res, 1500));
  }
  if (!S.catalog) return false;
  S.products = S.catalog.products;
  const st = S.catalog.store;
  const wm = (name) => { const parts = String(name || 'NVOS').split(/\s+/); const first = parts[0] || 'NVOS'; const mid = first.length >= 4 ? esc(first.slice(0, 2)) + '<b>' + esc(first[2]) + '</b>' + esc(first.slice(3)) : esc(first); return { n: mid.toUpperCase(), s: parts.slice(1).join(' ') }; };
  const w = wm(st.name);
  $('#storeName').innerHTML = w.n; $('#storeTag').textContent = w.s || st.tagline || ''; $('#footName').innerHTML = w.n; $('#footName2').textContent = st.name; document.title = st.name;
  if (st.whatsapp) { const wa = $('#footWa'); wa.href = 'https://wa.me/' + st.whatsapp.replace(/\D/g, ''); wa.textContent = 'WhatsApp'; wa.target = '_blank'; }
  paintFrame(); paintCartCount();
  return true;
}
function paintNav() {
  $('#catNav').innerHTML = `<a href="#/" data-r="home">${t('Inicio')}</a>` +
    cats().map((c) => `<a href="#/c/${encodeURIComponent(c.key)}" data-r="c:${esc(c.key)}">${esc(catL(c.key))}</a>`).join('') +
    `<a href="#/marcas" data-r="marcas">${t('Marcas')}</a><a class="hot" href="#/catalogo?destacados=1" data-r="dest">${t('Destacados')}</a>`;
}
function paintFrame() {
  const sk = $('.skip'); if (sk) sk.textContent = t('Ir al contenido');
  $('#q').placeholder = t('Busca por producto, marca o categoría');
  const fb = $('#finder button[type="submit"]'); if (fb) fb.textContent = t('Buscar');
  const cb = $('#cartBtn span'); if (cb) cb.textContent = t('Carrito');
  $('#dTitle').textContent = t('Tu carrito');
  $('#langLabel').textContent = LANG === 'es' ? 'English' : 'Español'; $('#langBtn').title = LANG === 'es' ? 'Switch to English' : 'Cambiar a español';
  document.title = (S.catalog && S.catalog.store.name) || document.title; const md = document.querySelector('meta[name="description"]'); if (md) md.content = LANG === 'en' ? 'Original fragrances for women, men and unisex. Secure checkout, tracked shipping and order status in your account.' : 'Fragancias originales para damas, caballeros y unisex. Compra segura, envío con guía y estado de tu pedido en tu cuenta.';
  $('#fhBuy').textContent = t('Comprar'); $('#fhAcct').textContent = t('Tu cuenta'); $('#fhHelp').textContent = t('Ayuda');
  $('#fAcctList').innerHTML = `<li><a href="#/cuenta">${t('Entrar o registrarte')}</a></li><li><a href="#/cuenta/pedidos">${t('Mis pedidos')}</a></li><li><a href="#/checkout">${t('Finalizar compra')}</a></li>`;
  $('#fHelp1').textContent = t('Envíos y plazos'); $('#fHelp2').textContent = t('Cambios y devoluciones');
  const wa = $('#footWa'); if (wa && !/wa\.me/.test(wa.href)) wa.textContent = t('Contacto');
  $('#footRights').textContent = t('Todos los derechos reservados');
  const st = (S.catalog && S.catalog.store) || {};
  if (!st.lede) $('#footTag').textContent = t('NVOS Shoppers Inc. Reunimos varios proveedores en un solo mercado y despachamos cada pedido desde nuestro depósito.');
  $('#footCats').innerHTML = `<li><a href="#/catalogo">${t('Catálogo')}</a></li>` + (S.catalog ? cats().map((c) => `<li><a href="#/c/${encodeURIComponent(c.key)}">${esc(catL(c.key))}</a></li>`).join('') : '') + `<li><a href="#/marcas">${t('Marcas')}</a></li>`;
  paintNav(); paintAcct();
}
function markNav() { const r = S.route; const key = r.name === 'cat' && r.cat ? 'c:' + r.cat : r.name === 'cat' && (r.q || {}).destacados ? 'dest' : r.name; $$('#catNav a').forEach((a) => a.classList.toggle('on', a.dataset.r === key)); }

/* ── Router ─────────────────────────────────────────── */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, ''); const [pathPart, qs] = h.split('?'); const parts = pathPart.split('/').map((x) => { try { return decodeURIComponent(x); } catch (_) { return x; } });
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const [a, b, c] = parts;
  if (!a) return { name: 'home' };
  if (a === 'catalogo') return { name: 'cat', q };
  if (a === 'c') return { name: 'cat', cat: b, q };
  if (a === 'marca') return { name: 'cat', brand: b, q };
  if (a === 'marcas') return { name: 'marcas' };
  if (a === 'p') return { name: 'product', id: b };
  if (a === 'checkout') return { name: 'checkout' };
  if (a === 'gracias') return { name: 'gracias', number: b };
  if (a === 'cuenta') return { name: 'cuenta', tab: b || 'perfil', id: c };
  if (a === 'ayuda') return { name: 'ayuda' };
  return { name: 'home' };
}
async function render() {
  const prev = S.route.name; S.route = parseRoute(); markNav(); closeCart();
  if (!(prev === 'cat' && S.route.name === 'cat')) window.scrollTo({ top: 0 });
  const main = $('#main');
  if (!S.catalog) { main.innerHTML = `<div class="wrap page"><div class="blank"><b>${t('Preparando la vitrina…')}</b>${t('Un momento.')}</div></div>`; return; }
  const v = { home, cat, marcas, product, checkout, gracias, cuenta, ayuda }[S.route.name] || home;
  main.innerHTML = await v();
  wireView();
}
function wireView() {
  $$('[data-add]').forEach((b) => b.onclick = () => addToCart(b.dataset.add, parseInt(($('#qv') || {}).textContent, 10) || 1));
  $$('[data-scroll]').forEach((b) => b.onclick = (e) => { e.preventDefault(); const el = $('#' + b.dataset.scroll); if (el) el.scrollIntoView({ behavior: 'smooth' }); });
  const nf = $('#newsForm'); if (nf) nf.onsubmit = async (e) => { e.preventDefault(); const em = $('input', nf).value; const r = await api('/api/newsletter', { method: 'POST', body: { email: em } }); toast(r.ok ? t('Listo, te avisaremos de lo nuevo.') : (r.error || t('No se pudo suscribir'))); if (r.ok) nf.reset(); };
  const w = { cat: wireCatRoute, product: wireProduct, checkout: wireCheckout, cuenta: wireCuenta, home: wireHome }[S.route.name]; if (w) w();
  setupReveal();
}
function setupReveal() {
  if (!('IntersectionObserver' in window)) { $$('.reveal').forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));
}

/* ── Tarjeta de producto ────────────────────────────── */
function card(p) {
  const out = p.stock <= 0, c = concOf(p), o = off(p), href = '#/p/' + encodeURIComponent(p.upc || p.id);
  const mayor = p.wholesaleMin && p.wholesalePrice;
  return `<article class="pcard ${out ? 'gone' : ''}">
    <a class="pshot" href="${href}" aria-label="Ver ${esc(p.name)}">
      ${o ? `<span class="b-sale">−${o}%</span>` : ''}
      <span class="b-cat">${esc(badgeOf(p))}</span>
      ${out ? `<span class="b-out">${t('Agotado')}</span>` : p.category === 'Refrigerados' ? `<span class="b-cold">${t('Frío')}</span>` : ''}
      ${mayor ? `<span class="b-may">${t('Al mayor')}</span>` : ''}
      ${pic(p)}
    </a>
    <div class="pinfo">
      <div class="p-brand">${esc(p.brand)}</div>
      ${c ? `<div class="p-conc">${esc(c.abbr)}</div>` : ''}
      <h3 class="p-name"><a href="${href}">${esc(p.name)}</a></h3>
      <p class="p-desc">${esc(describe(p))}</p>
      ${c ? bars(c.level, true) : ''}
      <div class="p-prices">
        <span class="p-now ${o ? '' : 'plain'}">${money(p.sell)}</span>
        ${o ? `<span class="p-was">${money(p.compare)}</span>` : ''}
      </div>
      ${mayor ? `<div class="p-may">${money(p.wholesalePrice)} ${t('c/u')} ${t('desde')} ${p.wholesaleMin} ${t('und')}</div>` : ''}
      ${!out && p.stock <= 5 ? `<div class="p-left">${LANG === 'en' ? `Only ${p.stock} left` : `Quedan ${p.stock}`}</div>` : ''}
      <button class="p-add" data-add="${esc(p.upc || p.id)}" ${out ? 'disabled' : ''}>${out ? t('Agotado') : t('Añadir al carrito')}</button>
    </div>
  </article>`;
}
const railHtml = (list) => list.map(card).join('');
function brandCounts(list = S.products) { const m = new Map(); for (const p of list) if (p.brand && p.brand !== '—') m.set(p.brand, (m.get(p.brand) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')); }
const featuredList = () => S.products.filter((p) => p.stock > 0).slice().sort((a, b) => (b.featured - a.featured) || (off(b) - off(a)) || (b.sell - a.sell));
const newest = () => S.products.filter((p) => p.stock > 0).slice().sort((a, b) => (b.own - a.own) || String(b.addedAt || '').localeCompare(String(a.addedAt || ''))).slice(0, 10);

/* ── Iconos de notas olfativas (dibujos propios) ───── */
const petals = (cx, cy, oy, rx, ry, fill, stroke) => [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${cx}" cy="${oy}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${cx} ${cy})" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>`).join('');
const bell = (x, y) => `<path d="M${x - 5} ${y + 7}c0-8 2-12 5-12s5 4 5 12l-2.5-1.800-2.5 1.800-2.5-1.800z" fill="#FFFDF6" stroke="#CFC8B0" stroke-width="1.1" stroke-linejoin="round"/>`;
const NOTE_ICON = {
  bergamot: `<circle cx="26" cy="37" r="16" fill="#B9C94E" stroke="#8FA033" stroke-width="1.5"/><path d="M26 21c2-6 8-9 14-8-1 6-6 10-14 8z" fill="#5E8B3A"/><path d="M26 21v-5" stroke="#5B4A2A" stroke-width="2" stroke-linecap="round"/><circle cx="45" cy="45" r="12" fill="#EEF3B4" stroke="#9DB040" stroke-width="2.5"/><path d="M45 35v20M35 45h20M38 38l14 14M52 38 38 52" stroke="#B7C65A" stroke-width="1.3"/>`,
  citrus: `<circle cx="24" cy="30" r="16" fill="#F29A2E"/><path d="M24 14c3-5 9-6 13-4-2 5-7 7-13 4z" fill="#5E8B3A"/><circle cx="43" cy="43" r="14" fill="#FFD27A" stroke="#F29A2E" stroke-width="3"/><path d="M43 31v24M31 43h24M34.5 34.5l17 17M51.5 34.5l-17 17" stroke="#F4A93F" stroke-width="1.4"/><circle cx="43" cy="43" r="2.2" fill="#FFF3D0"/>`,
  jasmine: `<path d="M32 60c-1-9 1-17 0-24" stroke="#6E9A4B" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M32 52c6-1 10-5 11-10-6 0-10 4-11 10z" fill="#7FAE56"/>${petals(32, 26, 14, 6, 10, '#FFFDF6', '#D9D2BC')}<circle cx="32" cy="26" r="4" fill="#F2C744"/>`,
  lavender: `<path d="M32 60V30" stroke="#6E9A4B" stroke-width="2" stroke-linecap="round"/><path d="M32 54c-6-1-9-5-10-9M32 48c6-1 9-5 10-9" stroke="#6E9A4B" stroke-width="2" fill="none" stroke-linecap="round"/><g fill="#8E72C9"><ellipse cx="32" cy="8" rx="3.5" ry="5"/><ellipse cx="27" cy="15" rx="3.5" ry="5" transform="rotate(-22 27 15)"/><ellipse cx="37" cy="15" rx="3.5" ry="5" transform="rotate(22 37 15)"/><ellipse cx="27" cy="24" rx="3.5" ry="5" transform="rotate(-22 27 24)"/><ellipse cx="37" cy="24" rx="3.5" ry="5" transform="rotate(22 37 24)"/><ellipse cx="28" cy="33" rx="3.2" ry="4.5" transform="rotate(-22 28 33)"/><ellipse cx="36" cy="33" rx="3.2" ry="4.5" transform="rotate(22 36 33)"/></g><g fill="#B7A2EA"><ellipse cx="32" cy="16" rx="2.4" ry="4"/><ellipse cx="32" cy="26" rx="2.4" ry="4"/></g>`,
  patchouli: `<g stroke="#3F6B34" stroke-width="1.3" stroke-linejoin="round"><path d="M30 54C16 54 8 44 8 30c14 0 22 10 22 24z" fill="#6FAE58"/><path d="M34 54c14 0 22-10 22-24-14 0-22 10-22 24z" fill="#6FAE58"/><path d="M32 54C20 46 18 26 32 10c14 16 12 36 0 44z" fill="#5E9A4A"/></g><path d="M32 54V18M30 54 13 35M34 54l17-19" stroke="#3F6B34" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  sandalwood: `<g transform="rotate(-18 32 32)"><rect x="8" y="16" width="46" height="11" rx="5.5" fill="#D9A066"/><rect x="12" y="29" width="46" height="11" rx="5.5" fill="#C98B4E"/><rect x="6" y="42" width="46" height="11" rx="5.5" fill="#E0AE78"/><g fill="#F3D2A6" stroke="#B57B3F" stroke-width="1.2"><ellipse cx="50" cy="21.5" rx="3.5" ry="5"/><ellipse cx="54" cy="34.5" rx="3.5" ry="5"/><ellipse cx="48" cy="47.5" rx="3.5" ry="5"/></g></g>`,
  tonka: `<g transform="rotate(-28 32 32)"><ellipse cx="25" cy="27" rx="18" ry="8.5" fill="#3A2A22"/><path d="M10 26c9-4 21-4 30 0" stroke="#7A6052" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="39" cy="42" rx="17" ry="8" fill="#4E3A2F"/><path d="M25 41c9-4 20-4 28 0" stroke="#8A6F60" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`,
  vanilla: `<path d="M12 56C26 46 42 28 52 10" stroke="#3B2A20" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M20 58C34 48 48 34 58 18" stroke="#4E382B" stroke-width="3.2" fill="none" stroke-linecap="round"/>${petals(24, 26, 15, 5.2, 9, '#FFF8E3', '#E2D6B0')}<circle cx="24" cy="26" r="3.6" fill="#F0C64C"/>`,
  lily: `<path d="M22 60C22 40 26 22 46 8" stroke="#6E9A4B" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M22 60C9 48 9 30 17 18c8 12 9 30 5 42z" fill="#7FAE56"/><path d="M43 11v6M37 17v7M32 25v8M28 35v7" stroke="#6E9A4B" stroke-width="1.4" stroke-linecap="round"/>${bell(43, 20)}${bell(37, 27)}${bell(32, 36)}${bell(28, 45)}`,
  vetiver: `<g fill="none" stroke-linecap="round"><g stroke="#7FAE56" stroke-width="2"><path d="M32 30C30 20 24 12 16 7"/><path d="M32 30c0-10 2-18 6-24"/><path d="M32 30c4-8 10-14 18-17"/></g><g stroke="#C9A24B" stroke-width="1.8"><path d="M32 32C20 30 12 34 8 44"/><path d="M32 32c-7 6-9 16-7 26"/><path d="M32 32c0 10 2 18 6 26"/><path d="M32 32c8 4 14 12 16 22"/><path d="M32 32c12-1 20 3 24 11"/><path d="M32 32c-10 3-17 11-19 21"/></g></g><rect x="26" y="27" width="12" height="7" rx="3.5" fill="#A9853A"/>`,
  rose: `<path d="M32 60V40" stroke="#6E9A4B" stroke-width="2.2" stroke-linecap="round"/><path d="M32 53c7 0 11-4 12-9-7 0-11 3-12 9z" fill="#7FAE56"/><circle cx="32" cy="24" r="17" fill="#E0637F"/><path d="M32 24c-8-2-12-9-9-15 8 0 13 6 9 15z" fill="#EC8FA4"/><path d="M32 24c8-2 13 3 13 10-7 3-14-1-13-10z" fill="#D14F6E"/><path d="M32 24c-2 8-9 12-15 9 0-8 6-13 15-9z" fill="#F1A3B5"/><path d="M32 24c2-8 9-11 14-8-1 7-6 11-14 8z" fill="#E77A93"/><circle cx="32" cy="24" r="4.5" fill="#C8405F"/>`,
  oud: `<path d="M10 54l8-18 14-4 18 6 6 14-10 8H18z" fill="#4A3324"/><path d="M18 36l14-4 18 6-14 6z" fill="#6B4A33"/><path d="M22 48l10-3M30 54l12-4M40 44l8 3" stroke="#8A6548" stroke-width="1.6" stroke-linecap="round"/><path d="M30 27c-6-5 6-8 0-15M40 25c-4-4 4-6 0-11" stroke="#B9AFA0" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  amber: `<path d="M32 6l18 20-6 28H20l-6-28z" fill="#E9A23B"/><path d="M32 6l8 20H24z" fill="#F7C66B"/><path d="M14 26h10l-4 28z" fill="#D48A24"/><path d="M50 26H40l4 28z" fill="#C97F1E"/><path d="M24 26h16l4 28H20z" fill="#F0B24E"/><path d="M27 32l3 13" stroke="#FFE7B0" stroke-width="2" stroke-linecap="round"/>`,
  musk: `<g fill="#EFE6DF"><circle cx="22" cy="38" r="12"/><circle cx="36" cy="30" r="14"/><circle cx="46" cy="40" r="10"/><rect x="14" y="38" width="40" height="12" rx="6"/></g><g fill="#D6C2B6"><circle cx="26" cy="41" r="2"/><circle cx="36" cy="35" r="2"/><circle cx="43" cy="43" r="2"/></g><path d="M51 9l1.800 4.200L57 15l-4.200 1.800L51 21l-1.800-4.200L45 15l4.200-1.800z" fill="#E4C878"/>`,
};
const noteIcon = (k) => `<svg viewBox="0 0 64 64" aria-hidden="true">${NOTE_ICON[k] || NOTE_ICON.musk}</svg>`;
const noteTile = (n) => `<a class="ntile" href="#/catalogo?nota=${encodeURIComponent(n.key)}"><span class="nico">${noteIcon(n.key)}</span><span class="nlab">${esc(NOTE_L(n))}</span><span class="ncount">${n.count}</span></a>`;
const brandTile = (b, n) => `<a class="bidx ${brandLogo(b) ? 'haslogo' : ''}" href="#/marca/${encodeURIComponent(b)}" aria-label="${esc(b)}">${brandLogo(b) ? `<img src="${esc(brandLogo(b))}" alt="${esc(b)}" loading="lazy">` : `<span>${esc(b)}</span>`}<i>${n}</i></a>`;

/* ── Portada ────────────────────────────────────────── */
const GENDERS = [
  ['Damas', 'dama', 'Elegantes. Radiantes. Inolvidables.', 'Aromas femeninos que unen flores suaves con notas cálidas y sensuales: una fragancia propia para cada ánimo y cada momento.', 'Fragancias para damas'],
  ['Caballeros', 'cab', 'Firmes. Refinados. Clásicos.', 'Aromas seguros de sí mismos, con cítricos frescos y maderas profundas: de los clásicos de diario a los de noche.', 'Fragancias para caballeros'],
  ['Unisex', 'uni', 'Modernos. Versátiles. Distintos.', 'Almizcles limpios y ámbares cálidos hechos para compartirse y llevarse a tu manera.', 'Fragancias unisex'],
];
async function home() {
  const st = store(); const cl = cats(); const stats = S.catalog.stats; const banners = st.banners || {};
  const perf = S.products.filter(isPerfume); const onlyPerf = cl.length <= 1 && perf.length > 0;
  const head = String(LANG === 'en' ? (st.headlineEn || t('Tu mercado global, con elegancia.')) : (st.headline || 'Tu mercado global, con elegancia.')); const ci = head.lastIndexOf(',');
  const h1 = ci > 0 ? `${esc(head.slice(0, ci + 1))} <span class="au">${esc(head.slice(ci + 1).trim())}</span>` : esc(head);
  const lede = LANG === 'en'
    ? (st.ledeEn || (onlyPerf ? 'Original fragrances for women, men and unisex from the houses you know, priced by the unit or wholesale, with order tracking from your account.'
      : cl.length ? `${cl.map((c) => catL(c.key).toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')}: original products from the brands you know, priced by the unit or wholesale, with order tracking from your account.` : 'Original products with nationwide shipping and order tracking from your account.'))
    : (st.lede || (onlyPerf ? 'Fragancias originales para damas, caballeros y unisex de las casas que conoces, con precio por unidad o al mayor, y seguimiento de tu pedido desde tu cuenta.'
      : cl.length ? `${cl.map((c) => c.key.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' y $1')}: productos originales de las marcas que conoces, con precio por unidad o al mayor, y seguimiento de tu pedido desde tu cuenta.` : 'Productos originales con envío a todo el país y seguimiento de tu pedido desde tu cuenta.'));
  const shelf = featuredList().filter((p) => p.image).slice(0, 3).concat(featuredList().filter((p) => !p.image)).slice(0, 3);
  const brands = brandCounts();
  const withLogo = brands.filter(([b]) => brandLogo(b));
  const strip = (withLogo.length >= 6 ? withLogo : [...withLogo, ...brands.filter(([b]) => !brandLogo(b))]).slice(0, 36);
  const bchips = strip.map(([b]) => `<a class="blogo" href="#/marca/${encodeURIComponent(b)}" aria-label="${esc(b)}">${brandLogo(b) ? `<img src="${esc(brandLogo(b))}" alt="${esc(b)}" loading="lazy">` : `<span class="wm2">${esc(b)}</span>`}</a>`).join('');
  const banner = (key, label) => banners[key] ? `<section class="bnrband"><div class="wrap"><a class="bnr reveal" href="${esc(banners[key + 'Link'] || '#/catalogo')}"><img src="${esc(banners[key])}" alt="${esc(label)}"></a></div></section>` : '';

  /* Mujer / Hombre / Unisex: una tarjeta de color por público */
  const genderBand = perf.length ? `<section class="band" id="genderBand"><div class="wrap">
    <div class="sec-head center reveal"><span class="kicker">${t('Compra por categoría')}</span><h2>${t('Para ella, para él, para todos')}</h2></div>
    <div class="genders reveal">${GENDERS.map(([g, skin, line, desc, cta]) => {
      const l = perf.filter((p) => (p.gender || 'Unisex') === g); const photo = banners['genero-' + skin];
      const shots = l.filter((p) => p.image && p.stock > 0).sort((a, b) => (b.featured - a.featured) || (b.sell - a.sell)).slice(0, 5);
      return `<a class="gcard ${skin}" href="#/c/Perfumer%C3%ADa?genero=${g}">
        <div class="gshots ${photo ? 'photo' : ''}">${photo ? `<img class="gphoto" src="${esc(photo)}" alt="">` : shots.length ? shots.map((p, i) => `<img class="gs gs${i + 1}" src="${esc(p.image)}" alt="" loading="lazy" data-fb="rm">`).join('') : `<span class="gempty">${t(g)}</span>`}</div>
        <div class="glabel"><h3>${t(g)}</h3><div class="tagline">${t(line)}</div><p class="gdesc">${t(desc)}</p><span class="gbtn">${t(cta)}</span><div class="n">${l.length} ${l.length === 1 ? t('fragancia') : t('fragancias')}</div></div></a>`; }).join('')}</div>
  </div></section>` : '';

  const notes = noteList().filter((n) => n.count > 0);
  const notesBand = notes.length ? `<section class="band tint" id="notesBand"><div class="wrap">
    <div class="sec-head center reveal"><span class="kicker">${t('Familias olfativas')}</span><h2>${t('Compra por notas')}</h2><p>${t('De los cítricos brillantes a las maderas cálidas y los gourmand dulces: toca una nota para ver los perfumes que la llevan.')}</p></div>
    <div class="ngrid reveal">${notes.map(noteTile).join('')}</div>
  </div></section>` : '';

  const catSections = cl.filter((c) => c.key !== 'Perfumería').slice(0, 4).map((c, i) => {
    const list = S.products.filter((p) => p.category === c.key).sort((a, b) => (b.stock > 0) - (a.stock > 0) || b.featured - a.featured).slice(0, 10);
    const key = slug(c.key);
    return `<section class="band ${i % 2 === 0 ? 'tint' : ''}" id="sec-${key}">
      <div class="wrap">
        <div class="sec-head center reveal"><span class="kicker">${esc(catL(c.key))}</span><h2>${esc(t(CAT_HEAD[c.key]) || catL(c.key))}</h2>${c.desc && LANG === 'es' ? `<p>${esc(c.desc)}</p>` : ''}</div>
        ${banners[key] ? `<a class="bnr sm reveal" style="margin-bottom:clamp(18px,2.6vw,28px)" href="#/c/${encodeURIComponent(c.key)}"><img src="${esc(banners[key])}" alt="${esc(c.key)}"></a>` : ''}
        <div class="rail reveal">${railHtml(list)}</div>
        <div style="text-align:center;margin-top:22px"><a class="btn-ghost" href="#/c/${encodeURIComponent(c.key)}">${t('Ver')} ${esc(catL(c.key).toLowerCase())} (${c.count})</a></div>
      </div></section>`;
  }).join('');
  return `
  <section class="hero">
    <span class="arc a1"></span><span class="arc a2"></span>
    <div class="wrap">
      <span class="orn">⟡ ⟡ ⟡</span>
      <span class="ovl">${esc(st.name)} · ${esc(LANG === 'en' ? t(st.tagline || 'Casa de compras') : (st.tagline || 'Casa de compras'))}</span>
      <h1>${h1}</h1>
      <p class="lede">${esc(lede)}</p>
      <div class="hero-cta"><a class="btn-gold" href="#/catalogo">${t('Ver el catálogo')}</a>${perf.length ? `<a class="btn-ghost" href="#" data-scroll="genderBand">${t('Compra por categoría')}</a>` : cl.length > 1 ? `<a class="btn-ghost" href="#" data-scroll="deptBand">${t('Departamentos')}</a>` : ''}</div>
      ${shelf.length ? `<div class="heromart-wrap"><span class="stage-chip"><span class="dotp"></span> ${t('Selección de la casa')}</span><div class="heromart">${shelf.map((p, i) => `
        <a class="hp hp${i + 1}" href="#/p/${encodeURIComponent(p.upc || p.id)}" aria-label="Ver ${esc(p.name)}">
          <div class="hp-shot">${pic(p)}</div>
          <div class="hp-meta"><span class="hp-brand">${esc(p.brand)}</span><span class="hp-name">${esc(p.name)}</span><span class="hp-price">${money(p.sell)}</span></div>
        </a>`).join('')}</div><div class="rule2"></div></div>` : ''}
      <div class="hero-stats">
        <div class="hst"><div class="n">${stats.products}</div><div class="l">${t('Productos')}</div></div>
        <div class="hst"><div class="n">${stats.brands}</div><div class="l">${t('Marcas')}</div></div>
        <div class="hst"><div class="n">${stats.units}</div><div class="l">${t('Unidades en stock')}</div></div>
      </div>
      ${cl.length > 1 ? `<div class="mkt"><div class="t">${t('Explora el mercado')}</div><div class="mkt-row">${cl.map((c) => `<a class="mtile" href="#/c/${encodeURIComponent(c.key)}">${esc(catL(c.key))}</a>`).join('<span class="sep">⟡</span>')}<span class="sep">⟡</span><a class="mtile" href="#/marcas">${t('Marcas')}</a></div></div>` : ''}
    </div>
  </section>

  <section class="trust"><div class="wrap trust-row">
    <div class="titem"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 5v6c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg><div><b>${t('100 % original')}</b><span>${t('Producto garantizado')}</span></div></div>
    <div class="titem"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg><div><b>${t('Pago seguro')}</b><span>${t('Confirmación por correo')}</span></div></div>
    <div class="titem"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 8h13v8H1zM14 11h4l3 3v2h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg><div><b>${t('Envío asegurado')}</b><span>${t('A todo el país, con guía')}</span></div></div>
    <div class="titem"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><div><b>${t('Seguimiento')}</b><span>${t('El estado de tu pedido, en tu cuenta')}</span></div></div>
  </div></section>

  ${genderBand}

  ${strip.length ? `<section class="mq" id="brandBand" aria-label="${t('Nuestras marcas')}"><div class="mq-track ${strip.length < 7 ? 'still' : ''}">${bchips}${strip.length < 7 ? '' : bchips}</div></section>` : ''}
  ${banner('principal', 'Banner principal')}

  ${notesBand}

  ${cl.length > 1 ? `<section class="band" id="deptBand"><div class="wrap">
    <div class="sec-head center reveal"><span class="kicker">${t('Departamentos')}</span><h2>${t('¿Qué buscas hoy?')}</h2></div>
    <div class="depts ${cl.length >= 3 ? 'n3' : ''} reveal">${cl.map((c, i) => `<a class="dept-card tone-${esc(c.tone)}" href="#/c/${encodeURIComponent(c.key)}">
      <span class="dnum">${String(i + 1).padStart(2, '0')}</span><h3>${esc(catL(c.key))}</h3><p>${esc((LANG === 'es' && c.desc) || t(CAT_HEAD[c.key]) || '')}</p><span class="n">${c.count} ${c.count === 1 ? t('producto') : t('productos')}</span><span class="arr2">→</span></a>`).join('')}</div>
  </div></section>` : ''}

  ${catSections}

  <section class="band" id="railBand"><div class="wrap">
    <div class="sec-head reveal"><div><span class="kicker">${t('Selección')}</span><h2>${t('Destacados de la casa')}</h2></div><a class="morelink" href="#/catalogo?destacados=1">${t('Ver todos los destacados')}</a></div>
    <div class="rail reveal">${railHtml(featuredList().slice(0, 10))}</div>
  </div></section>

  ${brands.length ? `<section class="band tint" id="brandsel"><div class="wrap">
    <div class="sec-head center reveal"><span class="kicker">${t('Las casas que trabajamos')}</span><h2>${t('Elige tu marca')}</h2><p>${t('Toca una marca para ver solo sus productos.')}</p></div>
    <div class="brandindex reveal">${brands.slice().sort((a, b) => (!!brandLogo(b[0]) - !!brandLogo(a[0]))).slice(0, 24).map(([b, n]) => brandTile(b, n)).join('')}${brands.length > 24 ? `<a class="bidx more" href="#/marcas">${LANG === 'en' ? `See all ${brands.length} brands` : `Ver todas las marcas (${brands.length})`}</a>` : ''}</div>
  </div></section>` : ''}

  <section class="band"><div class="wrap">
    <div class="sec-head reveal"><div><span class="kicker">${t('Recién llegados')}</span><h2>${t('Nuevos ingresos')}</h2></div><a class="morelink" href="#/catalogo">${t('Ver todo el catálogo')}</a></div>
    <div class="rail reveal">${railHtml(newest())}</div>
  </div></section>

  <section class="band tint" id="shop"><div class="wrap">
    <div class="sec-head center reveal"><span class="kicker">${t('Colección completa')}</span><h2>${t('Todo el catálogo')}</h2></div>
    <div id="homeCat"></div>
  </div></section>

  <section class="news"><div class="wrap"><div class="frame">
    <span class="kicker">${t('Novedades')}</span>
    <h2>${LANG === 'en' ? 'Be the first to know <span class="au">what arrives.</span>' : 'Entérate primero de <span class="au">lo que llega.</span>'}</h2>
    <p>${t('Avisos de nuevos ingresos y reposiciones. Sin saturar tu correo.')}</p>
    <form class="newsform" id="newsForm"><input type="email" placeholder="${LANG === 'en' ? 'you@email.com' : 'tu@correo.com'}" required aria-label="${t('Correo electrónico')}" /><button class="btn-gold" type="submit">${t('Suscribirme')}</button></form>
  </div></div></section>
  ${!S.products.length ? `<div class="wrap" style="padding-bottom:60px"><div class="empty"><b>${t('Todavía no hay productos publicados')}</b>${t('El catálogo se está preparando. Vuelve en unos minutos.')}</div></div>` : ''}`;
}
function wireHome() {
  if (!S.homeF) S.homeF = emptyF();
  const paint = (f) => { S.homeF = f; mountCatalog($('#homeCat'), f, { scope: {}, onChange: paint }); };
  paint(S.homeF);
}

/* ── Catálogo con filtros (bloque reutilizable) ─────── */
const emptyF = () => ({ cats: [], brands: [], types: [], notes: [], gender: '', text: '', min: 0, max: 0, stock: false, mayor: false, dest: false, sort: 'relevancia' });
function readF() {
  const q = S.route.q || {}; const f = emptyF();
  if (S.route.cat) f.cats = [S.route.cat]; else if (q.cat) f.cats = q.cat.split(',');
  if (S.route.brand) f.brands = [S.route.brand]; else if (q.marca) f.brands = q.marca.split(',');
  if (q.tipo) f.types = q.tipo.split(','); if (q.nota) f.notes = q.nota.split(',').filter(Boolean); f.gender = q.genero || ''; f.text = (q.q || '').trim(); f.min = Number(q.min) || 0; f.max = Number(q.max) || 0;
  f.stock = q.stock === '1'; f.mayor = q.mayor === '1'; f.dest = q.destacados === '1'; f.sort = q.orden || 'relevancia';
  return f;
}
function writeF(f) {
  const q = new URLSearchParams();
  if (f.text) q.set('q', f.text); if (f.cats.length && !S.route.cat) q.set('cat', f.cats.join(',')); if (f.brands.length && !S.route.brand) q.set('marca', f.brands.join(','));
  if (f.types.length) q.set('tipo', f.types.join(',')); if ((f.notes || []).length) q.set('nota', f.notes.join(',')); if (f.gender) q.set('genero', f.gender); if (f.min) q.set('min', f.min); if (f.max) q.set('max', f.max);
  if (f.stock) q.set('stock', '1'); if (f.mayor) q.set('mayor', '1'); if (f.dest) q.set('destacados', '1'); if (f.sort !== 'relevancia') q.set('orden', f.sort);
  const base = S.route.cat ? '#/c/' + encodeURIComponent(S.route.cat) : S.route.brand ? '#/marca/' + encodeURIComponent(S.route.brand) : '#/catalogo';
  location.hash = base + (q.toString() ? '?' + q.toString() : '');
}
function applyF(f, scope) {
  const text = f.text.toLowerCase();
  let list = S.products.filter((p) => (!scope.cat || p.category === scope.cat) && (!scope.brand || p.brand === scope.brand)
    && (!f.cats.length || f.cats.includes(p.category)) && (!f.brands.length || f.brands.includes(p.brand)) && (!f.types.length || f.types.includes(p.type || p.category))
    && (!f.gender || !isPerfume(p) || p.gender === f.gender)
    && (!(f.notes || []).length || f.notes.some((k) => (p.notes || []).includes(k)))
    && (!text || (p.name + ' ' + p.brand + ' ' + p.category + ' ' + (p.type || '') + ' ' + (p.tags || []).join(' ') + ' ' + p.upc).toLowerCase().includes(text))
    && (!f.min || p.sell >= f.min) && (!f.max || p.sell <= f.max) && (!f.stock || p.stock > 0) && (!f.mayor || (p.wholesaleMin && p.wholesalePrice)) && (!f.dest || p.featured || off(p) > 0));
  const sorts = { relevancia: (a, b) => (b.featured - a.featured) || ((b.stock > 0) - (a.stock > 0)) || a.name.localeCompare(b.name, 'es'), 'precio-asc': (a, b) => a.sell - b.sell, 'precio-desc': (a, b) => b.sell - a.sell, nombre: (a, b) => a.name.localeCompare(b.name, 'es'), marca: (a, b) => a.brand.localeCompare(b.brand, 'es') || a.name.localeCompare(b.name, 'es'), descuento: (a, b) => off(b) - off(a) };
  return list.sort(sorts[f.sort] || sorts.relevancia);
}
function mountCatalog(root, f, opts) {
  if (!root) return;
  const scope = opts.scope || {}; const list = applyF(f, scope);
  const inScope = S.products.filter((p) => (!scope.cat || p.category === scope.cat) && (!scope.brand || p.brand === scope.brand) && (!f.cats.length || f.cats.includes(p.category)));
  const catList = cats(); const perf = (scope.cat === 'Perfumería') || (f.cats.length === 1 && f.cats[0] === 'Perfumería');
  const types = new Map(), brands = new Map();
  for (const p of inScope) { const t = p.type || ''; if (t && t !== p.category) types.set(t, (types.get(t) || 0) + 1); brands.set(p.brand, (brands.get(p.brand) || 0) + 1); }
  const opt = (label, on, n, attr) => `<button class="fopt" ${attr} aria-pressed="${on}"><span class="bx">${on ? '✓' : ''}</span>${esc(label)}<span class="c">${n}</span></button>`;
  const bs = [...brands.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')); const showB = f.allBrands ? bs : bs.slice(0, 8);
  let side = '';
  if (!scope.cat && catList.length > 1) side += `<div class="fgroup"><h4>${t('Departamento')}</h4>${catList.map((c) => opt(catL(c.key), f.cats.includes(c.key), c.count, `data-cat="${esc(c.key)}"`)).join('')}</div>`;
  if (types.size > 1) side += `<div class="fgroup"><h4>${t('Categoría')}</h4>${[...types.entries()].sort().map(([t, n]) => opt(t, f.types.includes(t), n, `data-type="${esc(t)}"`)).join('')}</div>`;
  if (!scope.brand && bs.length > 1) side += `<div class="fgroup"><h4>${t('Marca')}</h4>${showB.map(([b, n]) => opt(b, f.brands.includes(b), n, `data-brand="${esc(b)}"`)).join('')}${bs.length > 8 ? `<button class="fmore" data-moreb>${f.allBrands ? t('− Ver menos') : (LANG === 'en' ? `+ See all ${bs.length} brands` : `+ Ver las ${bs.length} marcas`)}</button>` : ''}</div>`;
  const ncount = new Map(); for (const p of inScope) for (const k of (p.notes || [])) ncount.set(k, (ncount.get(k) || 0) + 1);
  if (ncount.size) side += `<div class="fgroup"><h4>${t('Notas')}</h4>${noteList().filter((n) => ncount.has(n.key)).map((n) => opt(NOTE_L(n), (f.notes || []).includes(n.key), ncount.get(n.key), `data-note="${esc(n.key)}"`)).join('')}</div>`;
  side += `<div class="fgroup"><h4>${t('Precio')}</h4><div class="rng"><input type="number" min="0" placeholder="${t('Mín.')}" data-min value="${f.min || ''}"><span>–</span><input type="number" min="0" placeholder="${t('Máx.')}" data-max value="${f.max || ''}"></div><button class="fmore" data-price>${t('Aplicar')}</button></div>`;
  side += `<div class="fgroup"><h4>${t('Disponibilidad')}</h4>${opt(t('Solo con stock'), f.stock, inScope.filter((p) => p.stock > 0).length, 'data-stock')}${opt(t('Con precio al mayor'), f.mayor, inScope.filter((p) => p.wholesaleMin && p.wholesalePrice).length, 'data-mayor')}${opt(t('Destacados y ofertas'), f.dest, inScope.filter((p) => p.featured || off(p) > 0).length, 'data-dest')}</div>`;
  const active = f.cats.length || f.brands.length || f.types.length || (f.notes || []).length || f.gender || f.text || f.min || f.max || f.stock || f.mayor || f.dest;
  if (active) side += `<button class="fclear" data-clear>${t('Quitar todos los filtros')}</button>`;
  const tags = [];
  if (!scope.cat) f.cats.forEach((v) => tags.push([t('Departamento'), catL(v), `data-xcat="${esc(v)}"`]));
  if (f.gender) tags.push([t('Para'), t(f.gender), 'data-xg']); f.types.forEach((v) => tags.push([t('Categoría'), v, `data-xtype="${esc(v)}"`]));
  if (!scope.brand) f.brands.forEach((v) => tags.push([t('Marca'), v, `data-xbrand="${esc(v)}"`]));
  (f.notes || []).forEach((v) => tags.push([t('Nota'), NOTE_L(noteInfo(v)), `data-xnote="${esc(v)}"`]));
  if (f.text) tags.push([t('Búsqueda'), f.text, 'data-xq']); if (f.min || f.max) tags.push([t('Precio'), `${f.min ? money(f.min) : '$0'} – ${f.max ? money(f.max) : '∞'}`, 'data-xprice']);
  if (f.stock) tags.push(['', t('Solo con stock'), 'data-xstock']); if (f.mayor) tags.push(['', t('Con precio al mayor'), 'data-xmayor']); if (f.dest) tags.push(['', t('Destacados y ofertas'), 'data-xdest']);
  const gchips = `${[['', t('Todos')], ['Damas', t('Damas')], ['Caballeros', t('Caballeros')], ['Unisex', t('Unisex')]].map(([k, l]) => `<button class="gchip" data-gchip="${k}" aria-pressed="${f.gender === k}">${l}</button>`).join('')}`;
  const chips = !scope.cat && catList.length > 1
    ? `<div class="gchips">${[['', t('Todo')], ...catList.map((c) => [c.key, catL(c.key)])].map(([k, l]) => `<button class="gchip" data-chip="${esc(k)}" aria-pressed="${k ? f.cats.length === 1 && f.cats[0] === k : !f.cats.length}">${esc(l)}</button>`).join('')}${perf ? '<span style="width:1px;background:var(--edge2);margin-inline:6px"></span>' + gchips : ''}</div>`
    : perf ? `<div class="gchips">${gchips}</div>` : '';
  root.innerHTML = `${chips}
    <div class="shopbar">
      <button class="fbtn" data-ftoggle><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M6 12h12M10 19h4"/></svg>${t('Filtrar')}</button>
      <div class="vbtns"><button data-view="grid" class="${S.view === 'grid' ? 'on' : ''}" aria-label="Cuadrícula">▦</button><button data-view="list" class="${S.view === 'list' ? 'on' : ''}" aria-label="Lista">☰</button></div>
      <span class="total">${list.length} ${list.length === 1 ? t('producto') : t('productos')}</span>
      <div class="sortwrap"><label>${t('Ordenar por')}</label><select data-sort>${[['relevancia', t('Relevancia')], ['nombre', t('Nombre')], ['marca', t('Marca')], ['precio-asc', t('Precio: menor a mayor')], ['precio-desc', t('Precio: mayor a menor')], ['descuento', t('Mayor descuento')]].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="shopbody">
      <aside class="sidebar ${f.open ? 'show' : ''}" aria-label="Filtros">${side}</aside>
      <div>
        <div class="tags">${tags.map(([k, v, a]) => `<span class="tagx">${k ? `<b>${k}:</b> ` : ''}${esc(v)} <button ${a} aria-label="Quitar">×</button></span>`).join('')}</div>
        ${list.length ? `<div class="pgrid ${S.view === 'list' ? 'listmode' : ''}">${list.map(card).join('')}</div>` : `<div class="blank"><b>${t('Sin coincidencias')}</b>${t('Prueba quitando algún filtro.')}</div>`}
      </div>
    </div>`;
  const go = (mut) => { const nf = { ...f, cats: [...f.cats], brands: [...f.brands], types: [...f.types], notes: [...(f.notes || [])] }; mut(nf); opts.onChange(nf); };
  const flip = (arr, v) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  $$('[data-cat]', root).forEach((b) => b.onclick = () => go((n) => { n.cats = flip(n.cats, b.dataset.cat); if (!n.cats.includes('Perfumería')) n.gender = ''; }));
  $$('[data-chip]', root).forEach((b) => b.onclick = () => go((n) => { n.cats = b.dataset.chip ? [b.dataset.chip] : []; n.types = []; if (b.dataset.chip !== 'Perfumería') n.gender = ''; }));
  $$('[data-gchip]', root).forEach((b) => b.onclick = () => go((n) => { n.gender = b.dataset.gchip; }));
  $$('[data-type]', root).forEach((b) => b.onclick = () => go((n) => { n.types = flip(n.types, b.dataset.type); }));
  $$('[data-brand]', root).forEach((b) => b.onclick = () => go((n) => { n.brands = flip(n.brands, b.dataset.brand); }));
  $$('[data-note]', root).forEach((b) => b.onclick = () => go((n) => { n.notes = flip(n.notes, b.dataset.note); }));
  $$('[data-xnote]', root).forEach((b) => b.onclick = () => go((n) => { n.notes = n.notes.filter((x) => x !== b.dataset.xnote); }));
  $$('[data-moreb]', root).forEach((b) => b.onclick = () => go((n) => { n.allBrands = !n.allBrands; n.open = true; }));
  $$('[data-price]', root).forEach((b) => b.onclick = () => go((n) => { n.min = Number($('[data-min]', root).value) || 0; n.max = Number($('[data-max]', root).value) || 0; }));
  $$('[data-min],[data-max]', root).forEach((i) => i.onkeydown = (e) => { if (e.key === 'Enter') $('[data-price]', root).click(); });
  $$('[data-stock]', root).forEach((b) => b.onclick = () => go((n) => { n.stock = !n.stock; }));
  $$('[data-mayor]', root).forEach((b) => b.onclick = () => go((n) => { n.mayor = !n.mayor; }));
  $$('[data-dest]', root).forEach((b) => b.onclick = () => go((n) => { n.dest = !n.dest; }));
  $$('[data-clear]', root).forEach((b) => b.onclick = () => go((n) => Object.assign(n, emptyF())));
  $$('[data-sort]', root).forEach((s) => s.onchange = () => go((n) => { n.sort = s.value; }));
  $$('[data-ftoggle]', root).forEach((b) => b.onclick = () => { const sd = $('.sidebar', root); sd.classList.toggle('show'); f.open = sd.classList.contains('show'); });
  $$('[data-view]', root).forEach((b) => b.onclick = () => { S.view = b.dataset.view; localStorage.setItem('view', S.view); go((n) => n); });
  $$('[data-xcat]', root).forEach((b) => b.onclick = () => go((n) => { n.cats = n.cats.filter((x) => x !== b.dataset.xcat); }));
  $$('[data-xtype]', root).forEach((b) => b.onclick = () => go((n) => { n.types = n.types.filter((x) => x !== b.dataset.xtype); }));
  $$('[data-xbrand]', root).forEach((b) => b.onclick = () => go((n) => { n.brands = n.brands.filter((x) => x !== b.dataset.xbrand); }));
  $$('[data-xg]', root).forEach((b) => b.onclick = () => go((n) => { n.gender = ''; }));
  $$('[data-xq]', root).forEach((b) => b.onclick = () => go((n) => { n.text = ''; $('#q').value = ''; }));
  $$('[data-xprice]', root).forEach((b) => b.onclick = () => go((n) => { n.min = 0; n.max = 0; }));
  $$('[data-xstock]', root).forEach((b) => b.onclick = () => go((n) => { n.stock = false; }));
  $$('[data-xmayor]', root).forEach((b) => b.onclick = () => go((n) => { n.mayor = false; }));
  $$('[data-xdest]', root).forEach((b) => b.onclick = () => go((n) => { n.dest = false; }));
  $$('[data-add]', root).forEach((b) => b.onclick = () => addToCart(b.dataset.add, 1));
}
async function cat() {
  const f = readF(); const scope = { cat: S.route.cat, brand: S.route.brand };
  const oneNote = (f.notes || []).length === 1 && !scope.cat && !scope.brand ? noteInfo(f.notes[0]) : null;
  const title = oneNote ? (LANG === 'en' ? `${oneNote.en} fragrances` : `Fragancias con ${oneNote.es.toLowerCase()}`) : scope.cat ? catL(scope.cat) : scope.brand ? scope.brand : f.dest ? t('Destacados de la casa') : f.text ? (LANG === 'en' ? `Results for “${f.text}”` : `Resultados para “${f.text}”`) : t('Todo el catálogo');
  const info = scope.cat ? catInfo(scope.cat) : null;
  return `<div class="wrap page">
    <div class="crumbs"><a href="#/">${t('Inicio')}</a><span>/</span>${scope.brand ? `<a href="#/marcas">${t('Marcas')}</a><span>/</span>` : `<a href="#/catalogo">${t('Catálogo')}</a>` + (scope.cat ? '<span>/</span>' : '')}${scope.cat || scope.brand ? esc(title) : ''}</div>
    <div class="sec-head reveal in"><div><span class="kicker">${oneNote ? t('Compra por notas') : scope.cat ? t('Departamento') : scope.brand ? t('Marca') : t('Colección completa')}</span><h2>${oneNote ? `<span class="nico inline">${noteIcon(oneNote.key)}</span>` : ''}${esc(title)}</h2>${info && info.desc && LANG === 'es' ? `<p>${esc(info.desc)}</p>` : ''}</div></div>
    <div id="routeCat"></div></div>`;
}
function wireCatRoute() { mountCatalog($('#routeCat'), readF(), { scope: { cat: S.route.cat, brand: S.route.brand }, onChange: (f) => writeF(f) }); }
async function marcas() {
  const list = brandCounts();
  return `<div class="wrap page"><div class="crumbs"><a href="#/">${t('Inicio')}</a><span>/</span>${t('Marcas')}</div>
    <div class="sec-head center reveal in"><span class="kicker">${t('Nuestras casas')}</span><h2>${t('Elige tu marca')}</h2><p>${LANG === 'en' ? `${list.length} ${list.length === 1 ? 'brand' : 'brands'} in the catalog. Tap one to see only its products.` : `${list.length} ${list.length === 1 ? 'marca' : 'marcas'} en el catálogo. Toca una para ver solo sus productos.`}</p></div>
    <div class="brandindex">${list.slice().sort((a, b) => (!!brandLogo(b[0]) - !!brandLogo(a[0]))).map(([b, n]) => brandTile(b, n)).join('')}</div></div>`;
}

/* ── Ficha de producto ──────────────────────────────── */
async function product() {
  const p = byUpc(S.route.id);
  if (!p) return `<div class="wrap page"><div class="empty"><b>${t('Ese producto ya no está disponible')}</b><a class="btn-ghost" href="#/catalogo" style="margin-top:14px">${t('Volver al catálogo')}</a></div></div>`;
  const c = concOf(p), size = sizeOf(p), out = p.stock <= 0, o = off(p); const mayor = p.wholesaleMin && p.wholesalePrice;
  const related = S.products.filter((x) => x !== p && (x.brand === p.brand || x.category === p.category) && x.stock > 0).sort((a, b) => (b.brand === p.brand) - (a.brand === p.brand)).slice(0, 6);
  const dims = p.lengthIn ? `${p.lengthIn} × ${p.widthIn || '?'} × ${p.heightIn || '?'} in <span class="muted">(${in2cm(p.lengthIn)} × ${p.widthIn ? in2cm(p.widthIn) : '?'} × ${p.heightIn ? in2cm(p.heightIn) : '?'} cm)</span>` : `<span class="muted">${t('Por confirmar')}</span>`;
  const weight = p.weightOz ? `${p.weightOz} oz <span class="muted">(${oz2g(p.weightOz)} g)</span>` : `<span class="muted">${t('Por confirmar')}</span>`;
  const desc = describe(p).split(/\n{2,}|\r?\n/).filter(Boolean).map((t) => `<p class="ddesc" style="margin-top:0">${esc(t)}</p>`).join('');
  const sh = S.catalog.shipping;
  return `<div class="wrap detail">
    <nav class="crumbs"><a href="#/">${t('Inicio')}</a><span>/</span><a href="#/c/${encodeURIComponent(p.category)}">${esc(catL(p.category))}</a><span>/</span><a href="#/marca/${encodeURIComponent(p.brand)}">${esc(p.brand)}</a></nav>
    <div class="dgrid">
      <div class="dshot">${pic(p)}</div>
      <div id="dInfo">
        <div class="p-brand dbrand"><a href="#/marca/${encodeURIComponent(p.brand)}">${esc(p.brand)}</a> · ${esc(badgeOf(p))}</div>
        <h1>${esc(p.name)}</h1>
        <div class="dprices"><span class="now ${o ? '' : 'plain'}">${money(p.sell)}</span>${o ? `<span class="was">${money(p.compare)}</span><span class="off">−${o}%</span>` : ''}</div>
        <div class="dstock" style="color:${out ? 'var(--rouge)' : 'var(--green)'}">${out ? t('Agotado por ahora') : `${t('Disponible')} · ${p.stock} ${p.stock === 1 ? t('unidad') : t('unidades')}`}</div>
        ${p.condition && p.condition !== 'nuevo' ? `<div class="dnote"><strong>${t('Condición')}: ${condL(p.condition)}.</strong></div>` : ''}
        ${mayor ? `<div class="dnote">${LANG === 'en' ? `<strong>Wholesale price: ${money(p.wholesalePrice)} per unit</strong> from ${p.wholesaleMin} units. Applied automatically in the cart once you reach that quantity.` : `<strong>Precio al mayor: ${money(p.wholesalePrice)} por unidad</strong> a partir de ${p.wholesaleMin} unidades. Se aplica solo en el carrito al llegar a esa cantidad.`}</div>` : ''}
        <div class="dbuy">
          <div class="step"><button id="qm" aria-label="Quitar una">−</button><span id="qv">1</span><button id="qp" aria-label="Añadir una">+</button></div>
          <button class="btn-buy" data-add="${esc(p.upc || p.id)}" ${out ? 'disabled' : ''}>${out ? t('Agotado') : t('Añadir al carrito')}</button>
        </div>
        ${c ? `<div class="dnote"><strong>${c.abbr} · ${LANG === 'en' ? `${c.pct} concentration.` : `${c.pct} de concentración.`}</strong> ${t(c.note)}${bars(c.level)}</div>` : ''}
        ${CAT_NOTE[p.category] ? `<div class="dnote">${esc(t(CAT_NOTE[p.category]))}</div>` : ''}
        ${(p.notes || []).length ? `<div class="pnotes"><span class="k">${t('Notas')}</span>${p.notes.map((k) => `<a class="pnote" href="#/catalogo?nota=${encodeURIComponent(k)}"><span class="nico">${noteIcon(k)}</span>${esc(NOTE_L(noteInfo(k)))}</a>`).join('')}</div>` : ''}
        <div class="ptabs"><button class="on" data-tab="d">${t('Descripción')}</button><button data-tab="f">${t('Ficha y envío')}</button></div>
        <div class="tabpane" id="tab-d">${desc}</div>
        <div class="tabpane hidden" id="tab-f"><div class="dspecs flat">
          <div class="r"><span class="k">${t('Marca')}</span><span class="v">${esc(p.brand)}</span></div>
          <div class="r"><span class="k">${t('Departamento')}</span><span class="v">${esc(catL(p.category))}</span></div>
          ${p.type && p.type !== p.category ? `<div class="r"><span class="k">${t('Categoría')}</span><span class="v">${esc(p.type)}</span></div>` : ''}
          ${isPerfume(p) && p.gender ? `<div class="r"><span class="k">${t('Para')}</span><span class="v">${esc(t(p.gender))}</span></div>` : ''}
          ${p.condition && p.condition !== 'nuevo' ? `<div class="r"><span class="k">${t('Condición')}</span><span class="v">${condL(p.condition)}</span></div>` : ''}
          ${size ? `<div class="r"><span class="k">${t('Presentación')}</span><span class="v">${esc(size)}</span></div>` : ''}
          ${c ? `<div class="r"><span class="k">${t('Duración estimada')}</span><span class="v">${esc(t(c.hours))}</span></div>` : ''}
          <div class="r"><span class="k">${t('Peso')}</span><span class="v">${weight}</span></div>
          <div class="r"><span class="k">${t('Medidas (largo × ancho × alto)')}</span><span class="v">${dims}</span></div>
          ${mayor ? `<div class="r"><span class="k">${t('Al mayor')}</span><span class="v">${LANG === 'en' ? `From ${p.wholesaleMin} units at ${money(p.wholesalePrice)} ea.` : `Desde ${p.wholesaleMin} und a ${money(p.wholesalePrice)} c/u`}</span></div>` : ''}
          <div class="r"><span class="k">${t('Envío')}</span><span class="v">${money(sh.flat)} · ${t('gratis desde')} ${money(sh.freeOver)}</span></div>
          <div class="r"><span class="k">${t('Código UPC')}</span><span class="v">${esc(p.upc || '—')}</span></div>
        </div></div>
      </div>
    </div>
    ${related.length ? `<div style="margin-top:clamp(44px,6vw,80px)"><span class="kicker">${t('También te puede gustar')}</span><h2 class="serif" style="font-size:clamp(26px,3.6vw,40px);color:var(--ivory);margin:12px 0 20px">${t('Piezas relacionadas')}</h2><div class="rail">${railHtml(related)}</div></div>` : ''}
  </div>`;
}
function wireProduct() {
  const p = byUpc(S.route.id); const qv = $('#qv'); if (!qv) return; let n = 1;
  $('#qm').onclick = () => { n = Math.max(1, n - 1); qv.textContent = n; };
  $('#qp').onclick = () => { n = Math.min(p.stock || 1, n + 1); qv.textContent = n; };
  $$('[data-tab]').forEach((b) => b.onclick = () => { $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); $('#tab-d').classList.toggle('hidden', b.dataset.tab !== 'd'); $('#tab-f').classList.toggle('hidden', b.dataset.tab !== 'f'); });
}

/* ── Checkout ───────────────────────────────────────── */
const US_STATES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['PR', 'Puerto Rico'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];
const stateCodeOf = (v) => { const x = String(v || '').trim().toLowerCase(); const hit = US_STATES.find(([c, n]) => c.toLowerCase() === x || n.toLowerCase() === x); return hit ? hit[0] : ''; };
const isUsCountry = (v) => /^(|us|usa|u\.s\.a?\.?|united states( of america)?|estados unidos|ee\.? ?uu\.?)$/i.test(String(v || '').trim());
let savedShip = null; let coQ = null; let quoteSeq = 0; let coUS = true;
/* Formulario de tarjeta de Square: vive en un iframe de Square; la tienda nunca ve el número. */
const sq = { loading: null, card: null };
function loadSquare() {
  if (!CFG.square) return Promise.resolve(false);
  if (!sq.loading) sq.loading = new Promise((res, rej) => { const el = document.createElement('script'); el.src = CFG.square.sdk; el.onload = () => res(true); el.onerror = () => { sq.loading = null; rej(new Error('sdk')); }; document.head.appendChild(el); });
  return sq.loading;
}
async function mountCard() {
  const box = $('#sqCard'); if (!box || !CFG.square) return;
  try {
    await loadSquare();
    if (sq.card) { try { await sq.card.destroy(); } catch (_) {} sq.card = null; }
    const payments = window.Square.payments(CFG.square.appId, CFG.square.locationId);
    const card = await payments.card();
    if (!$('#sqCard')) return; await card.attach('#sqCard'); sq.card = card;
    const st = $('#sqState'); if (st) st.textContent = '';
  } catch (_) { const st = $('#sqState'); if (st) st.innerHTML = `<span style="color:var(--rouge)">${t('No se pudo cargar el formulario de pago. Recarga la página.')}</span>`; }
}
async function checkout() {
  const ct = cartTotals();
  if (!ct.lines.length) return `<div class="wrap page"><div class="empty"><b>${t('Tu carrito está vacío')}</b><a class="btn-ghost" href="#/catalogo" style="margin-top:14px">${t('Ver el catálogo')}</a></div></div>`;
  if (S.user && !savedShip) { const r = await api('/api/my/profile').catch(() => ({})); savedShip = r.shipping || {}; }
  if (S.user && S.myRef === undefined) { const r = await api('/api/my/referral').catch(() => null); S.myRef = r && r.ok && r.enabled ? r : null; }
  const s = savedShip || {}; coUS = isUsCountry(s.country); coQ = null;
  const fld = (id, label, val, extra = '', w = '') => `<div class="fi ${w}"><label for="b_${id}">${label}</label><input id="b_${id}" value="${esc(val || '')}" ${extra}></div>`;
  const bal = S.myRef ? Number(S.myRef.balance) || 0 : 0; const pay = !!CFG.square;
  const stSel = stateCodeOf(s.state);
  return `<div class="wrap page">
    <div class="crumbs"><a href="#/">${t('Inicio')}</a><span>/</span><a href="#/catalogo">${t('Catálogo')}</a><span>/</span>${t('Finalizar compra')}</div>
    <div class="cogrid">
      <div class="pane"><h2>${t('Datos de entrega')}</h2><p class="sub">${S.user ? (LANG === 'en' ? `Buying as <b>${esc(S.user.email)}</b>.` : `Comprando como <b>${esc(S.user.email)}</b>.`) : (LANG === 'en' ? 'You can buy without an account, but <a class="link" href="#/cuenta">with one</a> you can check your order status anytime.' : 'Puedes comprar sin cuenta, pero <a class="link" href="#/cuenta">con una cuenta</a> ves el estado de tu pedido en cualquier momento.')}</p>
        <div class="ff">
          ${fld('name', t('Nombre completo'), s.name || (S.user && S.user.name), 'autocomplete="name" maxlength="120"', 'w')}
          ${fld('email', t('Correo electrónico'), S.user ? S.user.email : '', `type="email" autocomplete="email" maxlength="160" ${S.user ? 'readonly' : ''}`)}
          ${fld('phone', t('Teléfono'), s.phone, 'type="tel" autocomplete="tel" maxlength="30"')}
          ${fld('address', t('Dirección'), s.address, `autocomplete="street-address" maxlength="200" placeholder="${t('Calle, número, apartamento')}"`, 'w')}
          ${fld('city', t('Ciudad'), s.city, 'autocomplete="address-level2" maxlength="80"')}
          <div class="fi" id="stateWrap"><label for="b_state">${t('Estado')}</label>
            <select id="b_state" autocomplete="address-level1" class="${coUS ? '' : 'hidden'}"><option value="">${t('Elige tu estado')}</option>${US_STATES.map(([c, n]) => `<option value="${c}" ${c === stSel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            <input id="b_stateTxt" class="${coUS ? 'hidden' : ''}" value="${esc(coUS ? '' : s.state || '')}" maxlength="80" autocomplete="address-level1"></div>
          ${fld('zip', t('Código postal'), s.zip, 'autocomplete="postal-code" maxlength="12" inputmode="numeric"')}
          <div class="fi"><label for="b_countrySel">${t('País')}</label><select id="b_countrySel" autocomplete="country"><option value="US" ${coUS ? 'selected' : ''}>${t('Estados Unidos')}</option><option value="other" ${coUS ? '' : 'selected'}>${t('Otro país')}</option></select>
            <input id="b_countryTxt" class="${coUS ? 'hidden' : ''}" style="margin-top:8px" value="${esc(coUS ? '' : s.country || '')}" maxlength="60" placeholder="${t('País')}"></div>
          <div class="fi w"><label for="b_notes">${t('Referencias de entrega (opcional)')}</label><textarea id="b_notes" rows="2" maxlength="300"></textarea></div>
          <div class="fi w"><label for="b_ref">${t('Código de referido (opcional)')}</label>
            <div style="display:flex;gap:8px"><input id="b_ref" style="flex:1" placeholder="NVOS-XXXX" autocapitalize="characters" maxlength="24" value="${esc((S.coRef && S.coRef.code) || '')}"><button class="btn-ghost" id="refApply" type="button" style="white-space:nowrap">${t('Aplicar')}</button></div>
            <div id="refMsg" style="font-size:12px;margin-top:6px"></div></div>
          ${bal > 0 ? `<div class="fi w"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="b_useCredit" style="width:auto" ${S.coCredit ? 'checked' : ''}> ${t('Usar mi saldo a favor')} · <b>${money(bal)}</b> ${t('disponible')}</label></div>` : ''}
        </div>
        ${pay ? `<h2 style="margin-top:26px">${t('Pago')}</h2>
          <p class="sub">${t('Visa, Mastercard, American Express y Discover.')}</p>
          <div class="sqcard" id="sqCard"></div><div id="sqState" class="sqstate">${t('Cargando el formulario de pago…')}</div>
          <div class="tip">${t('Pago seguro procesado por Square. No vemos ni guardamos el número de tu tarjeta. El cargo se hace al confirmar y recibes el recibo por correo.')}</div>`
        : `<div class="tip">${LANG === 'en'
          ? `When you confirm, your order is <b>reserved</b> under this number and we email you the details. Then we contact you to complete the payment${(CFG.store || {}).whatsapp ? ' (bank transfer, Zelle or WhatsApp)' : ''}; once confirmed it moves to “Paid” and we start preparing it. You can follow every step from your account.`
          : `Al confirmar, tu pedido queda <b>reservado</b> con este número y te enviamos un correo con el detalle. Luego te contactamos para completar el pago${(CFG.store || {}).whatsapp ? ' (transferencia, Zelle o WhatsApp)' : ''}; cuando lo confirmamos pasa a “Pagado” y empezamos a prepararlo. Puedes seguir cada paso desde tu cuenta.`}</div>`}
        <div id="coErr" style="margin-top:14px"></div>
        <button class="wide" id="coGo" style="margin-top:12px">${coLabel(ct.total)}</button>
        <div class="secure-row"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>${t('Tus datos viajan cifrados y no se comparten con terceros')}</div>
      </div>
      <div class="pane cosum"><h2>${t('Resumen')}</h2><div id="coLines">${ct.lines.map(lineHtml).join('')}</div>
        <div class="tr" style="margin-top:14px"><span>${t('Subtotal')}</span><span id="sumSub">${money(ct.subtotal)}</span></div>
        <div class="tr" id="rowDisc" style="display:none;color:var(--green)"><span id="lblDisc">${t('Descuento')}</span><span id="sumDisc"></span></div>
        <div class="tr"><span>${t('Envío')}</span><span id="sumShip">${ct.shipping ? money(ct.shipping) : t('Gratis')}</span></div>
        <div class="tr"><span id="lblTax">${t('Impuesto')}</span><span id="sumTax" class="muted">${t('Se calcula con tu estado')}</span></div>
        <div class="tr" id="rowCred" style="display:none;color:var(--green)"><span>${t('Saldo usado')}</span><span id="sumCred"></span></div>
        <div class="tr sum"><span>${t('Total')}</span><span class="v" id="sumTotal">${money(ct.total)}</span></div></div>
    </div></div>`;
}
const coLabel = (total) => `${CFG.square && total > 0 ? t('Pagar') : CFG.square ? t('Confirmar pedido') : t('Reservar pedido')} · <span id="coGoTot">${money(total)}</span>`;
function coBody() {
  const g = (id) => (($('#b_' + id) || {}).value || '').trim();
  const buyer = { name: g('name'), email: g('email'), phone: g('phone'), address: g('address'), city: g('city'), zip: g('zip'), notes: g('notes'),
    state: coUS ? g('state') : g('stateTxt'), country: coUS ? 'US' : g('countryTxt') };
  const body = { items: S.cart, buyer, lang: LANG };
  if (S.coRef && S.coRef.code) body.referralCode = S.coRef.code;
  if (S.coCredit && $('#b_useCredit') && $('#b_useCredit').checked) body.useCredit = true;
  return body;
}
/* El total lo calcula el servidor (precios, envío, impuesto del estado); aquí solo se pinta. */
function paintTotals() {
  const ct = cartTotals(); const q = coQ || { subtotal: ct.subtotal, discount: 0, shipping: ct.shipping, tax: 0, taxRate: 0, taxState: '', credit: 0, total: ct.total };
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#sumSub', money(q.subtotal)); set('#sumShip', q.shipping ? money(q.shipping) : t('Gratis'));
  const rd = $('#rowDisc'); if (rd) { rd.style.display = q.discount > 0 ? '' : 'none'; set('#sumDisc', '−' + money(q.discount)); if (q.discount > 0 && S.coRef) set('#lblDisc', `${t('Descuento')} (${S.coRef.code})`); }
  const rc = $('#rowCred'); if (rc) { rc.style.display = q.credit > 0 ? '' : 'none'; set('#sumCred', '−' + money(q.credit)); }
  const stx = $('#sumTax'); if (stx) { const known = !!coQ && (!coUS || !!q.taxState); stx.classList.toggle('muted', !known); stx.textContent = known ? money(q.tax) : t('Se calcula con tu estado'); set('#lblTax', q.tax > 0 ? `${t('Impuesto')} (${q.taxState} ${q.taxRate}%)` : t('Impuesto')); }
  set('#sumTotal', money(q.total)); const go = $('#coGo'); if (go && !go.disabled) go.innerHTML = coLabel(q.total);
}
async function coQuote() {
  const my = ++quoteSeq; const r = await api('/api/orders/quote', { method: 'POST', body: coBody() }).catch(() => null);
  if (my !== quoteSeq) return null;
  if (r && r.ok) { coQ = r.totals; paintTotals(); return coQ; }
  const err = $('#coErr'); if (err && r && r.error) err.innerHTML = `<div class="err">${esc(r.error)}</div>`;
  return null;
}
function wireCheckout() {
  const cl = $('#coLines'); if (cl) { wireLines(cl); $$('.li button', cl).forEach((b) => { const prev = b.onclick; b.onclick = () => { prev(); render(); }; }); }
  const go = $('#coGo'); if (!go) return;
  const cs = $('#b_countrySel'); if (cs) cs.onchange = () => { coUS = cs.value === 'US'; $('#b_state').classList.toggle('hidden', !coUS); $('#b_stateTxt').classList.toggle('hidden', coUS); $('#b_countryTxt').classList.toggle('hidden', coUS); coQuote(); };
  const bs = $('#b_state'); if (bs) bs.onchange = () => coQuote();
  const ra = $('#refApply'); if (ra) ra.onclick = async () => {
    const code = ($('#b_ref').value || '').trim().toUpperCase(); const msg = $('#refMsg');
    if (!code) { S.coRef = null; msg.innerHTML = ''; coQuote(); return; }
    ra.disabled = true;
    const r = await api('/api/referral/check?code=' + encodeURIComponent(code)).catch(() => ({}));
    ra.disabled = false;
    if (r && r.valid) { S.coRef = { code: r.code, buyerPct: r.buyerPct, ownerName: r.ownerName }; msg.innerHTML = `<span style="color:var(--green)">✓ ${t('Código aplicado')}: ${r.buyerPct}% ${t('de descuento')}${r.ownerName ? ` · ${t('código de')} ${esc(r.ownerName)}` : ''}</span>`; }
    else { S.coRef = null; msg.innerHTML = `<span style="color:var(--rouge)">${t('Ese código no es válido o está inactivo')}</span>`; }
    coQuote();
  };
  const uc = $('#b_useCredit'); if (uc) uc.onchange = () => { S.coCredit = uc.checked; coQuote(); };
  paintTotals(); coQuote(); mountCard();
  const fail = (html) => { $('#coErr').innerHTML = `<div class="err">${html}</div>`; go.disabled = false; go.innerHTML = coLabel((coQ || cartTotals()).total); $('#coErr').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  go.onclick = async () => {
    const body = coBody(); const b = body.buyer; $('#coErr').innerHTML = '';
    $$('.fi input,.fi select').forEach((i) => i.classList.remove('bad'));
    const need = ['name', 'email', 'address', 'city'].filter((k) => !b[k]);
    if (need.length) { need.forEach((k) => $('#b_' + k).classList.add('bad')); return fail(t('Completa nombre, correo, dirección y ciudad.')); }
    if (coUS && (!b.state || !/^\d{5}(-\d{4})?$/.test(b.zip))) { if (!b.state) $('#b_state').classList.add('bad'); if (!/^\d{5}(-\d{4})?$/.test(b.zip)) $('#b_zip').classList.add('bad'); return fail(t('Elige tu estado y escribe un código postal de 5 dígitos.')); }
    go.disabled = true; go.textContent = CFG.square ? t('Procesando el pago…') : t('Reservando…');
    const q = await coQuote(); if (!q) { if (!$('#coErr').innerHTML) fail(t('No se pudo conectar')); else { go.disabled = false; go.innerHTML = coLabel(cartTotals().total); } return; }
    body.expectedTotal = q.total;
    if (CFG.square && q.total > 0) {
      if (!sq.card) return fail(t('No se pudo cargar el formulario de pago. Recarga la página.'));
      let tok; const nm = b.name.split(/\s+/);
      try { tok = await sq.card.tokenize({ amount: q.total.toFixed(2), currencyCode: 'USD', intent: 'CHARGE', customerInitiated: true, sellerKeyedIn: false,
        billingContact: { givenName: nm[0], familyName: nm.slice(1).join(' ') || nm[0], email: b.email, phone: b.phone || undefined, addressLines: [b.address], city: b.city, state: coUS ? b.state : undefined, postalCode: b.zip || undefined, countryCode: coUS ? 'US' : undefined } }); }
      catch (e) { tok = { status: 'ERR', errors: [{ message: e && e.message }] }; }
      if (!tok || tok.status !== 'OK' || !tok.token) return fail(esc(((tok && tok.errors) || []).map((e) => e.message).filter(Boolean).join(' ') || t('Revisa los datos de la tarjeta.')));
      body.payment = { sourceId: tok.token };
    }
    const r = await api('/api/orders', { method: 'POST', body }).catch(() => ({ ok: false, error: t('No se pudo conectar') }));
    if (!r.ok) return fail(esc(r.error || t('No se pudo crear el pedido')));
    if (S.user) api('/api/my/profile', { method: 'PUT', body: { ...b, country: coUS ? 'United States' : b.country } }).catch(() => {});
    S.cart = []; saveCart(); savedShip = null; S.lastOrder = r.order; S.coRef = null; S.coCredit = false; S.myRef = undefined; coQ = null;
    if (sq.card) { try { await sq.card.destroy(); } catch (_) {} sq.card = null; }
    location.hash = '#/gracias/' + encodeURIComponent(r.order.number);
  };
}
async function gracias() {
  const o = S.lastOrder; const paid = o && o.status === 'pagado';
  return `<div class="wrap page" style="max-width:720px"><div class="pane"><div class="ok">
    <div class="seal">✓</div>
    <h3>${paid ? t('Pedido confirmado') : t('Pedido reservado')}${o ? ', ' + esc(o.buyer.name.split(' ')[0]) : ''}.</h3>
    <div class="ref">${esc(S.route.number)}</div>
    <p>${paid ? t('Recibimos tu pago y ya estamos preparando tu pedido. Te enviamos un correo con el detalle; cuando salga, recibirás la guía de rastreo.') : t('Te enviamos un correo con el detalle y te contactaremos para coordinar el pago. Desde tu cuenta puedes seguir cada paso: pago, preparación, envío y entrega.')}</p>
    ${o ? orderHtml(o) : ''}
    <div class="acts"><a class="btn-gold" href="#/cuenta/pedidos">${t('Ver mis pedidos')}</a><a class="btn-ghost" href="#/catalogo">${t('Seguir comprando')}</a></div>
  </div></div></div>`;
}

/* ── Cuenta ─────────────────────────────────────────── */
function orderHtml(o) {
  const idx = STEPS.findIndex(([k]) => k === o.status);
  const steps = o.status === 'cancelado' ? '' : `<div class="steps">${STEPS.map(([k, l], i) => `<div class="st ${i < idx ? 'done' : i === idx ? 'now' : ''}">${t(l)}</div>`).join('')}</div>`;
  const disc = (o.totals && Number(o.totals.discount)) || 0, cred = (o.totals && Number(o.totals.credit)) || 0;
  return `<div class="order" style="text-align:left">
    <div class="r1"><b>${esc(o.number)}</b><span class="status ${esc(o.status)}">${esc(t(STATUS_LABEL[o.status]) || o.status)}</span></div>
    <div class="r2">${new Date(o.createdAt).toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' })} · ${t('Entrega en')} ${esc([o.buyer.address, o.buyer.city, o.buyer.state].filter(Boolean).join(', '))}</div>
    ${steps}
    <div class="items">${o.items.map((i) => `<span>${esc(i.name)} × ${i.qty}${i.wholesale ? ' · ' + t('al mayor') : ''}</span>`).join('')}</div>
    ${o.fulfillment && o.fulfillment.tracking ? `<div class="track">${t('Guía')} ${esc(o.fulfillment.tracking)}${o.fulfillment.carrier ? ' · ' + esc(o.fulfillment.carrier) : ''}</div>` : ''}
    <div class="r3"><span class="muted small">${t('Envío')} ${o.totals.shipping ? money(o.totals.shipping) : t('Gratis').toLowerCase()}${o.totals.tax ? ` · ${t('Impuesto')} ${money(o.totals.tax)}` : ''}${disc ? ` · ${t('Descuento')} −${money(disc)}` : ''}${cred ? ` · ${t('Saldo usado')} −${money(cred)}` : ''}${o.payment && o.payment.last4 ? ` · ${t('Pagado con')} ${esc(o.payment.brand || '')} ··${esc(o.payment.last4)}` : ''}${o.refunded ? ` · ${t('Reembolsado')} ${money(o.refunded)}` : ''}${o.payment && /^https:\/\//.test(o.payment.receiptUrl || '') ? ` · <a class="link" href="${esc(o.payment.receiptUrl)}" target="_blank" rel="noopener">${t('Ver recibo')}</a>` : ''}</span><span class="tot">${money(o.totals.total)}</span></div></div>`;
}
async function cuenta() {
  if (!S.user) return authHtml();
  if (S.myRef === undefined) { const r = await api('/api/my/referral').catch(() => null); S.myRef = r && r.ok && r.enabled ? r : null; }
  const tab = S.route.tab; let body = '';
  if (tab === 'pedidos') {
    const r = await api('/api/my/orders').catch(() => ({ orders: [] }));
    body = `<h2>${t('Mis pedidos')}</h2><p class="sub">${t('Aquí ves el estado de cada pedido: pendiente de pago, pagado, en preparación, enviado o entregado.')}</p>
      ${S.user.verified === false ? `<div class="notice">${t('Confirma tu correo (te enviamos un enlace al registrarte) para ver también los pedidos que hiciste antes de crear la cuenta.')}</div>` : ''}
      ${(r.orders || []).length ? r.orders.map(orderHtml).join('') : `<div class="blank"><b>${t('Todavía no tienes pedidos')}</b><a class="btn-ghost" href="#/catalogo" style="margin-top:14px">${t('Ver el catálogo')}</a></div>`}`;
  } else if (tab === 'carrito') {
    const ct = cartTotals();
    body = `<h2>${t('Mi carrito')}</h2><p class="sub">${t('Se guarda en tu cuenta: lo encuentras igual desde cualquier dispositivo.')}</p>
      ${ct.lines.length ? `<div id="acctCart">${ct.lines.map(lineHtml).join('')}</div><div class="tr sum" style="margin-top:14px"><span>${t('Total con envío')}</span><span class="v">${money(ct.total)}</span></div><a class="wide" href="#/checkout" style="display:block;text-align:center;margin-top:14px">${t('Finalizar compra')}</a>` : `<div class="blank"><b>${t('Tu carrito está vacío')}</b></div>`}`;
  } else if (tab === 'referidos') {
    const m = S.myRef;
    if (!m) {
      body = `<h2>${t('Mis referidos')}</h2><div class="blank"><b>${t('No tienes un código de referidos activo. Pregúntanos por WhatsApp para activarte uno.')}</b></div>`;
    } else {
      const KINDS = { earn: t('Ganancia'), spend: t('Gasto'), reverse: t('Reverso'), refund: t('Devolución'), adjust: t('Ajuste') };
      const log = (m.log || []).map((l) => `<div class="tr" style="font-size:13px"><span>${new Date(l.at).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' })} · ${KINDS[l.kind] || l.kind}${l.order ? ` · ${t('Pedido')} ${esc(l.order)}` : ''}</span><span style="color:${Number(l.amount) >= 0 ? 'var(--green)' : 'var(--rouge)'}">${Number(l.amount) >= 0 ? '+' : '−'}${money(Math.abs(Number(l.amount) || 0))}</span></div>`).join('');
      body = `<h2>${t('Mis referidos')}</h2><p class="sub">${t('Comparte tu código: quien compre con él recibe descuento y tú ganas saldo cuando el pedido se paga. Tu saldo se descuenta en tu próxima compra.')}</p>
        <div class="dnote" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span>${t('Tu código')}:</span> <b style="font-size:20px;letter-spacing:1px">${esc(m.code)}</b> <button class="btn-ghost" id="refCopy" type="button">${t('Copiar')}</button></div>
        <div class="hero-stats" style="margin-top:16px">
          <div class="hst"><div class="n">${money(m.balance)}</div><div class="l">${t('Saldo a favor')}</div></div>
          <div class="hst"><div class="n">${money(m.earned)}</div><div class="l">${t('Ganado en total')}</div></div>
          <div class="hst"><div class="n">${m.uses}</div><div class="l">${t('Compras con tu código')}</div></div>
        </div>
        <h2 style="margin-top:24px;font-size:18px">${t('Movimientos')}</h2>
        ${log || `<p class="sub">${t('Sin movimientos todavía.')}</p>`}`;
    }
  } else {
    const r = await api('/api/my/profile').catch(() => ({})); const s = r.shipping || {};
    const fld = (id, label, val, w = '') => `<div class="fi ${w}"><label for="p_${id}">${label}</label><input id="p_${id}" value="${esc(val || '')}"></div>`;
    body = `<h2>${t('Mi perfil')}</h2><p class="sub">${t('Guarda tu dirección para que el siguiente pedido sea más rápido.')}</p>
      <div class="ff"><div class="fi w"><label>${t('Correo')}</label><input value="${esc(S.user.email)}" readonly></div>
      ${fld('name', t('Nombre y apellido'), s.name || S.user.name)}${fld('phone', t('Teléfono'), s.phone)}${fld('address', t('Dirección'), s.address, 'w')}
      ${fld('city', t('Ciudad'), s.city)}${fld('state', t('Estado'), s.state)}${fld('zip', t('Código postal'), s.zip)}${fld('country', t('País'), s.country)}</div>
      <button class="wide" id="pSave" style="margin-top:16px">${t('Guardar dirección')}</button>`;
  }
  return `<div class="wrap page"><div class="acctgrid">
    <aside class="anav"><div class="who">${S.user.avatar ? `<img src="${esc(S.user.avatar)}" alt="">` : `<div class="av">${esc((S.user.name || '?')[0].toUpperCase())}</div>`}<div><b>${esc(S.user.name)}</b><small>${esc(S.user.email)}</small></div></div>
      <a href="#/cuenta/perfil" class="${tab === 'perfil' ? 'on' : ''}">${t('Mi perfil')}</a><a href="#/cuenta/pedidos" class="${tab === 'pedidos' ? 'on' : ''}">${t('Mis pedidos')}</a><a href="#/cuenta/carrito" class="${tab === 'carrito' ? 'on' : ''}">${t('Mi carrito')}</a>
      ${S.myRef ? `<a href="#/cuenta/referidos" class="${tab === 'referidos' ? 'on' : ''}">${t('Mis referidos')}</a>` : ''}
      <a href="#" id="signOut">${t('Cerrar sesión')}</a></aside>
    <div class="pane">${body}</div></div></div>`;
}
function authHtml(mode = 'login') {
  const google = sb ? `<button class="btn-google" id="gBtn"><img src="https://www.gstatic.com/firebaseui/2.0.0/images/auth/google.svg" alt="">${t('Continuar con Google')}</button><div class="or">${t('o con tu correo')}</div>` : `<div class="notice">${t('Modo local: entra solo con tu correo para probar.')}</div>`;
  return `<div class="wrap page"><div class="pane authbox">
    <h2>${mode === 'login' ? t('Entra a tu cuenta') : t('Crea tu cuenta')}</h2><p class="sub">${t('Con tu cuenta guardas el carrito, ves tus pedidos y sigues su estado.')}</p>
    ${google}<div id="aErr"></div>
    <div class="ff">
    ${mode === 'signup' ? `<div class="fi w"><label for="a_name">${t('Nombre')}</label><input id="a_name" autocomplete="name"></div>` : ''}
    <div class="fi w"><label for="a_email">${t('Correo')}</label><input id="a_email" type="email" autocomplete="email"></div>
    ${sb ? `<div class="fi w"><label for="a_pw">${t('Contraseña')}</label><input id="a_pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></div>` : ''}
    </div>
    <button class="wide" id="aGo" style="margin-top:16px">${mode === 'login' ? t('Entrar') : t('Registrarme')}</button>
    ${sb ? `<div class="sw">${mode === 'login' ? `${t('¿Primera vez?')} <button id="aSwitch" data-m="signup">${t('Crea tu cuenta')}</button>` : `${t('¿Ya tienes cuenta?')} <button id="aSwitch" data-m="login">${t('Entra')}</button>`}</div>` : ''}
  </div></div>`;
}
function wireAuth(mode = 'login') {
  const g = $('#gBtn'); if (g) g.onclick = async () => { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/#/cuenta' } }); if (error) $('#aErr').innerHTML = `<div class="err">${esc(error.message)}</div>`; };
  const sw = $('#aSwitch'); if (sw) sw.onclick = () => { $('#main').innerHTML = authHtml(sw.dataset.m); wireAuth(sw.dataset.m); };
  const go = $('#aGo'); if (!go) return;
  const submit = async () => {
    const email = ($('#a_email').value || '').trim().toLowerCase(); const err = $('#aErr'); err.innerHTML = '';
    if (!email) { err.innerHTML = `<div class="err">${t('Escribe tu correo.')}</div>`; return; }
    if (!sb) { const name = ($('#a_name') || {}).value || email.split('@')[0]; localStorage.setItem('devtoken', `dev:${email}:${name}`); S.token = localStorage.getItem('devtoken'); S.myRef = undefined; await loadUser(); render(); return; }
    const password = $('#a_pw').value; if (password.length < 6) { err.innerHTML = `<div class="err">${t('La contraseña necesita al menos 6 caracteres.')}</div>`; return; }
    go.disabled = true;
    if (mode === 'signup') {
      const name = ($('#a_name').value || '').trim();
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
      go.disabled = false;
      if (error) { err.innerHTML = `<div class="err">${esc(error.message)}</div>`; return; }
      if (!data.session) { err.innerHTML = `<div class="ok-box">${t('Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí para entrar.')}</div>`; return; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      go.disabled = false;
      if (error) { err.innerHTML = `<div class="err">${/invalid/i.test(error.message) ? t('Correo o contraseña incorrectos.') : esc(error.message)}</div>`; return; }
      S.myRef = undefined;
    }
  };
  go.onclick = submit; $$('#a_email,#a_pw,#a_name').forEach((i) => i.onkeydown = (e) => { if (e.key === 'Enter') submit(); });
}
function wireCuenta() {
  if (!S.user) { wireAuth('login'); return; }
  const so = $('#signOut'); if (so) so.onclick = (e) => { e.preventDefault(); S.myRef = undefined; signOut(); };
  const ps = $('#pSave'); if (ps) ps.onclick = async () => { const b = {}; for (const k of ['name', 'phone', 'address', 'city', 'state', 'zip', 'country']) b[k] = $('#p_' + k).value; const r = await api('/api/my/profile', { method: 'PUT', body: b }); toast(r.ok ? t('Dirección guardada') : (r.error || t('No se pudo guardar'))); };
  const rc = $('#refCopy'); if (rc) rc.onclick = () => { navigator.clipboard.writeText(S.myRef.code).then(() => toast(t('Código copiado'))).catch(() => {}); };
  const ac = $('#acctCart'); if (ac) wireLines(ac);
}
async function ayuda() {
  const sh = S.catalog.shipping; const wa = (CFG.store || {}).whatsapp;
  if (LANG === 'en') return `<div class="wrap page prose"><div class="crumbs"><a href="#/">Home</a><span>/</span>Help</div>
    <h1 class="ptitle">Shipping, payments & returns</h1>
    <h2>Shipping</h2><p>Standard shipping is ${money(sh.flat)} per order; free over ${money(sh.freeOver)}. Each product lists its weight and dimensions, which we use to prepare the dispatch. When your order ships, you get the tracking number by email and in your account.</p>
    <h2>Payments</h2><p>Once you reserve your order we contact you by email${wa ? ' or WhatsApp' : ''} to arrange payment. When we confirm it, your order moves to "Paid" and we start preparing it. You can see every status change in your account.</p>
    <h2>Wholesale purchases</h2><p>Products with a wholesale price show it on their page. The price is applied automatically in the cart once you reach the minimum quantity.</p>
    <h2>Referrals</h2><p>If you have a referral code, share it: whoever buys with it gets a discount, and you earn store credit once the order is paid. Your credit can be applied at checkout on your next purchase.</p>
    <h2>Returns</h2><p>If something arrives damaged or is not what you ordered, write to us within 48 hours of delivery with a photo and we will sort it out.</p>
    ${wa ? `<a class="btn-gold" href="https://wa.me/${wa.replace(/\D/g, '')}" target="_blank" rel="noopener" style="margin-top:22px">Message us on WhatsApp</a>` : ''}</div>`;
  return `<div class="wrap page prose"><div class="crumbs"><a href="#/">Inicio</a><span>/</span>Ayuda</div>
    <h1 class="ptitle">Envíos, pagos y devoluciones</h1>
    <h2>Envíos</h2><p>Envío estándar ${money(sh.flat)} por pedido; gratis a partir de ${money(sh.freeOver)}. Cada producto tiene su peso y medidas en la ficha, y con eso preparamos el despacho. Cuando tu pedido sale, recibes la guía de rastreo por correo y la ves en tu cuenta.</p>
    <h2>Pagos</h2><p>Al reservar tu pedido te contactamos por correo${wa ? ' o WhatsApp' : ''} para coordinar el pago. Cuando lo confirmamos, tu pedido pasa a “Pagado” y empezamos a prepararlo. Puedes ver cada cambio de estado en tu cuenta.</p>
    <h2>Compras al mayor</h2><p>Los productos con precio al mayor lo muestran en su ficha. El precio se aplica solo en el carrito al llegar a la cantidad mínima.</p>
    <h2>Referidos</h2><p>Si tienes un código de referidos, compártelo: quien compre con él recibe descuento y tú ganas saldo a favor cuando el pedido se paga. Tu saldo se puede usar en el checkout de tu próxima compra.</p>
    <h2>Devoluciones</h2><p>Si algo llega dañado o no es lo que pediste, escríbenos dentro de las 48 horas siguientes a la entrega con una foto y lo resolvemos.</p>
    ${wa ? `<a class="btn-gold" href="https://wa.me/${wa.replace(/\D/g, '')}" target="_blank" rel="noopener" style="margin-top:22px">Escribir por WhatsApp</a>` : ''}</div>`;
}

/* ── Arranque ───────────────────────────────────────── */
/* Fotos que no cargan: se cambian por una ficha con la inicial de la marca (o se quitan) */
document.addEventListener('error', (e) => {
  const el = e.target; if (!el || el.tagName !== 'IMG' || !el.dataset || !el.dataset.fb) return;
  if (el.dataset.fb === 'rm') { el.remove(); return; }
  const d = document.createElement('div'); d.className = 'tile'; d.style.background = el.dataset.bg || ''; d.textContent = el.dataset.ini || '·'; el.replaceWith(d);
}, true);
{ const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear(); }
window.addEventListener('hashchange', render);
$('#cartBtn').onclick = openCart; $('#dClose').onclick = closeCart; $('#veil').onclick = closeCart;
$('#langBtn').onclick = () => { LANG = LANG === 'es' ? 'en' : 'es'; try { localStorage.setItem('nvos_lang', LANG); } catch (_) {} document.documentElement.lang = LANG; paintFrame(); render(); };
document.documentElement.lang = LANG;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
$('#finder').onsubmit = (e) => { e.preventDefault(); const t = $('#q').value.trim(); location.hash = '#/catalogo' + (t ? '?q=' + encodeURIComponent(t) : ''); };
S.view = localStorage.getItem('view') || 'grid';
loadCart();
(async () => {
  render();
  const ok = await loadCatalog();
  if (!ok) { $('#main').innerHTML = `<div class="wrap page"><div class="empty"><b>${t('No pudimos cargar el catálogo')}</b>${t('Recarga la página en unos segundos.')}</div></div>`; return; }
  await initAuth();
  await render();
  setInterval(async () => { try { const r = await fetch('/api/catalog'); if (r.ok) { S.catalog = await r.json(); S.products = S.catalog.products; paintCartCount(); } } catch (_) {} }, 90000);
})();
})();
