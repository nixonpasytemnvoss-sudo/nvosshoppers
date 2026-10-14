# NVOS Shoppers — instrucciones para el agente

Léelo completo antes de tocar el código. Resume qué es el proyecto, las reglas que no se rompen
y cómo se trabaja aquí. Versión actual: **1.2** (Square, impuestos por estado, panel blindado).

## Qué es

Tienda de perfumería en línea para una clienta (la dueña) en EE. UU. La web abre en inglés con
botón para español. Vende perfumes del proveedor **Shoppex** (API firmada HMAC) y del
**inventario propio** de la dueña (carga manual y con pistola de código de barras). Lo que no es
perfumería (chocolates, enlatados, etc.) **no sale en la web**: es inventario que se vende por
eBay, Walmart Marketplace y Mercado Libre Int.

- Node 18+ **sin dependencias** (solo `http`, `crypto`, `fetch`). No añadas paquetes npm sin
  pedírselo a la persona: cada dependencia es superficie de ataque.
- Datos en **Supabase** (Postgres + Auth + Storage). Sin `SUPABASE_URL` corre en modo local
  (`data/local-db.json`, solo para desarrollo).
- Despliegue: Railway (`railway.json`) o Render (`render.yaml`). Código en GitHub
  `nvosshopperssytem/nvosshoppers`.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `server.js` | Rutas, catálogo, precios, pedidos, panel y capas de seguridad |
| `db.js` | Supabase (REST, Auth, Storage) o modo local |
| `square.js` | Cobro con tarjeta, reembolsos, firma de avisos de Square |
| `tax.js` | 50 estados + DC, cálculo del impuesto, reporte mensual y CSV |
| `channels.js` | Precios por canal, inventario comprometido, ShipStation |
| `ebay.js` | OAuth, publicación (Inventory API), ventas, stock, guía |
| `mail.js` | Correos por Resend (EN/ES) y avisos a la dueña |
| `public/index.html`, `app.js`, `app.css` | Tienda |
| `public/admin.html`, `admin.js` | Panel (el JS va en archivo aparte por la CSP) |
| `supabase/schema.sql` | Tablas con RLS sin políticas (solo el servidor accede) |
| `test/smoke.js`, `test/mock-services.js` | 71 pruebas contra simuladores de todos los servicios |
| `tools/hash-password.js` | Cifra la contraseña del panel (scrypt) |

## Reglas de negocio que no se rompen

1. **Mi stock sale primero.** Si un UPC está en el inventario propio y en el del proveedor, la
   venta descuenta primero lo propio (`ownQty`); a Shoppex solo se pide la diferencia
   (`supplierQty`). Vale para la web y para los marketplaces.
2. **Solo Perfumería en la web** (`visibility.webCategories`). Un producto oculto no se puede
   comprar por la web aunque se conozca su UPC.
3. Todo lo del proveedor entra como Perfumería (`supplier.category`), salvo corrección por UPC.
4. Canales: solo `ebay`, `walmart`, `mercadolibre` (más `web` interno para precios).
5. **Impuesto**: no se cobra en ningún estado hasta que la dueña lo active. Nunca actives
   estados por tu cuenta: depende de dónde esté registrada (lo decide su contador).
6. Las ventas de marketplaces no suman impuesto en el reporte: lo cobra el marketplace.

## Reglas de seguridad (obligatorias)

- **El precio lo pone el servidor.** El navegador solo envía UPC, cantidades y dirección.
  `priceOrder()` calcula todo; Square cobra `order.totals.total`. Nunca aceptes precios,
  totales ni descuentos del cliente. Las líneas del mismo UPC se suman antes de validar
  el stock (`priceOrder()` consolida en un `Map`), y la cantidad debe ser un entero entero
  de 1 a 999 (`qtyOf()`): rechaza `"5abc"`, `1.5`, `1e3`.
- **El impuesto se calcula con el estado del ZIP**, no con el que escribe el comprador.
  Si el ZIP es de EE. UU. pero el país declarado es otro, manda el ZIP
  (`TAX.stateFromZip()`, `tax.js`).
