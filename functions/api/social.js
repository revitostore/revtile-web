/* ===== Prueba social real =====
   GET /api/social — agregados calculados sobre la tabla `pedidos`.
   Solo números: ni un dato personal sale de aquí. Si la base no responde,
   devuelve ok:false y la portada oculta el bloque en vez de inventar nada. */

const json = (data, status = 200, maxAge = 3600) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? `public, max-age=${maxAge}` : 'no-store',
    },
  });

export async function onRequestGet({ env }) {
  try {
    const fila = await env.DB.prepare(
      `SELECT
         COUNT(*)                                                        AS entregados_total,
         SUM(CASE WHEN creado_en >= datetime('now','-30 day') THEN 1 END) AS entregados_30d,
         COUNT(DISTINCT lower(trim(ciudad)))                             AS ciudades
       FROM pedidos
       WHERE estado = 'entregado'`
    ).first();

    if (!fila) return json({ ok: false }, 200, 300);

    return json({
      ok: true,
      entregados_total: Number(fila.entregados_total) || 0,
      entregados_30d: Number(fila.entregados_30d) || 0,
      ciudades: Number(fila.ciudades) || 0,
      generado_en: new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    /* base no disponible: mejor no mostrar nada que mostrar un número inventado */
    return json({ ok: false }, 200, 60);
  }
}
