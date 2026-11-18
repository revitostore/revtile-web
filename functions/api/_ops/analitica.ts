/* ===== Analítica y operación del Centro de mando =====
   Las consultas SQL viven aquí y los cálculos en calculos.ts (puros y probados).
   Todas las rutas son de solo lectura salvo `costos`, `ajustes` y `sincronizar`, y todas pasan
   antes por el candado del panel (functions/api/admin/[[path]].js). */

import type { Env } from './tipos.ts';
import { json, acotar, faltaMigracion, propio } from './http.ts';
import { registrarError } from './log.ts';
import { sincronizarEnvios } from './envios.ts';
import {
  serieDiaria, suma, promedio, ewma, planReposicion, embudo, margen, segmentarClientes, contarSegmentos,
  fechaBase, fechaRecompra, fechaBogota, hoyBogota, sumarDias, diasEntre,
} from './calculos.ts';
import type { AgregadoCliente } from './calculos.ts';
import { SUPLEMENTOS, CREATINAS, DURACION } from '../_catalogo.ts';
import { reservadas } from '../stock.ts';

type Catalogo = Record<string, { nombre: string; precio: number; stock?: number }>;
const SUP = SUPLEMENTOS as Catalogo;
const CRE = CREATINAS as Catalogo;
const DUR = DURACION as Record<string, number>;

const ITEMS = `json_each(CASE WHEN json_valid(p.items) THEN p.items ELSE '[]' END) j`;
const BOGOTA = "date(datetime(p.creado_en, '-5 hours'))";

async function todos<T>(env: Env, sql: string, ...binds: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...binds).all<T>();
  return r.results ?? [];
}
async function uno<T>(env: Env, sql: string, ...binds: unknown[]): Promise<T | null> {
  return (await env.DB.prepare(sql).bind(...binds).first<T>()) ?? null;
}

const AJUSTES_BASE: Record<string, number> = { lead_time_dias: 20, cobertura_dias: 45 };

async function leerAjustes(env: Env): Promise<Record<string, number>> {
  const a = { ...AJUSTES_BASE };
  try {
    for (const f of await todos<{ clave: string; valor: string }>(env, 'SELECT clave, valor FROM ajustes')) {
      if (propio(AJUSTES_BASE, f.clave) && Number(f.valor) > 0) a[f.clave] = Number(f.valor);
    }
  } catch { /* sin migración v6: valores por defecto */ }
  return a;
}

async function leerCostos(env: Env): Promise<Record<string, number>> {
  const c: Record<string, number> = {};
  try { for (const f of await todos<{ k: string; costo: number }>(env, 'SELECT k, costo FROM costos')) c[f.k] = f.costo; } catch { /* sin v6 */ }
  return c;
}

const sinMigracion = () => json({ ok: true, faltaMigracion: true });

/* ───────── ventas, productos, embudo ───────── */

