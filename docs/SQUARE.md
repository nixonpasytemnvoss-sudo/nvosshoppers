# Cómo conseguir las llaves de Square (sandbox)

## 1. Cuenta de desarrollador
1. Ve a https://developer.squareup.com/
2. Sign Up → usa `system@nvosshoppers.com`
3. Verifica tu correo

## 2. Crear aplicación sandbox
1. En el dashboard → **My Applications** → **Create Application**
2. Nombre: `NVOS Shoppers Sandbox`
3. Description: `Tienda de perfumería NVOS Shoppers (ambiente de pruebas)`

## 3. Copiar las credenciales
Una vez creada la aplicación:

**Application ID:**
- Lo ves arriba: `sandbox-sq0idb-...`
- Cópialo y pégalo en Railway como `SQUARE_APP_ID`

**Sandbox Access Token:**
- Click en **Credentials** (menú izquierdo)
- En "Sandbox" verás: **Sandbox Access Token**
- Click en **Show** → copia el token (empieza con `EAAA...`)
- Pégalo en Railway como `SQUARE_ACCESS_TOKEN`

**Webhook Signature Key:**
- Click en **Webhooks** (menú izquierdo)
- **Add Endpoint**
- URL: `https://nvosshoppers.com/api/square/webhook`
- Events: marca `payment.created`, `payment.updated`, `refund.created`, `refund.updated`
- Save
- Te dará un **Signature Key** (empieza con `sq0sig-...`)
- Cópialo y pégalo en Railway como `SQUARE_SIGNATURE_KEY`

## 4. Probar con tarjetas de prueba
En sandbox, usa estas tarjetas ficticias (no cobran de verdad):

- Visa: `4111 1111 1111 1111`
- Mastercard: `5105 1051 0510 5100`
- CVV: cualquier 3 dígitos
- Fecha: cualquier fecha futura
- ZIP: `12345`

## 5. Pasar a producción
Cuando quieras cobrar dinero real:
1. En Square, cambia de **Sandbox** a **Production**
2. Copia el **Production Access Token** (diferente al de sandbox)
3. En Railway, cambia:
   - `SQUARE_ENV` → `production`
   - `SQUARE_ACCESS_TOKEN` → el nuevo token de producción
   - `SQUARE_APP_ID` → el mismo (o el de producción si creaste otra app)
4. Webhook en producción: mismo endpoint, pero ahora firma pagos reales

**IMPORTANTE:** nunca cambies a producción sin probar antes en sandbox.
