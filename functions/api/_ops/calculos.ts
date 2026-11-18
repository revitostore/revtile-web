/* ===== Cálculos de la plataforma de datos de REVTILE =====
   Funciones PURAS (sin base de datos ni red): reciben datos y devuelven resultados, así que se
   prueban en milisegundos (tests/unidad.mjs). La base de datos y las rutas viven en otros archivos.

   Fechas: todo se maneja como texto «AAAA-MM-DD» en hora de Bogotá (UTC-5). Las marcas de tiempo de
   SQLite («AAAA-MM-DD HH:MM:SS», en UTC) se convierten con fechaBogota(). */

export const MS_DIA = 86_400_000;

export const aMs = (fecha: string): number =>
  Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)));

export const sumarDias = (fecha: string, n: number): string =>
  new Date(aMs(fecha) + n * MS_DIA).toISOString().slice(0, 10);

export const diasEntre = (desde: string, hasta: string): number =>
  Math.round((aMs(hasta) - aMs(desde)) / MS_DIA);

/** La fecha de hoy en Bogotá. */
export const hoyBogota = (ahora: Date = new Date()): string =>
  new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

/** Convierte «2026-11-05 23:30:00» (UTC, como lo guarda SQLite) a la fecha de Bogotá. */
export const fechaBogota = (marca: string): string =>
  new Date(new Date(marca.replace(' ', 'T') + 'Z').getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

/* ───────── series y pronóstico ───────── */

export interface FilaDia { dia: string; n: number }

/** Serie de `dias` valores que termina en `hoy`; los días sin ventas valen 0. */
export function serieDiaria(filas: FilaDia[], dias: number, hoy: string): number[] {
  const porDia = new Map(filas.map((f) => [f.dia, f.n]));
  const serie: number[] = [];
  for (let i = dias - 1; i >= 0; i--) serie.push(porDia.get(sumarDias(hoy, -i)) ?? 0);
  return serie;
}

export const suma = (serie: number[]): number => serie.reduce((a, b) => a + b, 0);

export const promedio = (serie: number[]): number => (serie.length ? suma(serie) / serie.length : 0);

/** Suavizado exponencial simple. Devuelve el nivel final: las unidades por día que se esperan hoy.
    Arranca con el promedio de los primeros días para no castigar a las series que empiezan en 0. */
export function ewma(serie: number[], alfa = 0.1): number {
  if (!serie.length) return 0;
  const inicio = serie.slice(0, Math.min(7, serie.length));
  let nivel = promedio(inicio);
  for (const x of serie.slice(inicio.length)) nivel = alfa * x + (1 - alfa) * nivel;
  return nivel;
}

export type Urgencia = 'ok' | 'pronto' | 'ya' | 'sin_ventas';

export interface PlanReposicion {
  velocidad: number;            // unidades por día esperadas
  diasRestantes: number | null; // null si no hay ventas
  agotadoEn: string | null;     // fecha estimada en que se acaba
  sugerido: number;             // unidades a pedir hoy
  urgencia: Urgencia;
}

/** ¿Cuánto reponer y cuándo?
    - Si lo que queda no alcanza para el tiempo que tarda el proveedor (leadDias), es urgencia «ya».
    - Se sugiere pedir lo necesario para cubrir lead + cobertura, menos lo que ya hay. */
export function planReposicion(p: { restante: number; velocidad: number; leadDias: number; coberturaDias: number; hoy: string }): PlanReposicion {
  const v = p.velocidad;
  if (v < 0.0001) {
    return { velocidad: 0, diasRestantes: null, agotadoEn: null, sugerido: 0, urgencia: p.restante <= 0 ? 'ya' : 'sin_ventas' };
  }
  const dias = Math.max(0, p.restante) / v;
  const sugerido = Math.max(0, Math.ceil(v * (p.leadDias + p.coberturaDias) - Math.max(0, p.restante)));
  const urgencia: Urgencia = dias <= p.leadDias ? 'ya' : dias <= p.leadDias + 7 ? 'pronto' : 'ok';
  return { velocidad: v, diasRestantes: dias, agotadoEn: sumarDias(p.hoy, Math.floor(dias)), sugerido, urgencia };
}

/* ───────── embudo ───────── */

export interface ConteosEmbudo { vista: number; producto: number; canasta: number; pedido_inicio: number; pedidos: number }
export interface PasoEmbudo { clave: keyof ConteosEmbudo; nombre: string; n: number; pctPaso: number | null; pctTotal: number | null }

const NOMBRES_EMBUDO: [keyof ConteosEmbudo, string][] = [
  ['vista', 'Visitaron la tienda'],
  ['producto', 'Vieron un producto'],
  ['canasta', 'Añadieron a la canasta'],
  ['pedido_inicio', 'Abrieron el pedido'],
  ['pedidos', 'Hicieron el pedido'],
];

/** Cada paso con su % respecto al anterior y respecto al inicio. */
export function embudo(c: ConteosEmbudo): PasoEmbudo[] {
  const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return NOMBRES_EMBUDO.map(([clave, nombre], i) => ({
    clave,
    nombre,
    n: c[clave],
    pctPaso: i === 0 ? null : pct(c[clave], c[NOMBRES_EMBUDO[i - 1][0]]),
    pctTotal: i === 0 ? null : pct(c[clave], c.vista),
  }));
}

/* ───────── dinero ───────── */

/** Margen en pesos y en %. Si no hay costo cargado devuelve null (no se inventa). */
export function margen(ingreso: number, unidades: number, costoUnitario: number | null | undefined): { pesos: number; pct: number } | null {
  if (costoUnitario == null || !(ingreso > 0)) return null;
  const pesos = ingreso - costoUnitario * unidades;
  return { pesos, pct: Math.round((pesos / ingreso) * 1000) / 10 };
}

/* ───────── clientes (RFM simplificado) ───────── */

export interface AgregadoCliente {
  tel: string; nombre: string; ciudad: string;
  pedidos: number; gastado: number; primero: string; ultimo: string; // fechas AAAA-MM-DD
}
export type Segmento = 'nuevo' | 'recurrente' | 'vip' | 'en_riesgo' | 'dormido';
export interface Cliente extends AgregadoCliente { recencia: number; intervalo: number | null; segmento: Segmento }

export const DIAS_DORMIDO = 120;
export const DIAS_NUEVO = 45;

/** Clasifica a cada cliente por recencia (cuánto hace que compró), frecuencia (cuántas veces) y su
    ritmo propio de compra (cada cuántos días suele volver).
    - nuevo: una sola compra, reciente.
    - recurrente / vip: compra otra vez dentro de su ritmo (vip = 3 o más pedidos).
    - en_riesgo: ya pasó 1,5 veces su ritmo (o una sola compra de hace más de 45 días).
    - dormido: más de 120 días sin comprar. */
export function segmentarClientes(filas: AgregadoCliente[], hoy: string): Cliente[] {
  return filas.map((f) => {
    const recencia = diasEntre(f.ultimo, hoy);
    const intervalo = f.pedidos > 1 ? diasEntre(f.primero, f.ultimo) / (f.pedidos - 1) : null;
    let segmento: Segmento;
    if (recencia > DIAS_DORMIDO) segmento = 'dormido';
    else if (f.pedidos === 1) segmento = recencia <= DIAS_NUEVO ? 'nuevo' : 'en_riesgo';
    else if (intervalo !== null && recencia > Math.max(1.5 * intervalo, 14)) segmento = 'en_riesgo';
    else segmento = f.pedidos >= 3 ? 'vip' : 'recurrente';
    return { ...f, recencia, intervalo, segmento };
  });
}

export function contarSegmentos(clientes: Cliente[]): Record<Segmento, number> {
  const r: Record<Segmento, number> = { nuevo: 0, recurrente: 0, vip: 0, en_riesgo: 0, dormido: 0 };
  for (const c of clientes) r[c.segmento]++;
  return r;
}

/* ───────── recompra ───────── */

/** La fecha base desde la que cuenta lo que dura el producto: la de entrega; si no hay, 3 días
    después del despacho; si tampoco, 5 días después del pedido. Todas en AAAA-MM-DD. */
export function fechaBase(p: { creado: string; despachado?: string | null; entregado?: string | null }): string {
  if (p.entregado) return p.entregado;
  if (p.despachado) return sumarDias(p.despachado, 3);
  return sumarDias(p.creado, 5);
}

/** Cuándo avisarle: cuando se le acabe el PRIMER producto del pedido, menos unos días de holgura para
    que le dé tiempo de recibir el siguiente. null si ningún producto tiene duración conocida. */
export function fechaRecompra(base: string, items: { k: string; c: number }[], duraciones: Record<string, number>, holgura = 5): string | null {
  const dias = items
    .filter((i) => duraciones[i.k] > 0 && i.c > 0)
    .map((i) => duraciones[i.k] * i.c);
  if (!dias.length) return null;
  return sumarDias(base, Math.min(...dias) - holgura);
}

/* ───────── tiempos ───────── */

/** Horas entre dos marcas de SQLite («AAAA-MM-DD HH:MM:SS», UTC). */
export function horasEntre(desde: string, hasta: string): number {
  return (new Date(hasta.replace(' ', 'T') + 'Z').getTime() - new Date(desde.replace(' ', 'T') + 'Z').getTime()) / 3_600_000;
}
