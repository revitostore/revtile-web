/* ===== Copia de cada pedido a la hoja de cálculo de Google =====
 *
 * Qué hace: cada vez que entra un pedido, además de guardarlo en D1
 * (que sigue siendo la fuente de verdad), agrega una fila a tu hoja.
 * Si Google falla o tarda, el pedido se guarda igual: la copia nunca
 * puede tumbar una venta.
 *
 * Antes de que esto funcione hay que crear una credencial en Google.
 * Los pasos están en SETUP-GOOGLE-SHEETS.md. Mientras no exista la
 * variable GOOGLE_SA_JSON, esta función no hace nada y no molesta.
 *
 * Por qué una cuenta de servicio y no tu usuario: así el permiso es
 * solo sobre esa hoja, se puede revocar sin tocar tu cuenta de Google,
 * y si algún día alguien lee las variables del proyecto no obtiene
 * acceso a tu correo ni a tu Drive.
 */

const HOJA_ID = '1vn0I59DdCXerw-XuiVihQrcr54SbP78CvtfZ8h9o2Qw';
const PESTANA = 'Pedidos';

/* ── Firma del token, sin librerías ──────────────────────────────────
   Workers trae WebCrypto, así que se puede firmar el JWT a mano y
   evitar meter una dependencia entera para esto. */
function b64url(datos) {
  const bin = typeof datos === 'string' ? new TextEncoder().encode(datos) : new Uint8Array(datos);
  let s = '';
  for (const b of bin) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemABuffer(pem) {
  const cuerpo = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s/g, '');
  const bin = atob(cuerpo);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function tokenDeAcceso(sa) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: ahora + 3600,
    iat: ahora,
  }));
  const llave = await crypto.subtle.importKey(
    'pkcs8', pemABuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(cabecera + '.' + cuerpo));
  const jwt = cabecera + '.' + cuerpo + '.' + b64url(firma);

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error('Google rechazó la credencial: ' + r.status);
  return (await r.json()).access_token;
}

/* ── La fila ─────────────────────────────────────────────────────────
   El orden de las columnas queda fijo aquí. Si algún día se agrega un
   campo, va AL FINAL: insertarlo en medio desalinea todo lo que ya
   está escrito en la hoja. */
function filaDe(p) {
  let items = [];
  try { items = JSON.parse(p.items || '[]'); } catch (_) { items = []; }
  return [
    p.id,
    p.creado_en,
    p.estado,
    p.nombre,
    "'" + p.telefono,          // la comilla evita que Sheets se coma el cero inicial
    p.ciudad,
    p.direccion,
    [p.vivienda, p.apto].filter(Boolean).join(' '),
    p.porteria ? 'Sí' : 'No',
    items.map((i) => `${i.c}x ${i.nombre}`).join(' + '),
    p.subtotal,
    p.combo || 0,
    p.envio || 0,
    p.total,
    p.metodo_pago,
    [p.entrega_dia, p.entrega_hora].filter(Boolean).join(' '),
    p.direccion_mapa || '',
    p.lat && p.lng ? `${p.lat},${p.lng}` : '',
    p.nota || '',
  ];
}

/* ── Lo que se llama desde el checkout ───────────────────────────────
   Nunca lanza: si Google falla, el pedido ya quedó guardado en D1 y
   eso es lo que importa. El error se registra y se sigue. */
export async function copiarAHoja(env, pedido) {
  if (!env.GOOGLE_SA_JSON) return { ok: false, motivo: 'sin credencial' };
  try {
    const sa = JSON.parse(env.GOOGLE_SA_JSON);
    const token = await tokenDeAcceso(sa);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${HOJA_ID}` +
                `/values/${encodeURIComponent(PESTANA)}!A:S:append` +
                `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [filaDe(pedido)] }),
    });
    if (!r.ok) throw new Error('Sheets respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return { ok: true };
  } catch (e) {
    console.error('[sheets] no se pudo copiar el pedido', pedido && pedido.id, e.message);
    return { ok: false, motivo: e.message };
  }
}