export async function analitica(env: Env, url: URL): Promise<Response> {
  const dias = acotar(url.searchParams.get('dias'), 7, 365, 30);
  const ventana = `-${dias} days`;
  try {
    const [totales, cancelados, ventasDia, porProducto, ciudades, metodos, cupones] = await Promise.all([
      uno<{ n: number; ingresos: number; descuentos: number; combos: number }>(env,
        `SELECT COUNT(*) n, COALESCE(SUM(total), 0) ingresos, COALESCE(SUM(descuento), 0) descuentos, COALESCE(SUM(combo), 0) combos
           FROM pedidos p WHERE estado <> 'cancelado' AND creado_en >= datetime('now', ?)`, ventana),
      uno<{ n: number }>(env, `SELECT COUNT(*) n FROM pedidos WHERE estado = 'cancelado' AND creado_en >= datetime('now', ?)`, ventana),
      todos<{ dia: string; n: number; total: number }>(env,
        `SELECT ${BOGOTA} dia, COUNT(*) n, SUM(total) total FROM pedidos p
          WHERE estado <> 'cancelado' AND creado_en >= datetime('now', ?) GROUP BY dia ORDER BY dia`, ventana),
      todos<{ k: string; nombre: string; unidades: number; ingreso: number }>(env,
        `SELECT json_extract(j.value, '$.k') k, MAX(json_extract(j.value, '$.nombre')) nombre,
                SUM(CAST(json_extract(j.value, '$.c') AS INTEGER)) unidades,
                SUM(CAST(json_extract(j.value, '$.valor') AS INTEGER)) ingreso
           FROM pedidos p, ${ITEMS}
          WHERE p.estado <> 'cancelado' AND p.creado_en >= datetime('now', ?) GROUP BY k ORDER BY ingreso DESC`, ventana),
      todos<{ ciudad: string; n: number; total: number }>(env,
        `SELECT ciudad, COUNT(*) n, SUM(total) total FROM pedidos
          WHERE estado <> 'cancelado' AND creado_en >= datetime('now', ?) GROUP BY ciudad ORDER BY n DESC, total DESC LIMIT 10`, ventana),
      todos<{ metodo_pago: string; n: number; total: number }>(env,
        `SELECT metodo_pago, COUNT(*) n, SUM(total) total FROM pedidos
          WHERE estado <> 'cancelado' AND creado_en >= datetime('now', ?) GROUP BY metodo_pago ORDER BY n DESC`, ventana),
      todos<{ cupon: string; usos: number; descuento: number }>(env,
        `SELECT cupon, COUNT(*) usos, SUM(descuento) descuento FROM pedidos
          WHERE cupon IS NOT NULL AND estado <> 'cancelado' AND creado_en >= datetime('now', ?) GROUP BY cupon ORDER BY usos DESC`, ventana),
    ]);

    const costos = await leerCostos(env);
    const productos = porProducto.map((p) => ({ ...p, margen: margen(p.ingreso, p.unidades, costos[p.k] ?? costos[String(p.k).split(':')[0]]) }));
    const margenTotal = productos.reduce((a, p) => a + (p.margen ? p.margen.pesos : 0), 0);
    const conCosto = productos.filter((p) => p.margen).length;

    /* tiempos: del pedido al despacho, del pedido a la entrega y del despacho a la entrega */
    let tiempos: { despacho: Medida; entrega: Medida; transporte: Medida } | null = null;
    try {
      const h = async (estado: string): Promise<Medida> => {
        const r = await uno<{ horas: number | null; n: number }>(env,
          `SELECT AVG((julianday(d.t) - julianday(p.creado_en)) * 24) horas, COUNT(*) n
             FROM pedidos p JOIN (SELECT pedido_id, MIN(creado_en) t FROM estados_log WHERE estado = ? GROUP BY pedido_id) d ON d.pedido_id = p.id
            WHERE p.estado <> 'cancelado' AND p.creado_en >= datetime('now', ?)`, estado, ventana);
        return { horas: r && r.horas != null ? Math.round(r.horas * 10) / 10 : null, n: r ? r.n : 0 };
      };
      const transporte = await uno<{ horas: number | null; n: number }>(env,
        `SELECT AVG((julianday(e.t) - julianday(d.t)) * 24) horas, COUNT(*) n
           FROM (SELECT pedido_id, MIN(creado_en) t FROM estados_log WHERE estado = 'despachado' GROUP BY pedido_id) d
           JOIN (SELECT pedido_id, MIN(creado_en) t FROM estados_log WHERE estado = 'entregado' GROUP BY pedido_id) e ON e.pedido_id = d.pedido_id
          WHERE d.t >= datetime('now', ?)`, ventana);
      tiempos = {
        despacho: await h('despachado'),
        entrega: await h('entregado'),
        transporte: { horas: transporte && transporte.horas != null ? Math.round(transporte.horas * 10) / 10 : null, n: transporte ? transporte.n : 0 },
      };
    } catch (e) { if (!faltaMigracion(e)) throw e; }

    /* embudo de conversión (sesiones distintas por etapa) */
    let embudoPasos = null;
    let porDispositivo: { disp: string; n: number }[] = [];
    let interes: { k: string; vieron: number; canasta: number }[] = [];
    try {
      const filas = await todos<{ tipo: string; n: number }>(env,
        `SELECT tipo, COUNT(DISTINCT sesion) n FROM eventos WHERE creado_en >= datetime('now', ?) GROUP BY tipo`, ventana);
      const c = Object.fromEntries(filas.map((f) => [f.tipo, f.n])) as Record<string, number>;
      embudoPasos = embudo({ vista: c.vista ?? 0, producto: c.producto ?? 0, canasta: c.canasta ?? 0, pedido_inicio: c.pedido_inicio ?? 0, pedidos: totales?.n ?? 0 });
      porDispositivo = await todos(env, `SELECT COALESCE(disp, '?') disp, COUNT(DISTINCT sesion) n FROM eventos WHERE tipo = 'vista' AND creado_en >= datetime('now', ?) GROUP BY disp`, ventana);
      interes = await todos(env,
        `SELECT k, COUNT(DISTINCT CASE WHEN tipo = 'producto' THEN sesion END) vieron, COUNT(DISTINCT CASE WHEN tipo = 'canasta' THEN sesion END) canasta
           FROM eventos WHERE k IS NOT NULL AND tipo IN ('producto', 'canasta') AND creado_en >= datetime('now', ?) GROUP BY k ORDER BY vieron DESC`, ventana);
    } catch (e) { if (!faltaMigracion(e)) throw e; }

    const n = totales?.n ?? 0;
    return json({
      ok: true,
      dias,
      resumen: {
        pedidos: n,
        cancelados: cancelados?.n ?? 0,
        ingresos: totales?.ingresos ?? 0,
        ticket: n ? Math.round((totales?.ingresos ?? 0) / n) : 0,
        descuentos: (totales?.descuentos ?? 0) + (totales?.combos ?? 0),
        margenPesos: conCosto ? margenTotal : null,
        productosConCosto: conCosto,
        productosTotal: productos.length,
      },
      ventasDia: serieConFechas(ventasDia, dias),
      productos,
      ciudades,
      metodos,
      cupones,
      tiempos,
      embudo: embudoPasos,
      porDispositivo,
      interes,
    });
  } catch (e) {
    await registrarError(env, 'admin/analitica', e);
    return json({ ok: false, error: 'No se pudo calcular la analítica' }, 500);
  }
}