- **La compra nunca lleva precios del cliente**, tampoco por referidos: solo el servidor
  los saca del catálogo y de `pricing`.
- **Nunca expongas** costo, datos del proveedor, llaves ni estado interno en rutas públicas
  (`/api/catalog`, `publicOrder`). Hay pruebas que lo verifican.
- **Secretos solo en variables de entorno.** Nunca en el código, en commits, en logs ni en el
  chat. No imprimas el contenido de `.env`. Si la persona pega una llave en el chat, avísale de
  que debe rotarla.
- **CSP estricta**: no añadas `'unsafe-inline'` a `script-src` ni atributos `onclick=`/`onerror=`
  en HTML. Usa `addEventListener` y `data-*`. Todo texto que venga de datos pasa por `esc()`.
- **Panel**: solo la sesión de cookie da acceso (`isAdmin`). No vuelvas a permitir acceso por
  correo de cliente. Mantén 2FA, bloqueo por intentos (también `GLOBAL_FAIL_MAX` /
  `loginStorm()`), `ADMIN_PATH`, bitácora (`audit()`) y `ADMIN_PASSWORD_HASH` validado
  (`ADMIN_HASH_OK`: un hash mal pegado no abre con contraseña vacía).
- La **contraseña del panel nunca se imprime en los registros** (`adminPwGenerated`
  solo fuera de `NODE_ENV=production`). Un hash mal formado se avisa con
  `⚠` y `checkPassword()` devuelve `false` hasta corregirlo.
- **IP real**: usa `clientIp(req)`, nunca el primer valor de `X-Forwarded-For`.
- **Avisos entrantes** (Square, ShipStation, canales) siempre con firma o secreto verificado en
  tiempo constante; ShipStation solo acepta `resource_url` de su propio dominio.
- **Cuentas**: pedidos de invitado y saldo de referidos solo para correos verificados
  (`user.verified`). Las compras invitadas con código de referido requieren aprobación
  manual (`referral.needsReview`, `/api/admin/referrals/approve`). En producción sin
  llaves de Supabase la sesión queda cerrada (`LOCAL && IS_PROD` en `db.js`).
- Los pedidos se reservan en serie (`serial()`); no lo quites.
- Errores en producción: solo número de referencia, nunca el detalle.

## Cómo se trabaja

```
npm test                         # 71 comprobaciones, unos segundos; corre SIEMPRE antes de entregar
npm start                        # http://localhost:3000 (panel en ADMIN_PATH, por defecto /admin)
npm run hash-password -- "frase" # genera ADMIN_PASSWORD_HASH
```

- Cada cambio de comportamiento lleva su prueba en `test/smoke.js` (y su simulación en
  `test/mock-services.js` si toca un servicio externo).
- Mensajes del panel en español; la tienda en inglés y español (`TX_EN` en `app.js`).
- No hagas `push` ni cambies llaves, cobros, reembolsos o publicaciones reales sin que la
  persona lo confirme en el chat.

## Variables de entorno

Todas están documentadas en `.env.example`: Shoppex, servidor, seguridad del panel, Supabase,
Resend, ShipStation, Square, eBay, escáner (UPCitemdb, Google CSE) y marketplaces.

## Pendientes conocidos

- CAPTCHA (Cloudflare Turnstile) en registro y pago.
- Usuarios separados del panel con permisos.
- Páginas de producto con URL propia (hoy rutas `#/p/UPC`) para SEO y Google Merchant Center.
- Sesiones del panel en la base de datos si se escala a varias instancias.
- Impuestos locales por código postal (TaxJar/Avalara) si el contador lo pide.
- Walmart y Mercado Libre: solo paquete exportable; falta publicación automática.
- El aviso de marketplace acepta el total que manda el canal (queda en revisión si el
  precio llega muy por debajo del publicado); conviene cotejarlo contra la API del canal.
- El `access_token` de Supabase vive en `localStorage` (legible por un XSS): pasarlo a
  cookie HttpOnly exigiría mover el inicio de sesión al servidor.
