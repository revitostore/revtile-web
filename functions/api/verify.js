/* ===== REVTILE VERIFY — consulta pública =====
   GET /api/verify?codigo=RV-8F29X-K3TQ

   Devuelve el registro de inspección de UNA unidad física. Nunca sale de
   aquí ningún dato del comprador: ni nombre, ni teléfono, ni dirección, ni
   ciudad, ni el número de pedido. La respuesta es idéntica para un código
   inexistente y para uno mal formado, así que enumerar no revela nada. */

import { RE_CODIGO, normalizarCodigo, vistaPublica } from './_verify-lib.js';

const json = (data, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });

/* misma respuesta para "no existe" y para "código inválido" */
const noEncontrado = () => json({ ok: false, error: 'No encontramos ningún registro con ese código.' }, 404);

export async function onRequestGet({ request, env }) {
  const codigo = normalizarCodigo(new URL(request.url).searchParams.get('codigo'));
  if (!RE_CODIGO.test(codigo)) return noEncontrado();

  try {
    const fila = await env.DB.prepare(
      `SELECT codigo, sku, lote, vence, sello, sello_nota,
              inspeccionado_en, despachado_en, fotos, estado, motivo_anulacion
       FROM verificaciones WHERE codigo = ?`
    ).bind(codigo).first();

    if (!fila) return noEncontrado();

    /* las fotos solo se anuncian si el bucket está configurado */
    return json({ ok: true, registro: vistaPublica(fila, !!env.VERIFY_FOTOS) }, 200, 300);
  } catch (e) {
    /* tabla sin migrar o base caída: no inventamos un registro */
    return json({ ok: false, error: 'La verificación no está disponible en este momento.' }, 503);
  }
}
