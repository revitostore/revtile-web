/* Respuestas JSON y utilidades pequeñas de las rutas. */

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Un número entre min y max; si no es válido, el valor por defecto. */
export const acotar = (v: unknown, min: number, max: number, defecto: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : defecto;
};

/** ¿La consulta falló porque falta una tabla o columna (la migración v6 aún no se ejecutó)? */
export const faltaMigracion = (e: unknown): boolean =>
  /no such (table|column)/i.test(String((e as Error)?.message ?? e));

export const propio = (obj: object, k: string): boolean => Object.prototype.hasOwnProperty.call(obj, k);
