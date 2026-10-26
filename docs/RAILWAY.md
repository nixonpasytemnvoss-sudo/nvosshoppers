# Despliegue a Railway

## Variables de entorno ya configuradas
✅ Supabase (URL, anon key, service key)
✅ Shoppex (proveedor de perfumes)
✅ Panel de administración (ADMIN_PATH, hash de contraseña)
✅ Resend (correos)
✅ Site URL y secrets

⏳ **Pendiente:** Square sandbox (SQUARE_APP_ID, SQUARE_ACCESS_TOKEN, SQUARE_SIGNATURE_KEY)

Ver `docs/SQUARE.md` para conseguir las llaves.

## Build y deploy
Railway detecta automáticamente Node.js. El `Procfile` dice:
```
web: node server.js
```

Railway ejecuta:
1. `npm install` (no hay dependencias, se salta)
2. `node server.js`
3. El servidor escucha en `$PORT` (Railway lo asigna automáticamente)

## Health check
Railway revisa `https://nvosshoppers.com/config.js` cada 30 segundos. Si responde 200, el deploy está vivo.

## Logs
```bash
railway logs
```

## Conectar GitHub
1. Railway dashboard → tu proyecto
2. Settings → Connect GitHub Repo
3. Selecciona `nvosshopperssytem/nvosshoppers`
4. Branch: `v1.2`
5. Cada push a `v1.2` redeploya automáticamente

## Primera prueba en producción
1. Ve a https://nvosshoppers.com/panel-nvos
2. Inicia sesión con la contraseña que generaste
3. Revisa `/api/admin/status` → debe decir modo producción, Supabase conectado
4. Revisa el catálogo → deben aparecer los perfumes de Shoppex

## Rollback si algo falla
Railway guarda cada deploy. Si algo sale mal:
1. Deployments → elige el anterior
2. Redeploy
