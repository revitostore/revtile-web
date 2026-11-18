/* ===== Rastreo público de pedidos =====
   GET /api/rastreo?id=RV-XXXXX
   Devuelve solo datos NO sensibles (nunca dirección, teléfono ni nombre completo). */

import type { Env } from './_ops/tipos.ts';
import { json } from './_ops/http.ts';
import { seguimientoSkydropx, avanzarPedido } from './_ops/envios.ts';
import { registrarError } from './_ops/log.ts';

interface FilaPedido {
  id: string; creado_en: string; estado: string; metodo_pago: string;
  entrega_dia: string | null; entrega_hora: string | null; items: string;
  total: number; ciudad: string; guia: string | null; transportadora: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = (new URL(request.url).searchParams.get('id') || '').trim().toUpperCase();
  if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);

  try {
    const p = await env.DB.prepare(
      `SELECT id, creado_en, estado, metodo_pago, entrega_dia, entrega_hora,
              items, total, ciudad, guia, transportadora
       FROM pedidos WHERE id = ?`
    ).bind(id).first<FilaPedido>();

    if (!p) return json({ ok: false, error: 'No encontramos ese pedido' }, 404);

    let items: { c: number; nombre: string; k: string; pre: number }[] = [];
    try {
      items = (JSON.parse(p.items) as { c: number; nombre: string; k: string; pre?: number }[]).map((i) => ({ c: i.c, nombre: i.nombre, k: i.k, pre: i.pre ? 1 : 0 }));
    } catch { /* nada */ }

    const skydropx = await seguimientoSkydropx(env, p.guia);

    /* sincronización automática: si la transportadora ya avanzó, el estado interno avanza solo
       (nunca retrocede, nunca toca un pedido cancelado) y queda anotado en el historial */
    if (await avanzarPedido(env, id, p.estado, skydropx)) {
      const f = await env.DB.prepare('SELECT estado FROM pedidos WHERE id = ?').bind(id).first<{ estado: string }>();
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
};
