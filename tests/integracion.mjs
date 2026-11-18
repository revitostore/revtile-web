/* Pruebas de integración de punta a punta: levantan el sitio completo (Cloudflare Pages + Functions + D1)
   en local con Wrangler, aplican las migraciones y llaman a la API como lo haría un cliente real.
   Se ejecutan con `npm run test:integracion` (sirven igual en tu computador y en GitHub Actions).

   Qué cubren:
     · precios, stock, combo y cupones: el servidor recalcula todo y rechaza trampas
     · eventos anónimos y embudo
     · analítica, inventario, clientes, recompras, costos, salud y sincronización del panel
     · seguridad: acceso al panel, JSON obligatorio, rastreo sin datos personales */

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(RAIZ, 'tests', '.tmp');
const PERSISTIR = join(TMP, 'd1');
const TOML = join(RAIZ, 'wrangler.toml');
const PUERTO = 8788;
const LLAVE = 'llave-de-prueba-123456';
const MIGRACIONES = ['db/schema.sql', 'db/schema-v2.sql', 'db/schema-v4.sql', 'db/schema-v6.sql'];

let bien = 0;
let mal = 0;
const chequear = (nombre, cond, extra) => {
  if (cond) { bien++; console.log('  ok   ' + nombre); } else { mal++; console.log('  FALLA ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

/* ── HTTP mínimo (sin fetch, para que corra también en Node 16) ── */
function req(metodo, ruta, cuerpo, cabeceras) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const h = Object.assign(datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) } : {}, cabeceras || {});
    const r = http.request({ host: 'localhost', port: PUERTO, method: metodo, path: ruta, headers: h }, (x) => {
      let t = '';
      x.on('data', (c) => (t += c));
      x.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* no es JSON */ } res({ status: x.statusCode, json: j, text: t }); });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}
