/* ===== REVTILE VERIFY — fotografías =====
   GET /api/verify/foto?c=RV-8F29X-K3TQ&i=0

   El bucket R2 nunca se expone directamente: se sirve a través de esta
   ruta, que primero comprueba que el código existe y que esa posición
   pertenece a ese registro. Sin el código no hay forma de listar ni de
   adivinar las claves de los objetos. */

import { RE_CODIGO, normalizarCodigo } from '../_verify-lib.js';

const vacio = (status) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export async function onRequestGet({ request, env }) {
  if (!env.VERIFY_FOTOS) return vacio(404);   // bucket sin configurar todavía

  const url = new URL(request.url);
  const codigo = normalizarCodigo(url.searchParams.get('c'));
  const i = parseInt(url.searchParams.get('i'), 10);
  if (!RE_CODIGO.test(codigo) || !Number.isInteger(i) || i < 0 || i > 19) return vacio(404);

  try {
    const fila = await env.DB.prepare('SELECT fotos, estado FROM verificaciones WHERE codigo = ?')
      .bind(codigo).first();
    if (!fila) return vacio(404);

    let claves = [];
    try { claves = JSON.parse(fila.fotos || '[]'); } catch (e) { /* registro sin fotos */ }
    const clave = claves[i];
    if (!clave || typeof clave !== 'string' || !clave.startsWith('verify/')) return vacio(404);

    const obj = await env.VERIFY_FOTOS.get(clave);
    if (!obj) return vacio(404);

    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
        /* las fotos de un registro no cambian nunca */
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return vacio(503);
  }
}
