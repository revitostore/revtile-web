/* ===== Rastreo público de pedidos =====
   GET /api/rastreo?id=RV-XXXXX
   Devuelve solo datos NO sensibles (nunca dirección, teléfono ni nombre completo). */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/* Rastreo en vivo vía Skydropx PRO (opcional: requiere secrets SKYDROPX_CLIENT_ID y
   SKYDROPX_CLIENT_SECRET en el proyecto Pages). Si no están o falla, se ignora.
   Endpoint real verificado: GET /api/v1/shipments?tracking_number=... — el estado
   vive en el paquete incluido (tracking_status_display_name, tracking_url_provider). */
async function trackingSkydropx(env, guia) {
  if (!env.SKYDROPX_CLIENT_ID || !env.SKYDROPX_CLIENT_SECRET || !guia) return null;
  try {
    const tk = await fetch('https://pro.skydropx.com/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.SKYDROPX_CLIENT_ID,
        client_secret: env.SKYDROPX_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });
    if (!tk.ok) return null;
    const { access_token } = await tk.json();
    const r = await fetch(
      'https://pro.skydropx.com/api/v1/shipments?tracking_number=' + encodeURIComponent(guia),
      { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access_token } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const envio = data.data && data.data[0];
    if (!envio) return null;
    const incl = data.included || [];
    const paquete = incl.find((i) => i.type === 'package' && i.attributes && i.attributes.tracking_number === guia)
      || incl.find((i) => i.type === 'package');
    const a = (paquete && paquete.attributes) || {};
    const s = envio.attributes || {};
    return {
      estado: a.tracking_status || null,
      estado_nombre: a.tracking_status_display_name || null,
      url: a.tracking_url_provider || null,
      dias_estimados: s.estimated_delivery_days != null ? s.estimated_delivery_days : null,
      actualizado: s.updated_at || null,
    };
  } catch (e) {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  const id = (new URL(request.url).searchParams.get('id') || '').trim().toUpperCase();
  if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);

  try {
    const p = await env.DB.prepare(
      `SELECT id, creado_en, estado, metodo_pago, entrega_dia, entrega_hora,
              items, total, ciudad, guia, transportadora
       FROM pedidos WHERE id = ?`
    ).bind(id).first();

    if (!p) return json({ ok: false, error: 'No encontramos ese pedido' }, 404);

    let items = [];
    try { items = JSON.parse(p.items).map((i) => ({ c: i.c, nombre: i.nombre })); } catch (e) { /* nada */ }

    const skydropx = await trackingSkydropx(env, p.guia);

    /* sincronización automática: si la transportadora ya avanzó, el estado interno
       avanza solo (nunca retrocede, y nunca toca un pedido cancelado) */
    const MAPA_SKY = { picked_up: 'despachado', in_transit: 'despachado', out_for_delivery: 'despachado', delivered: 'entregado' };
    const ORDEN = ['nuevo', 'verificado', 'despachado', 'entregado'];
    const estadoSky = skydropx && MAPA_SKY[skydropx.estado];
    if (estadoSky && p.estado !== 'cancelado' && ORDEN.indexOf(estadoSky) > ORDEN.indexOf(p.estado)) {
      p.estado = estadoSky;
      try {
        await env.DB.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').bind(estadoSky, id).run();
      } catch (e) { /* si no se pudo persistir, igual se muestra actualizado */ }
    }

    return json({
      ok: true,
      id: p.id,
      creado_en: p.creado_en,
      estado: p.estado,
      metodo_pago: p.metodo_pago,
      entrega_dia: p.entrega_dia,
      entrega_hora: p.entrega_hora,
      ciudad: p.ciudad,
      items,
      total: p.total,
      guia: p.guia,
      transportadora: p.transportadora,
      skydropx,
    });
  } catch (e) {
    return json({ ok: false, error: 'Sistema no disponible' }, 500);
  }
}
