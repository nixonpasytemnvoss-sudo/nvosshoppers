# NVOS Market · NVOS Shoppers Inc

Tienda de perfumería (abre en inglés, con botón para español) conectada al catálogo del proveedor
(Shoppex) y a tu inventario propio, con cuentas de cliente, carrito guardado, seguimiento de pedidos,
ShipStation, publicación en eBay y panel de administración. Lo que no es perfumería (chocolates,
enlatados, lo que crees) vive como inventario: no sale en la web y se vende por marketplaces.

Corre en **Node 18+ sin dependencias**. Los datos viven en **Supabase** (Postgres + Auth + Storage).
Sin Supabase configurado, corre en modo local guardando en `data/local-db.json` (solo para probar en tu PC).

## Versión 1.2 — pagos, impuestos y seguridad

- **Square** (`square.js`): formulario de tarjeta de Square en el checkout; el servidor calcula el total y cobra; pedido pagado al instante, recibo por correo, reembolsos desde el panel y avisos de disputas. Modo de prueba con `SQUARE_ENV=sandbox`.
- **Impuestos** (`tax.js`): los 50 estados y DC con su tasa; se cobra solo en los que la dueña activa. Pestaña *Impuestos* con el reporte mensual por estado y descarga en CSV.
- **Antifraude**: verificación de dirección y CVV de Square, pedidos retenidos por riesgo o monto, bloqueo tras pagos rechazados, límites por IP y por correo.
- **Panel**: dirección propia (`ADMIN_PATH`), verificación en 2 pasos con app autenticadora, bloqueo por intentos, contraseña cifrada opcional, sesión atada al navegador, avisos por correo y bitácora.
- **Navegador**: política de seguridad sin scripts incrustados (el código del panel vive en `public/admin.js`), HSTS y cabeceras de aislamiento.
- **Cuentas**: los pedidos hechos sin cuenta y el saldo de referidos solo se muestran a correos verificados.
- `npm test` corre 71 comprobaciones.

## Novedades de la versión 1.1

- **Idioma**: la tienda abre en inglés; el botón del globo cambia a español y se recuerda. Los correos salen en el idioma del cliente.
- **Portada**: tarjetas de color Women / Men / Unisex, cinta de logos de marcas (se suben en Ajustes → Logos de marcas) y sección *Shop by notes*. Se quitó la franja de avisos superior.
- **Notas olfativas**: se detectan en el nombre y la descripción; se corrigen por producto en Catálogo → botón de notas.
- **Categorías**: todo lo del proveedor entra como Perfumería (Ajustes → Categorías); la dueña crea las suyas. Solo las marcadas en *Visibilidad* salen en la web.
- **Catálogo** con tres vistas: completo, proveedor e inventario mío.
- **Mi inventario**: carga manual, escáner de código de barras (pistola USB), datos y foto automáticos, foto cuadrada sobre fondo blanco, precio de venta opcional. **Tu stock sale primero**; al proveedor solo se le pide lo que falte.
- **Canales**: eBay (publicación real), Walmart y Mercado Libre (paquete listo, publicación pendiente).
- **eBay** (`ebay.js`): conexión OAuth desde el panel, publicación con foto/descripción/precio/stock, lectura de ventas cada 10 min, stock sincronizado y guía de vuelta.
- **ShipStation**: el pedido pasa solo al quedar pagado; `POST /api/shipstation/webhook?secret=…` recibe la guía y marca "enviado".
- `npm test` corre 41 comprobaciones contra un simulador local (`test/mock-services.js`); no toca servicios reales.

---

## 1. Qué hace

