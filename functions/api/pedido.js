/* ===== API de pedidos Revtile (Cloudflare Pages Function) =====
   POST /api/pedido — valida y guarda el pedido en D1 (binding: DB).
   Si algo falla, devuelve error y el checkout usa su respaldo por WhatsApp. */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
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
    /* INSERT OR IGNORE: si el mismo ID llega dos veces, no se duplica */
    await env.DB.prepare(
      `INSERT OR IGNORE INTO pedidos
        (id, metodo_pago, entrega_dia, entrega_hora, items, subtotal, combo, envio, total,
         nombre, telefono, ciudad, direccion, vivienda, apto, porteria, direccion_mapa, lat, lng)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
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
      p.lng ? Number(p.lng) : null
    ).run();

    return json({ ok: true, id });
  } catch (e) {
    /* DB no configurada o caída: el checkout usará el mensaje completo por WhatsApp */
    return json({ ok: false, error: 'DB no disponible' }, 500);
  }
}

/* métodos distintos de POST: Cloudflare Pages responde 405 automáticamente */
