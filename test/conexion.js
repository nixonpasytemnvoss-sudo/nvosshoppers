/* Prueba directa de la Partner API de Shoppex — corre: node test/conexion.js */
const crypto = require('crypto'); const https = require('https'); const path = require('path'); const fs = require('fs');
try { fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch (_) {}
const BASE = (process.env.SHOPPEX_BASE_URL || 'https://partners-api.shoppexcorp.com').replace(/\/+$/, '');
const KEY = process.env.SHOPPEX_KEY, SECRET = process.env.SHOPPEX_SECRET, route = '/api/v1/products';
if (!KEY || !SECRET) { console.log('Faltan SHOPPEX_KEY / SHOPPEX_SECRET (en .env o como variables).'); process.exit(1); }
const ts = Math.floor(Date.now() / 1000).toString(), nonce = crypto.randomUUID();
const bodyHash = crypto.createHash('sha256').update('').digest('hex');
const sig = crypto.createHmac('sha256', SECRET).update(['GET', route, ts, nonce, bodyHash].join('\n')).digest('hex');
https.request(BASE + route, { method: 'GET', headers: { 'Content-Type': 'application/json', 'X-Shoppex-Key': KEY, 'X-Shoppex-Timestamp': ts, 'X-Shoppex-Nonce': nonce, 'X-Shoppex-Signature': sig }, timeout: 20000 }, (res) => {
  let d = ''; res.on('data', (c) => (d += c));
  res.on('end', () => {
    console.log('HTTP', res.statusCode);
    try {
      const j = JSON.parse(d); const list = Array.isArray(j) ? j : j.products || j.data || [];
      console.log('Productos recibidos:', list.length);
      if (list[0]) console.log('Ejemplo:', JSON.stringify(list[0]).slice(0, 300));
      if (!list.length) console.log('Respuesta:', d.slice(0, 400));
    } catch (_) { console.log(d.slice(0, 400)); }
  });
}).on('error', (e) => console.log('ERROR:', e.message)).end();