| Parte | Descripción |
|---|---|
| Tienda (`/`) | Diseño **Ónix** (azul profundo, oro, Cormorant/Oswald/Inter): portada con titular, vitrina de tres piezas, cinta y selector de marcas, banners, departamentos numerados, una sección por categoría (Perfumería con Damas/Caballeros/Unisex), destacados, nuevos ingresos, catálogo completo con filtros (departamento, categoría, marca, precio, stock, al mayor, ofertas, vista en lista) y boletín. Ficha de producto con pestaña *Ficha y envío* (peso y medidas), carrito lateral, checkout, cuenta del cliente con perfil, carrito guardado y pedidos con línea de estados. |
| Cuentas | Registro/ingreso con **Google** o correo+clave (Supabase Auth). En el primer ingreso se crea el perfil y se envía el **correo de bienvenida**. |
| Pedidos | Estados: `pendiente_pago → pagado → en_proceso → enviado → entregado` (o `cancelado`, que libera stock). Cada cambio manda correo al cliente; en *enviado* incluye transportista y guía. |
| Panel (`/admin`) | Catálogo unificado (proveedor + propios) con edición por UPC de categoría, peso, medidas, mínimo y precio al mayor, destacado. Mis productos (formulario + foto). Importar CSV. Precios y simulador por canal. Pedidos (estado, guía, botón ShipStation). Clientes. Canales. Ajustes. |
| Precios | Precio web = costo + margen (general › por categoría › por producto). Cada canal (eBay 15 %, Amazon, Shopify) sube el precio solo para absorber su comisión y dejar la misma ganancia. |
| Al mayor | Por producto: `mín. unidades` + `precio al mayor`. En el carrito, al llegar al mínimo, la línea cambia sola a ese precio. En el payload de canales el precio al mayor también se infla con la comisión del canal. |
| Envíos | Cada producto tiene peso (oz) y largo × ancho × alto (in). El pedido suma el peso y arma dimensiones; con llaves de ShipStation el botón *Crear envío* crea la orden real vía API. |
| Proveedor | El catálogo del proveedor se lee con tu llave/secret (firma HMAC-SHA256: cabeceras `X-Shoppex-Key`, `X-Shoppex-Timestamp`, `X-Shoppex-Nonce`, `X-Shoppex-Signature`; la ruta firmada va sin `/wp-json`) y se refresca cada minuto. Los productos del proveedor caen solos en Perfumería, Hogar y más, Chocolates, Enlatados o Refrigerados según su nombre/tipo; el resto queda en “Otros” hasta que le pongas categoría en el panel. La página pública **nunca** muestra el costo, el estado de la conexión ni textos como "catálogo en vivo". |

---

## 2. Puesta en marcha en la nube (Supabase + Railway/Render)

### 2.1 Supabase
1. Crea un proyecto en <https://supabase.com> (región cercana a tus clientes).
2. **SQL Editor → New query**: pega el contenido de `supabase/schema.sql` y ejecuta (*Run*). Crea las tablas, activa RLS y el bucket público `productos`.
3. **Project Settings → API**: copia `Project URL`, `anon public` y `service_role` (esta última **solo** va en el servidor, nunca en el navegador).
4. **Authentication → Providers → Google**: actívalo y pega el *Client ID* y *Client Secret* de Google Cloud
   (APIs & Services → Credentials → OAuth client ID → Web; en *Authorized redirect URIs* pon la URL que Supabase te muestra, tipo `https://xxxx.supabase.co/auth/v1/callback`).
5. **Authentication → URL Configuration**: `Site URL` = la URL pública de tu tienda; en *Redirect URLs* agrega `https://tu-tienda/**` (y `http://localhost:3000/**` para probar).
6. **Authentication → Providers → Email**: deja activo *Confirm email*. **No lo desactives.**
   La tienda muestra los pedidos y el saldo de referidos según el correo de la cuenta: si el
   correo no se verifica, cualquiera puede registrarse con la dirección de otra persona y ver
   sus pedidos (nombre, dirección, teléfono) y gastar su saldo.

### 2.2 Correos (Resend)
1. Cuenta en <https://resend.com>, verifica tu dominio (DNS) y crea una API key.
2. `EMAIL_FROM` debe ser una dirección de ese dominio, p. ej. `NVOS Shoppers <pedidos@tudominio.com>`.
   Sin `RESEND_API_KEY` el sistema no falla: solo escribe en el log qué correo habría enviado.

### 2.3 ShipStation
Settings → Account → API Settings → *Generate API Keys*. Pon `SHIPSTATION_KEY` y `SHIPSTATION_SECRET`.
Sin llaves, el botón funciona en simulación y te muestra el payload que enviaría.

### 2.4 Servidor (Railway o Render)
- **Railway**: New Project → Deploy from GitHub (o `railway up`). Detecta Node y usa `npm start`.
- **Render**: New → Web Service → repo; el archivo `render.yaml` ya trae la configuración.

Variables de entorno (copia `.env.example`):

```
SHOPPEX_BASE_URL, SHOPPEX_KEY, SHOPPEX_SECRET   ← proveedor
SITE_URL=https://tu-tienda.up.railway.app       ← URL pública sin barra final
NODE_ENV=production
ADMIN_PASSWORD, ADMIN_EMAILS, SESSION_SECRET
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET=productos
RESEND_API_KEY, EMAIL_FROM
SHIPSTATION_KEY, SHIPSTATION_SECRET
CHANNEL_WEBHOOK_SECRET                         ← para recibir pedidos de eBay/Amazon/Shopify
```

