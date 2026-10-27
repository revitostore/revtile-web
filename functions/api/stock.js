/* ===== Stock vivo de los suplementos =====
   GET /api/stock → { ok, vivo, stock: { 'wgs:dobles': 2, ... } }
   Stock real = unidades que hay (productos.json) menos lo que ya se vendió en pedidos
   no cancelados. Cancelar un pedido devuelve la unidad. */

import { SUPLEMENTOS } from './_catalogo.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/* unidades ya vendidas, por clave de producto */
export async function reservadas(db) {
  const r = await db.prepare(
    `SELECT json_extract(j.value, '$.k') AS k,
            SUM(CAST(json_extract(j.value, '$.c') AS INTEGER)) AS n
       FROM pedidos p, json_each(CASE WHEN json_valid(p.items) THEN p.items ELSE '[]' END) j
      WHERE p.estado <> 'cancelado'
      GROUP BY k`
  ).all();
  const m = {};
  for (const f of r.results || []) m[f.k] = Number(f.n) || 0;
  return m;
}

export async function onRequestGet({ env }) {
  let apartadas = {};
  let vivo = true;
  try { apartadas = await reservadas(env.DB); } catch (e) { vivo = false; }
  const stock = {};
  for (const [k, v] of Object.entries(SUPLEMENTOS)) stock[k] = Math.max(0, v.stock - (apartadas[k] || 0));
  return json({ ok: true, vivo, stock });
}