interface Medida { horas: number | null; n: number }

/** Los días de la ventana completos (los sin ventas valen 0), para que la gráfica no salte. */
function serieConFechas(filas: { dia: string; n: number; total: number }[], dias: number) {
  const hoy = hoyBogota();
  const pedidos = serieDiaria(filas.map((f) => ({ dia: f.dia, n: f.n })), dias, hoy);
  const ingresos = serieDiaria(filas.map((f) => ({ dia: f.dia, n: f.total })), dias, hoy);
  return pedidos.map((n, i) => ({ dia: sumarDias(hoy, -(dias - 1 - i)), n, total: ingresos[i] }));
}

/* ───────── inventario y reposición ───────── */

export async function inventario(env: Env): Promise<Response> {
  try {
    const hoy = hoyBogota();
    const ajustes = await leerAjustes(env);
    const costos = await leerCostos(env);
    const vendido = await reservadas(env.DB);
    const filas = await todos<{ k: string; dia: string; n: number }>(env,
      `SELECT json_extract(j.value, '$.k') k, ${BOGOTA} dia, SUM(CAST(json_extract(j.value, '$.c') AS INTEGER)) n
         FROM pedidos p, ${ITEMS}
        WHERE p.estado <> 'cancelado' AND p.creado_en >= datetime('now', '-60 days') GROUP BY k, dia`);
    const porK = new Map<string, { dia: string; n: number }[]>();
    for (const f of filas) { if (!porK.has(f.k)) porK.set(f.k, []); porK.get(f.k)!.push({ dia: f.dia, n: f.n }); }

    const urg = { ya: 0, pronto: 1, ok: 2, sin_ventas: 3 } as const;
    const suplementos = Object.entries(SUP).map(([k, p]) => {
      const serie = serieDiaria(porK.get(k) ?? [], 60, hoy);
      const base = p.stock ?? 0;
      const restante = Math.max(0, base - (vendido[k] ?? 0));
      const vel = ewma(serie, 0.1);
      const plan = planReposicion({ restante, velocidad: vel, leadDias: ajustes.lead_time_dias, coberturaDias: ajustes.cobertura_dias, hoy });
      const costo = costos[k] ?? costos[k.split(':')[0]] ?? null;
      return {
        k, nombre: p.nombre, precio: p.precio, costo,
        margenUnidad: costo != null ? p.precio - costo : null,
        base, vendido: vendido[k] ?? 0, restante,
        ult7: suma(serie.slice(-7)), ult30: suma(serie.slice(-30)),
        velocidad: Math.round(plan.velocidad * 1000) / 1000,
        promedio30: Math.round(promedio(serie.slice(-30)) * 1000) / 1000,
        diasRestantes: plan.diasRestantes != null ? Math.round(plan.diasRestantes) : null,
        agotadoEn: plan.agotadoEn, sugerido: plan.sugerido, urgencia: plan.urgencia,
        serie: serie.slice(-30),
      };
    }).sort((a, b) => urg[a.urgencia] - urg[b.urgencia] || (a.diasRestantes ?? 1e9) - (b.diasRestantes ?? 1e9));

    /* las creatinas no llevan stock aquí: se muestra su ritmo de venta */
    const creatinas = Object.entries(CRE).map(([k, p]) => {
      const serie = serieDiaria(porK.get(k) ?? [], 60, hoy);
      return { k, nombre: p.nombre, precio: p.precio, costo: costos[k] ?? null, ult7: suma(serie.slice(-7)), ult30: suma(serie.slice(-30)), velocidad: Math.round(ewma(serie, 0.1) * 1000) / 1000, serie: serie.slice(-30) };
    });
    return json({ ok: true, ajustes, suplementos, creatinas });
  } catch (e) {
    await registrarError(env, 'admin/inventario', e);
    return json({ ok: false, error: 'No se pudo calcular el inventario' }, 500);
  }
}

