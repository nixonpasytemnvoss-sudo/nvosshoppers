(() => {
'use strict';
const $ = (s) => document.querySelector(s); const $$ = (s) => Array.from(document.querySelectorAll(s));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = (url, opts) => fetch(url, { credentials: 'same-origin', ...opts }).then((r) => r.json());
const post = (url, body, method = 'POST') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const S = { catalog: { products: [] }, pricing: {}, manual: [], orders: [], chan: 'web', catQ: '', catF: '', catShip: '', catSrc: '', priQ: '', ordF: '', manQ: '', manF: '', brQ: '', brF: '', editingId: null, image: '', formNotes: [], status: {} };
let ft; const flash = (m) => { const el = $('#flash'); el.textContent = m; el.classList.add('show'); clearTimeout(ft); ft = setTimeout(() => el.classList.remove('show'), 2600); };
const thumb = (p) => p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : `<div class="thumb" style="display:grid;place-items:center;color:#9AA3B5">${esc((p.brand||'?')[0])}</div>`;
const AVS = { AVS_ACCEPTED: 'coincide', AVS_REJECTED: 'NO coincide', AVS_NOT_CHECKED: 'sin revisar', CVV_ACCEPTED: 'correcto', CVV_REJECTED: 'incorrecto', CVV_NOT_CHECKED: 'sin revisar' };
const RISK = { NORMAL: 'normal', MODERATE: 'moderado', HIGH: 'ALTO', PENDING: 'pendiente' };
const STATUS = { pendiente_pago: 'Pendiente de pago', pagado: 'Pagado', en_proceso: 'En preparación', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
const cats = () => (S.catalog.categories && S.catalog.categories.length) ? S.catalog.categories : (S.pricing.store && S.pricing.store.categories || []).map((c) => c.key).concat(['Otros']);
const NOTES = () => S.catalog.notes || [];
const PERF = 'Perfumería';
const note = (html, kind = '') => `<div class="note ${kind}">${html}</div>`;

/* ══ sesión ══ */
async function boot() { const s = await api('/api/admin/session').catch(() => ({})); if (s.admin) enter(); }
async function enter() {
  $('#gate').style.display = 'none'; $('#app').classList.add('on'); await loadAll();
  if (location.hash.startsWith('#chan')) { showView('chan'); const m = decodeURIComponent(location.hash.slice(6)); if (m) flash(m); history.replaceState(null, '', location.pathname); }
}
$('#gateGo').onclick = doLogin; $('#gatePw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const r = await post('/api/admin/login', { password: $('#gatePw').value, code: $('#gateCode').value.trim() });
  if (r.need2fa) { $('#gateCode').style.display = ''; $('#gateCode').focus(); }
  if (!r.ok) { $('#gateErr').textContent = r.error || 'No se pudo entrar'; return; }
  $('#gatePw').value = ''; $('#gateCode').value = ''; enter();
}
$('#gateCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
/* si la sesión vence, cualquier respuesta 401 devuelve a la pantalla de acceso */
const rawFetch = window.fetch.bind(window);
window.fetch = async (...a) => { const r = await rawFetch(...a); if (r.status === 401 && $('#app').classList.contains('on') && !String(a[0]).includes('/api/admin/login')) { location.reload(); } return r; };
$('#doLogout').onclick = async () => { await post('/api/admin/logout', {}); location.reload(); };

/* ══ carga ══ */
async function loadAll() {
  const [cat, pri, man, ord, st] = await Promise.all([api('/api/admin/catalog'), api('/api/admin/pricing'), api('/api/admin/products'), api('/api/admin/orders'), api('/api/admin/status')]);
  S.catalog = cat; S.pricing = pri; S.manual = Array.isArray(man) ? man : []; S.orders = Array.isArray(ord) ? ord : []; S.status = st;
  const nm = String(pri.store.name || 'NVOS').split(/\s+/)[0]; $('#aName').innerHTML = (nm.length >= 4 ? esc(nm.slice(0, 2)) + '<b>' + esc(nm[2]) + '</b>' + esc(nm.slice(3)) : esc(nm)).toUpperCase();
  const ac = $('#apiChip');
  if (st.mode === 'live') { ac.className = 'chip ok'; ac.textContent = `Proveedor conectado · ${st.apiCount} productos`; }
  else if (st.mode === 'conectando') { ac.className = 'chip warn'; ac.textContent = 'Conectando con el proveedor…'; }
  else { ac.className = 'chip bad'; ac.textContent = st.mode === 'sin-credenciales' ? 'Proveedor sin credenciales' : 'Proveedor sin conexión'; }
  const dc = $('#dbChip'); dc.className = 'chip ' + (st.storage === 'Supabase' ? 'ok' : 'warn'); dc.textContent = 'Datos: ' + st.storage;
  $('#apiMsg').innerHTML = st.error ? `<div class="note">${esc(st.error)}</div>` : '';
  $('#sysInfo').innerHTML = `Proveedor: ${esc(st.mode)}${st.apiAt ? ' · última lectura ' + new Date(st.apiAt).toLocaleString('es') : ''}<br>Datos: ${esc(st.storage)}<br>Correos: ${st.email ? 'Resend activo' : 'apagados (falta RESEND_API_KEY)'}<br>Admins por correo: ${st.adminEmails.length ? esc(st.adminEmails.join(', ')) : 'ninguno (solo contraseña)'}`;
  fillCatSelects(); $('#m_imgG').classList.toggle('hide', !st.googleImages);
  $('#brandList').innerHTML = [...new Set(S.catalog.products.map((p) => p.brand))].sort().map((b) => `<option value="${esc(b)}">`).join('');
  paintKpis(); paintCat(); paintManual(); paintPricing(); paintOrders(); paintSettings(); loadChannels(); loadCustomers(); loadTax(); loadSecurity();
}
async function reloadCatalog() { S.catalog = await api('/api/admin/catalog'); S.manual = await api('/api/admin/products'); fillCatSelects(); paintKpis(); paintCat(); paintManual(); paintPriRows(); }
$('#apiRefresh').onclick = async () => { $('#apiRefresh').disabled = true; const r = await post('/api/admin/refresh', {}); $('#apiRefresh').disabled = false; flash(r.mode === 'live' ? `Catálogo actualizado: ${r.apiCount} productos del proveedor` : (r.error || 'No se pudo conectar')); loadAll(); };

/* ══ catálogo ══ */
function fillCatSelects() {
  const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; if ([...sel.options].some((o) => o.value === v)) sel.value = v; };
  const o = cats().map((c) => `<option>${esc(c)}</option>`).join('');
  keep($('#catF'), '<option value="">Todas las categorías</option>' + o);
  keep($('#manF'), '<option value="">Todas las categorías</option>' + o);
  keep($('#m_cat'), o + '<option value="__new">+ Nueva categoría…</option>');
  togglePerf();
}
function isWebCat(c) { const vis = S.pricing.visibility || {}; return !vis.enforce || (vis.webCategories || []).includes(c); }
function togglePerf() {
  const c = $('#m_cat').value; $$('.perf-only').forEach((el) => el.classList.toggle('hide', c !== PERF));
  $('#m_catHint').textContent = isWebCat(c) ? 'Se publica en tu web y en los marketplaces.' : 'No sale en tu web: queda como inventario para eBay, Walmart o Mercado Libre.';
}
async function addCategory(name) {
  name = String(name || '').trim().slice(0, 60); if (!name) return false;
  if (cats().some((c) => c.toLowerCase() === name.toLowerCase())) { flash('Esa categoría ya existe'); return false; }
  const r = await post('/api/admin/pricing', { store: { categories: [...(S.pricing.store.categories || []), { key: name, desc: '', tone: 'otro' }] } });
  if (!r.ok) { flash('No se pudo crear la categoría'); return false; }
  S.pricing = r.rules; S.catalog = await api('/api/admin/catalog'); fillCatSelects(); paintPricing(); flash('Categoría creada: ' + name); return true;
}
function paintKpis() {
  const st = S.catalog.stats || {}; const noShip = S.catalog.products.filter((p) => !p.weightOz).length;
  $('#kpis').innerHTML = [[st.products || 0, 'Productos en total'], [st.supplier || 0, 'Del proveedor'], [st.own || 0, 'En mi inventario'], [st.webVisible ?? st.products ?? 0, 'Visibles en tu web'], [st.hidden || 0, 'Solo inventario (eBay / ML…)'], [st.units || 0, 'Unidades disponibles'], [noShip, 'Sin ficha de envío'], [S.orders.filter((o) => o.status === 'pendiente_pago').length, 'Pedidos por cobrar']]
    .map(([v, l]) => `<div class="kpi"><div class="v">${Number(v).toLocaleString('es')}</div><div class="l">${l}</div></div>`).join('');
  const vis = S.pricing.visibility || {};
  $('#kpiNote').innerHTML = `<b>${st.webVisible || 0}</b> visibles en tu web + <b>${st.hidden || 0}</b> solo inventario = <b>${st.products || 0}</b> productos. En la web solo sale ${vis.enforce ? esc((vis.webCategories || []).join(', ') || 'nada') : 'todo'}; lo demás (chocolates, enlatados, lo que crees) queda como inventario para los marketplaces.${st.both ? ` ${st.both} producto${st.both === 1 ? ' está' : 's están'} a la vez en el proveedor y en tu inventario y se cuenta${st.both === 1 ? '' : 'n'} una sola vez.` : ''}`;
  $('#nAll').textContent = (st.products || 0).toLocaleString('es'); $('#nApi').textContent = (st.supplier || 0).toLocaleString('es'); $('#nOwn').textContent = (st.own || 0).toLocaleString('es');
}
const SRC_TXT = {
  '': ['Catálogo completo', 'Todos los productos: los del proveedor (API) y los tuyos, unidos por código UPC. Desde aquí corriges la categoría, a quién va dirigido cada perfume, sus notas y la <b>ficha de envío</b> (peso y medidas). Sin ficha, ShipStation no puede cotizar el envío.'],
  api: ['Catálogo proveedor', 'Lo que Shoppex ofrece por su API. Su stock y su costo se leen solos cada minuto; tú decides la categoría, las notas, la ficha de envío y si sale en tu web.'],
  own: ['Catálogo inventario mío', 'La mercancía que tienes en mano. <b>Es la que se vende primero</b>: al proveedor solo se le pide lo que tú no tengas. Para añadir productos o cambiar stock ve a la pestaña “Mi inventario”.'],
};
function paintCat() {
  const q = S.catQ.toLowerCase();
  const list = S.catalog.products.filter((p) => (S.catSrc === 'api' ? p.hasApi : S.catSrc === 'own' ? p.hasOwn : true) && (!q || (p.name + ' ' + p.brand + ' ' + p.category + ' ' + p.upc).toLowerCase().includes(q)) && (!S.catF || p.category === S.catF) && (S.catShip !== 'sin' || !p.weightOz));
  $('#catTitle').textContent = SRC_TXT[S.catSrc][0]; $('#catSub').innerHTML = SRC_TXT[S.catSrc][1];
  $$('#catSrc button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.src === S.catSrc));
  $('#catCount').textContent = `${list.length.toLocaleString('es')} productos`;
  const opts = (sel) => cats().map((c) => `<option ${sel === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('#catRows').innerHTML = list.slice(0, 400).map((p) => {
    const manItem = p.hasOwn ? S.manual.find((x) => (p.upc && String(x.upc) === String(p.upc)) || x.id === p.id) : null;
    const k = esc(p.upc || p.id); const dis = p.upc ? '' : 'disabled'; const nn = (p.notes || []).length;
    return `<tr data-upc="${k}" data-hasupc="${p.upc ? 1 : 0}">
      <td>${thumb(p)}</td><td style="min-width:230px"><b>${esc(p.name)}</b><br><span class="muted" style="font-size:11.5px">${esc(p.brand)} · ${esc(p.upc || 'sin UPC')}</span></td>
      <td style="white-space:nowrap">${p.hasApi ? '<span class="src api">Proveedor</span> ' : ''}${p.hasOwn ? '<span class="src man">Mío</span>' : ''}</td>
      <td><select data-m="category" ${dis}>${opts(p.category)}</select></td>
      <td>${p.category === PERF ? `<button class="btn soft sm" data-notes="${k}" ${dis} title="${esc((p.notes || []).map((x) => (NOTES().find((n) => n.key === x) || {}).es || x).join(', ') || 'Sin notas detectadas')}">${esc(p.gender || '—')} · ${nn} nota${nn === 1 ? '' : 's'}</button>` : '<span class="muted">—</span>'}</td>
      <td class="num">${p.stock}${p.hasApi && p.hasOwn ? `<br><span class="stk">${p.ownFree} mío + ${p.apiFree} prov.</span>` : ''}${p.committed ? `<br><span class="stk">−${p.committed} vendidas</span>` : ''}</td>
      <td class="num">${money(p.cost)}</td><td class="num"><b>${money(p.sell)}</b></td>
      <td><input data-m="weightOz" type="number" step="0.1" value="${p.weightOz ?? ''}" placeholder="oz" style="width:64px" ${dis}></td>
      <td style="white-space:nowrap"><input data-m="lengthIn" type="number" step="0.1" value="${p.lengthIn ?? ''}" style="width:52px" ${dis}> <input data-m="widthIn" type="number" step="0.1" value="${p.widthIn ?? ''}" style="width:52px" ${dis}> <input data-m="heightIn" type="number" step="0.1" value="${p.heightIn ?? ''}" style="width:52px" ${dis}></td>
      <td style="white-space:nowrap"><input data-m="wholesaleMin" type="number" step="1" value="${p.wholesaleMin ?? ''}" style="width:52px" ${dis}> <input data-m="wholesalePrice" type="number" step="0.01" value="${p.wholesalePrice ?? ''}" style="width:70px" ${dis}></td>
      <td><input type="checkbox" data-m="featured" ${p.featured ? 'checked' : ''} ${dis}></td>
      <td><input type="checkbox" data-m="webVisible" title="Visible en tu web (desmarcado = solo inventario para eBay/Walmart/ML)" ${p.webVisible ? 'checked' : ''} ${dis}></td>
      <td>${manItem ? `<button class="btn soft sm" data-edit="${esc(manItem.id)}">Editar</button>` : ''}</td></tr>`;
  }).join('') + (list.length > 400 ? `<tr><td colspan="14" class="muted">Mostrando 400 de ${list.length}. Usa el buscador.</td></tr>` : '') + (!list.length ? `<tr><td colspan="14" class="muted" style="padding:18px">${S.catSrc === 'own' ? 'Todavía no tienes productos en tu inventario. Ve a la pestaña “Mi inventario” y escanea el primero.' : 'No hay productos con ese filtro.'}</td></tr>` : '');
  $$('#catRows [data-m]').forEach((el) => el.onchange = async () => {
    const tr = el.closest('tr'); const upc = tr.dataset.upc; const k = el.dataset.m;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    const r = await post('/api/admin/meta', { upc, [k]: v === '' ? '' : v });
    if (r.ok) { flash('Ficha guardada'); if (k === 'category' || k === 'webVisible') reloadCatalog(); } else flash(r.error || 'No se pudo guardar');
  });
  $$('#catRows [data-edit]').forEach((b) => b.onclick = () => { editManual(b.dataset.edit); showView('man'); });
  $$('#catRows [data-notes]').forEach((b) => b.onclick = () => openNotes(b.dataset.notes));
}
$('#catQ').oninput = (e) => { S.catQ = e.target.value; paintCat(); }; $('#catF').onchange = (e) => { S.catF = e.target.value; paintCat(); }; $('#catShip').onchange = (e) => { S.catShip = e.target.value; paintCat(); };
$$('#catSrc button').forEach((b) => b.onclick = () => { S.catSrc = b.dataset.src; paintCat(); });

/* notas y género de un perfume */
let nmUpc = '';
const chipHtml = (sel) => NOTES().map((n) => `<button type="button" class="chipb" data-n="${n.key}" aria-pressed="${sel.includes(n.key)}">${esc(n.es)}</button>`).join('');
const wireChips = (root, onChange) => $$('.chipb', root).forEach((b) => b.onclick = () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); if (onChange) onChange(); });
const readChips = (root) => $$('.chipb[aria-pressed="true"]', root).map((b) => b.dataset.n);
function openNotes(upc) {
  const p = S.catalog.products.find((x) => String(x.upc || x.id) === String(upc)); if (!p) return; nmUpc = upc;
  $('#nmTitle').textContent = p.name; $('#nmSub').textContent = `${p.brand} · UPC ${p.upc} · ${p.notesManual ? 'notas fijadas a mano' : 'notas detectadas por el nombre y la descripción'}`;
  $('#nmGender').value = p.gender || ''; $('#nmNotes').innerHTML = chipHtml(p.notes || []); wireChips($('#nmNotes'));
  $('#noteModal').classList.add('on');
}
const closeNotes = () => $('#noteModal').classList.remove('on');
$('#nmCancel').onclick = closeNotes; $('#noteModal').onclick = (e) => { if (e.target.id === 'noteModal') closeNotes(); };
$('#nmSave').onclick = async () => { const r = await post('/api/admin/meta', { upc: nmUpc, gender: $('#nmGender').value, notes: readChips($('#nmNotes')) }); flash(r.ok ? 'Notas guardadas' : (r.error || 'No se pudo guardar')); closeNotes(); reloadCatalog(); };
$('#nmAuto').onclick = async () => { const r = await post('/api/admin/meta', { upc: nmUpc, gender: '', notes: '' }); flash(r.ok ? 'Vuelve a detectarse solo' : (r.error || 'No se pudo guardar')); closeNotes(); reloadCatalog(); };

/* ══ mi inventario ══ */
const FIELDS = { m_name: 'name', m_brand: 'brand', m_cat: 'category', m_type: 'type', m_upc: 'upc', m_supplier: 'supplier', m_cost: 'cost', m_stock: 'stock', m_cond: 'condition', m_price: 'price', m_gender: 'gender', m_w: 'weightOz', m_l: 'lengthIn', m_wd: 'widthIn', m_h: 'heightIn', m_wmin: 'wholesaleMin', m_wpr: 'wholesalePrice', m_tags: 'tags', m_feat: 'featured', m_desc: 'description' };
const IMG_HINT = 'Haz clic para subir una foto';
/* Deja la foto cuadrada (1200 px) y centrada sobre blanco. Si el fondo original es claro y parejo
   (gris o crema de estudio), lo lleva a blanco puro rellenando desde los bordes. */
function whitenBackground(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const bg = corners.reduce((a, c) => [a[0] + c[0] / 4, a[1] + c[1] / 4, a[2] + c[2] / 4], [0, 0, 0]);
  const light = (bg[0] + bg[1] + bg[2]) / 3 > 205; const even = corners.every((c) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < 36);
  if (!light || !even || (bg[0] > 251 && bg[1] > 251 && bg[2] > 251)) return false;
  const tol = 30; const seen = new Uint8Array(w * h); const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop(); if (seen[p]) continue; seen[p] = 1; const i = p * 4;
    if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > tol) continue;
    d[i] = d[i + 1] = d[i + 2] = 255; const x = p % w;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1); if (p >= w) stack.push(p - w); if (p < w * (h - 1)) stack.push(p + w);
  }
  ctx.putImageData(img, 0, 0); return true;
}
function whiteSquare(dataUrl) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      try {
        const k0 = Math.min(1, 1400 / Math.max(im.width, im.height)); const w0 = Math.max(1, Math.round(im.width * k0)), h0 = Math.max(1, Math.round(im.height * k0));
        const a = document.createElement('canvas'); a.width = w0; a.height = h0; const ax = a.getContext('2d', { willReadFrequently: true });
        ax.fillStyle = '#fff'; ax.fillRect(0, 0, w0, h0); ax.drawImage(im, 0, 0, w0, h0); whitenBackground(ax, w0, h0);
        const side = 1200, pad = 60; const c = document.createElement('canvas'); c.width = c.height = side; const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, side, side); x.imageSmoothingQuality = 'high';
        const k = Math.min((side - 2 * pad) / w0, (side - 2 * pad) / h0); const w = w0 * k, h = h0 * k; x.drawImage(a, (side - w) / 2, (side - h) / 2, w, h);
        resolve(c.toDataURL('image/jpeg', 0.9));
      } catch (e) { reject(e); }
    };
    im.onerror = () => reject(new Error('No se pudo leer la imagen')); im.src = dataUrl;
  });
}
function showImage(url) { S.image = url || ''; $('#imgPrev').innerHTML = url ? `<img src="${esc(url)}" alt="">` : ''; $('#imgHint').textContent = url ? 'Toca para cambiar la foto' : IMG_HINT; }
async function useImageData(dataUrl) {
  try {
    $('#imgHint').textContent = 'Preparando la foto…';
    const out = $('#m_white').checked ? await whiteSquare(dataUrl) : dataUrl;
    const r = await post('/api/admin/upload', { dataUrl: out }); if (!r.ok) throw new Error(r.error || 'No se pudo subir');
    showImage(r.url); flash($('#m_white').checked ? 'Foto guardada sobre fondo blanco' : 'Foto guardada');
  } catch (e) { flash(e.message); $('#imgHint').textContent = 'Intenta con otra foto'; }
}
async function importImage(url) {
  url = String(url || '').trim(); if (!/^https?:\/\//i.test(url)) { flash('Pega un enlace que empiece por https://'); return; }
  $('#imgHint').textContent = 'Trayendo la foto…';
  const r = await post('/api/admin/image-import', { url }); if (!r.ok) { flash(r.error || 'No se pudo traer la foto'); $('#imgHint').textContent = S.image ? 'Toca para cambiar la foto' : IMG_HINT; return; }
  await useImageData(r.dataUrl);
}
function showCands(urls) {
  $('#imgCands').innerHTML = (urls || []).map((u) => `<button type="button" class="cand" data-u="${esc(u)}" title="Usar esta foto"><img src="${esc(u)}" alt="" referrerpolicy="no-referrer" data-fb="cand"></button>`).join('');
  $$('#imgCands .cand').forEach((b) => b.onclick = () => importImage(b.dataset.u));
}
$('#imgDrop').onclick = () => $('#m_file').click();
$('#m_file').addEventListener('change', () => {
  const f = $('#m_file').files[0]; if (!f) return; if (f.size > 15e6) { flash('La imagen supera 15 MB'); return; }
  const rd = new FileReader(); rd.onload = () => useImageData(rd.result); rd.readAsDataURL(f); $('#m_file').value = '';
});
$('#m_imgGo').onclick = () => importImage($('#m_imgUrl').value);
$('#m_imgG').onclick = async () => {
  const q = [$('#m_brand').value, $('#m_name').value].join(' ').trim() || $('#m_upc').value.trim(); if (!q) { flash('Escribe primero el nombre o el UPC'); return; }
  const r = await api('/api/admin/image-search?q=' + encodeURIComponent(q)); if (!r.ok) { flash(r.error || 'Google no devolvió fotos'); return; }
  showCands(r.images); flash(r.images.length ? 'Elige una de las fotos' : 'Google no encontró fotos con fondo blanco');
};
function setFormNotes(list) { S.formNotes = list || []; $('#m_notes').innerHTML = chipHtml(S.formNotes); wireChips($('#m_notes'), () => { S.formNotes = readChips($('#m_notes')); }); }
function clearForm() { S.editingId = null; showImage(''); for (const id of Object.keys(FIELDS)) $('#' + id).value = ''; $('#m_cat').value = cats()[0]; $('#m_cond').value = 'nuevo'; $('#m_imgUrl').value = ''; showCands([]); setFormNotes([]); togglePerf(); $('#manTitle').textContent = 'Añadir producto a mi inventario'; }
$('#mReset').onclick = () => { clearForm(); $('#scanOut').innerHTML = ''; };
$('#m_cat').onchange = async () => {
  if ($('#m_cat').value === '__new') { const name = (prompt('Nombre de la nueva categoría:') || '').trim(); const ok = name && await addCategory(name); $('#m_cat').value = ok ? name : cats()[0]; }
  togglePerf();
};
function fillForm(p) {
  for (const [el, k] of Object.entries(FIELDS)) { let v = p[k]; if (k === 'tags') v = Array.isArray(v) ? v.join(', ') : (v || ''); if (k === 'featured') v = v ? '1' : ''; if (k === 'condition') v = v || 'nuevo'; if (v === '—') v = ''; if (k === 'category' && v && !cats().includes(v)) v = 'Otros'; $('#' + el).value = v == null ? '' : v; }
  if (!$('#m_cat').value) $('#m_cat').value = cats()[0];
  showImage(p.image || ''); setFormNotes(p.notesManual === false ? [] : (p.notes || [])); togglePerf();
}
function editManual(id) {
  const p = S.manual.find((x) => x.id === id); if (!p) return; S.editingId = id; showCands([]);
  fillForm({ ...p, notesManual: true });
  $('#manTitle').textContent = 'Editar producto de mi inventario'; window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#mSave').onclick = async () => {
  const body = { id: S.editingId || undefined, image: S.image, notes: S.formNotes }; for (const [el, k] of Object.entries(FIELDS)) body[k] = $('#' + el).value;
  if (!body.name.trim()) { flash('El producto necesita nombre'); return; }
  if (body.cost === '' || !(Number(body.cost) >= 0)) { flash('Escribe tu costo'); return; }
  if (body.stock === '') { flash('Escribe cuántas unidades tienes'); $('#m_stock').focus(); return; }
  if (!body.weightOz) { if (!confirm('Sin peso, ShipStation no puede cotizar el envío. ¿Guardar igual?')) return; }
  const r = await post('/api/admin/products', body); if (!r.ok) { flash(r.error || 'No se pudo guardar'); return; }
  flash(S.editingId ? 'Producto actualizado' : 'Producto guardado en tu inventario'); clearForm(); $('#scanOut').innerHTML = ''; await reloadCatalog(); $('#scanIn').focus();
};
function paintManual() {
  const q = S.manQ.toLowerCase();
  const list = S.manual.filter((p) => (!q || (p.name + ' ' + p.brand + ' ' + p.category + ' ' + p.upc).toLowerCase().includes(q)) && (!S.manF || p.category === S.manF));
  $('#manCount').textContent = `${list.length} de ${S.manual.length} productos · ${S.manual.reduce((a, p) => a + (Number(p.stock) || 0), 0).toLocaleString('es')} unidades`;
  $('#manRows').innerHTML = list.length ? list.map((p) => {
    const cp = S.catalog.products.find((x) => (p.upc && String(x.upc) === String(p.upc)) || x.id === p.id);
    const where = p.active === false ? '<span class="pill">Oculto</span>' : cp && cp.webVisible ? '<span class="pill entregado">Web + marketplaces</span>' : '<span class="pill pagado">Solo marketplaces</span>';
    return `<tr><td>${thumb(p)}</td><td><b>${esc(p.name)}</b><br><span class="muted" style="font-size:11.5px">${esc(p.brand)} · ${esc(p.upc || 'sin UPC')}</span></td><td>${esc(p.category)}</td><td class="num">${money(p.cost)}</td><td class="num">${cp ? `<b>${money(cp.sell)}</b>` : '—'}</td>
    <td class="num">${p.stock}${cp && cp.hasApi ? `<br><span class="stk">+ ${cp.apiFree} del proveedor</span>` : ''}</td>
    <td>${p.weightOz ? `${p.weightOz} oz${p.lengthIn ? ` · ${p.lengthIn}×${p.widthIn}×${p.heightIn} in` : ''}` : '<span style="color:var(--rouge)">Sin ficha</span>'}</td>
    <td>${where}</td>
    <td style="white-space:nowrap"><button class="btn soft sm" data-p1="${esc(p.id)}" title="Sumar una unidad">+1</button> <button class="btn soft sm" data-e="${esc(p.id)}">Editar</button> <button class="btn danger sm" data-x="${esc(p.id)}">Borrar</button></td></tr>`; }).join('')
    : `<tr><td colspan="9" class="muted" style="padding:18px">${S.manual.length ? 'Nada con ese filtro.' : 'Todavía no hay productos en tu inventario. Escanea uno arriba, usa el formulario o importa un CSV.'}</td></tr>`;
  $$('#manRows [data-e]').forEach((b) => b.onclick = () => editManual(b.dataset.e));
  $$('#manRows [data-p1]').forEach((b) => b.onclick = async () => { const r = await post('/api/admin/products/stock', { id: b.dataset.p1, delta: 1 }); if (r.ok) { flash(`${r.name}: ahora ${r.stock}`); reloadCatalog(); } });
  $$('#manRows [data-x]').forEach((b) => b.onclick = async () => { if (!confirm('¿Borrar este producto de tu inventario?')) return; const r = await post('/api/admin/products', { id: b.dataset.x }, 'DELETE'); if (r.ok) { flash('Producto borrado'); reloadCatalog(); } });
}
$('#manQ').oninput = (e) => { S.manQ = e.target.value; paintManual(); }; $('#manF').onchange = (e) => { S.manF = e.target.value; paintManual(); };

/* ══ escáner de código de barras ══
   La pistola USB/Bluetooth escribe el código como un teclado y pulsa Enter. */
async function onScan(raw) {
  const code = String(raw || '').replace(/[^0-9A-Za-z-]/g, ''); const out = $('#scanOut'); if (!code) return;
  out.innerHTML = note(`Buscando <b>${esc(code)}</b>…`);
  const r = await api('/api/admin/lookup?upc=' + encodeURIComponent(code)).catch(() => null);
  $('#scanIn').value = '';
  if (!r || !r.ok) { out.innerHTML = note('No se pudo buscar el código. Revisa la conexión.', 'bad'); return; }
  if (r.manual) {
    if ($('#scanAdd').checked) {
      const a = await post('/api/admin/products/stock', { id: r.manual.id, delta: 1 });
      out.innerHTML = note(`<b>+1</b> · ${esc(r.manual.name)} · ahora tienes <b>${a.stock}</b>`, 'ok'); await reloadCatalog(); $('#scanIn').focus(); return;
    }
    S.manual = await api('/api/admin/products'); editManual(r.manual.id);
    out.innerHTML = note(`<b>${esc(r.manual.name)}</b> ya está en tu inventario (${r.manual.stock} und.). Lo abrí abajo para que cambies el stock o cualquier dato.`, 'ok'); $('#m_stock').focus(); $('#m_stock').select(); return;
  }
  clearForm();
  if (r.found) {
    const p = r.found;
    fillForm({ name: p.name, brand: p.brand, category: p.category, type: p.type, upc: code, cost: p.cost, condition: 'nuevo', gender: '', description: p.description, image: p.image, weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn, notes: [], notesManual: false });
    out.innerHTML = note(`<b>${esc(p.name)}</b> (${esc(p.brand)}) está en el catálogo del proveedor: ${p.apiFree ?? p.stock} und. a ${money(p.cost)}. Copié nombre, foto y descripción. Escribe <b>cuántas tienes tú</b> y <b>tu costo</b>, y guarda: tu stock se venderá antes que el del proveedor.`, 'ok');
    $('#m_stock').focus(); return;
  }
  if (r.external && r.external.sources && r.external.sources.length) {
    const e = r.external;
    fillForm({ name: e.name, brand: e.brand, category: e.category, type: e.type, upc: code, condition: 'nuevo', description: e.description, weightOz: e.weightOz, lengthIn: e.lengthIn, widthIn: e.widthIn, heightIn: e.heightIn, notes: [], notesManual: false });
    showCands(e.images);
    out.innerHTML = note(`Encontré <b>${esc(e.name || code)}</b> en ${esc(e.sources.join(' y '))}. Revisa los datos, ${e.images.length ? 'elige una de las fotos de abajo (se guarda sobre fondo blanco), ' : ''}pon tu costo y tu stock, y guarda.`, 'ok');
    if (e.images.length === 1) importImage(e.images[0]);
    $('#m_cost').focus(); return;
  }
  $('#m_upc').value = code;
  out.innerHTML = note(`No encontré datos para <b>${esc(code)}</b>${r.external && r.external.limited ? ' (la base gratuita de códigos llegó a su límite de hoy)' : ''}. Dejé el código puesto: completa el nombre y lo demás a mano.`);
  $('#m_name').focus();
}
$('#scanGo').onclick = () => onScan($('#scanIn').value);
$('#scanIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onScan($('#scanIn').value); } });
$('#m_upc').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !S.editingId && !$('#m_name').value.trim()) { e.preventDefault(); onScan($('#m_upc').value); } });

/* ══ importar CSV ══ */
const MAP = { upc: 'upc', codigo: 'upc', sku: 'upc', nombre: 'name', name: 'name', producto: 'name', marca: 'brand', brand: 'brand', categoria: 'category', category: 'category', subtipo: 'type', tipo: 'type', costo: 'cost', cost: 'cost', stock: 'stock', cantidad: 'stock', peso_oz: 'weightOz', peso: 'weightOz', largo_in: 'lengthIn', largo: 'lengthIn', ancho_in: 'widthIn', ancho: 'widthIn', alto_in: 'heightIn', alto: 'heightIn', mayor_min: 'wholesaleMin', mayor_precio: 'wholesalePrice', descripcion: 'description', imagen: 'image', etiquetas: 'tags', destacado: 'featured', proveedor: 'supplier', condicion: 'condition', estado: 'condition' };
function parseCsv(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
    else if (c === '"') inQ = true; else if (c === ',' || c === ';') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map((h) => MAP[h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || null);
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => { const o = {}; head.forEach((k, i) => { if (k && r[i] != null) o[k] = r[i].trim(); }); if (o.featured) o.featured = /^(1|si|sí|yes|true)$/i.test(o.featured); return o; });
}
let csvRows = [];
$('#csvFile').onchange = () => { const f = $('#csvFile').files[0]; if (!f) return; f.text().then((t) => { $('#csvText').value = t; }); };
$('#csvPreview').onclick = () => {
  csvRows = parseCsv($('#csvText').value); const existing = new Set(S.manual.map((p) => String(p.upc)));
  for (const r of csvRows) { const ex = r.upc && S.manual.find((p) => String(p.upc) === String(r.upc)); if (ex) r.id = ex.id; }
  $('#csvOut').innerHTML = csvRows.length ? `<div class="note">${csvRows.length} filas · ${csvRows.filter((r) => r.id).length} actualizan productos existentes · ${csvRows.filter((r) => !r.weightOz).length} sin peso</div><div class="scroll"><table class="tbl"><thead><tr><th>UPC</th><th>Nombre</th><th>Marca</th><th>Categoría</th><th class="num">Costo</th><th class="num">Stock</th><th>Peso</th><th>Medidas</th><th>Al mayor</th></tr></thead><tbody>${csvRows.slice(0, 50).map((r) => `<tr><td>${esc(r.upc)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.category)}</td><td class="num">${esc(r.cost)}</td><td class="num">${esc(r.stock)}</td><td>${esc(r.weightOz)}</td><td>${esc([r.lengthIn, r.widthIn, r.heightIn].filter(Boolean).join('×'))}</td><td>${r.wholesaleMin ? esc(r.wholesaleMin + ' → $' + r.wholesalePrice) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note">No se reconocieron filas. Revisa los encabezados.</div>';
  $('#csvGo').disabled = !csvRows.length;
};
$('#csvGo').onclick = async () => { $('#csvGo').disabled = true; const r = await post('/api/admin/products/import', { rows: csvRows }); flash(`Importados ${r.imported}${r.errors && r.errors.length ? ` · ${r.errors.length} con error` : ''}`); if (r.errors && r.errors.length) $('#csvOut').innerHTML += `<div class="note">${r.errors.map(esc).join('<br>')}</div>`; reloadCatalog(); };

/* ══ precios ══ */
function paintPricing() {
  const r = S.pricing; $('#p_global').value = r.globalMargin; $('#p_round').value = r.rounding; $('#p_cmp').value = r.showCompare ? '1' : '0';
  $('#catMargins').innerHTML = cats().map((c) => `<div class="f"><label>${esc(c)} (%)</label><input data-cm="${esc(c)}" type="number" step="1" value="${(r.categoryMargins || {})[c] ?? ''}" placeholder="general"></div>`).join('');
  $('#priChan').innerHTML = Object.entries(r.channels).map(([k, c]) => `<option value="${k}" ${S.chan === k ? 'selected' : ''}>${esc(c.label)} · ${c.commission}% + ${c.gateway}%</option>`).join('');
  paintPriRows();
}
function calcChan(p, ch) { const c = S.pricing.channels[ch]; const base = p.sell; const take = ((c.commission || 0) + (c.gateway || 0)) / 100; const fixed = c.fixed || 0; let price = ch === 'web' ? base : (base + fixed) / (1 - take); if (S.pricing.rounding === 'ends99') price = Math.floor(price) + 0.99; const fees = price * take + fixed; return { price, net: price - fees - p.cost }; }
function paintPriRows() {
  const q = S.priQ.toLowerCase(); const list = S.catalog.products.filter((p) => !q || (p.name + ' ' + p.brand).toLowerCase().includes(q)).slice(0, 300);
  $('#priRows').innerHTML = list.map((p) => { const ov = (S.pricing.overrides || {})[p.upc] || {}; const c = calcChan(p, S.chan); return `<tr data-upc="${esc(p.upc)}"><td><b>${esc(p.name)}</b><br><span class="muted" style="font-size:11px">${esc(p.brand)} · ${esc(p.category)}</span></td><td class="num">${money(p.cost)}</td>
    <td><input class="ov-m" type="number" step="1" value="${ov.margin ?? ''}" placeholder="${p.margin}" ${p.upc ? '' : 'disabled'}></td><td><input class="ov-c" type="number" step="0.01" value="${ov.compare ?? ''}" placeholder="—" ${p.upc ? '' : 'disabled'}></td>
    <td class="num"><b>${money(p.sell)}</b></td><td class="num">${money(c.price)}</td><td class="num ${c.net < 0 ? 'loss' : 'profit'}">${money(c.net)}</td></tr>`; }).join('');
  $$('#priRows input').forEach((i) => i.onchange = () => { const tr = i.closest('tr'); const upc = tr.dataset.upc; const ov = { ...((S.pricing.overrides || {})[upc] || {}) }; const m = tr.querySelector('.ov-m').value, cmp = tr.querySelector('.ov-c').value; if (m === '') delete ov.margin; else ov.margin = Number(m); if (cmp === '') delete ov.compare; else ov.compare = Number(cmp); S.pricing.overrides = { ...(S.pricing.overrides || {}) }; if (Object.keys(ov).length) S.pricing.overrides[upc] = ov; else delete S.pricing.overrides[upc]; savePricing(); });
}
$('#priChan').onchange = (e) => { S.chan = e.target.value; paintPriRows(); }; $('#priQ').oninput = (e) => { S.priQ = e.target.value; paintPriRows(); };
async function savePricing() {
  const cm = {}; $$('#catMargins [data-cm]').forEach((i) => { if (i.value !== '') cm[i.dataset.cm] = Number(i.value); });
  S.pricing = { ...S.pricing, globalMargin: Number($('#p_global').value) || 0, rounding: $('#p_round').value, showCompare: $('#p_cmp').value === '1', categoryMargins: cm };
  const r = await post('/api/admin/pricing', S.pricing); if (r.ok) { S.pricing = r.rules; flash('Reglas guardadas'); S.catalog = await api('/api/admin/catalog'); paintCat(); paintPriRows(); }
}
$('#priSave').onclick = savePricing;

/* ══ pedidos ══ */
function paintOrders() {
  const list = S.orders.filter((o) => !S.ordF || o.status === S.ordF);
  $('#ordList').innerHTML = list.length ? list.map((o) => `<div class="oitem" data-n="${esc(o.number)}">
    <div class="r1"><span>${esc(o.number)} · ${esc(o.buyer.name)} <span class="src api">${esc(o.channel)}</span>${o.externalId ? ` <span class="muted" style="font-family:Inter,sans-serif;font-size:11.5px">${esc(o.externalId)}</span>` : ''}</span><span class="pill ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span></div>
    <div class="r2">${new Date(o.createdAt).toLocaleString('es')} · ${esc(o.buyer.email)} · ${esc(o.buyer.phone || '')} · ${esc([o.buyer.address, o.buyer.city, o.buyer.state, o.buyer.zip, o.buyer.country].filter(Boolean).join(', '))}${o.buyer.notes ? ' · Nota: ' + esc(o.buyer.notes) : ''}</div>
    <ul>${o.items.map((i) => `<li>${esc(i.name)} × ${i.qty} — ${money(i.price * i.qty)}${i.wholesale ? ' <span class="muted">(al mayor)</span>' : ''}${i.ownQty || i.supplierQty ? ` <span class="muted">· ${i.ownQty ? `${i.ownQty} de tu inventario` : ''}${i.ownQty && i.supplierQty ? ' + ' : ''}${i.supplierQty ? `${i.supplierQty} a Shoppex` : ''}</span>` : ''}${i.condition && i.condition !== 'nuevo' ? ` <span class="src man">${i.condition === 'caja_abierta' ? 'caja abierta' : 'usado casi nuevo'}</span>` : ''}${i.weightOz ? ` <span class="muted">· ${i.weightOz} oz${i.lengthIn ? ` · ${i.lengthIn}×${i.widthIn}×${i.heightIn} in` : ''}</span>` : ' <span style="color:var(--rouge)">· sin ficha de envío</span>'}</li>`).join('')}</ul>
    ${o.review ? `<div class="note bad" style="margin-bottom:8px"><b>Retenido para revisión:</b> ${esc((o.review.reasons || []).join('; '))}. No pasó a ShipStation. Si todo está en orden pulsa “Aprobar”; si dudas, reembolsa.</div>` : ''}${o.dispute ? `<div class="note bad" style="margin-bottom:8px"><b>Disputa de pago abierta</b> (${esc(o.dispute.reason || '')}, ${esc(o.dispute.state || '')}). Respóndela en el panel de Square.</div>` : ''}
    <div class="fin"><span>Total <b>${money(o.totals.total)}</b></span>${o.totals.tax ? `<span>Impuesto ${esc(o.totals.taxState || '')} ${o.totals.taxRate}%: ${money(o.totals.tax)}</span>` : ''}${o.payment ? `<span>Pago: <b>${esc(o.payment.brand || 'tarjeta')} ··${esc(o.payment.last4 || '')}</b> <span class="muted">· dirección ${esc(AVS[o.payment.avs] || o.payment.avs || '—')} · CVV ${esc(AVS[o.payment.cvv] || o.payment.cvv || '—')}${o.payment.risk ? ' · riesgo ' + esc(RISK[o.payment.risk] || o.payment.risk) : ''}</span>${/^https:\/\//.test(o.payment.receiptUrl || '') ? ` <a href="${esc(o.payment.receiptUrl)}" target="_blank" rel="noopener">recibo</a>` : ''}</span>` : ''}${o.refund ? `<span style="color:var(--rouge)">Reembolsado ${money(o.refund.amount)}</span>` : ''}${o.totals.discount ? `<span>Descuento −${money(o.totals.discount)}${o.referral && o.referral.code ? ` <span class="src man">código ${esc(o.referral.code)} → ${esc(o.referral.ownerName || o.referral.ownerEmail || '')} gana ${money(o.referral.credit || 0)}</span>` : ''}</span>` : ''}${o.totals.credit ? `<span>Saldo usado −${money(o.totals.credit)}</span>` : ''}<span>Envío ${money(o.totals.shipping)}</span><span>Costo ${money(o.totals.cost)}</span>${o.totals.fees ? `<span>Comisión de pago −${money(o.totals.fees)}</span>` : ''}<span>Ganancia <b class="${o.totals.profit < 0 ? 'loss' : 'profit'}">${money(o.totals.profit)}</b></span><span>Peso ${o.totals.weightOz || 0} oz</span>${o.fulfillment && o.fulfillment.id ? `<span>ShipStation: ${esc(o.fulfillment.id)} (${esc(o.fulfillment.mode)})</span>` : ''}${o.shortfalls ? `<span style="color:var(--rouge)">Sobreventa: ${o.shortfalls.map((s) => `${s.upc} pidió ${s.requested}, había ${s.available}`).join('; ')}</span>` : ''}</div>
    <div class="act"><select class="st">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="carrier" placeholder="Transportista" value="${esc((o.fulfillment || {}).carrier || '')}" style="width:120px"><input class="track" placeholder="Nº de guía" value="${esc((o.fulfillment || {}).tracking || '')}" style="width:160px">
      <button class="btn sm" data-save>Guardar estado</button><button class="btn soft sm" data-ship>Crear envío en ShipStation</button>${o.review ? '<button class="btn gold sm" data-approve>Aprobar y enviar</button>' : ''}${o.payment && o.payment.id && !(o.refund && o.refund.full) ? '<button class="btn danger sm" data-refund>Reembolsar</button>' : ''}${o.supplierOrder && (o.supplierOrder.products || []).some((p) => p.quantity > 0) ? (o.supplierOrder.sent ? '<span class="src api">Pedido a Shoppex ✓</span>' : '<button class="btn gold sm" data-sup>Pedir a Shoppex</button>') : ''}</div></div>`).join('')
    : '<div class="muted" style="padding:14px 4px">No hay pedidos con ese filtro.</div>';
  $$('#ordList [data-save]').forEach((b) => b.onclick = async () => { const el = b.closest('.oitem'); const r = await post('/api/admin/orders/status', { number: el.dataset.n, status: el.querySelector('.st').value, carrier: el.querySelector('.carrier').value, tracking: el.querySelector('.track').value }); if (r.ok) { flash('Estado guardado; el cliente recibe un correo'); S.orders = await api('/api/admin/orders'); paintOrders(); paintKpis(); } else flash(r.error || 'Error'); });
  $$('#ordList [data-ship]').forEach((b) => b.onclick = async () => { b.disabled = true; const r = await post('/api/admin/ship', { number: b.closest('.oitem').dataset.n }); b.disabled = false; flash(r.result ? r.result.note : (r.error || 'Error')); S.orders = await api('/api/admin/orders'); paintOrders(); });
  $$('#ordList [data-approve]').forEach((b) => b.onclick = async () => { b.disabled = true; const r = await post('/api/admin/orders/approve', { number: b.closest('.oitem').dataset.n }); flash(r.ok ? 'Pedido aprobado' : (r.error || 'Error')); S.orders = await api('/api/admin/orders'); paintOrders(); });
  $$('#ordList [data-refund]').forEach((b) => b.onclick = async () => {
    const n = b.closest('.oitem').dataset.n; const o = S.orders.find((x) => x.number === n); const left = Math.round(((o.payment.amount || o.totals.total) - ((o.refund || {}).amount || 0)) * 100) / 100;
    const v = prompt(`Monto a reembolsar a la tarjeta (máximo ${money(left)}). Deja el total para devolver todo:`, left.toFixed(2)); if (v == null) return; const amount = Number(v); if (!(amount > 0)) return;
    if (!confirm(`Se devolverán ${money(amount)} a la tarjeta del cliente. Esto no se puede deshacer. ¿Seguir?`)) return;
    b.disabled = true; const r = await post('/api/admin/refund', { number: n, amount }); b.disabled = false;
    flash(r.ok ? `Reembolso de ${money(r.refunded)} enviado${r.full ? '; pedido cancelado si aún no había salido' : ''}` : (r.error || 'No se pudo reembolsar')); S.orders = await api('/api/admin/orders'); paintOrders(); reloadCatalog();
  });
  $$('#ordList [data-sup]').forEach((b) => b.onclick = async () => {
    if (!confirm('Se le pedirá a Shoppex solo la parte que NO salió de tu inventario. ¿Enviar?')) return;
    b.disabled = true; const r = await post('/api/admin/supplier-order', { number: b.closest('.oitem').dataset.n }); b.disabled = false;
    flash(r.ok ? 'Pedido enviado a Shoppex ✓' : (r.error || (r.response && r.response.message) || 'Shoppex no aceptó el pedido'));
    S.orders = await api('/api/admin/orders'); paintOrders();
  });
}
$('#ordF').onchange = (e) => { S.ordF = e.target.value; paintOrders(); };

/* ══ clientes ══ */
async function loadCustomers() { const rows = await api('/api/admin/customers').catch(() => []); S.customers = rows || []; loadReferrals(); $('#cliRows').innerHTML = (rows || []).length ? rows.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.provider || '')}</td><td>${c.created_at ? new Date(c.created_at).toLocaleDateString('es') : ''}</td><td class="muted">${esc(c.shipping ? [c.shipping.address, c.shipping.city, c.shipping.state].filter(Boolean).join(', ') : '')}</td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="padding:14px">Todavía no hay clientes registrados.</td></tr>'; }

/* ══ referidos ══ */
const KIND = { earn: 'Ganó por venta', spend: 'Usó saldo', reverse: 'Reversado (cancelación)', refund: 'Saldo devuelto', adjust: 'Ajuste manual' };
async function loadReferrals() {
  const j = await api('/api/admin/referrals').catch(() => null); if (!j) return;
  S.ref = j;
  $('#r_buyer').value = j.rules.buyerPct; $('#r_owner').value = j.rules.ownerPct; $('#r_min').value = j.rules.minOrder || 0;
  $('#refRows').innerHTML = (j.codes || []).length ? j.codes.map((c) => `<tr>
    <td><code>${esc(c.code)}</code></td><td>${esc(c.name || '')}<br><span class="muted" style="font-size:11px">${esc(c.email || '')}</span></td>
    <td class="num">${c.buyer_pct != null && c.buyer_pct !== '' ? c.buyer_pct + '%' : '<span class="muted">general</span>'}</td>
    <td class="num">${c.owner_pct != null && c.owner_pct !== '' ? c.owner_pct + '%' : '<span class="muted">general</span>'}</td>
    <td class="num"><b>${money(c.balance)}</b></td><td class="num">${money(c.earned)}</td><td class="num">${c.uses || 0}</td>
    <td>${c.enabled ? '<span class="pill entregado">Activo</span>' : '<span class="pill cancelado">Apagado</span>'}</td>
    <td style="white-space:nowrap"><button class="btn soft sm" data-tg="${esc(c.code)}" data-em="${esc(c.email || '')}" data-en="${c.enabled ? 0 : 1}">${c.enabled ? 'Apagar' : 'Encender'}</button> <button class="btn soft sm" data-adj="${esc(c.code)}">Ajustar saldo</button></td></tr>`).join('')
    : '<tr><td colspan="9" class="muted" style="padding:14px">Todavía no has activado códigos. Elige un cliente arriba.</td></tr>';
  $('#refLog').innerHTML = (j.log || []).length ? j.log.map((l) => `<tr><td>${l.at ? new Date(l.at).toLocaleString('es') : ''}</td><td><code>${esc(l.code)}</code></td><td>${esc(l.order_number || '')}</td><td>${esc(KIND[l.kind] || l.kind)}</td><td class="num ${Number(l.amount) < 0 ? 'loss' : 'profit'}">${money(l.amount)}</td><td class="muted">${esc(l.note || '')}</td></tr>`).join('')
    : '<tr><td colspan="6" class="muted" style="padding:14px">Sin movimientos todavía.</td></tr>';
  $$('#refRows [data-tg]').forEach((b) => b.onclick = async () => { const r = await post('/api/admin/referrals/code', { email: b.dataset.em, code: b.dataset.tg, enabled: b.dataset.en === '1' }); flash(r.ok ? 'Código actualizado' : (r.error || 'Error')); loadReferrals(); });
  $$('#refRows [data-adj]').forEach((b) => b.onclick = async () => { const m = prompt('Monto a sumar (negativo para restar), en USD:'); if (m == null || !Number(m)) return; const note = prompt('Nota (opcional):') || ''; const r = await post('/api/admin/referrals/adjust', { code: b.dataset.adj, amount: Number(m), note }); flash(r.ok ? `Saldo ajustado · ahora ${money(r.balance)}` : (r.error || 'Error')); loadReferrals(); });
  $('#cliList').innerHTML = (S.customers || []).map((c) => `<option value="${esc(c.email)}">${esc(c.name || '')}</option>`).join('');
}
$('#refRules').onclick = async () => { const r = await post('/api/admin/referrals', { buyerPct: Number($('#r_buyer').value) || 0, ownerPct: Number($('#r_owner').value) || 0, minOrder: Number($('#r_min').value) || 0 }); flash(r.ok ? 'Reglas guardadas' : (r.error || 'Error')); };
$('#refAdd').onclick = async () => {
  const email = $('#rc_email').value.trim(); if (!email) { flash('Escribe el correo del cliente'); return; }
  const r = await post('/api/admin/referrals/code', { email, name: $('#rc_name').value.trim(), code: $('#rc_code').value.trim(), buyerPct: $('#rc_bp').value === '' ? '' : Number($('#rc_bp').value), ownerPct: $('#rc_op').value === '' ? '' : Number($('#rc_op').value), enabled: true });
  if (r.ok) { flash(`Código ${r.code.code} activado para ${email}`); $('#rc_email').value = $('#rc_name').value = $('#rc_code').value = $('#rc_bp').value = $('#rc_op').value = ''; loadReferrals(); }
  else flash(r.error || 'No se pudo activar');
};

/* ══ canales ══ */
async function loadChannels() {
  const j = await api('/api/admin/channels');
  $('#chanCards').innerHTML = j.channels.map((c) => `<div class="chan"><h3>${esc(c.label)} ${c.credsReady ? '<span class="src api">conectado</span>' : `<span class="src man">${c.key === 'ebay' ? 'sin conectar' : 'simulación'}</span>`}</h3>
    <div class="fees"><label>Comisión % <input data-k="${c.key}" data-f="commission" type="number" step="0.1" value="${c.commission}"></label><label>Pasarela % <input data-k="${c.key}" data-f="gateway" type="number" step="0.1" value="${c.gateway}"></label><label>Fijo $ <input data-k="${c.key}" data-f="fixed" type="number" step="0.01" value="${c.fixed}"></label></div>
    ${c.sample ? `<div class="row"><span class="muted">Ej.: ${esc(c.sample.name.slice(0, 28))}…</span></div><div class="row"><span>Precio en ${esc(c.label)}</span><b>${money(c.sample.price)}</b></div><div class="row"><span>Comisiones</span><span>−${money(c.sample.fees)}</span></div><div class="row"><span>Ganancia neta</span><b class="${c.sample.profit < 0 ? 'loss' : 'profit'}">${money(c.sample.profit)}</b></div>` : ''}
    <div class="row"><span>Publicables (con UPC)</span><span>${c.publishable}</span></div>
    ${c.lastPublish ? `<div class="row muted"><span>Última publicación</span><span>${new Date(c.lastPublish.at).toLocaleString('es')} · ${esc(c.lastPublish.mode)}</span></div>` : ''}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><label><input type="checkbox" data-on="${c.key}" ${c.enabled ? 'checked' : ''}> Activo</label>${c.key === 'ebay' ? '' : `<button class="btn soft sm" data-pub="${c.key}">Preparar catálogo</button>`}<a class="btn soft sm" href="/api/admin/channels/export?channel=${c.key}" target="_blank">Ver paquete</a></div></div>`).join('');
  const ss = j.integrations.shipstation; const hook = `${(S.status.siteUrl || location.origin)}/api/shipstation/webhook?secret=TU_SECRETO`;
  $('#integr').innerHTML = `<div class="row" style="margin-bottom:8px">ShipStation: ${ss.credsReady ? `<span class="src api">conectado</span> ${ss.autoShip ? 'Los pedidos pagados pasan solos a ShipStation.' : 'Envío automático apagado: usa el botón del pedido.'}` : '<span class="src man">simulación — añade SHIPSTATION_KEY y SHIPSTATION_SECRET</span>'}<br><span class="muted">Para que la guía vuelva sola: en ShipStation → Settings → Integrations → Webhooks crea uno “On Items Shipped” con esta dirección: <code>${esc(hook)}</code> ${S.status.webhookSecret ? '' : '(falta definir CHANNEL_WEBHOOK_SECRET en el servidor)'}</span></div><div class="row" style="margin-bottom:8px">Square (pagos con tarjeta): ${j.integrations.square.credsReady ? `<span class="src api">${j.integrations.square.sandbox ? 'modo de prueba (sandbox)' : 'cobros reales activos'}</span> <button class="btn soft sm" id="sqTest">Probar conexión</button><br><span class="muted">Aviso de reembolsos y disputas: en Square Developer → Webhooks crea una suscripción a <code>${esc((S.status.siteUrl || location.origin) + '/api/square/webhook')}</code> con los eventos payment.updated, refund.created, refund.updated y dispute.created ${j.integrations.square.webhook ? '(firma configurada)' : '(falta SQUARE_WEBHOOK_SIGNATURE_KEY)'}</span>` : '<span class="src man">sin llaves — los pedidos quedan pendientes y se cobran a mano. Añade SQUARE_ACCESS_TOKEN, SQUARE_APP_ID y SQUARE_LOCATION_ID</span>'}</div><div class="row">Correos (Resend): ${j.integrations.email.credsReady ? '<span class="src api">activos</span>' : '<span class="src man">apagados — añade RESEND_API_KEY</span>'}</div>`;
  $$('#chanCards [data-f]').forEach((i) => i.onchange = async () => { await post('/api/admin/channels', { key: i.dataset.k, [i.dataset.f]: i.value }); flash('Canal actualizado'); S.pricing = await api('/api/admin/pricing'); loadChannels(); paintPricing(); });
  $$('#chanCards [data-on]').forEach((t) => t.onchange = async () => { await post('/api/admin/channels', { key: t.dataset.on, enabled: t.checked }); flash('Canal actualizado'); });
  $$('#chanCards [data-pub]').forEach((b) => b.onclick = async () => { b.disabled = true; const r = await post('/api/admin/channels/publish', { channel: b.dataset.pub }); b.disabled = false; flash(r.result ? r.result.note : (r.error || 'Error')); loadChannels(); });
  const st = $('#sqTest'); if (st) st.onclick = async () => { st.disabled = true; const r = await post('/api/admin/square-test', {}); st.disabled = false; flash(r.ok ? `Square responde: ${r.name} · ${r.status}${r.cards ? ' · acepta tarjetas' : ' · AÚN NO puede cobrar tarjetas'}` : ('Square: ' + (r.note || 'sin respuesta'))); };
  loadEbay();
}
let ebayTimer;
async function loadEbay() {
  clearTimeout(ebayTimer);
  const e = await api('/api/admin/ebay/status').catch(() => null); const box = $('#ebayBox'); if (!e || !e.ok) { box.innerHTML = note('No se pudo leer el estado de eBay.', 'bad'); return; }
  if (!e.appReady || !e.runame) { box.innerHTML = note(`Faltan las llaves de eBay en el servidor: <code>EBAY_CLIENT_ID</code>, <code>EBAY_CLIENT_SECRET</code> y <code>EBAY_RUNAME</code>. En developer.ebay.com, dentro de tu RuName, pon como “Your auth accepted URL”: <code>${esc(e.callback)}</code>. La guía trae el paso a paso.`); return; }
  if (!e.connected) { box.innerHTML = note(`Las llaves están cargadas${e.sandbox ? ' (modo de prueba: sandbox)' : ''}. Falta dar el permiso con tu cuenta de vendedora de eBay; se hace una sola vez.`) + '<a class="btn gold" href="/api/admin/ebay/connect">Conectar con eBay</a>'; return; }
  const c = e.config || {}; const miss = c.missing || []; const j = e.job || {}; const pct = j.total ? Math.round(100 * j.done / j.total) : 0;
  const keepV = (id, d) => { const el = $('#' + id); return el ? el.value : d; }; const vs = keepV('ebScope', ''), vc = keepV('ebCat', ''), vl = keepV('ebLimit', '5');
  box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><span class="src api">Conectado${e.sandbox ? ' · sandbox' : ''}</span><span class="pill">${e.listings} anuncios publicados</span>${e.lastImport ? `<span class="pill">Ventas leídas ${new Date(e.lastImport.at).toLocaleString('es')}</span>` : ''}${e.lastSync ? `<span class="pill">Stock enviado ${new Date(e.lastSync.at).toLocaleString('es')} · ${e.lastSync.updated} cambios</span>` : ''}</div>
    ${miss.length ? note('Antes de publicar falta: ' + miss.map(esc).join(' · '), 'bad') : c.fulfillmentPolicyId ? note(`Cuenta lista: se usarán tus políticas de envío, pago y devoluciones de eBay y el almacén <code>${esc(c.merchantLocationKey)}</code>.`, 'ok') : ''}
    ${(c.errors || []).length ? note(c.errors.map(esc).join('<br>'), 'bad') : ''}
    <div class="searchrow"><select id="ebScope"><option value="">Todo el catálogo</option><option value="own">Solo mi inventario</option><option value="supplier">Solo el del proveedor</option></select>
      <select id="ebCat"><option value="">Todas las categorías</option>${cats().map((x) => `<option>${esc(x)}</option>`).join('')}</select>
      <select id="ebLimit"><option value="5">Probar con 5 productos</option><option value="50">50 productos</option><option value="0">Todos</option></select>
      <button class="btn gold" id="ebPub" ${j.running || miss.length ? 'disabled' : ''}>Publicar en eBay</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn soft sm" id="ebTest">Probar conexión</button><button class="btn soft sm" id="ebImport">Traer ventas ahora</button><button class="btn soft sm" id="ebSync">Actualizar stock y precios</button><button class="btn danger sm" id="ebOff">Desconectar</button></div>
    <p class="muted" style="margin:10px 0 0">Solo se publican productos con foto, precio y stock. Las ventas se leen solas cada 10 minutos y el stock de los anuncios se corrige en la misma pasada.</p>
    ${j.startedAt ? `<div style="margin-top:14px"><b>${j.running ? 'Publicando…' : 'Última publicación'}</b> · ${j.done} de ${j.total} · ${j.ok} publicados · ${j.failed} con error${j.skipped ? ` · ${j.skipped} quedaron fuera (${j.noStock || 0} sin stock, ${j.noPhoto || 0} sin foto)` : ''}<div class="bar"><i style="width:${pct}%"></i></div>
      ${(j.errors || []).length ? `<div class="scroll"><table class="tbl"><thead><tr><th>UPC</th><th>Producto</th><th>Qué dijo eBay</th></tr></thead><tbody>${j.errors.slice(0, 60).map((x) => `<tr><td>${esc(x.sku)}</td><td>${esc(x.title)}</td><td style="color:var(--rouge)">${esc(x.error)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>` : ''}`;
  $('#ebScope').value = vs; $('#ebCat').value = vc; $('#ebLimit').value = vl;
  $('#ebPub').onclick = async () => { const lim = Number($('#ebLimit').value); if (!lim && !confirm('Se publicarán en eBay todos los productos con foto y stock. ¿Seguir?')) return; $('#ebPub').disabled = true; const r = await post('/api/admin/channels/publish', { channel: 'ebay', scope: $('#ebScope').value, category: $('#ebCat').value, limit: lim }); flash(r.result ? r.result.note : (r.error || 'Error')); loadEbay(); };
  $('#ebTest').onclick = async () => { $('#ebTest').disabled = true; const r = await post('/api/admin/ebay/test', {}); flash(r.ok ? ((r.config.missing || []).length ? 'Conexión correcta, pero falta configuración' : 'Conexión con eBay correcta') : (r.error || 'eBay no respondió')); loadEbay(); };
  $('#ebImport').onclick = async () => { $('#ebImport').disabled = true; const r = await post('/api/admin/ebay/import', {}); flash(r.ok ? `${r.imported} venta${r.imported === 1 ? '' : 's'} nueva${r.imported === 1 ? '' : 's'} de eBay` : (r.error || 'No se pudieron leer las ventas')); S.orders = await api('/api/admin/orders'); paintOrders(); loadEbay(); };
  $('#ebSync').onclick = async () => { $('#ebSync').disabled = true; const r = await post('/api/admin/ebay/sync', {}); flash(r.ok ? `${r.updated} anuncio${r.updated === 1 ? '' : 's'} actualizado${r.updated === 1 ? '' : 's'}` : (r.error || r.note || 'No se pudo actualizar')); loadEbay(); };
  $('#ebOff').onclick = async () => { if (!confirm('¿Desconectar eBay? Los anuncios ya publicados siguen en eBay, pero dejan de actualizarse.')) return; await post('/api/admin/ebay/disconnect', {}); loadEbay(); loadChannels(); };
  if (j.running) ebayTimer = setTimeout(loadEbay, 3000);
}

/* ══ ajustes ══ */
function paintSettings() {
  const st = S.pricing.store || {}, sh = S.pricing.shipping || {};
  const catList = (st.categories || []).filter((c) => c.key !== 'Otros');
  $('#s_name').value = st.name || ''; $('#s_tag').value = st.tagline || ''; $('#s_wa').value = st.whatsapp || ''; $('#s_free').value = sh.freeOver; $('#s_flat').value = sh.flat; $('#s_oz').value = sh.perOz || 0;
  $('#s_head').value = st.headline || ''; $('#s_lede').value = st.lede || ''; $('#s_headEn').value = st.headlineEn || ''; $('#s_ledeEn').value = st.ledeEn || '';
  $('#s_autoShip').checked = (S.pricing.automation || {}).shipOnPaid !== false; $('#s_review').value = (S.pricing.fraud || {}).reviewOver ?? 750;
  const sc = (S.pricing.supplier || {}).category || ''; $('#s_supCat').innerHTML = '<option value="">Detectar por el nombre de cada producto</option>' + cats().filter((c) => c !== 'Otros').map((c) => `<option ${c === sc ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const bn = st.banners || {}; const slug = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slots = [['principal', 'Banner principal (1600 × 520)'], ['genero-dama', 'Foto de la tarjeta Women (1200 × 750)'], ['genero-cab', 'Foto de la tarjeta Men (1200 × 750)'], ['genero-uni', 'Foto de la tarjeta Unisex (1200 × 750)'], ...catList.map((c) => [slug(c.key), `Banner de ${c.key} (1600 × 420)`])];
  $('#bnrCfg').innerHTML = slots.map(([k, l]) => `<div class="f"><label>${esc(l)}</label><div class="imgdrop wide" data-bnr="${esc(k)}">${bn[k] ? `<img src="${esc(bn[k])}" alt="">` : '<span>Haz clic para subir</span>'}</div>${bn[k] ? `<button class="btn danger sm" data-bnr-x="${esc(k)}" style="align-self:flex-start">Quitar</button>` : ''}</div>`).join('');
  $$('[data-bnr]').forEach((d) => d.onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = async () => { d.innerHTML = '<span>Subiendo…</span>'; const r = await post('/api/admin/upload', { dataUrl: rd.result }); if (!r.ok) { flash(r.error || 'No se pudo subir'); paintSettings(); return; } S.pricing.store.banners = { ...(S.pricing.store.banners || {}), [d.dataset.bnr]: r.url }; const rr = await post('/api/admin/pricing', S.pricing); if (rr.ok) { S.pricing = rr.rules; flash('Banner guardado'); } paintSettings(); }; rd.readAsDataURL(f); }; inp.click(); });
  $$('[data-bnr-x]').forEach((b) => b.onclick = async () => { const bnr = { ...(S.pricing.store.banners || {}) }; delete bnr[b.dataset.bnrX]; S.pricing.store.banners = bnr; const rr = await post('/api/admin/pricing', S.pricing); if (rr.ok) { S.pricing = rr.rules; flash('Banner quitado'); } paintSettings(); });
  S.catList = catList;
  $('#catCfg').innerHTML = catList.map((c, i) => `<div style="display:grid;grid-template-columns:minmax(150px,1fr) minmax(200px,2fr) auto;gap:10px;align-items:end;margin-bottom:8px"><div class="f"><label>Categoría</label><input data-ck="${i}" value="${esc(c.key)}"></div><div class="f"><label>Descripción</label><input data-cd="${i}" value="${esc(c.desc || '')}"></div><button class="btn danger sm" data-cx="${i}" title="Quitar de la lista" style="margin-bottom:3px">Quitar</button></div>`).join('');
  $$('#catCfg [data-cx]').forEach((b) => b.onclick = async () => { const c = catList[Number(b.dataset.cx)]; const n = S.catalog.products.filter((p) => p.category === c.key).length; if (!confirm(n ? `"${c.key}" tiene ${n} producto${n === 1 ? '' : 's'}. Si la quitas de la lista siguen con esa categoría hasta que se la cambies. ¿Quitar?` : `¿Quitar la categoría "${c.key}"?`)) return; const r = await post('/api/admin/pricing', { store: { categories: catList.filter((x) => x !== c) } }); if (r.ok) { S.pricing = r.rules; S.catalog = await api('/api/admin/catalog'); fillCatSelects(); paintSettings(); flash('Categoría quitada'); } });
  paintBrands();
  const vis = S.pricing.visibility || { enforce: false, webCategories: [] };
  const allCats = [...new Set([...catList.map((c) => c.key), ...S.catalog.products.map((p) => p.category)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  $('#v_enforce').checked = !!vis.enforce;
  $('#visCats').innerHTML = allCats.map((c) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-vc="${esc(c)}" ${(vis.webCategories || []).includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('');
}
$('#catAdd').onclick = async () => { if (await addCategory($('#catNew').value)) { $('#catNew').value = ''; paintSettings(); } };
function paintBrands() {
  const logos = (S.pricing.store || {}).brandLogos || {}; const counts = new Map();
  for (const p of S.catalog.products) if (p.webVisible && p.brand && p.brand !== '—') counts.set(p.brand, (counts.get(p.brand) || 0) + 1);
  const q = S.brQ.toLowerCase();
  const all = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const list = all.filter(([b]) => (!q || b.toLowerCase().includes(q)) && (S.brF === 'sin' ? !logos[b] : S.brF === 'con' ? !!logos[b] : true));
  $('#brCount').textContent = `${all.filter(([b]) => logos[b]).length} de ${all.length} marcas con logo`;
  $('#brGrid').innerHTML = list.slice(0, 90).map(([b, n]) => `<div class="brow"><div class="lg" data-bl="${esc(b)}" title="Subir logo">${logos[b] ? `<img src="${esc(logos[b])}" alt="">` : 'Subir logo'}</div><div class="bn" title="${esc(b)}">${esc(b)}<small>${n} producto${n === 1 ? '' : 's'}</small></div>${logos[b] ? `<button class="btn danger sm" data-blx="${esc(b)}" title="Quitar logo">×</button>` : ''}</div>`).join('') + (list.length > 90 ? `<div class="muted">y ${list.length - 90} más; usa el buscador.</div>` : '') + (!list.length ? '<div class="muted">Sin marcas con ese filtro.</div>' : '');
  const saveLogos = async (next) => { const r = await post('/api/admin/pricing', { store: { brandLogos: next } }); if (r.ok) { S.pricing = r.rules; paintBrands(); } return r.ok; };
  $$('#brGrid [data-bl]').forEach((d) => d.onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/svg+xml,image/png,image/webp,image/jpeg'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = async () => { d.textContent = 'Subiendo…'; const r = await post('/api/admin/upload', { dataUrl: rd.result }); if (!r.ok) { flash(r.error || 'No se pudo subir'); paintBrands(); return; } if (await saveLogos({ ...logos, [d.dataset.bl]: r.url })) flash('Logo guardado: ' + d.dataset.bl); }; rd.readAsDataURL(f); }; inp.click(); });
  $$('#brGrid [data-blx]').forEach((b) => b.onclick = async () => { const next = { ...logos }; delete next[b.dataset.blx]; if (await saveLogos(next)) flash('Logo quitado'); });
}
$('#brQ').oninput = (e) => { S.brQ = e.target.value; paintBrands(); }; $('#brF').onchange = (e) => { S.brF = e.target.value; paintBrands(); };
$('#setSave').onclick = async () => {
  const categories = (S.catList || S.pricing.store.categories || []).map((c, i) => ({ key: ($(`[data-ck="${i}"]`) || {}).value ? $(`[data-ck="${i}"]`).value.trim() : c.key, desc: ($(`[data-cd="${i}"]`) || { value: c.desc || '' }).value.trim(), tone: c.tone || 'otro' }));
  S.pricing.store = { ...S.pricing.store, name: $('#s_name').value.trim(), tagline: $('#s_tag').value.trim(), whatsapp: $('#s_wa').value.trim(), headline: $('#s_head').value.trim(), lede: $('#s_lede').value.trim(), headlineEn: $('#s_headEn').value.trim(), ledeEn: $('#s_ledeEn').value.trim(), categories };
  S.pricing.supplier = { category: $('#s_supCat').value }; S.pricing.automation = { ...(S.pricing.automation || {}), shipOnPaid: $('#s_autoShip').checked }; S.pricing.fraud = { reviewOver: Math.max(0, Number($('#s_review').value) || 0) };
  S.pricing.shipping = { freeOver: Number($('#s_free').value) || 0, flat: Number($('#s_flat').value) || 0, perOz: Number($('#s_oz').value) || 0 };
  S.pricing.visibility = { enforce: $('#v_enforce').checked, webCategories: $$('#visCats [data-vc]').filter((c) => c.checked).map((c) => c.dataset.vc) };
  const r = await post('/api/admin/pricing', S.pricing); if (r.ok) { S.pricing = r.rules; flash('Ajustes guardados'); loadAll(); }
};

$('#provTest').onclick = async () => { const b = $('#provTest'); b.disabled = true; $('#provOut').innerHTML = '<div class="note">Consultando al proveedor…</div>'; const r = await post('/api/admin/provider-test', {}); b.disabled = false;
  if (r.ok) $('#provOut').innerHTML = `<div class="note ok">Conexión correcta · HTTP ${r.status} en ${r.ms} ms · ${r.count} productos en la primera página${r.pagination ? ` · ${esc(JSON.stringify(r.pagination))}` : ''}</div><pre class="dump">${esc(JSON.stringify(r.sample, null, 2))}</pre>`;
  else $('#provOut').innerHTML = `<div class="note bad">Sin conexión · ${r.status ? 'HTTP ' + r.status : ''} ${esc(r.note || '')}</div><div class="muted" style="font-size:12px">URL: <code>${esc(r.url || '')}</code>${r.key ? ` · llave <code>${esc(r.key)}</code>` : ''}</div>${r.body ? `<pre class="dump">${esc(r.body)}</pre>` : ''}`; };
$('#apiRefresh2').onclick = () => $('#apiRefresh').click();

/* ══ impuestos ══ */
const pct = (n) => (Math.round(Number(n) * 1000) / 1000) + '%';
async function loadTax(month) {
  const j = await api('/api/admin/tax-report' + (month ? '?month=' + encodeURIComponent(month) : '')).catch(() => null); if (!j || !j.ok) return;
  S.tax = j; const r = j.report; $('#taxMonth').value = r.month;
  $('#taxCsv').href = '/api/admin/tax-report?format=csv&month=' + r.month; $('#taxCsvD').href = '/api/admin/tax-report?format=detail&month=' + r.month;
  $('#taxKpis').innerHTML = [[money(r.totals.tax), 'Impuesto cobrado en la web'], [money(r.totals.taxable), 'Ventas gravadas'], [money(r.totals.sales), 'Ventas netas de la web'], [r.totals.orders, 'Pedidos pagados']].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
  const tbl = (head, rows) => `<div class="scroll"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  let html = r.rows.length ? tbl('<th>Estado</th><th class="num">Pedidos</th><th class="num">Ventas netas</th><th class="num">Envío</th><th class="num">Ventas gravadas</th><th class="num">Impuesto cobrado</th><th class="num">Total cobrado</th>',
    r.rows.map((x) => `<tr><td><b>${esc(x.state)}</b> <span class="muted">${esc(x.name)}</span></td><td class="num">${x.orders}</td><td class="num">${money(x.sales)}</td><td class="num">${money(x.shipping)}</td><td class="num">${money(x.taxable)}</td><td class="num"><b>${money(x.tax)}</b></td><td class="num">${money(x.total)}</td></tr>`).join('') +
    `<tr><td><b>Total</b></td><td class="num"><b>${r.totals.orders}</b></td><td class="num"><b>${money(r.totals.sales)}</b></td><td class="num"><b>${money(r.totals.shipping)}</b></td><td class="num"><b>${money(r.totals.taxable)}</b></td><td class="num"><b>${money(r.totals.tax)}</b></td><td class="num"><b>${money(r.totals.total)}</b></td></tr>`)
    : '<div class="muted" style="padding:10px 4px">No hay pedidos pagados en la web ese mes.</div>';
  if (r.refunds.length) html += `<h2 style="margin-top:18px;font-size:14px">Reembolsos del mes</h2>` + tbl('<th>Pedido</th><th>Estado</th><th>Fecha</th><th class="num">Reembolsado</th><th class="num">Impuesto devuelto</th>', r.refunds.map((x) => `<tr><td>${esc(x.number)}</td><td>${esc(x.state)}</td><td>${new Date(x.at).toLocaleDateString('es')}</td><td class="num">${money(x.amount)}</td><td class="num">${money(x.tax)}</td></tr>`).join('')) + `<p class="muted">Impuesto neto del mes: <b>${money(r.totals.tax - r.refundedTax)}</b> (cobrado menos devuelto).</p>`;
  if (r.marketplace.length) html += `<h2 style="margin-top:18px;font-size:14px">Ventas por marketplace (el impuesto lo cobra y declara el marketplace)</h2>` + tbl('<th>Estado</th><th>Canal</th><th class="num">Pedidos</th><th class="num">Ventas</th>', r.marketplace.map((x) => `<tr><td><b>${esc(x.state)}</b> <span class="muted">${esc(x.name)}</span></td><td>${esc(x.channel || '')}</td><td class="num">${x.orders}</td><td class="num">${money(x.sales)}</td></tr>`).join(''));
  $('#taxOut').innerHTML = html + `<p class="muted" style="margin-top:10px">Mes calendario en hora ${esc(r.timezone)}. Cuenta los pedidos pagados (no cancelados) según el día en que se pagaron.</p>`;
  if (!S.taxEdit) S.taxEdit = JSON.parse(JSON.stringify(j.tax.states));
  $('#taxAsOf').textContent = `Tasas estatales y promedios locales: Tax Foundation, vigentes al ${new Date(j.asOf + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}. Las tasas cambian; revísalas con tu contador una o dos veces al año.`;
  paintTaxRows();
}
function paintTaxRows() {
  if (!S.tax) return; const q = ($('#taxQ').value || '').toLowerCase(); const ed = S.taxEdit;
  $('#taxCount').textContent = `${Object.values(ed).filter((x) => x.collect).length} estados con cobro activo`;
  $('#taxRows').innerHTML = S.tax.states.filter((s) => !q || (s.name + ' ' + s.code).toLowerCase().includes(q)).map((s) => { const e = ed[s.code] || {}; return `<tr data-c="${s.code}"><td><input type="checkbox" data-t="collect" ${e.collect ? 'checked' : ''}></td><td><b>${s.code}</b> ${esc(s.name)}</td><td><input type="number" data-t="rate" min="0" max="15" step="0.001" value="${e.rate}" style="width:92px"></td><td class="num">${pct(s.state)}</td><td class="num muted">${pct(s.local)}</td><td><input type="checkbox" data-t="shipping" ${e.shipping ? 'checked' : ''}></td></tr>`; }).join('');
  $$('#taxRows [data-t]').forEach((el) => el.onchange = () => { const c = el.closest('tr').dataset.c; ed[c] = ed[c] || {}; ed[c][el.dataset.t] = el.type === 'checkbox' ? el.checked : Number(el.value); $('#taxCount').textContent = `${Object.values(ed).filter((x) => x.collect).length} estados con cobro activo · sin guardar`; });
}
$('#taxQ').oninput = paintTaxRows;
$('#taxGo').onclick = () => loadTax($('#taxMonth').value); $('#taxMonth').onchange = () => loadTax($('#taxMonth').value);
$('#taxOrig').onclick = () => { if (!S.tax || !confirm('¿Volver todas las tasas a la tasa estatal? No cambia qué estados están activos.')) return; for (const s of S.tax.states) S.taxEdit[s.code].rate = s.state; paintTaxRows(); };
$('#taxSave').onclick = async () => {
  const on = Object.entries(S.taxEdit).filter(([, x]) => x.collect).map(([c]) => c);
  if (!confirm(on.length ? `Se cobrará impuesto en: ${on.join(', ')}. ¿Confirmas que la tienda está registrada para cobrar en ${on.length === 1 ? 'ese estado' : 'esos estados'}?` : 'No se cobrará impuesto en ningún estado. ¿Guardar así?')) return;
  const r = await post('/api/admin/pricing', { tax: { states: S.taxEdit } }); if (!r.ok) { flash('No se pudo guardar'); return; }
  S.pricing = r.rules; S.taxEdit = JSON.parse(JSON.stringify(r.rules.tax.states)); flash('Estados de impuesto guardados'); paintTaxRows();
};

/* ══ seguridad ══ */
const ACT = { acceso: 'Entró al panel', acceso_fallido: 'Intento fallido', pagos_rechazados: 'Pagos rechazados', pricing: 'Cambió ajustes o precios', 'orders/status': 'Cambió estado de pedido', refund: 'Reembolso', 'orders/approve': 'Aprobó pedido retenido', products: 'Guardó o borró producto', 'products/import': 'Importó CSV', ship: 'Envió a ShipStation', 'supplier-order': 'Pidió a Shoppex', channels: 'Cambió un canal', 'channels/publish': 'Publicó en un canal', 'ebay/disconnect': 'Desconectó eBay', referrals: 'Cambió reglas de referidos', 'referrals/code': 'Activó o editó un código', 'referrals/adjust': 'Ajustó saldo', inventory: 'Ajustó inventario', '2fa/setup': 'Generó clave de 2 pasos', '2fa/enable': 'Activó 2 pasos', '2fa/disable': 'Desactivó 2 pasos', 'square-test': 'Probó Square' };
async function loadSecurity() {
  const j = await api('/api/admin/security').catch(() => null); if (!j || !j.ok) return; S.sec = j;
  const li = (ok, txt) => `<div class="row" style="margin-bottom:6px"><span class="src ${ok ? 'api' : 'man'}">${ok ? 'bien' : 'pendiente'}</span> ${txt}</div>`;
  $('#secBox').innerHTML =
    li(j.twoFa, j.twoFa ? `Verificación en 2 pasos <b>activa</b>${j.twoFaEnv ? ' (fijada en el servidor)' : ' <button class="btn danger sm" id="faOff">Desactivar</button>'}` : 'Verificación en 2 pasos <b>apagada</b> <button class="btn gold sm" id="faOn">Activar ahora</button>') +
    '<div id="faBox"></div>' +
    li(!j.weakPassword, j.hashed ? 'La contraseña está guardada cifrada en el servidor (ADMIN_PASSWORD_HASH).' : j.weakPassword ? 'La contraseña del panel tiene menos de 14 caracteres. Usa una frase larga y única (variable ADMIN_PASSWORD).' : 'Contraseña larga. Mejor aún: guárdala cifrada con ADMIN_PASSWORD_HASH (ver la guía).') +
    li(!j.defaultPath, j.defaultPath ? 'El panel está en la dirección <code>/admin</code>, la primera que prueban los robots. Cámbiala con la variable ADMIN_PATH.' : `El panel está en una dirección propia (<code>${esc(j.adminPath)}</code>).`) +
    li(j.https, j.https ? 'Conexión cifrada (HTTPS) y cookie de sesión segura.' : 'Estás entrando sin HTTPS (solo debería pasar en tu computadora).') +
    li(j.sessionSecret, j.sessionSecret ? `La sesión dura ${j.sessionHours} h, se cierra tras ${j.idleMinutes} min sin uso y solo vale en este navegador.` : 'Falta SESSION_SECRET en el servidor: la sesión se cierra en cada reinicio.') +
    li(j.alerts, j.alerts ? 'Recibes un correo cuando alguien entra desde una IP nueva, hay intentos fallidos, un pedido queda retenido o se abre una disputa.' : 'Los avisos por correo están apagados: hacen falta RESEND_API_KEY y ADMIN_ALERT_EMAIL.') +
    li(j.ipAllow > 0, j.ipAllow ? `El panel solo abre desde ${j.ipAllow} IP autorizada${j.ipAllow === 1 ? '' : 's'}.` : 'Opcional: limitar el panel a tus IP (variable ADMIN_IP_ALLOW). Útil si siempre entras desde la misma oficina.');
  const on = $('#faOn'); if (on) on.onclick = async () => {
    const r = await post('/api/admin/2fa/setup', {}); if (!r.ok) { flash(r.error || 'No se pudo generar'); return; }
    $('#faBox').innerHTML = note(`<b>1.</b> Instala Google Authenticator, Microsoft Authenticator o Authy en tu teléfono.<br><b>2.</b> En la app elige “Añadir cuenta” → “Ingresar clave de configuración” y escribe esta clave (tipo: basada en tiempo):<br><code style="font-size:15px;letter-spacing:.12em;user-select:all">${esc(r.secret.match(/.{1,4}/g).join(' '))}</code><br><b>3.</b> Escribe aquí el código de 6 dígitos que muestra la app: <input id="faCode" inputmode="numeric" maxlength="7" style="width:110px;border:1px solid var(--line);border-radius:7px;padding:6px 8px"> <button class="btn gold sm" id="faGo">Confirmar</button><br><span class="muted">Guarda la clave en un lugar seguro (papel o gestor de contraseñas): sirve para recuperar el acceso si cambias de teléfono.</span>`);
    $('#faGo').onclick = async () => { const e = await post('/api/admin/2fa/enable', { code: $('#faCode').value }); flash(e.ok ? 'Verificación en 2 pasos activada' : (e.error || 'Código incorrecto')); if (e.ok) loadSecurity(); };
  };
  const off = $('#faOff'); if (off) off.onclick = async () => { const code = prompt('Para desactivarla escribe el código actual de tu app autenticadora:'); if (!code) return; const r = await post('/api/admin/2fa/disable', { code }); flash(r.ok ? 'Verificación en 2 pasos desactivada' : (r.error || 'Código incorrecto')); loadSecurity(); };
  $('#secLog').innerHTML = (j.log || []).length ? j.log.map((l) => `<tr><td style="white-space:nowrap">${new Date(l.at).toLocaleString('es')}</td><td>${esc(l.ip)}</td><td>${esc(ACT[l.action] || l.action)}</td><td class="muted">${esc(l.detail)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted" style="padding:12px">Sin movimientos todavía.</td></tr>';
}

/* ══ pestañas ══ */
function showView(v) { $$('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.v === v)); $$('.view').forEach((s) => s.classList.toggle('on', s.id === 'v-' + v)); if (v === 'man') setTimeout(() => $('#scanIn').focus(), 60); if (v === 'chan') loadEbay(); if (v === 'tax') loadTax($('#taxMonth').value); if (v === 'set') loadSecurity(); }
$$('.tab').forEach((t) => t.onclick = () => showView(t.dataset.v));
document.addEventListener('error', (e) => { const el = e.target; if (el && el.tagName === 'IMG' && el.dataset && el.dataset.fb === 'cand') { const c = el.closest('.cand'); if (c) c.remove(); } }, true);
boot();
})();
