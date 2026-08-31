/* ===== API de pedidos Revtile (Cloudflare Pages Function) =====
   POST /api/pedido — valida y guarda el pedido en D1 (binding: DB), aplica cupón
   y envía aviso por email (si RESEND_KEY está configurada).
   Si algo falla, devuelve error y el checkout usa su respaldo por WhatsApp. */

import { validarCupon } from './cupon.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

/* Aviso de pedido nuevo por email (Resend). Nunca bloquea el registro. */
async function avisarPedido(env, d) {
  if (!env.RESEND_KEY || !env.NOTIF_EMAIL) return;
  const items = d.items.map((i) => `${i.c}× ${i.nombre}`).join('<br>');
  const entrega = d.entrega_dia ? `⚡ Programada: <b>${d.entrega_dia} · ${d.entrega_hora}</b>` : 'Estándar (2-3 días hábiles)';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#0d0f17;color:#f7f8fa;padding:24px;border-radius:14px">
      <h2 style="color:#e41c34;margin:0 0 4px">🦎 Pedido nuevo ${d.id}</h2>
      <p style="color:#9aa2b5;margin:0 0 16px">${d.metodo_pago === 'contraentrega' ? '🚚 CONTRAENTREGA (cobrar al entregar)' : '⚡ Pago anticipado Bre-B (esperar comprobante)'}</p>
      <p>${items}</p>
      ${d.cupon ? `<p>🎟 Cupón <b>${d.cupon}</b>: −${fmt(d.descuento)}</p>` : ''}
      <p style="font-size:20px"><b>Total: ${fmt(d.total)}</b> ${d.envio ? `(incluye envío ${fmt(d.envio)})` : '(envío gratis)'}</p>
      <hr style="border-color:#2a2f45">
      <p>👤 <b>${d.nombre}</b><br>📱 <a href="https://wa.me/57${d.telefono}" style="color:#2de2e6">${d.telefono}</a><br>📍 ${d.direccion}, ${d.ciudad}</p>
      <p>📦 ${entrega}</p>
      <p><a href="https://revtile.com.co/admin.html" style="color:#ffc24b">Abrir panel de pedidos →</a></p>
    </div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RESEND_KEY },
      body: JSON.stringify({
        from: env.NOTIF_FROM || 'REVTILE <onboarding@resend.dev>',
        to: [env.NOTIF_EMAIL],
        subject: `🦎 Pedido ${d.id} — ${fmt(d.total)} (${d.metodo_pago})`,
        html,
      }),
    });
  } catch (e) { /* el aviso nunca tumba el pedido */ }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let p;
  try {
    p = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'JSON inválido' }, 400);
  }

  /* honeypot: los bots llenan el campo oculto — respondemos ok falso y no guardamos */
  if (p.web) return json({ ok: true, id: p.id || 'RV-OK' });

  /* validación de campos mínimos */
  const id = String(p.id || '').trim();
  const nombre = String(p.nombre || '').trim().slice(0, 120);
  const telefono = String(p.telefono || '').replace(/\D/g, '');
  const ciudad = String(p.ciudad || '').trim().slice(0, 80);
  const direccion = String(p.direccion || '').trim().slice(0, 200);
  const metodo = p.metodo_pago === 'contraentrega' ? 'contraentrega' : 'anticipado';

  if (!/^RV-[A-Z0-9]{4,8}$/.test(id)) return json({ ok: false, error: 'ID inválido' }, 400);
  if (!nombre) return json({ ok: false, error: 'Falta el nombre' }, 400);
  if (!/^3\d{9}$/.test(telefono)) return json({ ok: false, error: 'Teléfono inválido' }, 400);
  if (!ciudad || !direccion) return json({ ok: false, error: 'Faltan datos de entrega' }, 400);
  if (!Array.isArray(p.items) || p.items.length === 0) return json({ ok: false, error: 'Pedido vacío' }, 400);

  const total = Number(p.total);
  if (!Number.isFinite(total) || total < 10000 || total > 5000000) {
    return json({ ok: false, error: 'Total fuera de rango' }, 400);
  }

  try {
    /* cupón: re-validación en servidor (el cliente solo sugiere) */
    let cupon = null;
    let descuento = 0;
    if (p.cupon) {
      try {
        const codigo = String(p.cupon).trim().toUpperCase();
        const base = (Number(p.subtotal) || total) - (Number(p.combo) || 0);
        const v = await validarCupon(env.DB, codigo, base);
        if (v.ok) { cupon = v.codigo; descuento = v.descuento; }
      } catch (e) { /* tabla cupones ausente: pedido sigue sin descuento */ }
    }

    /* INSERT OR IGNORE: si el mismo ID llega dos veces, no se duplica */
    const camposBase = [
      id,
      metodo,
      p.entrega_dia ? String(p.entrega_dia).slice(0, 40) : null,
      p.entrega_hora ? String(p.entrega_hora).slice(0, 20) : null,
      JSON.stringify(p.items).slice(0, 2000),
      Number(p.subtotal) || 0,
      Number(p.combo) || 0,
      Number(p.envio) || 0,
      total,
      nombre,
      telefono,
      ciudad,
      direccion,
      p.vivienda ? String(p.vivienda).slice(0, 30) : null,
      p.apto ? String(p.apto).slice(0, 80) : null,
      p.porteria ? 1 : 0,
      p.direccion_mapa ? String(p.direccion_mapa).slice(0, 200) : null,
      p.lat ? Number(p.lat) : null,
      p.lng ? Number(p.lng) : null,
    ];
    let res;
    try {
      res = await env.DB.prepare(
        `INSERT OR IGNORE INTO pedidos
          (id, metodo_pago, entrega_dia, entrega_hora, items, subtotal, combo, envio, total,
           nombre, telefono, ciudad, direccion, vivienda, apto, porteria, direccion_mapa, lat, lng, cupon, descuento)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(...camposBase, cupon, descuento).run();
    } catch (e) {
      /* base sin migrar a v2 (sin columnas cupon/descuento): guardar igual con el esquema viejo */
      res = await env.DB.prepare(
        `INSERT OR IGNORE INTO pedidos
          (id, metodo_pago, entrega_dia, entrega_hora, items, subtotal, combo, envio, total,
           nombre, telefono, ciudad, direccion, vivienda, apto, porteria, direccion_mapa, lat, lng)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(...camposBase).run();
    }

    /* solo si el pedido es nuevo (no repetido): contar uso del cupón y avisar */
    if (res.meta.changes > 0) {
      if (cupon) {
        await env.DB.prepare('UPDATE cupones SET usos = usos + 1 WHERE codigo = ?').bind(cupon).run();
      }
      context.waitUntil(avisarPedido(env, {
        id, metodo_pago: metodo, items: p.items, total, nombre, telefono, ciudad, direccion,
        entrega_dia: p.entrega_dia, entrega_hora: p.entrega_hora, envio: Number(p.envio) || 0, cupon, descuento,
      }));
    }

    return json({ ok: true, id, cupon, descuento });
  } catch (e) {
    /* DB no configurada o caída: el checkout usará el mensaje completo por WhatsApp */
    return json({ ok: false, error: 'DB no disponible' }, 500);
  }
}

/* métodos distintos de POST: Cloudflare Pages responde 405 automáticamente */