/* ───────── clientes ───────── */

export async function clientes(env: Env): Promise<Response> {
  try {
    const hoy = hoyBogota();
    const filas = await todos<{ tel: string; nombre: string; ciudad: string; pedidos: number; gastado: number; primero: string; ultimo: string }>(env,
      `SELECT telefono tel, MAX(nombre) nombre, MAX(ciudad) ciudad, COUNT(*) pedidos, SUM(total) gastado, MIN(creado_en) primero, MAX(creado_en) ultimo
         FROM pedidos WHERE estado <> 'cancelado' GROUP BY telefono`);
    const agregados: AgregadoCliente[] = filas.map((f) => ({ ...f, primero: fechaBogota(f.primero), ultimo: fechaBogota(f.ultimo) }));
    const lista = segmentarClientes(agregados, hoy);
    const orden = { en_riesgo: 0, vip: 1, recurrente: 2, nuevo: 3, dormido: 4 } as const;
    lista.sort((a, b) => orden[a.segmento] - orden[b.segmento] || b.gastado - a.gastado);
    const total = lista.length;
    const recurrentes = lista.filter((c) => c.pedidos > 1).length;
    const ingresos = lista.reduce((a, c) => a + c.gastado, 0);
    return json({
      ok: true,
      kpis: {
        clientes: total,
        recompra: total ? Math.round((recurrentes / total) * 1000) / 10 : 0,
        valorMedio: total ? Math.round(ingresos / total) : 0,
        pedidosPorCliente: total ? Math.round((lista.reduce((a, c) => a + c.pedidos, 0) / total) * 100) / 100 : 0,
      },
      segmentos: contarSegmentos(lista),
      clientes: lista.slice(0, 200),
    });
  } catch (e) {
    await registrarError(env, 'admin/clientes', e);
    return json({ ok: false, error: 'No se pudieron calcular los clientes' }, 500);
  }
}

/* ───────── recompras (avisos de «se te está acabando») ───────── */