Luego apunta tu dominio (CNAME) al servicio y actualiza `SITE_URL` y las URLs en Supabase Auth.

### 2.5 Si no ves los productos del proveedor
Panel → **Ajustes → Estado del sistema → Probar conexión con el proveedor**. Te dice el código HTTP, la URL exacta, la llave usada y el texto de la respuesta del proveedor. Casos típicos:
- `HTTP 401/403` con mensaje de firma o llave: la llave/secret del `.env` no coinciden con el partner activo en ShoppexCorp (si regeneraste el secret, pega el nuevo y reinicia).
- `HTTP 404`: cambió la ruta del plugin; ajusta `ROUTE_PRODUCTS` en `server.js`.
- `HTTP 200` con 0 productos: la cuenta partner no tiene catálogo asignado; pregúntale a ShoppexCorp.
El chip rojo de la cabecera del panel muestra el mismo motivo. En la tienda pública nunca aparece nada de esto.

### 2.6 Probar en tu PC
```
cp .env.example .env     # rellena lo que tengas
npm start                # http://localhost:3000  ·  panel en /admin
npm test                 # prueba automática del flujo completo (modo local)
```
En modo local (sin `SUPABASE_URL`) el ingreso de clientes es solo con correo, para probar.

---

## 3. Cargar tus productos venezolanos

**Panel → Mis productos** (uno a uno, con foto) o **Panel → Importar CSV** (en lote).
Plantilla: `ejemplos/productos-ejemplo.csv`. Columnas:

```
upc, nombre, marca, categoria (Chocolates | Enlatados | Refrigerados), subtipo, costo, stock,
peso_oz, largo_in, ancho_in, alto_in, mayor_min, mayor_precio, descripcion, imagen, etiquetas, destacado
```
- Peso en **onzas** y medidas en **pulgadas** (lo que usa ShipStation). La ficha del cliente los muestra también en g y cm.
- Si dejas `categoria` vacía se detecta por el nombre (queso/tequeño → Refrigerados; chocolate/cacao → Chocolates; atún/lata/harina → Enlatados). Marcas **AndesFood** y **Tequemosh** caen en Refrigerados automáticamente.
- Si un UPC ya existe en el proveedor, tu producto se une con él y el stock se suma.
- Para los productos **del proveedor** (que no puedes editar allí) usa **Panel → Catálogo**: cada fila deja escribir categoría, peso, medidas, al mayor y destacado; se guarda como ficha por UPC.

El panel muestra el contador **"Sin ficha de envío"** y un filtro para encontrar rápido lo que falta.

---

## 3.1 Portada y banners
Panel → **Ajustes**: nombre, subtítulo, **titular** de la portada (lo que va tras la última coma sale en dorado), texto de apoyo (si lo dejas vacío se arma con tus categorías), descripción de cada categoría y **banners** (principal 1600 × 520 px y uno por categoría 1600 × 420 px; se suben desde el panel a Supabase Storage y, si no hay banner, esa franja no aparece).

## 4. Canales y pedidos externos
- **Panel → Canales**: comisiones (eBay 15 % por defecto), simulador de precio por canal, exportar feed o publicar.
- Para recibir pedidos de un canal: `POST /api/channels/ebay/order` con cabecera `X-Channel-Secret: <CHANNEL_WEBHOOK_SECRET>` y cuerpo `{ externalId, buyer:{…}, items:[{upc, qty}] }`. Se crea como *pagado* y descuenta stock.

## 5. Pagos
Aún no hay pasarela: el cliente **reserva** el pedido (queda *pendiente de pago*), recibe un correo y tú lo pasas a *pagado* desde el panel cuando cobras (transferencia/Zelle/WhatsApp). Cuando conectes Square u otra pasarela, el flujo cambia solo en `createOrder` + el estado inicial.

## 6. Seguridad
- Las tablas tienen RLS sin políticas: solo el servidor (service_role) las toca. El navegador solo habla con Supabase para **Auth**.
- El costo de los productos y el estado del proveedor solo se ven con sesión de administrador.
- Cabeceras CSP, cookies firmadas y límite de peticiones en rutas sensibles.

Elaborado por: InnolabSystem, C.A.
