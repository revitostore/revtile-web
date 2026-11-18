/* ===== Rastreo público de pedidos =====
   GET /api/rastreo?id=RV-XXXXX
   Devuelve solo datos NO sensibles (nunca dirección, teléfono ni nombre completo). */

import { seguimientoSkydropx, avanzarPedido } from './_ops/envios.ts';
import { registrarError } from './_ops/log.ts';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

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
    try { items = JSON.parse(p.items).map((i) => ({ c: i.c, nombre: i.nombre, k: i.k, pre: i.pre ? 1 : 0 })); } catch (e) { /* nada */ }

    const skydropx = await seguimientoSkydropx(env, p.guia);

    /* sincronización automática: si la transportadora ya avanzó, el estado interno avanza solo
       (nunca retrocede, nunca toca un pedido cancelado) y queda anotado en el historial */
    if (await avanzarPedido(env, id, p.estado, skydropx)) {
      const f = await env.DB.prepare('SELECT estado FROM pedidos WHERE id = ?').bind(id).first();
      if (f) p.estado = f.estado;
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
    await registrarError(env, 'rastreo', e);
    return json({ ok: false, error: 'Sistema no disponible' }, 500);
  }
}