export async function recompras(env: Env): Promise<Response> {
  try {
    const hoy = hoyBogota();
    const pedidos = await todos<{ id: string; nombre: string; telefono: string; items: string; creado_en: string; estado: string; despachado: string | null; entregado: string | null }>(env,
      `SELECT p.id, p.nombre, p.telefono, p.items, p.creado_en, p.estado,
              (SELECT MIN(creado_en) FROM estados_log WHERE pedido_id = p.id AND estado = 'despachado') despachado,
              (SELECT MIN(creado_en) FROM estados_log WHERE pedido_id = p.id AND estado = 'entregado') entregado
         FROM pedidos p WHERE p.recordar = 1 AND p.estado IN ('despachado', 'entregado')`);
    const ultimos = new Map((await todos<{ telefono: string; ultimo: string }>(env,
      `SELECT telefono, MAX(creado_en) ultimo FROM pedidos WHERE estado <> 'cancelado' GROUP BY telefono`)).map((f) => [f.telefono, f.ultimo]));

    const lista = [];
    for (const p of pedidos) {
      /* si ya volvió a comprar después de este pedido, no hay nada que recordarle */
      if ((ultimos.get(p.telefono) ?? '') > p.creado_en) continue;
      let items: { k: string; c: number; nombre: string }[] = [];
      try { items = JSON.parse(p.items); } catch { continue; }
      const base = fechaBase({ creado: fechaBogota(p.creado_en), despachado: p.despachado ? fechaBogota(p.despachado) : null, entregado: p.entregado ? fechaBogota(p.entregado) : null });
      const cuando = fechaRecompra(base, items, DUR);
      if (!cuando) continue;
      const diasFaltan = diasEntre(hoy, cuando);
      if (diasFaltan > 14) continue; // solo los de las próximas dos semanas y los vencidos
      const primero = items.filter((i) => DUR[i.k] > 0).sort((a, b) => DUR[a.k] * a.c - DUR[b.k] * b.c)[0];
      const nombrePila = (p.nombre || '').trim().split(/\s+/)[0];
      lista.push({
        id: p.id, nombre: p.nombre, telefono: p.telefono, cuando, diasFaltan,
        producto: primero ? primero.nombre : '',
        mensaje: `Hola ${nombrePila}, soy David de REVTILE. Por el ritmo de uso, a tu ${primero ? primero.nombre : 'pedido'} ya le debe quedar poco. Si quieres reponerlo, lo armas en un minuto en revtile.com.co y el envío es gratis. Si prefieres no recibir más avisos, dímelo y no te vuelvo a escribir.`,
      });
    }
    lista.sort((a, b) => a.diasFaltan - b.diasFaltan);
    return json({ ok: true, hoy, recompras: lista });
  } catch (e) {
    if (faltaMigracion(e)) return sinMigracion();
    await registrarError(env, 'admin/recompras', e);
    return json({ ok: false, error: 'No se pudieron calcular las recompras' }, 500);
  }
}

/* ───────── costos y ajustes ───────── */

export async function costos(env: Env, request: Request): Promise<Response> {
  try {
    if (request.method === 'POST') {
      const b = (await request.json()) as { k?: string; costo?: number | null };
      const k = String(b.k || '');
      if (!propio(SUP, k) && !propio(CRE, k)) return json({ ok: false, error: 'Producto desconocido' }, 400);
      if (b.costo === null || b.costo === undefined || (b.costo as unknown) === '') {
        await env.DB.prepare('DELETE FROM costos WHERE k = ?').bind(k).run();
      } else {
        const costo = Math.round(Number(b.costo));
        if (!Number.isFinite(costo) || costo < 0 || costo > 5_000_000) return json({ ok: false, error: 'Costo inválido' }, 400);
        await env.DB.prepare(
          `INSERT INTO costos (k, costo) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET costo = excluded.costo, actualizado_en = datetime('now')`
        ).bind(k, costo).run();
      }
    }
    const c = await leerCostos(env);
    const catalogo = [...Object.entries(CRE), ...Object.entries(SUP)].map(([k, p]) => ({
      k, nombre: p.nombre, precio: p.precio, costo: c[k] ?? null,
      margen: c[k] != null ? { pesos: p.precio - c[k], pct: Math.round(((p.precio - c[k]) / p.precio) * 1000) / 10 } : null,
    }));
    return json({ ok: true, costos: catalogo });
  } catch (e) {
    if (faltaMigracion(e)) return sinMigracion();
    await registrarError(env, 'admin/costos', e);
    return json({ ok: false, error: 'No se pudo guardar el costo' }, 500);
  }
}

