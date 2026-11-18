/* Estados de los pedidos y sincronización con la transportadora (Skydropx).
   Un pedido solo AVANZA (nuevo → verificado → despachado → entregado) y nunca toca uno cancelado.
   Cada avance queda en `estados_log`, que es de donde salen los tiempos de entrega. */

import type { Env } from './tipos.ts';
import { ESTADOS } from './tipos.ts';

/** Anota un cambio de estado. Si la tabla aún no existe (migración v6 pendiente) se ignora. */
export async function registrarEstado(env: Env, id: string, estado: string): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO estados_log (pedido_id, estado) VALUES (?, ?)').bind(id, estado).run();
  } catch { /* sin migración v6 */ }
}

export interface Seguimiento {
  estado: string | null;
  estado_nombre: string | null;
  url: string | null;
  dias_estimados: number | null;
  actualizado: string | null;
}

/* Rastreo en vivo vía Skydropx PRO (opcional: requiere SKYDROPX_CLIENT_ID y SKYDROPX_CLIENT_SECRET).
   Endpoint verificado: GET /api/v1/shipments?tracking_number=… — el estado vive en el paquete incluido. */
export async function seguimientoSkydropx(env: Env, guia: string | null): Promise<Seguimiento | null> {
  if (!env.SKYDROPX_CLIENT_ID || !env.SKYDROPX_CLIENT_SECRET || !guia) return null;
  try {
    const tk = await fetch('https://pro.skydropx.com/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.SKYDROPX_CLIENT_ID, client_secret: env.SKYDROPX_CLIENT_SECRET, grant_type: 'client_credentials' }),
    });
    if (!tk.ok) return null;
    const { access_token } = (await tk.json()) as { access_token: string };
    const r = await fetch('https://pro.skydropx.com/api/v1/shipments?tracking_number=' + encodeURIComponent(guia), {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access_token },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { data?: { attributes?: Record<string, unknown> }[]; included?: { type: string; attributes?: Record<string, unknown> }[] };
    const envio = data.data && data.data[0];
    if (!envio) return null;
    const incl = data.included || [];
    const paquete = incl.find((i) => i.type === 'package' && i.attributes && i.attributes.tracking_number === guia) || incl.find((i) => i.type === 'package');
    const a = (paquete && paquete.attributes) || {};
    const s = envio.attributes || {};
    return {
      estado: (a.tracking_status as string) || null,
      estado_nombre: (a.tracking_status_display_name as string) || null,
      url: (a.tracking_url_provider as string) || null,
      dias_estimados: s.estimated_delivery_days != null ? Number(s.estimated_delivery_days) : null,
      actualizado: (s.updated_at as string) || null,
    };
  } catch {
    return null;
  }
}

const MAPA_SKY: Record<string, string> = { picked_up: 'despachado', in_transit: 'despachado', out_for_delivery: 'despachado', delivered: 'entregado' };

/** El estado interno al que debería avanzar un pedido según la transportadora; null si no hay que moverlo. */
export function estadoDestino(actual: string, seg: Seguimiento | null): string | null {
  const destino = seg && seg.estado ? MAPA_SKY[seg.estado] : undefined;
  if (!destino || actual === 'cancelado') return null;
  const orden = ESTADOS as readonly string[];
  return orden.indexOf(destino) > orden.indexOf(actual) ? destino : null;
}

/** Avanza un pedido (y lo anota en el historial). Devuelve true si cambió. */
export async function avanzarPedido(env: Env, id: string, actual: string, seg: Seguimiento | null): Promise<boolean> {
  const destino = estadoDestino(actual, seg);
  if (!destino) return false;
  try {
    await env.DB.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').bind(destino, id).run();
    await registrarEstado(env, id, destino);
    return true;
  } catch {
    return false;
  }
}

/** Recorre los pedidos con guía que aún no se entregaron y los pone al día con la transportadora.
    Se llama desde el botón «Sincronizar» del panel (máximo 15 por vez, para respetar el tiempo de la función). */
export async function sincronizarEnvios(env: Env): Promise<{ revisados: number; cambios: { id: string; de: string; a: string }[] }> {
  const { results } = await env.DB.prepare(
    `SELECT id, estado, guia FROM pedidos
      WHERE estado IN ('verificado', 'despachado') AND guia IS NOT NULL AND guia <> ''
      ORDER BY creado_en LIMIT 15`
  ).all<{ id: string; estado: string; guia: string }>();
  const cambios: { id: string; de: string; a: string }[] = [];
  for (const p of results ?? []) {
    const seg = await seguimientoSkydropx(env, p.guia);
    const destino = estadoDestino(p.estado, seg);
    if (destino && (await avanzarPedido(env, p.id, p.estado, seg))) cambios.push({ id: p.id, de: p.estado, a: destino });
  }
  return { revisados: results?.length ?? 0, cambios };
}
