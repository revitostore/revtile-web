/* ===== Wompi · inicio de pago =====
   GET  → ¿está configurado? (el checkout muestra u oculta la opción)
   POST {id} → firma la transacción en el servidor (el monto sale de la
   base, nunca del navegador) y devuelve la URL del Web Checkout.

   Llaves en Cloudflare Pages → Variables and Secrets:
     WOMPI_PUBLIC    (texto)   llave pública pub_prod_… o pub_test_…
     WOMPI_INTEGRITY (secreto) secreto de integridad
     WOMPI_EVENTS    (secreto) secreto de eventos (lo usa /api/wompi) */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const sha256hex = async (texto) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export async function onRequestGet({ env }) {
  return json({ ok: true, activo: !!(env.WOMPI_PUBLIC && env.WOMPI_INTEGRITY) });
}

export async function onRequestPost({ request, env }) {
  if (!env.WOMPI_PUBLIC || !env.WOMPI_INTEGRITY) {
    return json({ ok: false, error: 'Pagos en línea aún no disponibles' }, 503);
  }
  const { id } = await request.json().catch(() => ({}));
  if (!/^RV-[A-Z0-9]{4,8}$/.test(id || '')) return json({ ok: false, error: 'ID inválido' }, 400);

  const p = await env.DB.prepare('SELECT total, estado FROM pedidos WHERE id = ?').bind(id).first();
  if (!p) return json({ ok: false, error: 'Pedido no encontrado' }, 404);
  if (p.estado === 'cancelado') return json({ ok: false, error: 'Pedido cancelado' }, 409);

  /* referencia única por intento: permite reintentar un pago fallido */
  const referencia = id + '-' + Date.now().toString(36).toUpperCase();
  const centavos = Math.round(Number(p.total)) * 100;
  const firma = await sha256hex(referencia + centavos + 'COP' + env.WOMPI_INTEGRITY);

  const u = new URL('https://checkout.wompi.co/p/');
  u.searchParams.set('public-key', env.WOMPI_PUBLIC);
  u.searchParams.set('currency', 'COP');
  u.searchParams.set('amount-in-cents', String(centavos));
  u.searchParams.set('reference', referencia);
  u.searchParams.set('signature:integrity', firma);
  u.searchParams.set('redirect-url', 'https://revtile.com.co/rastreo?id=' + id);

  return json({ ok: true, url: u.toString() });
}
