/* ===== Stock vivo de los suplementos =====
   GET /api/stock → { ok, vivo, stock: { 'wgs:dobles': 2, ... } }
   Stock real = unidades que hay (productos.json) menos lo que ya se vendió en pedidos
   no cancelados. Cancelar un pedido devuelve la unidad. */

import type { Env } from './_ops/tipos.ts';
import { json } from './_ops/http.ts';
import { SUPLEMENTOS } from './_catalogo.ts';

/** Unidades ya vendidas (pedidos no cancelados), por clave de producto. */
export async function reservadas(db: D1Database): Promise<Record<string, number>> {
  const r = await db.prepare(
    `SELECT json_extract(j.value, '$.k') AS k,
            SUM(CAST(json_extract(j.value, '$.c') AS INTEGER)) AS n
       FROM pedidos p, json_each(CASE WHEN json_valid(p.items) THEN p.items ELSE '[]' END) j
      WHERE p.estado <> 'cancelado'
      GROUP BY k`
  ).all<{ k: string; n: number }>();
  const m: Record<string, number> = {};
  for (const f of r.results ?? []) m[f.k] = Number(f.n) || 0;
  return m;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let vendidas: Record<string, number> = {};
  let vivo = true;
  try { vendidas = await reservadas(env.DB); } catch { vivo = false; }
  const stock: Record<string, number> = {};
  for (const [k, v] of Object.entries(SUPLEMENTOS)) stock[k] = Math.max(0, v.stock - (vendidas[k] || 0));
  return json({ ok: true, vivo, stock });
};
