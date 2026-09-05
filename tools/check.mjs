#!/usr/bin/env node
/* Verifica que los precios digan lo mismo en todas partes.
   Uso:  node tools/check.mjs
   Falla (exit 1) si productos.json, checkout.js, las tarjetas del index,
   las fichas o el JSON-LD se contradicen. */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const data = JSON.parse(read('productos.json'));
const cop = (n) => '$' + n.toLocaleString('es-CO');

const errores = [];
const avisos = [];

/* 1 · checkout.js debe usar los mismos precios */
const checkout = read('js/checkout.js');
for (const p of data.productos) {
  const re = new RegExp(`${p.sku}\\s*:\\s*\\{[^}]*precio:\\s*(\\d+)`);
  const m = checkout.match(re);
  if (!m) errores.push(`checkout.js no define el producto "${p.sku}"`);
  else if (Number(m[1]) !== p.precio)
    errores.push(`checkout.js dice ${cop(Number(m[1]))} para "${p.sku}", productos.json dice ${cop(p.precio)}`);
}
const recargo = checkout.match(/RECARGO_CE_NACIONAL\s*=\s*(\d+)/);
if (recargo && Number(recargo[1]) !== data.envio.recargo_contraentrega_fuera_bogota)
  errores.push(`El recargo de contraentrega no coincide: checkout.js ${recargo[1]} vs productos.json ${data.envio.recargo_contraentrega_fuera_bogota}`);
const combo = checkout.match(/COMBO_POR_PAR\s*=\s*(\d+)/);
if (combo && Number(combo[1]) !== data.combo.descuento_por_par)
  errores.push(`El descuento del combo no coincide: checkout.js ${combo[1]} vs productos.json ${data.combo.descuento_por_par}`);

/* 2 · el precio de cada producto debe aparecer en su ficha, y el JSON-LD coincidir */
for (const p of data.productos) {
  let html;
  try { html = read(p.pagina); } catch { errores.push(`Falta la ficha ${p.pagina}`); continue; }
  if (!html.includes(cop(p.precio)))
    errores.push(`${p.pagina} no muestra el precio ${cop(p.precio)}`);
  const ld = html.match(/"price"\s*:\s*"?(\d+)"?/);
  if (!ld) avisos.push(`${p.pagina} no tiene precio en el JSON-LD`);
  else if (Number(ld[1]) !== p.precio)
    errores.push(`${p.pagina}: el JSON-LD dice ${cop(Number(ld[1]))} y la página ${cop(p.precio)}`);
}

/* 3 · ninguna página puede decir "gratis en Bogotá" cuando es toda Colombia */
for (const f of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const s = read(f);
  if (/gratis\s+(?:en|para|s[oó]lo en)\s+Bogot/i.test(s) || /GRATIS EN BOGOT/.test(s))
    errores.push(`${f} dice "envío gratis en Bogotá"; la política es ${data.envio.gratis}`);
}

/* 4 · nada de urgencia simulada */
for (const f of readdirSync(join(ROOT, 'js'))) {
  const s = read(join('js', f));
  const random = s.replace(/Math\.random\(\)\.toString\(36\)/g, '');
  if (/Math\.random\(\)[\s\S]{0,300}(pidieron|personas|comprando|quedan\s+\d|en stock|cupos)/i.test(random))
    errores.push(`js/${f} parece generar actividad simulada con Math.random()`);
}

/* 5 · avisos sobre datos pendientes */
for (const [k, v] of Object.entries(data._pendientes || {}))
  if (!v) avisos.push(`Pendiente de completar: ${k}`);
for (const p of data.productos)
  if (p.precio_antes && !p.precio_antes_confirmado)
    avisos.push(`"${p.sku}": el precio tachado ${cop(p.precio_antes)} está sin confirmar como precio realmente cobrado`);

for (const a of avisos) console.log('  aviso   ' + a);
for (const e of errores) console.error('  ERROR   ' + e);
console.log(errores.length ? `\n${errores.length} error(es).` : '\nTodo coherente.');
process.exit(errores.length ? 1 : 0);
