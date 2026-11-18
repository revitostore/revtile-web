#!/usr/bin/env node
/* Demo local con DATOS SINTÉTICOS: levanta el sitio completo con una base de datos de prueba llena de
   pedidos, clientes, eventos e historial inventados (generador con semilla fija: siempre los mismos).
   Sirve para ver y mostrar el Centro de mando sin tocar un solo dato real de clientes.

   Uso:   npm run demo
   Luego: http://localhost:8788/gestion.html   (llave de acceso: demo) */

import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = join(RAIZ, '.demo');
const PERSISTIR = join(DEMO, 'd1');
const TOML = join(RAIZ, 'wrangler.toml');
const MIGRACIONES = ['db/schema.sql', 'db/schema-v2.sql', 'db/schema-v4.sql', 'db/schema-v6.sql'];
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '').split('\n').filter((l) => l.trim()).join('\n');

/* ── generador pseudoaleatorio con semilla (mulberry32): mismos datos en cada corrida ── */
let semilla = 42;
const azar = () => { semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const marca = (diasAtras, horas = 0) => new Date(Date.now() - diasAtras * 86400000 - horas * 3600000).toISOString().slice(0, 19).replace('T', ' ');

const catalogo = JSON.parse(readFileSync(join(RAIZ, 'productos.json'), 'utf8'));
const CREATINAS = catalogo.productos.map((p) => ({ k: p.sku, nombre: `${p.marca} ${p.nombre} ${p.gramos} g`, precio: p.precio }));
const SUPL = { 'wgs:dobles': ['Optimum Nutrition Gold Standard 100% Whey · Double Rich Chocolate', 250000], 'outrage:blue': ['Nutrex Research Outrage Ultra Stim Pre-Workout · Blue Raspberry', 120000], 'bcaa:fruit': ['Rule 1 BCAA 2:1:1 · Fruit Punch', 120000], 'vitaform:unica': ['AllMax Nutrition Premium Vitaform', 90000] };
const CIUDADES = ['Bogotá', 'Bogotá', 'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Cartagena', 'Pereira', 'Manizales'];

const sentencias = [];
const clientes = Array.from({ length: 70 }, (_, i) => ({ nombre: `Cliente Demo ${String(i + 1).padStart(2, '0')}`, tel: '3000000' + String(100 + i), ciudad: elegir(CIUDADES), recordar: azar() < 0.45 }));
let n = 0;
const pedidoDe = (cliente, hace, lineas) => {
  const id = 'RV-D' + String(++n).padStart(4, '0');
  const items = lineas.map(([k, c]) => ({ k, c, nombre: (SUPL[k] ? SUPL[k][0] : CREATINAS.find((x) => x.k === k).nombre), valor: (SUPL[k] ? SUPL[k][1] : CREATINAS.find((x) => x.k === k).precio) * c }));
  const unidades = lineas.reduce((a, [, c]) => a + c, 0);
  const subtotal = items.reduce((a, i) => a + i.valor, 0);
  const combo = Math.floor(unidades / 2) * 10000;
  const cupon = azar() < 0.12 ? 'DEMO5' : null;
  const descuento = cupon ? Math.round((subtotal - combo) * 0.05) : 0;
  const total = subtotal - combo - descuento;
  const estado = hace > 6 ? (azar() < 0.04 ? 'cancelado' : 'entregado') : hace > 3 ? 'despachado' : hace > 1 ? 'verificado' : 'nuevo';
  const metodo = azar() < 0.5 ? 'contraentrega' : 'anticipado';
  const horasPedido = entre(0, 23);
  sentencias.push(`INSERT INTO pedidos (id, creado_en, estado, metodo_pago, items, subtotal, combo, envio, total, nombre, telefono, ciudad, direccion, porteria, cupon, descuento, recordar, guia, transportadora)
    VALUES (${q(id)}, ${q(marca(hace, horasPedido))}, ${q(estado)}, ${q(metodo)}, ${q(JSON.stringify(items))}, ${subtotal}, ${combo}, 0, ${total}, ${q(cliente.nombre)}, ${q(cliente.tel)}, ${q(cliente.ciudad)}, 'Dirección de demostración', 0, ${q(cupon)}, ${descuento}, ${cliente.recordar ? 1 : 0}, ${estado === 'despachado' || estado === 'entregado' ? q('DEMO' + n) : 'NULL'}, ${estado === 'despachado' || estado === 'entregado' ? "'servientrega'" : 'NULL'});`);
  /* historial de estados con demoras realistas */
  let t = hace * 24 + (24 - horasPedido);   // horas desde ahora hacia atrás
  const log = (est, h) => sentencias.push(`INSERT INTO estados_log (pedido_id, estado, creado_en) VALUES (${q(id)}, ${q(est)}, ${q(marca(0, h))});`);
  log('nuevo', t);
  if (['verificado', 'despachado', 'entregado'].includes(estado)) { t -= entre(1, 6); log('verificado', t); }
  if (['despachado', 'entregado'].includes(estado)) { t -= entre(3, 28); log('despachado', t); }
  if (estado === 'entregado') { t -= entre(36, 96); log('entregado', t); }
  if (estado === 'cancelado') { t -= entre(2, 20); log('cancelado', t); }
};

/* 60 días de pedidos: creatinas y proteína sobre todo, con clientes que repiten y algo de estacionalidad semanal */
for (let hace = 60; hace >= 0; hace--) {
  const dia = new Date(Date.now() - hace * 86400000).getUTCDay();
  const cantidad = entre(0, dia === 5 || dia === 6 ? 4 : 2) + (hace < 20 ? 1 : 0);
  for (let i = 0; i < cantidad; i++) {
    const c = azar() < 0.4 ? clientes[entre(0, 14)] : elegir(clientes);   // los primeros 15 compran más seguido
    const lineas = [[elegir(CREATINAS).k, entre(1, 2)]];
    if (azar() < 0.1) lineas.push([elegir(CREATINAS).k, 1]);
    pedidoDe(c, hace, lineas);
  }
}
/* unos pocos suplementos (el stock del catálogo es pequeño) */
pedidoDe(clientes[3], 12, [['wgs:dobles', 1]]);
pedidoDe(clientes[8], 9, [['outrage:blue', 1], ['on', 1]]);
pedidoDe(clientes[1], 5, [['bcaa:fruit', 1]]);
pedidoDe(clientes[6], 4, [['vitaform:unica', 1], ['vitaform:unica', 1]]);
sentencias.push("INSERT INTO cupones (codigo, tipo, valor, max_usos, min_total) VALUES ('DEMO5', 'porcentaje', 5, 500, 0);");

/* eventos: un embudo que se va afinando, con más visitas en celular */
const productos = ['on', 'mt', 'on120', 'wgs', 'outrage', 'bcaa', 'vitaform'];
for (let s = 0; s < 900; s++) {
  const sesion = 'demo' + s.toString(36).padStart(8, '0') + 'sesion';
  const hace = entre(0, 29);
  const disp = azar() < 0.72 ? 'm' : 'd';
  const t = (tipo, ruta, k) => sentencias.push(`INSERT INTO eventos (creado_en, sesion, tipo, ruta, k, disp) VALUES (${q(marca(hace, entre(0, 23)))}, ${q(sesion)}, ${q(tipo)}, ${q(ruta)}, ${q(k)}, ${q(disp)});`);
  t('vista', '/index', null);
  if (azar() < 0.46) {
    const k = elegir(productos);
    t('producto', '/ficha', k);
    if (azar() < 0.34) {
      t('canasta', null, k);
      if (azar() < 0.55) { t('pedido_inicio', '/pedido', null); }
    }
  }
}
/* costos de ejemplo para que el margen se vea (INVENTADOS: en producción los cargas tú) */
for (const [k, pct] of [['on', 0.62], ['mt', 0.64], ['on120', 0.6], ['wgs:dobles', 0.7], ['outrage:blue', 0.66], ['bcaa:fruit', 0.68], ['vitaform:unica', 0.65]]) {
  const precio = (SUPL[k] ? SUPL[k][1] : CREATINAS.find((x) => x.k === k).precio);
  sentencias.push(`INSERT INTO costos (k, costo) VALUES (${q(k)}, ${Math.round((precio * pct) / 1000) * 1000});`);
}
sentencias.push("INSERT INTO errores (ruta, mensaje) VALUES ('demo', 'Ejemplo de error registrado');");

/* ── levantar ── */
const ejecutar = (args) => execSync(`npx wrangler d1 execute revtile-db --local --persist-to "${PERSISTIR}" ${args}`, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
rmSync(DEMO, { recursive: true, force: true });
mkdirSync(DEMO, { recursive: true });
writeFileSync(TOML, 'name = "revtile"\npages_build_output_dir = "."\ncompatibility_date = "2024-06-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "revtile-db"\ndatabase_id = "local-demo"\n');
const limpiar = () => { rmSync(TOML, { force: true }); rmSync(join(RAIZ, '.wrangler'), { recursive: true, force: true }); };
process.on('SIGINT', () => { limpiar(); process.exit(0); });

console.log('Preparando la base de datos de demostración…');
MIGRACIONES.forEach((f, i) => { const a = join(DEMO, `m${i}.sql`); writeFileSync(a, sinComentarios(readFileSync(join(RAIZ, f), 'utf8'))); ejecutar(`--file "${a}"`); });
const semillaSql = join(DEMO, 'datos.sql');
writeFileSync(semillaSql, sentencias.join('\n'));
ejecutar(`--file "${semillaSql}"`);
console.log(`Listo: ${n} pedidos sintéticos, 900 sesiones, historial de estados y costos de ejemplo.`);
console.log('\n  Centro de mando:  http://localhost:8788/gestion.html   (llave: demo)\n  Tienda:           http://localhost:8788/\n');
const servidor = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', '8788', '--persist-to', PERSISTIR, '--binding', 'ADMIN_KEY=demo'], { cwd: RAIZ, shell: true, stdio: 'inherit' });
servidor.on('exit', () => { limpiar(); process.exit(0); });
