'use strict';
/*
 * Capa de datos — Supabase (PostgREST + Auth + Storage) usando solo fetch.
 * Sin SUPABASE_URL el servidor corre en modo LOCAL: guarda todo en
 * data/local-db.json (solo para desarrollo en tu computadora).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'productos';
const LOCAL = !URL_ || !SERVICE;
const IS_PROD = process.env.NODE_ENV === 'production';
/* El modo LOCAL es solo para desarrollo: acepta tokens "dev:<correo>" sin firma.
 * Si faltan las llaves de Supabase en producción se avisa fuerte y la autenticación queda cerrada
 * (ver userFromToken): es preferible que nadie inicie sesión a que cualquiera entre como cualquiera. */
if (LOCAL && IS_PROD) {
  console.error('\n  ⛔ FALTAN SUPABASE_URL / SUPABASE_SERVICE_KEY en producción.');
  console.error('     Las cuentas de clientes quedan DESACTIVADAS (nadie puede iniciar sesión)');
  console.error('     para no aceptar tokens sin firma. Defínelas en las variables del servidor.\n');
}

/* ─────────────────────────── Supabase REST ─────────────────────────── */
async function rest(method, table, { query = '', body, prefer } = {}) {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL_}/rest/v1/${table}${query ? '?' + query : ''}`, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) { const e = new Error(`Supabase ${table}: ${r.status} ${(json && (json.message || json.hint)) || text.slice(0, 200)}`); e.status = r.status; throw e; }
  return json;
}
const q = (obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

const supa = {
  async all(table, extra = {}) { return (await rest('GET', table, { query: q({ select: '*', ...extra }) })) || []; },
  async find(table, match) { const r = await rest('GET', table, { query: q({ select: '*', ...eq(match), limit: 1 }) }); return (r && r[0]) || null; },
  async where(table, match, extra = {}) { return (await rest('GET', table, { query: q({ select: '*', ...eq(match), ...extra }) })) || []; },
  async insert(table, row) { const r = await rest('POST', table, { body: row, prefer: 'return=representation' }); return Array.isArray(r) ? r[0] : r; },
  async upsert(table, rows, onConflict) { const r = await rest('POST', table, { query: onConflict ? q({ on_conflict: onConflict }) : '', body: rows, prefer: 'resolution=merge-duplicates,return=representation' }); return r; },
  async update(table, match, patch) { return rest('PATCH', table, { query: q(eq(match)), body: patch, prefer: 'return=representation' }); },
  async del(table, match) { return rest('DELETE', table, { query: q(eq(match)) }); },
  async count(table) { const r = await fetch(`${URL_}/rest/v1/${table}?select=id`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact', Range: '0-0' } }); const cr = r.headers.get('content-range') || ''; return parseInt(cr.split('/')[1], 10) || 0; },
};
function eq(match) { const o = {}; for (const [k, v] of Object.entries(match || {})) o[k] = `eq.${v}`; return o; }

/* ─────────────────────────── Modo local (archivo) ─────────────────────────── */
const F_LOCAL = path.join(__dirname, 'data', 'local-db.json');
let mem = null;
function memLoad() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(F_LOCAL, 'utf8')); } catch (_) { mem = {}; }
  return mem;
}
function memSave() { fs.mkdirSync(path.dirname(F_LOCAL), { recursive: true }); fs.writeFileSync(F_LOCAL, JSON.stringify(mem, null, 2)); }
const tbl = (t) => { const m = memLoad(); if (!m[t]) m[t] = []; return m[t]; };
const matches = (row, match) => Object.entries(match || {}).every(([k, v]) => String(row[k]) === String(v));
const PK = { settings: 'key', products_manual: 'id', product_meta: 'upc', orders: 'id', profiles: 'id', carts: 'user_id', inventory_ledger: 'upc', inventory_log: 'id', referral_codes: 'code', referral_log: 'id' };

const local = {
  async all(table, extra = {}) { let rows = [...tbl(table)]; if (extra.order) rows = sortBy(rows, extra.order); if (extra.limit) rows = rows.slice(0, extra.limit); return rows; },
  async find(table, match) { return tbl(table).find((r) => matches(r, match)) || null; },
  async where(table, match, extra = {}) { let rows = tbl(table).filter((r) => matches(r, match)); if (extra.order) rows = sortBy(rows, extra.order); if (extra.limit) rows = rows.slice(0, extra.limit); return rows; },
  async insert(table, row) { const r = { ...row }; const pk = PK[table]; if (pk && r[pk] == null) r[pk] = (table === 'inventory_log' || table === 'referral_log') ? tbl(table).length + 1 : crypto.randomUUID(); if (!r.created_at) r.created_at = new Date().toISOString(); tbl(table).push(r); memSave(); return r; },
  async upsert(table, rows, onConflict) { const list = Array.isArray(rows) ? rows : [rows]; const pk = onConflict || PK[table]; const out = []; for (const row of list) { const i = tbl(table).findIndex((r) => String(r[pk]) === String(row[pk])); if (i >= 0) tbl(table)[i] = { ...tbl(table)[i], ...row }; else tbl(table).push({ created_at: new Date().toISOString(), ...row }); out.push(row); } memSave(); return out; },
  async update(table, match, patch) { const out = []; for (const r of tbl(table)) if (matches(r, match)) { Object.assign(r, patch); out.push(r); } memSave(); return out; },
  async del(table, match) { const m = memLoad(); m[table] = tbl(table).filter((r) => !matches(r, match)); memSave(); },
  async count(table) { return tbl(table).length; },
};
function sortBy(rows, order) { const [f, dir] = String(order).split('.'); return rows.sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }

const db = LOCAL ? local : supa;

/* ─────────────────────────── Ajustes (clave → json) ─────────────────────────── */
const settingsCache = new Map();
async function getSetting(key, fallback) {
  if (settingsCache.has(key)) return settingsCache.get(key);
  const row = await db.find('settings', { key });
  const v = row ? row.value : fallback;
  settingsCache.set(key, v);
  return v;
}
async function setSetting(key, value) {
  await db.upsert('settings', [{ key, value, updated_at: new Date().toISOString() }], 'key');
  settingsCache.set(key, value);
  return value;
}

/* ─────────────────────────── Auth (tokens de Supabase) ─────────────────────────── */
const userCache = new Map(); // token → { user, exp }
async function userFromToken(token) {
  if (!token) return null;
  const hit = userCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  if (LOCAL && !IS_PROD) {
    // Desarrollo local sin Supabase: token "dev:<correo>:<nombre>"
    // En producción esta rama NO existe: el token "dev:" no está firmado y entraría cualquiera.
    const m = /^dev:([^:]+):?(.*)$/.exec(token);
    if (!m) return null;
    const email = m[1].toLowerCase();
    const user = { id: 'local-' + crypto.createHash('sha1').update(email).digest('hex').slice(0, 24), email, name: m[2] || email.split('@')[0], provider: 'dev', verified: true };
    userCache.set(token, { user, exp: Date.now() + 3e5 });
    return user;
  }
  try {
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.id) return null;
    const md = j.user_metadata || {};
    const user = { id: j.id, email: String(j.email || '').toLowerCase(), name: md.full_name || md.name || (j.email || '').split('@')[0], avatar: md.avatar_url || md.picture || '', provider: (j.app_metadata && j.app_metadata.provider) || 'email',
      /* correo comprobado: Google lo garantiza; con correo+clave, solo si confirmó el enlace */
      verified: !!(j.email_confirmed_at || j.confirmed_at) };
    userCache.set(token, { user, exp: Date.now() + 3e5 });
    return user;
  } catch (_) { return null; }
}
setInterval(() => { const now = Date.now(); for (const [k, v] of userCache) if (v.exp < now) userCache.delete(k); }, 60000).unref();

/* ─────────────────────────── Storage (fotos) ─────────────────────────── */
async function uploadImage(name, buf, mime) {
  if (LOCAL) {
    const dir = path.join(__dirname, 'data', 'img'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buf);
    return '/img/' + name;
  }
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${name}`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: buf });
  if (!r.ok) throw new Error('No se pudo subir la imagen a Supabase Storage: ' + (await r.text()).slice(0, 200));
  return `${URL_}/storage/v1/object/public/${BUCKET}/${name}`;
}

module.exports = { db, LOCAL, URL: URL_, ANON, BUCKET, getSetting, setSetting, userFromToken, uploadImage };