const admin = (metodo, ruta, cuerpo) => req(metodo, '/api/admin/' + ruta, cuerpo, { 'x-admin-key': LLAVE });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Base de datos local ── */
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '').split('\n').filter((l) => l.trim()).join('\n');
function ejecutarSql(args) {
  return execSync(`npx wrangler d1 execute revtile-db --local --persist-to "${PERSISTIR}" ${args}`, { cwd: RAIZ, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
}
const sql = (cmd) => ejecutarSql(`--command "${cmd.replace(/"/g, '\\"')}"`);
function migrar() {
  MIGRACIONES.forEach((f, i) => {
    const archivo = join(TMP, `migracion-${i}.sql`);
    writeFileSync(archivo, sinComentarios(readFileSync(join(RAIZ, f), 'utf8')));
    ejecutarSql(`--file "${archivo}"`);
  });
}

/* ── Servidor ── */
let servidor = null;
function levantar() {
  writeFileSync(TOML, 'name = "revtile"\npages_build_output_dir = "."\ncompatibility_date = "2024-06-01"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "revtile-db"\ndatabase_id = "local-test"\n');
  rmSync(PERSISTIR, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  migrar();
  servidor = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', String(PUERTO), '--persist-to', PERSISTIR, '--binding', `ADMIN_KEY=${LLAVE}`], { cwd: RAIZ, shell: true, stdio: 'ignore' });
}
function apagar() {
  try {
    if (servidor && servidor.pid) {
      if (process.platform === 'win32') execSync(`taskkill /pid ${servidor.pid} /T /F`, { stdio: 'ignore' });
      if (process.platform === 'win32') execSync('taskkill /IM workerd.exe /F', { stdio: 'ignore' });
      else process.kill(servidor.pid);
    }
  } catch { /* ya estaba apagado */ }
  rmSync(TOML, { force: true });
  rmSync(join(RAIZ, '.wrangler'), { recursive: true, force: true });
}
async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try { const r = await req('GET', '/api/stock'); if (r.status === 200) return; } catch { /* aún no */ }
    await esperar(2000);
  }
  throw new Error('El servidor no arrancó a tiempo');
}

/* ── Datos de prueba ── */
const PRECIO = { on: 120000, mt: 140000, on120: 170000, 'wgs:dobles': 250000, 'wgs:extreme': 250000, 'outrage:blue': 120000, 'outrage:fruit': 120000, 'bcaa:blue': 120000, 'bcaa:fruit': 120000, 'vitaform:unica': 90000 };
let tn = 0;
const datos = (id, extra) => Object.assign({ id, nombre: 'Prueba Uno', telefono: '31000' + String(10000 + ++tn), ciudad: 'Bogotá', direccion: 'Cra 1 # 2-3', vivienda: 'casa', apto: '', porteria: false, metodo_pago: 'anticipado', envio: 0 }, extra);
function pedido(id, lineas, extra) {
  const items = lineas.map(([k, c]) => ({ k, c, nombre: 'cualquiera', valor: 1 }));
  const unidades = lineas.reduce((a, [, c]) => a + c, 0);
  const subtotal = lineas.reduce((a, [k, c]) => a + PRECIO[k] * c, 0);
  const combo = Math.floor(unidades / 2) * 10000;
  return datos(id, Object.assign({ items, subtotal, combo, total: subtotal - combo }, extra));
}
const stock = async () => (await req('GET', '/api/stock')).json.stock;

async function pruebas() {
  console.log('\n── Precios y stock ──');
  let s = await stock();
  chequear('stock inicial = base del catálogo', s['wgs:extreme'] === 1 && s['wgs:dobles'] === 2 && s['vitaform:unica'] === 3, s);
  let r = await req('POST', '/api/pedido', pedido('RV-SU001', [['wgs:extreme', 1]]));
  chequear('un suplemento con el total correcto se registra', r.status === 200 && r.json.ok, r);
  s = await stock();
  chequear('la unidad vendida sale del stock en vivo', s['wgs:extreme'] === 0, s);
  const fila = sql("SELECT items FROM pedidos WHERE id='RV-SU001'");
  chequear('se guarda el nombre oficial del catálogo (no el del navegador)', /Gold Standard/.test(fila) && !/cualquiera/.test(fila));
  r = await req('POST', '/api/pedido', pedido('RV-SU002', [['wgs:extreme', 1]]));
  chequear('la MISMA última unidad no se vende dos veces (409)', r.status === 409, r);
  r = await req('POST', '/api/pedido', pedido('RV-SU001', [['wgs:extreme', 1]]));
  chequear('reenviar el MISMO pedido es idempotente', r.status === 200 && r.json.ok, r);
  r = await req('POST', '/api/pedido', pedido('RV-SU003', [['outrage:fruit', 2]]));
  chequear('pedir más de las unidades que hay se rechaza (409)', r.status === 409, r);

  console.log('\n── El servidor no confía en el navegador ──');
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK001', [['wgs:dobles', 1]]), { total: 10000 }));
  chequear('TRAMPA: total de $10.000 por una proteína de $250.000 se rechaza', r.status === 400 && r.json.precio === true, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK002', [['on', 1]]), { items: [{ k: 'on', c: 1, nombre: 'x', valor: 1 }], subtotal: 1, total: 1 }));
  chequear('TRAMPA: creatina con valor y total falsos se rechaza', r.status === 400, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK003', [['on', 1]]), { items: [{ k: 'inventado', c: 1, nombre: 'x', valor: 50000 }] }));
  chequear('un producto que no existe se rechaza', r.status === 400, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK004', [['on', 1]]), { items: [{ k: '__proto__', c: 1 }] }));
  chequear('la clave __proto__ no engaña al catálogo', r.status === 400, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK005', [['on', 1]]), { items: [{ k: 'on', c: 11 }] }));
  chequear('más de 10 unidades de una línea se rechaza', r.status === 400, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK006', [['on', 1]]), { items: [{ k: 'on', c: -3 }] }));
  chequear('una cantidad negativa se rechaza', r.status === 400, r);
  r = await req('POST', '/api/pedido', JSON.stringify(pedido('RV-HK007', [['on', 1]])), { 'Content-Type': 'text/plain' });
  chequear('un cuerpo que no es JSON (formulario de otro sitio) se rechaza (415)', r.status === 415, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-HK008', [['on', 1]]), { nombre: '<img src=x onerror=alert(1)>' }));
  chequear('el nombre con HTML se guarda (se escapa al mostrar, no se ejecuta)', r.status === 200 && r.json.ok, r);

  console.log('\n── Combo Gymbro y cupones ──');
  r = await req('POST', '/api/pedido', pedido('RV-MIX01', [['on', 1], ['outrage:blue', 2]]));
  chequear('pedido MIXTO de 3 productos: combo de $10.000 en el servidor', r.status === 200 && r.json.ok, r);
  const f2 = sql("SELECT combo, total FROM pedidos WHERE id='RV-MIX01'");
  chequear('el combo y el total guardados son los del servidor (350.000)', /350000/.test(f2) && /10000/.test(f2), f2.slice(0, 200));
  r = await req('POST', '/api/pedido', pedido('RV-CB001', [['vitaform:unica', 1], ['bcaa:blue', 1]]));
  chequear('combo con DOS suplementos distintos (par = −$10.000)', r.status === 200 && r.json.ok, r);
  sql("INSERT INTO cupones (codigo,tipo,valor,max_usos,min_total) VALUES ('PRUEBA5','porcentaje',5,1,0)");
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-CU001', [['mt', 1]]), { cupon: 'PRUEBA5', total: 140000 - 7000 }));
  chequear('un cupón del 5 % se aplica sobre el total real (−$7.000)', r.status === 200 && r.json.ok && r.json.descuento === 7000, r);
  r = await req('POST', '/api/pedido', Object.assign(pedido('RV-CU002', [['mt', 1]]), { cupon: 'PRUEBA5', total: 140000 - 7000 }));
  chequear('el cupón es de UN SOLO USO: el segundo intento con descuento se rechaza', r.status === 400 && r.json.precio === true, r);

  console.log('\n── Freno por teléfono y cancelaciones ──');
  const tel = '3119998877';
  let ult = null;
  for (let i = 1; i <= 6; i++) ult = await req('POST', '/api/pedido', pedido('RV-TL00' + i, [['mt', 1]], { telefono: tel }));
  chequear('el 6.º pedido del mismo teléfono en 10 minutos se frena (429)', ult.status === 429, ult);
  r = await req('POST', '/api/pedido', pedido('RV-TL001', [['mt', 1]], { telefono: tel }));
  chequear('reenviar uno ya registrado sigue funcionando aunque haya freno', r.status === 200 && r.json.ok, r);
  sql("UPDATE pedidos SET estado='cancelado' WHERE id='RV-SU001'");
  s = await stock();
  chequear('cancelar un pedido DEVUELVE la unidad al stock', s['wgs:extreme'] === 1, s);

  console.log('\n── Historial de estados y recordatorio de recompra ──');
  const telR = '3125550199';
  r = await req('POST', '/api/pedido', pedido('RV-RC001', [['wgs:dobles', 1]], { telefono: telR, recordar: true, nombre: 'Laura Gómez' }));
  chequear('un pedido con «avísame cuando se me acabe» se registra', r.status === 200 && r.json.ok, r);
  chequear('el recordatorio queda guardado', /1/.test(sql("SELECT recordar FROM pedidos WHERE id='RV-RC001'").split('"recordar":')[1] || ''), '');
  chequear('el pedido nuevo entra al historial de estados', /nuevo/.test(sql("SELECT estado FROM estados_log WHERE pedido_id='RV-RC001'")));
  r = await admin('POST', 'pedido', { id: 'RV-RC001', estado: 'despachado', guia: 'G123' });
  chequear('el panel cambia el estado', r.status === 200 && r.json.ok, r);
  chequear('y el cambio queda en el historial', /despachado/.test(sql("SELECT estado FROM estados_log WHERE pedido_id='RV-RC001'")));
  r = await admin('POST', 'pedido', { id: 'RV-RC001', estado: 'despachado' });
  const n1 = (sql("SELECT COUNT(*) n FROM estados_log WHERE pedido_id='RV-RC001' AND estado='despachado'").match(/"n":\s*(\d+)/) || [])[1];
  chequear('repetir el mismo estado no duplica el historial', n1 === '1', n1);
  sql("UPDATE pedidos SET creado_en = datetime('now', '-29 days') WHERE id='RV-RC001'");
  sql("UPDATE estados_log SET creado_en = datetime('now', '-27 days') WHERE pedido_id='RV-RC001' AND estado = 'despachado'");
  r = await admin('GET', 'ops/recompras');
  const rec = r.json && r.json.recompras && r.json.recompras.find((x) => x.id === 'RV-RC001');
  chequear('la recompra aparece cuando ya toca avisar', r.status === 200 && !!rec && rec.diasFaltan <= 0, r.json);
  chequear('el mensaje trae el nombre de pila, el producto y una salida para no recibir más avisos', !!rec && /Laura/.test(rec.mensaje) && /Gold Standard/.test(rec.mensaje) && /no te vuelvo a escribir/.test(rec.mensaje), rec);
  r = await req('POST', '/api/pedido', pedido('RV-RC002', [['mt', 1]], { telefono: telR }));
  r = await admin('GET', 'ops/recompras');
  chequear('si el cliente ya volvió a comprar, deja de aparecer', !(r.json.recompras || []).some((x) => x.id === 'RV-RC001'), r.json);

  console.log('\n── Eventos anónimos y embudo ──');
  const ev = (cuerpo, cab) => req('POST', '/api/e', cuerpo, cab);
  r = await ev({ sesion: 'abc123def456ghi', tipo: 'vista', ruta: '/index.html', disp: 'm' });
  chequear('un evento válido responde 204', r.status === 204, r.status);
  await ev({ sesion: 'abc123def456ghi', tipo: 'producto', ruta: '/whey-gold-standard-optimum-nutrition.html', k: 'wgs:dobles' });
  await ev({ sesion: 'abc123def456ghi', tipo: 'canasta', k: 'wgs:dobles' });
  await ev({ sesion: 'zzz999yyy888xxx', tipo: 'vista', ruta: '/', disp: 'd' });
  const guardados = sql('SELECT tipo, ruta, k, disp FROM eventos ORDER BY id');
  chequear('los eventos se guardan con el producto normalizado (wgs:dobles → wgs)', /"k":\s*"wgs"/.test(guardados) && !/wgs:dobles/.test(guardados), guardados.slice(0, 300));
  chequear('la ruta se normaliza (sin .html)', /"\/index"/.test(guardados));
  const antes = (sql('SELECT COUNT(*) n FROM eventos').match(/"n":\s*(\d+)/) || [])[1];
  await ev({ sesion: 'abc123def456ghi', tipo: 'hackeo' });
  await ev({ sesion: 'corta', tipo: 'vista' });
  await ev({ sesion: 'abc123def456ghi', tipo: 'canasta', k: 'inventado' });
  await ev({ sesion: 'abc123def456ghi', tipo: 'vista', ruta: '/../../etc/passwd' });
  await ev('x'.repeat(2000), {});
  await ev({ sesion: 'abc123def456ghi', tipo: 'vista' }, { 'User-Agent': 'Googlebot/2.1' });
  await ev(JSON.stringify({ sesion: 'abc123def456ghi', tipo: 'vista' }), { 'Content-Type': 'text/plain' });
  const despues = (sql('SELECT COUNT(*) n FROM eventos').match(/"n":\s*(\d+)/) || [])[1];
  chequear('tipos desconocidos, sesión corta, producto inventado, ruta maliciosa, cuerpo enorme, robots y no-JSON se ignoran',
    despues === antes || (Number(despues) === Number(antes) + 1 /* la ruta maliciosa se guarda sin ruta */), { antes, despues });
  chequear('la ruta maliciosa no se guarda', !/passwd/.test(sql('SELECT ruta FROM eventos')));
  chequear('no se guarda IP ni agente de usuario (la tabla no tiene esas columnas)', !/"name":\s*"(ip|ip_addr|agente|user_agent|ua)"/i.test(sql("SELECT name FROM pragma_table_info('eventos')")));
  await ev({ sesion: 'abc123def456ghi', tipo: 'pedido_inicio', ruta: '/pedido' });

  console.log('\n── Panel: acceso ──');
  r = await req('GET', '/api/admin/pedidos');
  chequear('sin credenciales el panel responde 401', r.status === 401, r.status);
  r = await req('GET', '/api/admin/ops/analitica', undefined, { 'x-admin-key': 'x'.repeat(22) });
  chequear('con una llave equivocada no entra a la analítica', r.status === 401, r.status);
  r = await req('POST', '/api/admin/ops/costos', JSON.stringify({ k: 'on', costo: 1 }), { 'x-admin-key': LLAVE, 'Content-Type': 'text/plain' });
  chequear('una acción del panel que no es JSON se rechaza (415)', r.status === 415, r.status);

  console.log('\n── Panel: analítica ──');
  r = await admin('GET', 'ops/analitica?dias=30');
  const a = r.json;
  chequear('la analítica responde con totales', r.status === 200 && a.ok && a.resumen.pedidos > 0 && a.resumen.ingresos > 0, a && a.resumen);
  chequear('hay un valor por cada día de la ventana (30)', a.ventasDia.length === 30, a.ventasDia && a.ventasDia.length);
  chequear('los cancelados no cuentan como venta', a.resumen.cancelados >= 1);
  chequear('el ticket medio es ingresos ÷ pedidos', a.resumen.ticket === Math.round(a.resumen.ingresos / a.resumen.pedidos), a.resumen);
  chequear('los productos traen unidades e ingreso', a.productos.length > 0 && a.productos.every((p) => p.unidades > 0 && p.ingreso > 0));
  chequear('sin costos cargados no se inventa un margen', a.resumen.margenPesos === null && a.productos.every((p) => p.margen === null), a.resumen);
  chequear('el embudo muestra 5 pasos con porcentajes', Array.isArray(a.embudo) && a.embudo.length === 5 && a.embudo[1].pctPaso !== null, a.embudo);
  chequear('el embudo cuenta sesiones distintas (2 vieron la tienda)', a.embudo && a.embudo[0].n === 2, a.embudo && a.embudo[0]);
  chequear('el interés por producto sale de los eventos', a.interes.some((i) => i.k === 'wgs' && i.vieron >= 1 && i.canasta >= 1), a.interes);
  chequear('los cupones usados aparecen con su descuento', a.cupones.some((c) => c.cupon === 'PRUEBA5' && c.descuento === 7000), a.cupones);
  chequear('hay tiempos del pedido al despacho', a.tiempos && a.tiempos.despacho.n >= 1, a.tiempos);
  r = await admin('GET', 'ops/analitica?dias=99999');
  chequear('la ventana se acota (máximo 365)', r.json.dias === 365, r.json.dias);

  console.log('\n── Panel: costos y margen ──');
  r = await admin('POST', 'ops/costos', { k: 'wgs:dobles', costo: 180000 });
  chequear('se guarda el costo de un producto', r.status === 200 && r.json.costos.find((c) => c.k === 'wgs:dobles').costo === 180000, r.json);
  chequear('el margen unitario sale del precio y el costo (70.000 = 28 %)', r.json.costos.find((c) => c.k === 'wgs:dobles').margen.pesos === 70000 && r.json.costos.find((c) => c.k === 'wgs:dobles').margen.pct === 28);
  r = await admin('POST', 'ops/costos', { k: 'inventado', costo: 5 });
  chequear('un producto inventado se rechaza', r.status === 400, r.status);
  r = await admin('POST', 'ops/costos', { k: 'on', costo: -5 });
  chequear('un costo negativo se rechaza', r.status === 400, r.status);
  r = await admin('GET', 'ops/analitica?dias=30');
  chequear('con costo cargado aparece el margen real del producto', r.json.resumen.margenPesos !== null && r.json.productos.some((p) => p.margen), r.json.resumen);
  r = await admin('POST', 'ops/costos', { k: 'wgs:dobles', costo: null });
  chequear('el costo se puede quitar', r.json.costos.find((c) => c.k === 'wgs:dobles').costo === null);

  console.log('\n── Panel: inventario y reposición ──');
  r = await admin('GET', 'ops/inventario');
  const inv = r.json;
  chequear('el inventario lista los suplementos con restante, ritmo y urgencia', r.status === 200 && inv.suplementos.length === 7 && inv.suplementos.every((p) => typeof p.restante === 'number' && p.urgencia), inv.suplementos && inv.suplementos[0]);
  const wd = inv.suplementos.find((p) => p.k === 'wgs:dobles');
  chequear('lo restante = stock base − vendido (sin contar cancelados)', wd.restante === wd.base - wd.vendido && wd.vendido >= 1, wd);
  chequear('un producto con ventas recientes tiene ritmo positivo', wd.velocidad > 0 && wd.serie.length === 30, wd);
  chequear('los más urgentes salen primero', ['ya', 'pronto', 'ok', 'sin_ventas'].indexOf(inv.suplementos[0].urgencia) <= ['ya', 'pronto', 'ok', 'sin_ventas'].indexOf(inv.suplementos[inv.suplementos.length - 1].urgencia));
  chequear('las creatinas muestran su ritmo de venta', inv.creatinas.length === 3 && inv.creatinas.some((c) => c.ult30 > 0), inv.creatinas);
  r = await admin('POST', 'ops/ajustes', { clave: 'lead_time_dias', valor: 40 });
  chequear('se puede ajustar el tiempo de entrega del proveedor', r.status === 200 && r.json.ajustes.lead_time_dias === 40, r.json);
  r = await admin('POST', 'ops/ajustes', { clave: 'cualquiera', valor: 5 });
  chequear('un ajuste que no existe se rechaza', r.status === 400, r.status);
  r = await admin('GET', 'ops/inventario');
  chequear('un tiempo de entrega mayor adelanta la urgencia (más productos en «ya» o «pronto»)',
    r.json.suplementos.filter((p) => p.urgencia === 'ya' || p.urgencia === 'pronto').length >= inv.suplementos.filter((p) => p.urgencia === 'ya' || p.urgencia === 'pronto').length);

  console.log('\n── Panel: clientes ──');
  r = await admin('GET', 'ops/clientes');
  chequear('la lista de clientes trae indicadores y segmentos', r.status === 200 && r.json.kpis.clientes > 0 && r.json.segmentos, r.json && r.json.kpis);
  const lau = r.json.clientes.find((c) => c.tel === telR);
  chequear('una clienta con 2 pedidos se agrupa por teléfono', !!lau && lau.pedidos === 2, lau);
  chequear('su segmento depende de recencia y ritmo', !!lau && ['recurrente', 'vip', 'en_riesgo'].includes(lau.segmento), lau);
  chequear('la tasa de recompra es el % de clientes con más de un pedido', r.json.kpis.recompra > 0 && r.json.kpis.recompra <= 100, r.json.kpis);

  console.log('\n── Panel: salud y sincronización ──');
  r = await admin('GET', 'ops/salud');
  chequear('la migración v6 figura completa', r.status === 200 && r.json.migracion.completa === true, r.json.migracion);
  chequear('hay conteos de pedidos y eventos', r.json.conteos.pedidos > 0 && r.json.conteos.eventos > 0, r.json.conteos);
  r = await admin('POST', 'ops/sincronizar', {});
  chequear('sincronizar sin transportadora configurada no rompe y revisa lo que haya', r.status === 200 && r.json.ok && Array.isArray(r.json.cambios), r.json);

  console.log('\n── Rastreo público ──');
  r = await req('GET', '/api/rastreo?id=RV-MIX01');
  chequear('el rastreo no revela nombre, teléfono ni dirección', r.json && r.json.ok && !('nombre' in r.json) && !('telefono' in r.json) && !('direccion' in r.json), r.json && Object.keys(r.json));
  r = await req('GET', '/api/rastreo?id=../../etc');
  chequear('un ID con caracteres raros se rechaza', r.status === 400, r.status);
  r = await req('GET', '/api/social');
  chequear('el endpoint de cifras de entregas ya no existe', r.status === 404, r.status);
}

try {
  levantar();
  await esperarServidor();
  await pruebas();
} catch (e) {
  console.error('ERROR DE PRUEBA', e);
  mal++;
} finally {
  apagar();
}
console.log(`\n${bien} pruebas bien, ${mal} con falla.`);
process.exit(mal ? 1 : 0);
