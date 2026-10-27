/* ===== Wompi · webhook de eventos =====
   Wompi llama aquí cuando una transacción cambia de estado. Se valida
   el checksum con el secreto de eventos y, si el pago fue APROBADO, el
   pedido pasa solo de 'nuevo' a 'verificado' (nunca retrocede).

   URL a registrar en el panel de Wompi (Eventos):
     https://revtile.com.co/api/wompi */

const sha256hex = async (texto) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/* comparación en tiempo constante: no filtra cuántos caracteres del checksum acertó un atacante */
const iguales = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

export async function onRequestPost({ request, env }) {
  if (!env.WOMPI_EVENTS) return new Response('sin configurar', { status: 503 });

  const cuerpo = await request.json().catch(() => null);
  const tx = cuerpo && cuerpo.data && cuerpo.data.transaction;
  const firma = cuerpo && cuerpo.signature;
  if (!tx || !firma || !Array.isArray(firma.properties) || cuerpo.timestamp == null) {
    return new Response('cuerpo inválido', { status: 400 });
  }

  /* checksum: los valores de signature.properties (rutas sobre `data`),
     concatenados en orden, más el timestamp y el secreto de eventos */
  const valorDe = (ruta) => ruta.split('.').reduce((a, k) => (a == null ? a : a[k]), cuerpo.data);
  const concatenado = firma.properties.map((p) => String(valorDe(p))).join('');
  const esperado = await sha256hex(concatenado + cuerpo.timestamp + env.WOMPI_EVENTS);
  if (!iguales(esperado.toLowerCase(), String(firma.checksum || '').toLowerCase())) {
    return new Response('checksum inválido', { status: 403 });
  }

  if (tx.status === 'APPROVED' && typeof tx.reference === 'string') {
    /* la referencia es RV-XXXXX-<intento>: recuperamos el ID del pedido */
    const m = tx.reference.match(/^(RV-[A-Z0-9]{4,8})/);
    if (m) {
      try {
        /* el pedido solo se verifica si lo pagado es exactamente su total (en centavos, COP) */
        const ped = await env.DB.prepare('SELECT total FROM pedidos WHERE id = ?').bind(m[1]).first();
        if (!ped || Number(tx.amount_in_cents) !== Math.round(Number(ped.total)) * 100 || (tx.currency && tx.currency !== 'COP')) {
          return new Response('monto no coincide', { status: 200 }); // 200 para que Wompi no reintente; queda sin verificar
        }
        await env.DB.prepare(
          `UPDATE pedidos
             SET estado = CASE WHEN estado = 'nuevo' THEN 'verificado' ELSE estado END,
                 nota = TRIM(COALESCE(nota, '') || ' · Wompi aprobado ' || ?)
           WHERE id = ?`
        ).bind(String(tx.id || ''), m[1]).run();
      } catch (e) { /* si la base falla, Wompi reintenta al no recibir 200 */
        return new Response('db', { status: 500 });
      }
    }
  }
  /* DECLINED / VOIDED / ERROR: no se toca nada — el cliente puede reintentar */
  return new Response('ok', { status: 200 });
}