export async function ajustes(env: Env, request: Request): Promise<Response> {
  try {
    if (request.method === 'POST') {
      const b = (await request.json()) as { clave?: string; valor?: number };
      const clave = String(b.clave || '');
      const valor = Math.round(Number(b.valor));
      if (!propio(AJUSTES_BASE, clave) || !(valor >= 1 && valor <= 365)) return json({ ok: false, error: 'Ajuste inválido' }, 400);
      await env.DB.prepare(`INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).bind(clave, String(valor)).run();
    }
    return json({ ok: true, ajustes: await leerAjustes(env) });
  } catch (e) {
    if (faltaMigracion(e)) return sinMigracion();
    await registrarError(env, 'admin/ajustes', e);
    return json({ ok: false, error: 'No se pudo guardar el ajuste' }, 500);
  }
}

/* ───────── salud del sistema ───────── */

const TABLAS_V6 = ['eventos', 'costos', 'ajustes', 'estados_log', 'errores'];

export async function salud(env: Env): Promise<Response> {
  try {
    const tablas = new Set((await todos<{ name: string }>(env, `SELECT name FROM sqlite_master WHERE type = 'table'`)).map((t) => t.name));
    const faltan = TABLAS_V6.filter((t) => !tablas.has(t));
    const columnas = new Set((await todos<{ name: string }>(env, `PRAGMA table_info(pedidos)`)).map((c) => c.name));
    if (!columnas.has('recordar')) faltan.push('pedidos.recordar');

    const n = async (sql: string, ...b: unknown[]) => (await uno<{ n: number }>(env, sql, ...b))?.n ?? 0;
    const conteos = {
      pedidos: await n('SELECT COUNT(*) n FROM pedidos'),
      eventos: tablas.has('eventos') ? await n('SELECT COUNT(*) n FROM eventos') : null,
      eventos24h: tablas.has('eventos') ? await n(`SELECT COUNT(*) n FROM eventos WHERE creado_en >= datetime('now', '-1 day')`) : null,
    };
    const alertas: { nivel: 'alta' | 'media'; texto: string }[] = [];
    const sinGestionar = await n(`SELECT COUNT(*) n FROM pedidos WHERE estado = 'nuevo' AND creado_en < datetime('now', '-1 day') AND archivado_en IS NULL`);
    if (sinGestionar) alertas.push({ nivel: 'alta', texto: `${sinGestionar} pedido(s) nuevo(s) llevan más de 24 h sin gestionar` });
    const sinGuia = await n(`SELECT COUNT(*) n FROM pedidos WHERE estado = 'despachado' AND (guia IS NULL OR guia = '') AND archivado_en IS NULL`);
    if (sinGuia) alertas.push({ nivel: 'media', texto: `${sinGuia} pedido(s) despachado(s) no tienen número de guía` });

    let errores: { ruta: string; mensaje: string; creado_en: string }[] = [];
    let erroresPorRuta: { ruta: string; n: number }[] = [];
    if (tablas.has('errores')) {
      errores = await todos(env, 'SELECT ruta, mensaje, creado_en FROM errores ORDER BY id DESC LIMIT 30');
      erroresPorRuta = await todos(env, `SELECT ruta, COUNT(*) n FROM errores WHERE creado_en >= datetime('now', '-7 days') GROUP BY ruta ORDER BY n DESC`);
      const e24 = await n(`SELECT COUNT(*) n FROM errores WHERE creado_en >= datetime('now', '-1 day')`);
      if (e24 >= 5) alertas.push({ nivel: 'alta', texto: `${e24} errores del servidor en las últimas 24 h` });
    }
    return json({ ok: true, migracion: { completa: faltan.length === 0, faltan }, conteos, alertas, errores, erroresPorRuta });
  } catch (e) {
    return json({ ok: false, error: 'No se pudo leer la salud del sistema' }, 500);
  }
}

/* ───────── sincronización con la transportadora ───────── */

export async function sincronizar(env: Env): Promise<Response> {
  try {
    return json({ ok: true, ...(await sincronizarEnvios(env)) });
  } catch (e) {
    await registrarError(env, 'admin/sincronizar', e);
    return json({ ok: false, error: 'No se pudo sincronizar' }, 500);
  }
}

