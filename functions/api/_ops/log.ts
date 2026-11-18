/* Registro de errores del servidor: queda en la tabla `errores` y se ve en la pestaña «Salud» del panel.
   Nunca lanza: registrar un error jamás debe tumbar la petición que ya falló. */

import type { Env } from './tipos.ts';

export async function registrarError(env: Env, ruta: string, e: unknown): Promise<void> {
  const mensaje = String((e as Error)?.message ?? e).slice(0, 300);
  console.error(`[${ruta}]`, mensaje);
  try {
    await env.DB.prepare('INSERT INTO errores (ruta, mensaje) VALUES (?, ?)').bind(ruta.slice(0, 80), mensaje).run();
  } catch { /* sin tabla o sin base: solo queda el console.error */ }
}
