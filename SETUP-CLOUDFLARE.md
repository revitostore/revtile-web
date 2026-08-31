# Migración a Cloudflare Pages — pasos únicos de configuración

El código ya está listo. Estos pasos se hacen UNA sola vez en el panel de Cloudflare
(la misma cuenta donde está el dominio revtile.com.co).

## 1. Conectar el repositorio (hosting)

1. Panel de Cloudflare → **Workers y Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
2. Autorizar GitHub y elegir el repo **revitostore/revtile-web**.
3. Configuración del build:
   - Framework preset: **None**
   - Build command: *(vacío)*
   - Build output directory: `/` *(la raíz)*
4. **Save and Deploy**. El primer deploy tarda ~1 minuto.

## 2. Crear la base de datos (pedidos)

1. **Workers y Pages** → **D1 SQL Database** → **Create database** → nombre: `revtile-db`.
2. Entrar a `revtile-db` → pestaña **Console** → pegar TODO el contenido de
   `db/schema.sql` → **Execute**. Debe decir "success".

## 3. Conectar la base de datos al sitio (binding)

1. Volver al proyecto Pages **revtile-web** → **Settings** → **Bindings**
   (o "Functions" → "D1 database bindings" según la versión del panel).
2. **Add binding** → tipo **D1 database**:
   - Variable name: `DB`  ← exactamente así, en mayúsculas
   - Database: `revtile-db`
3. Guardar y hacer **Retry deployment** (o esperar el próximo push) para que aplique.

## 4. Pasar el dominio

1. Proyecto Pages → **Custom domains** → **Set up a custom domain** → `revtile.com.co`.
   Como el DNS ya está en la misma cuenta, Cloudflare cambia el CNAME solo.
2. Repetir con `www.revtile.com.co`.
3. Esperar 1-5 min y abrir https://revtile.com.co — debe salir la versión nueva.

## 5. Verificar que los pedidos se guardan

1. Hacer un pedido de prueba en https://revtile.com.co/pedido.html.
2. En el panel: **D1** → `revtile-db` → **Console** →
   `SELECT id, nombre, total, metodo_pago, creado_en FROM pedidos ORDER BY creado_en DESC LIMIT 5;`
3. Debe aparecer el pedido de prueba. Listo ✅

## Notas

- Netlify puede quedarse conectado al repo sin problema (sus deploys están pausados);
  cuando todo funcione en Cloudflare, se puede borrar el sitio en Netlify.
- El archivo `_headers` funciona igual en Cloudflare Pages (CSP, etc.).
- Límites gratis de Cloudflare: 500 deploys/mes, 100.000 requests/día a la API,
  5 GB en D1 — sobra por años.
