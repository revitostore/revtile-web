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

## 6. Sistema v2: rastreo, panel admin, cupones y avisos

Pasos únicos tras el deploy del sistema v2:

1. **Migrar la base**: D1 → `revtile-db` → Console → pegar TODO `db/schema-v2.sql` → Execute.
2. **Acceso al centro de mando** (https://revtile.com.co/gestion.html):
   - **Opcion A (activa): Cloudflare Access** — app en Zero Trust con destinos
     `revtile.com.co/gestion.html` y `revtile.com.co/api/admin/*`, policy Allow →
     Emails → <TU-CORREO-ADMIN>; variable `ADMIN_EMAILS` = <TU-CORREO-ADMIN>
     en Pages + Retry deployment. Entras con codigo al correo, sin contrasenas.
   - **Opcion B (respaldo): Secret `ADMIN_KEY`** = clave larga; el panel la pide una vez.
   - En el celular: abrir gestion.html → "Agregar a pantalla de inicio" = app instalada.

3. **(Opcional) Aviso por email de cada pedido**: crear cuenta gratis en https://resend.com
   (100 correos/día gratis), copiar la API key y agregar en Variables and Secrets:
   - `RESEND_KEY` (secret) = la API key
   - `NOTIF_EMAIL` (texto) = tu correo (ej. <TU-CORREO>)
   Con el dominio verificado en Resend se puede agregar `NOTIF_FROM` = `REVTILE <pedidos@revtile.com.co>`.
4. **(Opcional) Rastreo en vivo Skydropx**: si tu cuenta Skydropx PRO tiene API
   (Conexiones → API), agregar secrets `SKYDROPX_CLIENT_ID` y `SKYDROPX_CLIENT_SECRET`.
   Sin esto, el rastreo muestra el estado interno + enlace a la transportadora (funciona igual).

## Notas

- Netlify puede quedarse conectado al repo sin problema (sus deploys están pausados);
  cuando todo funcione en Cloudflare, se puede borrar el sitio en Netlify.
- El archivo `_headers` funciona igual en Cloudflare Pages (CSP, etc.).
- Límites gratis de Cloudflare: 500 deploys/mes, 100.000 requests/día a la API,
  5 GB en D1 — sobra por años.

---

## La maleta

**La maleta (carrito) y la venta de suplementos no necesitan nada nuevo:** funcionan con la base
de datos que ya tienes. Cada suplemento vendido se descuenta del stock dentro de `pedidos` y el stock
en vivo (`/api/stock`) sale de `productos.json` menos lo ya vendido en pedidos no cancelados. El servidor
revisa el precio de cada suplemento contra el catálogo (si alguien lo manipula, rechaza el pedido) y
cancelar un pedido desde el Centro de mando devuelve la unidad al stock automáticamente. Ojo: un pedido
que nunca se paga sigue reservando su unidad hasta que lo canceles.

**Cuando cambies un precio o repongas stock de un suplemento:** edita `precio`, `precio_antes` (el
tachado) o el `stock` de cada variante en `productos.json` (clave `suplementos`) y ejecuta
`node tools/build-suplementos.mjs` y luego `node tools/check.mjs`. Eso regenera las fichas, la portada,
`llms.txt`, el sitemap y el catálogo del servidor. Después sube los cambios y Cloudflare los publica.

---

## Seguridad (recomendado)

El servidor ya recalcula cada pedido (precios, combo, cupón y total salen del catálogo, no del
navegador), escapa todo lo que escribe el cliente, limita 5 pedidos por teléfono cada 10 minutos y solo
acepta JSON. Para cerrar lo que no se puede hacer desde el código:

1. **Panel con el token de Access verificado.** Pages → Settings → Variables and Secrets:
   `CF_ACCESS_TEAM_DOMAIN` = tu dominio de Zero Trust (p. ej. `miequipo.cloudflareaccess.com`) y
   `CF_ACCESS_AUD` = el *Application Audience (AUD) Tag* de la app de Access de `/gestion.html` y
   `/api/admin/*`. Luego **Retry deployment**. Con eso el panel solo acepta un token firmado por
   Cloudflare; aunque alguien falsifique el header o la cookie, no entra.
2. **Límite de peticiones.** Cloudflare → Security → WAF → Rate limiting: una regla para `/api/*`
   (por ejemplo 30 peticiones por minuto por IP). Frena a quien pruebe cupones o pedidos en masa.
3. **Bot Fight Mode** (Security → Bots) activado.
4. **Wompi:** el webhook solo verifica un pedido si el monto pagado es exactamente su total.
