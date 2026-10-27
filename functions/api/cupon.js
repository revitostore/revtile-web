/* ===== Validación de cupones =====
   GET /api/cupon?codigo=GYMBRO10&total=240000
   Devuelve el descuento que aplicaría; el cobro real se re-valida al registrar el pedido. */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/* valida y calcula; compartida conceptualmente con /api/pedido (misma lógica) */
export async function validarCupon(db, codigo, total) {
  const c = await db.prepare('SELECT * FROM cupones WHERE codigo = ?').bind(codigo).first();
  if (!c) return { ok: false, error: 'Ese cupón no existe' };
  if (!c.activo) return { ok: false, error: 'Ese cupón ya no está activo' };
  if (c.max_usos != null && c.usos >= c.max_usos) return { ok: false, error: 'Ese cupón ya se agotó' };
  if (total < c.min_total) return { ok: false, error: `Ese cupón aplica desde $${c.min_total.toLocaleString('es-CO')} de compra` };
  const descuento = c.tipo === 'porcentaje'
    ? Math.round((total * c.valor) / 100)
    : Math.min(c.valor, total);
  return { ok: true, codigo: c.codigo, tipo: c.tipo, valor: c.valor, descuento };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const codigo = (url.searchParams.get('codigo') || '').trim().toUpperCase();
  const total = Number(url.searchParams.get('total')) || 0;
  if (!/^[A-Z0-9]{3,20}$/.test(codigo)) return json({ ok: false, error: 'Código inválido' }, 400);

  try {
    const res = await validarCupon(env.DB, codigo, total);
    return json(res, res.ok ? 200 : 404);
  } catch (e) {
    return json({ ok: false, error: 'Sistema no disponible' }, 500);
  }
}
