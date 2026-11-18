/* Pruebas unitarias de las funciones puras (functions/api/_ops/calculos.ts).
   No necesitan servidor ni base de datos: se ejecutan con `npm run test:unidad`.
   El TypeScript se traduce al vuelo con el propio compilador, así corre en cualquier Node. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(RAIZ, 'tests', '.tmp');
mkdirSync(TMP, { recursive: true });

async function cargarTs(ruta) {
  const salida = ts.transpileModule(readFileSync(join(RAIZ, ruta), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  const destino = join(TMP, ruta.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs'));
  writeFileSync(destino, salida.outputText);
  return import(pathToFileURL(destino).href);
}

const C = await cargarTs('functions/api/_ops/calculos.ts');
let ok = 0;
const prueba = (nombre, fn) => {
  try { fn(); ok++; console.log('  ok   ' + nombre); } catch (e) { console.error('  FALLA ' + nombre + '\n        ' + e.message); process.exitCode = 1; }
};
const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} no está cerca de ${b}`);

console.log('\n── Fechas ──');
prueba('sumarDias cruza fin de mes y de año', () => {
  assert.equal(C.sumarDias('2026-01-31', 1), '2026-02-01');
  assert.equal(C.sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(C.sumarDias('2026-03-01', -1), '2026-02-28');
});
prueba('diasEntre es simétrico en signo', () => {
  assert.equal(C.diasEntre('2026-11-01', '2026-11-11'), 10);
  assert.equal(C.diasEntre('2026-11-11', '2026-11-01'), -10);
});
prueba('hoyBogota resta 5 horas (a las 03:00 UTC todavía es el día anterior)', () => {
  assert.equal(C.hoyBogota(new Date('2026-11-06T03:00:00Z')), '2026-11-05');
  assert.equal(C.hoyBogota(new Date('2026-11-06T05:00:00Z')), '2026-11-06');
});
prueba('fechaBogota convierte la marca de SQLite', () => {
  assert.equal(C.fechaBogota('2026-11-06 02:30:00'), '2026-11-05');
  assert.equal(C.fechaBogota('2026-11-06 15:00:00'), '2026-11-06');
});
prueba('horasEntre', () => cerca(C.horasEntre('2026-11-01 10:00:00', '2026-11-02 16:30:00'), 30.5));

console.log('\n── Series y pronóstico ──');
prueba('serieDiaria rellena con ceros y termina hoy', () => {
  const s = C.serieDiaria([{ dia: '2026-11-04', n: 2 }, { dia: '2026-11-06', n: 5 }], 5, '2026-11-06');
  assert.deepEqual(s, [0, 0, 2, 0, 5]);
});
prueba('ewma de una serie constante es esa constante', () => cerca(C.ewma(Array(30).fill(2)), 2));
prueba('ewma de una serie vacía es 0 y de puros ceros también', () => {
  assert.equal(C.ewma([]), 0);
  assert.equal(C.ewma(Array(20).fill(0)), 0);
});
prueba('ewma reacciona a un cambio de ritmo (sube sin pasarse)', () => {
  const s = [...Array(30).fill(1), ...Array(20).fill(3)];
  const e = C.ewma(s, 0.1);
  assert.ok(e > 1 && e < 3, String(e));
});
prueba('ewma con alfa mayor reacciona más rápido', () => {
  const s = [...Array(30).fill(1), ...Array(5).fill(4)];
  assert.ok(C.ewma(s, 0.4) > C.ewma(s, 0.05));
});

console.log('\n── Reposición ──');
const hoy = '2026-11-06';
prueba('sin ventas: no hay fecha ni sugerencia', () => {
  const r = C.planReposicion({ restante: 3, velocidad: 0, leadDias: 20, coberturaDias: 45, hoy });
  assert.equal(r.urgencia, 'sin_ventas'); assert.equal(r.diasRestantes, null); assert.equal(r.sugerido, 0);
});
prueba('sin stock y sin ventas igual es urgente', () => assert.equal(C.planReposicion({ restante: 0, velocidad: 0, leadDias: 20, coberturaDias: 45, hoy }).urgencia, 'ya'));
prueba('stock que no alcanza al proveedor = urgencia ya', () => {
  const r = C.planReposicion({ restante: 5, velocidad: 0.5, leadDias: 20, coberturaDias: 45, hoy });
  assert.equal(r.urgencia, 'ya'); cerca(r.diasRestantes, 10); assert.equal(r.agotadoEn, '2026-11-16');
});
prueba('pronto: se acaba justo después del tiempo del proveedor', () => assert.equal(C.planReposicion({ restante: 13, velocidad: 0.5, leadDias: 20, coberturaDias: 45, hoy }).urgencia, 'pronto'));
prueba('ok: sobra stock', () => assert.equal(C.planReposicion({ restante: 40, velocidad: 0.5, leadDias: 20, coberturaDias: 45, hoy }).urgencia, 'ok'));
prueba('sugerido = velocidad × (lead + cobertura) − lo que queda, redondeado hacia arriba', () => {
  const r = C.planReposicion({ restante: 5, velocidad: 0.5, leadDias: 20, coberturaDias: 45, hoy });
  assert.equal(r.sugerido, Math.ceil(0.5 * 65 - 5)); // 28
});
prueba('nunca sugiere negativo', () => assert.equal(C.planReposicion({ restante: 500, velocidad: 0.1, leadDias: 10, coberturaDias: 10, hoy }).sugerido, 0));
prueba('con stock 0 y ventas sugiere cubrir todo el período', () => assert.equal(C.planReposicion({ restante: 0, velocidad: 1, leadDias: 10, coberturaDias: 20, hoy }).sugerido, 30));

console.log('\n── Embudo ──');
prueba('porcentajes por paso y total', () => {
  const e = C.embudo({ vista: 1000, producto: 400, canasta: 100, pedido_inicio: 50, pedidos: 20 });
  assert.equal(e[0].pctPaso, null); assert.equal(e[1].pctPaso, 40); assert.equal(e[2].pctPaso, 25);
  assert.equal(e[4].pctPaso, 40); assert.equal(e[4].pctTotal, 2);
});
prueba('embudo sin visitas no divide entre cero', () => {
  const e = C.embudo({ vista: 0, producto: 0, canasta: 0, pedido_inicio: 0, pedidos: 0 });
  assert.ok(e.every((p) => p.pctPaso === null || p.pctPaso === null));
});

console.log('\n── Margen ──');
prueba('margen en pesos y %', () => {
  const m = C.margen(250000, 1, 180000);
  assert.equal(m.pesos, 70000); assert.equal(m.pct, 28);
});
prueba('sin costo no se inventa un margen', () => { assert.equal(C.margen(250000, 1, null), null); assert.equal(C.margen(250000, 1, undefined), null); });
prueba('el margen puede ser negativo', () => assert.equal(C.margen(100000, 2, 70000).pesos, -40000));

console.log('\n── Clientes ──');
const cli = (extra) => ({ tel: '3100000000', nombre: 'X', ciudad: 'Bogotá', pedidos: 1, gastado: 100000, primero: '2026-11-01', ultimo: '2026-11-01', ...extra });
prueba('una compra reciente = nuevo', () => assert.equal(C.segmentarClientes([cli({})], '2026-11-10')[0].segmento, 'nuevo'));
prueba('una compra de hace 60 días = en riesgo', () => assert.equal(C.segmentarClientes([cli({ primero: '2026-09-01', ultimo: '2026-09-01' })], '2026-11-06')[0].segmento, 'en_riesgo'));
prueba('más de 120 días = dormido', () => assert.equal(C.segmentarClientes([cli({ primero: '2026-05-01', ultimo: '2026-05-01' })], '2026-11-06')[0].segmento, 'dormido'));
prueba('dos compras y vuelve dentro de su ritmo = recurrente', () => {
  const c = C.segmentarClientes([cli({ pedidos: 2, primero: '2026-09-01', ultimo: '2026-10-01' })], '2026-10-20')[0];
  assert.equal(c.segmento, 'recurrente'); cerca(c.intervalo, 30);
});
prueba('tres o más compras al día = vip', () => assert.equal(C.segmentarClientes([cli({ pedidos: 4, primero: '2026-07-01', ultimo: '2026-10-25' })], '2026-11-02')[0].segmento, 'vip'));
prueba('pasó 1,5 veces su ritmo = en riesgo', () => assert.equal(C.segmentarClientes([cli({ pedidos: 2, primero: '2026-08-01', ultimo: '2026-09-01' })], '2026-10-25')[0].segmento, 'en_riesgo'));
prueba('contarSegmentos suma todos', () => {
  const cs = C.segmentarClientes([cli({}), cli({ primero: '2026-05-01', ultimo: '2026-05-01' })], '2026-11-06');
  const n = C.contarSegmentos(cs);
  assert.equal(Object.values(n).reduce((a, b) => a + b, 0), 2); assert.equal(n.dormido, 1);
});

console.log('\n── Recompra ──');
prueba('la base es la entrega; si no hay, despacho + 3; si no, pedido + 5', () => {
  assert.equal(C.fechaBase({ creado: '2026-11-01', despachado: '2026-11-02', entregado: '2026-11-05' }), '2026-11-05');
  assert.equal(C.fechaBase({ creado: '2026-11-01', despachado: '2026-11-02' }), '2026-11-05');
  assert.equal(C.fechaBase({ creado: '2026-11-01' }), '2026-11-06');
});
prueba('se avisa 5 días antes de que se acabe el primer producto', () => {
  const f = C.fechaRecompra('2026-11-05', [{ k: 'on', c: 1 }, { k: 'bcaa:blue', c: 1 }], { on: 60, 'bcaa:blue': 30 });
  assert.equal(f, '2026-11-30'); // base + 30 − 5
});
prueba('dos unidades del mismo producto duran el doble', () => assert.equal(C.fechaRecompra('2026-11-05', [{ k: 'on', c: 2 }], { on: 60 }, 0), '2027-03-05'));
prueba('sin duración conocida no hay fecha', () => assert.equal(C.fechaRecompra('2026-11-05', [{ k: 'x', c: 1 }], {}), null));

console.log(`\n${ok} pruebas bien${process.exitCode ? ', con fallas' : ''}.`);
