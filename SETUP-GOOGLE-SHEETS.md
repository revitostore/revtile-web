# Conectar los pedidos con la hoja de cálculo

Cada pedido nuevo se copiará como una fila en tu hoja. La base de datos
(D1) sigue siendo la fuente de verdad; la hoja es una copia para que
puedas filtrar, ordenar y guardar tus clientes con comodidad.

Son unos 10 minutos, una sola vez. **La clave nunca pasa por el chat:**
la generas tú en Google y la pegas tú en Cloudflare.

---

## 1 · Crear el proyecto en Google Cloud

1. Entra a <https://console.cloud.google.com>.
2. Arriba a la izquierda, en el selector de proyectos, **Nuevo proyecto**.
3. Nómbralo `revtile` y créalo. Espera a que quede seleccionado.

## 2 · Encender la API de Sheets

1. Menú ☰ → **APIs y servicios** → **Biblioteca**.
2. Busca **Google Sheets API** y dale **Habilitar**.

## 3 · Crear la cuenta de servicio

Una cuenta de servicio es un "usuario robot". Le vas a dar permiso solo
sobre esta hoja, y nada más. Si algún día quieres cortarle el acceso,
la quitas de la hoja y listo, sin tocar tu cuenta de Google.

1. Menú ☰ → **APIs y servicios** → **Credenciales**.
2. **Crear credenciales** → **Cuenta de servicio**.
3. Nombre: `revtile-pedidos`. Dale **Crear y continuar**.
4. En "Rol", no le pongas ninguno. **Continuar** → **Listo**.
   (No necesita permisos del proyecto, solo de la hoja.)

## 4 · Descargar la llave

1. En la lista de credenciales, haz clic en la cuenta `revtile-pedidos`.
2. Pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON**.
3. Se descarga un archivo `.json`. **Guárdalo bien y no lo subas a
   GitHub.** Ese archivo es la llave: quien lo tenga puede escribir en
   tu hoja.

## 5 · Darle acceso a la hoja

1. Abre el archivo `.json` con el Bloc de notas.
2. Busca la línea `"client_email"`. Es un correo que termina en
   `.iam.gserviceaccount.com`. Cópialo.
3. Abre tu hoja de cálculo, dale a **Compartir**, pega ese correo y
   dale permiso de **Editor**. Envía.

## 6 · Preparar la pestaña

1. En la hoja, renombra la primera pestaña a **`Pedidos`** (con mayúscula
   inicial, exactamente así).
2. En la fila 1, pega estos títulos, uno por columna, de la A a la S:

```
Pedido	Fecha	Estado	Nombre	Teléfono	Ciudad	Dirección	Apto	Portería	Productos	Subtotal	Combo	Envío	Total	Pago	Entrega	Dirección mapa	Coordenadas	Nota
```

> El orden importa: el código escribe en ese orden exacto. Si más
> adelante quieres una columna nueva, agrégala **al final**. Meterla en
> el medio desalinea todo lo que ya esté escrito.

## 7 · Pegar la llave en Cloudflare

1. Entra a Cloudflare → **Workers y Pages** → tu proyecto `revtile-web`.
2. **Settings** → **Environment variables** → **Add variable**.
3. Nombre: `GOOGLE_SA_JSON`
4. Valor: **todo el contenido del archivo `.json`**, de la primera llave
   `{` a la última `}`. Ábrelo con el Bloc de notas, selecciona todo
   (Ctrl+A), copia y pega.
5. **Importantísimo:** marca **Encrypt**. Así queda como secreto y no se
   puede volver a leer desde el panel.
6. Guarda y vuelve a desplegar el sitio (**Deployments** → en el último,
   **Retry deployment**).

---

## Comprobar que quedó

Haz un pedido de prueba en el sitio. En menos de un minuto debería
aparecer una fila nueva en la hoja.

Si no aparece, mira los registros: Cloudflare → tu proyecto →
**Functions** → **Real-time Logs**. Un mensaje que empiece con
`[sheets]` te dice qué pasó.

## Si algo falla

**El pedido se guarda igual.** La copia a la hoja está escrita para no
poder tumbar una venta: si Google no responde, el pedido ya quedó en la
base de datos y el cliente no se entera de nada. Por eso la hoja es una
comodidad, no un eslabón del que dependa la tienda.

## Para cortar el acceso

Abre la hoja → **Compartir** → quita el correo `...iam.gserviceaccount.com`.
Desde ese momento deja de escribirse, sin tocar nada más.
