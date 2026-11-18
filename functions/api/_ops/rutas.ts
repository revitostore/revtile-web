/* Despachador de las rutas de analítica y operación: /api/admin/ops/<ruta>.
   Se llama desde functions/api/admin/[[path]].js DESPUÉS del candado de acceso, así que aquí no se
   vuelve a autenticar. Devuelve null si la ruta no es de este módulo. */

import type { Env } from './tipos.ts';
import { json } from './http.ts';
import * as a from './analitica.ts';

export async function rutasOps(ruta: string, request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const lectura = request.method === 'GET';
  switch (ruta) {
    case 'analitica': return lectura ? a.analitica(env, url) : json({ ok: false, error: 'Método no permitido' }, 405);
    case 'inventario': return lectura ? a.inventario(env) : json({ ok: false, error: 'Método no permitido' }, 405);
    case 'clientes': return lectura ? a.clientes(env) : json({ ok: false, error: 'Método no permitido' }, 405);
    case 'recompras': return lectura ? a.recompras(env) : json({ ok: false, error: 'Método no permitido' }, 405);
    case 'salud': return lectura ? a.salud(env) : json({ ok: false, error: 'Método no permitido' }, 405);
    case 'costos': return a.costos(env, request);
    case 'ajustes': return a.ajustes(env, request);
    case 'sincronizar': return request.method === 'POST' ? a.sincronizar(env) : json({ ok: false, error: 'Método no permitido' }, 405);
    default: return null;
  }
}
