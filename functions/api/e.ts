/* ===== Eventos anónimos del sitio =====
   POST /api/e  { sesion, tipo, ruta?, k?, disp? }

   Mide el embudo de conversión (vista → producto → canasta → pedido) SIN datos personales: no se guarda
   IP, ni agente de usuario, ni nada que identifique a la persona. La sesión es un número al azar que vive
   solo en la pestaña (sessionStorage) y desaparece al cerrarla. El cliente no manda nada si el navegador
   pide no ser rastreado (Do Not Track / Global Privacy Control).

   Todo lo que llega se valida contra listas cerradas; lo que no encaja se ignora en silencio. */

import type { Env } from './_ops/tipos.ts';
import { propio } from './_ops/http.ts';
import { SUPLEMENTOS, CREATINAS } from './_catalogo.ts';

const TIPOS = ['vista', 'producto', 'canasta', 'pedido_inicio'];
const MAX_POR_HORA = 150;   // eventos por sesión: frena a quien intente llenar la tabla
const sinContenido = (): Response => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/** «wgs:dobles» → «wgs»: el embudo se mide por producto, no por sabor. Devuelve null si no existe. */
function productoBase(k: unknown): string | null {
  const base = String(k ?? '').split(':')[0];
  const hay = Object.keys(SUPLEMENTOS).some((c) => c.split(':')[0] === base) || propio(CREATINAS, base);
  return hay ? base : null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  /* robots y rastreadores no cuentan como visitas */
  if (/bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(request.headers.get('user-agent') || '')) return sinContenido();
  if (!/application\/json/i.test(request.headers.get('content-type') || '')) return sinContenido();
  let b: Record<string, unknown>;
  try {
    const texto = await request.text();
    if (texto.length > 1000) return sinContenido();
    b = JSON.parse(texto);
  } catch { return sinContenido(); }

  const sesion = String(b.sesion ?? '');
  const tipo = String(b.tipo ?? '');
  if (!/^[a-z0-9]{12,24}$/.test(sesion) || !TIPOS.includes(tipo)) return sinContenido();
  const ruta = typeof b.ruta === 'string' && /^\/[a-z0-9\-_/]{0,70}(\.html)?$/i.test(b.ruta) && !b.ruta.includes('//') ? b.ruta.toLowerCase().replace(/\.html$/, '') : null;
  const k = b.k != null ? productoBase(b.k) : null;
  if (b.k != null && !k) return sinContenido();
  const disp = b.disp === 'm' || b.disp === 'd' ? b.disp : null;

  try {
    const r = await env.DB.prepare(`SELECT COUNT(*) n FROM eventos WHERE sesion = ? AND creado_en >= datetime('now', '-1 hour')`).bind(sesion).first<{ n: number }>();
    if (r && r.n >= MAX_POR_HORA) return sinContenido();
    await env.DB.prepare('INSERT INTO eventos (sesion, tipo, ruta, k, disp) VALUES (?, ?, ?, ?, ?)').bind(sesion, tipo, ruta, k, disp).run();
  } catch { /* sin tabla (migración v6 pendiente) o sin base: se ignora */ }
  return sinContenido();
};
